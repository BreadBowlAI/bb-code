import { confirm, input } from "@inquirer/prompts";
import type { Command } from "commander";
import { cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addStatement, openWorkspace } from "@breadbowl/bb-core";
import { humanActor, print } from "./io.js";

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
    print("Ready. Run `bb integrate codex` or `bb integrate claude`.");
  });

  program.command("doctor").description("Check repository and integration prerequisites").action(async () => {
    const workspace = await openWorkspace(process.cwd());
    print(`ok repository ${workspace.repositoryId}`);
    print(`ok SQLite ${workspace.database.filename}`);
    print(`ok Node ${process.version}`);
  });

  program.command("integrate <host>").description("Show or install host integration").option("--copy-to <directory>", "copy the bundled plugin to a host plugin directory").action(async (host, options) => {
    if (host !== "codex" && host !== "claude") throw new Error("host must be codex or claude");
    if (options.copyTo) {
      const source = resolve(dirname(fileURLToPath(import.meta.url)), "plugins", host);
      const destination = resolve(options.copyTo, "bb-code");
      await cp(source, destination, { recursive: true });
      return print(`Installed plugin at ${destination}`);
    }
    print(host === "codex" ? "Install plugins/bb-code from this repository's marketplace, then restart Codex." : "Add .claude-plugin/marketplace.json as a marketplace, install bb-code, then restart Claude Code.");
  });
}
