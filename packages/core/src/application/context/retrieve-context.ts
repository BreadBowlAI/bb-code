import type { ContextResult } from "../../domain/context.js";
import type { SemanticHit, SemanticRetrievalProvider } from "../../ports/semantic-retrieval.js";
import type { BbDatabase } from "../../infrastructure/sqlite/bb-database.js";
import { rankContext } from "./rank-context.js";
import { renderContext } from "./render-context.js";

export async function retrieveContext(input: {
  database: BbDatabase;
  repositoryId: string;
  gitViewId: string;
  query: string;
  paths?: string[];
  runId?: string;
  maxItems?: number;
  semantic?: SemanticRetrievalProvider;
}): Promise<ContextResult> {
  const paths = input.paths ?? [];
  const lexical = input.database.searchLexical(input.repositoryId, input.query, 40);
  let semantic: SemanticHit[] = [];
  const providerStatus: Record<string, unknown> = { local: "ok", semantic: input.semantic ? "ok" : "disabled" };
  if (input.semantic) {
    try {
      semantic = await input.semantic.search({ query: input.query, topK: 40, candidateK: 40, signal: AbortSignal.timeout(1_200) });
    } catch (error) {
      providerStatus.semantic = "degraded";
      providerStatus.semanticError = error instanceof Error ? error.message : String(error);
    }
  }
  const items = rankContext({
    lexical,
    semantic,
    fallback: input.database.listStatements(input.repositoryId),
    resolveStatement: (id) => {
      try { return input.database.getStatement(id); }
      catch { return undefined; }
    },
    paths,
    maxItems: Math.min(Math.max(input.maxItems ?? 12, 1), 12)
  });
  const rendered = renderContext(items, input.runId);
  const retrievalId = input.database.logRetrieval({ repositoryId: input.repositoryId, ...(input.runId ? { runId: input.runId } : {}), gitViewId: input.gitViewId, query: input.query, paths, providerStatus, renderedTokenCount: Math.ceil(rendered.length / 4), items });
  return { retrievalId, ...(input.runId ? { runId: input.runId } : {}), items, rendered, providerStatus };
}
