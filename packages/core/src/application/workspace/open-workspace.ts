import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { BbError } from "../../domain/errors.js";
import { createId } from "../../domain/ids.js";
import { inspectGit } from "../../infrastructure/git/git-client.js";
import { defaultDatabasePath } from "../../infrastructure/filesystem/data-paths.js";
import { BbDatabase } from "../../infrastructure/sqlite/bb-database.js";

const RepoFileSchema = z.object({ repository_id: z.string().min(1), schema_version: z.literal(1) });

export type Workspace = { database: BbDatabase; repositoryId: string; root: string; worktreeId: string; gitViewId: string };

export async function openWorkspace(cwd: string, options: { databasePath?: string; create?: boolean } = {}): Promise<Workspace> {
  const git = await inspectGit(cwd);
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
  const database = new BbDatabase(options.databasePath ?? defaultDatabasePath());
  const registered = database.registerRepository({ repositoryId, ...git });
  return { database, repositoryId, root: git.root, worktreeId: registered.worktreeId, gitViewId: registered.gitViewId };
}
