import type { ContextResult } from "../../domain/context.js";
import { invariant } from "../../domain/errors.js";
import type { SemanticRetrievalProvider } from "../../ports/semantic-retrieval.js";
import { openWorkspace } from "../workspace/open-workspace.js";
import { retrieveContext } from "./retrieve-context.js";

export async function getContext(input: { cwd: string; request: string; paths?: string[]; maxItems?: number; runId?: string; databasePath?: string; semantic?: SemanticRetrievalProvider }): Promise<ContextResult> {
  const workspace = await openWorkspace(input.cwd, input.databasePath ? { databasePath: input.databasePath } : {});
  try {
    const runId = input.runId ?? workspace.database.latestRunningRunForRequest(workspace.repositoryId, workspace.worktreeId, input.request);
    if (input.runId) {
      invariant(workspace.database.runBelongsToRepository(input.runId, workspace.repositoryId) && workspace.database.isRunRunning(input.runId), `Running run ${input.runId} was not found in this repository`, "invalid_run");
    }
    return await retrieveContext({
      database: workspace.database,
      repositoryId: workspace.repositoryId,
      gitViewId: workspace.gitViewId,
      git: workspace.git,
      query: input.request,
      ...(input.paths ? { paths: input.paths } : {}),
      ...(input.maxItems ? { maxItems: input.maxItems } : {}),
      ...(runId ? { runId } : {}),
      ...(input.semantic ? { semantic: input.semantic } : {})
    });
  } finally { workspace.database.close(); }
}
