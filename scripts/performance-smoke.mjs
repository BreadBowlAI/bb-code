import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { BbDatabase, inspectGit, processRuntimeEvent } from "../packages/core/dist/index.js";

const directory = mkdtempSync(join(tmpdir(), "bb-code-performance-"));
const root = join(directory, "repo");
const databasePath = join(directory, "bb.db");
const repositoryId = "repo_performance";
const runGit = (...arguments_) => execFileSync("git", arguments_, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
const percentile95 = (values) => [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1] ?? 0;

try {
  mkdirSync(root);
  runGit("init", "-b", "main");
  runGit("config", "user.name", "bb-code performance");
  runGit("config", "user.email", "performance@bb-code.invalid");
  writeFileSync(join(root, "README.md"), "performance fixture\n");
  runGit("add", "README.md");
  runGit("commit", "-m", "initial");
  mkdirSync(join(root, ".bb"));
  writeFileSync(join(root, ".bb/repo.json"), `${JSON.stringify({ repository_id: repositoryId, schema_version: 1 }, null, 2)}\n`);
  const git = await inspectGit(root, { includePatchId: false });
  const database = new BbDatabase(databasePath);
  const registration = database.registerRepository({ repositoryId, ...git });
  const actor = { kind: "human", id: "performance" };
  for (let index = 0; index < 10_000; index += 1) {
    database.createStatement(repositoryId, { kind: "belief", body: `Subsystem ${index % 100} retains reviewed behavior ${index}`, status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, actor, evidence: { kind: "user_statement", summary: "Performance fixture", gitViewId: registration.gitViewId } });
  }
  database.close();

  const retrieval = [];
  for (let index = 0; index < 30; index += 1) {
    const started = performance.now();
    await processRuntimeEvent({ schemaVersion: 1, host: "codex", event: "start_run", externalSessionId: "performance", externalTurnId: `turn-${index}`, cwd: root, occurredAt: new Date().toISOString(), payload: { prompt: `Change subsystem ${index % 100} behavior` } }, databasePath);
    retrieval.push(performance.now() - started);
  }
  const hooks = [];
  for (let index = 0; index < 50; index += 1) {
    const started = performance.now();
    await processRuntimeEvent({ schemaVersion: 1, host: "codex", event: "before_tool", externalSessionId: "performance", externalToolUseId: `tool-${index}`, cwd: root, occurredAt: new Date().toISOString(), payload: { tool_name: "Read", path: "README.md" } }, databasePath);
    hooks.push(performance.now() - started);
  }
  const retrievalP95 = percentile95(retrieval);
  const hookP95 = percentile95(hooks);
  process.stdout.write(`10k retrieval p95=${retrievalP95.toFixed(1)}ms; pre-tool p95=${hookP95.toFixed(1)}ms\n`);
  if (retrievalP95 >= 200) throw new Error(`Local run-start retrieval p95 exceeded 200ms (${retrievalP95.toFixed(1)}ms)`);
  if (hookP95 >= 50) throw new Error(`Pre-tool hook p95 exceeded 50ms (${hookP95.toFixed(1)}ms)`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
