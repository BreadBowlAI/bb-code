import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BbDatabase } from "../../src/infrastructure/sqlite/bb-database.js";

export type SqliteFixture = {
  database: BbDatabase;
  repositoryId: string;
  worktreeId: string;
  gitViewId: string;
  dispose: () => void;
};

export function createSqliteFixture(): SqliteFixture {
  const directory = mkdtempSync(join(tmpdir(), "bb-code-test-"));
  const database = new BbDatabase(join(directory, "bb.db"));
  const repositoryId = `repo_${directory.split("-").at(-1)}`;
  const registration = database.registerRepository({ repositoryId, root: join(directory, "repo"), gitCommonDir: join(directory, "repo/.git"), gitDir: join(directory, "repo/.git"), headCommitSha: "abc", headTreeSha: "def", dirtyFingerprint: "clean", branchLabel: "main" });
  return {
    database,
    repositoryId,
    worktreeId: registration.worktreeId,
    gitViewId: registration.gitViewId,
    dispose: () => { database.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}
