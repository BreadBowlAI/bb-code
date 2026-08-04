import type { ContextResult } from "../../domain/context.js";
import type { SemanticRetrievalProvider } from "../../ports/semantic-retrieval.js";
import { openWorkspace } from "../workspace/open-workspace.js";
import { retrieveContext } from "./retrieve-context.js";

export async function getContext(input: { cwd: string; task: string; paths?: string[]; maxItems?: number; runId?: string; databasePath?: string; semantic?: SemanticRetrievalProvider }): Promise<ContextResult> {
  const workspace = await openWorkspace(input.cwd, input.databasePath ? { databasePath: input.databasePath } : {});
  return retrieveContext({
    database: workspace.database,
    repositoryId: workspace.repositoryId,
    gitViewId: workspace.gitViewId,
    query: input.task,
    ...(input.paths ? { paths: input.paths } : {}),
    ...(input.maxItems ? { maxItems: input.maxItems } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.semantic ? { semantic: input.semantic } : {})
  });
}
