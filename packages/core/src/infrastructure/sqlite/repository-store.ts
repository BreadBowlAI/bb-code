import { createId } from "../../domain/ids.js";
import { now } from "./values.js";
import type { SqliteConnection } from "./connection.js";

export type RepositoryRegistration = { repositoryId: string; locationId: string; worktreeId: string; gitViewId: string };

export class RepositoryStore {
  constructor(private readonly connection: SqliteConnection) {}

  register(input: { repositoryId: string; root: string; gitCommonDir: string; gitDir: string; headCommitSha: string; headTreeSha: string; dirtyFingerprint: string; branchLabel?: string }): RepositoryRegistration {
    const database = this.connection.database;
    const timestamp = now();
    database.prepare("INSERT OR IGNORE INTO repositories VALUES(?, ?, 1)").run(input.repositoryId, timestamp);
    let location = database.prepare("SELECT id FROM repository_locations WHERE canonical_root=?").get(input.root) as { id: string } | undefined;
    if (!location) {
      location = { id: createId("loc") };
      database.prepare("INSERT INTO repository_locations VALUES(?, ?, ?, ?, ?, ?)").run(location.id, input.repositoryId, input.root, input.gitCommonDir, timestamp, timestamp);
    } else database.prepare("UPDATE repository_locations SET last_seen_at=? WHERE id=?").run(timestamp, location.id);
    let worktree = database.prepare("SELECT id FROM worktrees WHERE canonical_root=?").get(input.root) as { id: string } | undefined;
    if (!worktree) {
      worktree = { id: createId("wtr") };
      database.prepare("INSERT INTO worktrees VALUES(?, ?, ?, ?, ?, ?)").run(worktree.id, location.id, input.root, input.gitDir, timestamp, timestamp);
    } else database.prepare("UPDATE worktrees SET last_seen_at=? WHERE id=?").run(timestamp, worktree.id);
    const gitViewId = createId("view");
    database.prepare("INSERT INTO git_views VALUES(?, ?, ?, ?, ?, ?, ?, ?)").run(gitViewId, input.repositoryId, worktree.id, input.headCommitSha, input.headTreeSha, input.dirtyFingerprint, input.branchLabel ?? null, timestamp);
    return { repositoryId: input.repositoryId, locationId: location.id, worktreeId: worktree.id, gitViewId };
  }
}
