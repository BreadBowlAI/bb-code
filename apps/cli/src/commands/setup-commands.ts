import { confirm, input } from "@inquirer/prompts";
import type { Command } from "commander";
import { execFile } from "node:child_process";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { addStatement, openWorkspace } from "@breadbowl/bb-core";
import { MCP_TOOL_NAMES } from "../mcp/server.js";
import { renderClaudeResponse, renderCodexResponse } from "../adapters/hook-adapter.js";
import { humanActor, print } from "./io.js";

const runFile = promisify(execFile);

async function firstExisting(paths: string[]): Promise<string> {
  for (const path of paths) {
    try { await access(path); return path; } catch { /* continue */ }
  }
  throw new Error(`Bundled integration files were not found (${paths.join(", ")})`);
}

async function pluginSource(host: "codex" | "claude"): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return firstExisting([
    resolve(moduleDirectory, "plugins", host),
    resolve(moduleDirectory, "..", "plugins", host),
    resolve(moduleDirectory, "../../../../plugins", host === "codex" ? "bb-code" : "claude/bb-code")
  ]);
}

async function claudeMarketplaceSource(): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return firstExisting([
    resolve(moduleDirectory, "plugins/claude-marketplace"),
    resolve(moduleDirectory, "../plugins/claude-marketplace"),
    resolve(moduleDirectory, "../../../..")
  ]);
}

async function registerCodexMarketplace(root: string): Promise<string> {
  const directory = resolve(root, ".agents/plugins");
  const destination = resolve(directory, "bb-code");
  await mkdir(directory, { recursive: true });
  await cp(await pluginSource("codex"), destination, { recursive: true, force: true });
  const marketplacePath = resolve(directory, "marketplace.json");
  let marketplace: Record<string, unknown> = { name: "bb-code-local", interface: { displayName: "bb-code" }, plugins: [] };
  try { marketplace = JSON.parse(await readFile(marketplacePath, "utf8")) as Record<string, unknown>; } catch { /* create it */ }
  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins.filter((entry) => !(entry && typeof entry === "object" && (entry as { name?: unknown }).name === "bb-code")) : [];
  plugins.push({ name: "bb-code", source: { source: "local", path: "./.agents/plugins/bb-code" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" });
  await writeFile(marketplacePath, `${JSON.stringify({ ...marketplace, plugins }, null, 2)}\n`);
  return marketplacePath;
}

export function registerSetupCommands(program: Command): void {
  program.command("init").description("Initialize bb-code in this Git repository").option("--yes", "skip guided questions").action(async (options) => {
    const workspace = await openWorkspace(process.cwd(), { create: true });
    print(`Initialized bb-code for ${workspace.root}`);
    if (options.yes || !process.stdin.isTTY) return;
    const goal = await input({ message: "What are you building?", validate: (value) => value.trim().length > 0 || "Please enter a goal" });
    await addStatement(workspace.root, { kind: "intent", body: goal, status: "active", scope: { kind: "repository" }, attributes: { owner: humanActor, priority: "normal", successConditions: [] }, evidenceSummary: "Provided during bb init" });
    while (await confirm({ message: "Add something that must remain true?", default: false })) {
      const body = await input({ message: "Commitment:" });
      const rationale = await input({ message: "Why does it matter?" });
      await addStatement(workspace.root, { kind: "commitment", body, status: "accepted", scope: { kind: "repository" }, attributes: { rationale, authority: humanActor }, evidenceSummary: "Explicitly accepted during bb init" });
    }
    const humanOnly = await input({ message: "What must agents not decide without asking? (leave blank for none)", default: "" });
    if (humanOnly.trim()) {
      await addStatement(workspace.root, { kind: "commitment", body: humanOnly.trim(), status: "accepted", scope: { kind: "repository" }, attributes: { rationale: "This decision requires explicit human authority", authority: humanActor, revisitCondition: "A human explicitly changes this boundary" }, evidenceSummary: "Explicitly accepted during bb init" });
    }
    print("Ready. Run `bb integrate codex` or `bb integrate claude`.");
  });

  program.command("doctor").description("Check repository and integration prerequisites").action(async () => {
    const failures: string[] = [];
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 24) failures.push(`Node 24+ required; found ${process.version}`); else print(`ok Node ${process.version}`);
    const workspace = await openWorkspace(process.cwd());
    print(`ok repository ${workspace.repositoryId}`);
    const health = workspace.database.health();
    if (health.schemaVersion < 2 || health.journalMode.toLowerCase() !== "wal" || !health.foreignKeys) failures.push(`SQLite health check failed: ${JSON.stringify(health)}`);
    else print(`ok SQLite schema ${health.schemaVersion}, WAL, foreign keys`);
    if (MCP_TOOL_NAMES.length !== 4 || new Set(MCP_TOOL_NAMES).size !== 4) failures.push("MCP must initialize exactly four unique tools");
    else print(`ok MCP ${MCP_TOOL_NAMES.join(", ")}`);
    if (!renderCodexResponse("UserPromptSubmit", { output: "smoke" }) || !renderClaudeResponse("UserPromptSubmit", { output: "smoke" })) failures.push("Hook response rendering failed");
    else print("ok Codex and Claude hook responses");
    try { await access(resolve(workspace.root, ".agents/plugins/marketplace.json")); print("ok Codex marketplace registered"); }
    catch { print("warn Codex marketplace not registered; run `bb integrate codex`"); }
    try { await access(await pluginSource("claude")); print("ok Claude plugin bundle"); }
    catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    if (failures.length) throw new Error(failures.join("\n"));
  });

  program.command("integrate <host>").description("Install or register a host integration").option("--copy-to <directory>", "copy the bundled plugin to a host plugin directory").action(async (host, options) => {
    if (host !== "codex" && host !== "claude") throw new Error("host must be codex or claude");
    if (options.copyTo) {
      const destination = resolve(options.copyTo, "bb-code");
      await cp(await pluginSource(host), destination, { recursive: true, force: true });
      return print(`Installed plugin at ${destination}`);
    }
    const workspace = await openWorkspace(process.cwd());
    if (host === "codex") {
      const marketplace = await registerCodexMarketplace(workspace.root);
      print(`Registered the Codex marketplace at ${marketplace}. Open Codex /plugins, install and trust bb-code, then start a new Codex task and run \`bb doctor\`.`);
      return;
    }
    const marketplace = await claudeMarketplaceSource();
    await runFile("claude", ["plugin", "marketplace", "add", marketplace, "--scope", "user"], { maxBuffer: 4 * 1024 * 1024 });
    await runFile("claude", ["plugin", "install", "bb-code@bb-code", "--scope", "user"], { maxBuffer: 4 * 1024 * 1024 });
    print("Installed bb-code for Claude Code at user scope. Start a new Claude session and run `bb doctor`.");
  });
}
