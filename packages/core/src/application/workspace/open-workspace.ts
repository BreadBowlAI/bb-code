import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { BbError } from "../../domain/errors.js";
import { createId } from "../../domain/ids.js";
import { inspectGit, inspectKnownWorktree, type GitSnapshot } from "../../infrastructure/git/git-client.js";
import { defaultDatabasePath } from "../../infrastructure/filesystem/data-paths.js";
import { BbDatabase } from "../../infrastructure/sqlite/bb-database.js";

const RepoFileSchema = z.object({ repository_id: z.string().min(1), schema_version: z.literal(1) });

export type Workspace = { database: BbDatabase; repositoryId: string; root: string; worktreeId: string; gitViewId: string; git: GitSnapshot };

async function findInitializedRepository(cwd: string): Promise<{ root: string; repositoryId: string } | undefined> {
  let directory = await realpath(resolve(cwd));
  while (true) {
    try {
      const parsed = RepoFileSchema.parse(JSON.parse(await readFile(join(directory, ".bb/repo.json"), "utf8")));
      return { root: directory, repositoryId: parsed.repository_id };
    } catch { /* walk toward the filesystem root */ }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

export async function openWorkspace(cwd: string, options: { databasePath?: string; create?: boolean; inspectPatchId?: boolean; lightweightGit?: boolean } = {}): Promise<Workspace> {
  const databasePath = options.databasePath ?? defaultDatabasePath();
  if (options.lightweightGit) {
    const initialized = await findInitializedRepository(cwd);
    if (initialized) {
      const database = new BbDatabase(databasePath);
      const known = database.knownWorktree(initialized.repositoryId, initialized.root);
      if (known) {
        const git = await inspectKnownWorktree({ root: initialized.root, gitCommonDir: known.gitCommonDir, gitDir: known.gitDir, previous: known.gitView });
        const registered = database.registerRepository({ repositoryId: initialized.repositoryId, ...git });
        return { database, repositoryId: initialized.repositoryId, root: initialized.root, worktreeId: registered.worktreeId, gitViewId: registered.gitViewId, git };
      }
      database.close();
    }
  }
  const git = await inspectGit(cwd, { includePatchId: options.inspectPatchId ?? true, lightweight: options.lightweightGit ?? false });
  const bbDirectory = join(git.root, ".bb");
  const repoFile = join(bbDirectory, "repo.json");
  let repositoryId: string;
  try { repositoryId = RepoFileSchema.parse(JSON.parse(await readFile(repoFile, "utf8"))).repository_id; }
  catch (error) {
    if (!options.create) throw new BbError("bb-code is not initialized. Run `bb init` first.", "not_initialized", { cause: error instanceof Error ? error.message : String(error) });
    repositoryId = createId("repo");
    await mkdir(bbDirectory, { recursive: true });
    await writeFile(repoFile, `${JSON.stringify({ repository_id: repositoryId, schema_version: 1 }, null, 2)}\n`, { flag: "wx" }).catch(async (writeError: unknown) => {
      if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
      repositoryId = RepoFileSchema.parse(JSON.parse(await readFile(repoFile, "utf8"))).repository_id;
    });
  }
  const database = new BbDatabase(databasePath);
  const registered = database.registerRepository({ repositoryId, ...git });
  return { database, repositoryId, root: git.root, worktreeId: registered.worktreeId, gitViewId: registered.gitViewId, git };
}
