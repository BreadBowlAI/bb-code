import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BbDatabase } from "../packages/core/dist/index.js";

const directory = mkdtempSync(join(tmpdir(), "bb-code-concurrency-"));
const databasePath = join(directory, "bb.db");
const database = new BbDatabase(databasePath);
const repositoryId = "repo_concurrency";
const registration = database.registerRepository({ repositoryId, root: join(directory, "repo"), gitCommonDir: join(directory, "repo/.git"), gitDir: join(directory, "repo/.git"), headCommitSha: "abc", headTreeSha: "def", dirtyFingerprint: "clean", branchLabel: "main" });
database.close();

function worker(host) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(import.meta.dirname, "concurrency-worker.mjs"), databasePath, repositoryId, registration.worktreeId, registration.gitViewId, host], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`${host} worker exited ${code}`)));
  });
}

try {
  await Promise.all([worker("codex"), worker("claude")]);
  const verified = new BbDatabase(databasePath);
  try {
    if (verified.health().journalMode.toLowerCase() !== "wal") throw new Error("WAL was not preserved");
  } finally { verified.close(); }
  process.stdout.write("Concurrent Codex and Claude WAL writes completed successfully.\n");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
