import { createId } from "../../domain/ids.js";
import type { GitView } from "../../domain/runtime.js";
import { fromJson, now, toJson } from "./values.js";
import type { SqliteConnection } from "./connection.js";

export type RepositoryRegistration = { repositoryId: string; locationId: string; worktreeId: string; gitViewId: string };
export type KnownWorktree = { gitCommonDir: string; gitDir: string; gitView: GitView };

export class RepositoryStore {
  constructor(private readonly connection: SqliteConnection) {}

  register(input: { repositoryId: string; root: string; gitCommonDir: string; gitDir: string; headCommitSha: string; headTreeSha: string; parentShas?: string[]; dirtyFingerprint: string; changedPaths?: string[]; stablePatchId?: string; branchLabel?: string }): RepositoryRegistration {
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
    database.prepare("INSERT INTO git_views(id,repository_id,worktree_id,head_commit_sha,head_tree_sha,dirty_fingerprint,branch_label,observed_at,parent_shas_json,stable_patch_id,changed_paths_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(gitViewId, input.repositoryId, worktree.id, input.headCommitSha, input.headTreeSha, input.dirtyFingerprint, input.branchLabel ?? null, timestamp, toJson(input.parentShas ?? []), input.stablePatchId ?? null, toJson(input.changedPaths ?? []));
    return { repositoryId: input.repositoryId, locationId: location.id, worktreeId: worktree.id, gitViewId };
  }

  getGitView(id: string): GitView | undefined {
    const row = this.connection.database.prepare("SELECT g.*,w.canonical_root FROM git_views g JOIN worktrees w ON w.id=g.worktree_id WHERE g.id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      repositoryId: String(row.repository_id),
      worktreeId: String(row.worktree_id),
      root: String(row.canonical_root),
      headCommitSha: String(row.head_commit_sha),
      headTreeSha: String(row.head_tree_sha),
      parentShas: fromJson<string[]>(row.parent_shas_json),
      dirtyFingerprint: String(row.dirty_fingerprint),
      changedPaths: fromJson<string[]>(row.changed_paths_json),
      ...(row.stable_patch_id ? { stablePatchId: String(row.stable_patch_id) } : {}),
      ...(row.branch_label ? { branchLabel: String(row.branch_label) } : {}),
      observedAt: String(row.observed_at)
    };
  }

  knownWorktree(repositoryId: string, root: string): KnownWorktree | undefined {
    const row = this.connection.database.prepare(`SELECT l.git_common_dir,w.git_dir,g.id git_view_id
      FROM repository_locations l JOIN worktrees w ON w.repository_location_id=l.id
      JOIN git_views g ON g.worktree_id=w.id
      WHERE l.repository_id=? AND w.canonical_root=? ORDER BY g.observed_at DESC LIMIT 1`).get(repositoryId, root) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const gitView = this.getGitView(String(row.git_view_id));
    return gitView ? { gitCommonDir: String(row.git_common_dir), gitDir: String(row.git_dir), gitView } : undefined;
  }
}
