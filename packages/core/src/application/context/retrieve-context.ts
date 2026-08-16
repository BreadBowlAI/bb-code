import type { ContextResult } from "../../domain/context.js";
import type { SemanticHit, SemanticRetrievalProvider } from "../../ports/semantic-retrieval.js";
import type { BbDatabase } from "../../infrastructure/sqlite/bb-database.js";
import type { GitSnapshot } from "../../infrastructure/git/git-client.js";
import { rankContext, selectRelevantSemanticHits } from "./rank-context.js";
import { renderContextResult } from "./render-context.js";
import { resolveApplicability } from "./resolve-applicability.js";
import { buildSemanticQuery } from "./build-query.js";

export async function retrieveContext(input: {
  database: BbDatabase;
  repositoryId: string;
  gitViewId: string;
  git: GitSnapshot;
  query: string;
  paths?: string[];
  runId?: string;
  maxItems?: number;
  semantic?: SemanticRetrievalProvider;
}): Promise<ContextResult> {
  const paths = input.paths ?? [];
  const lexicalQuery = [...paths, input.query].join(" ");
  const lexical = input.database.searchLexical(input.repositoryId, lexicalQuery, 40);
  const semanticQuery = buildSemanticQuery(input.query, paths);
  let semantic: SemanticHit[] = [];
  const providerStatus: Record<string, unknown> = { local: "ok", semantic: input.semantic ? "ok" : "disabled" };
  if (input.semantic && !semanticQuery) providerStatus.semantic = "abstained";
  if (input.semantic && semanticQuery) {
    try {
      const rawSemantic = await input.semantic.search({ query: semanticQuery, topK: 40, candidateK: 100, signal: AbortSignal.timeout(1_200) });
      semantic = selectRelevantSemanticHits(rawSemantic);
      providerStatus.semanticCandidates = rawSemantic.length;
      providerStatus.semanticSelected = semantic.length;
      if (rawSemantic.length > 0 && semantic.length === 0) providerStatus.semantic = "abstained";
    } catch (error) {
      providerStatus.semantic = "degraded";
      providerStatus.semanticError = error instanceof Error ? error.message : String(error);
    }
  }
  const candidates = new Map(lexical.map((hit) => [hit.statement.id, hit.statement]));
  for (const hit of semantic) {
    try {
      const statement = input.database.getStatement(hit.statementId, input.repositoryId);
      candidates.set(statement.id, statement);
    } catch { /* A remote ID is never authoritative. */ }
  }
  const applicability = await resolveApplicability({ database: input.database, repositoryId: input.repositoryId, gitViewId: input.gitViewId, git: input.git, statements: [...candidates.values()], paths, query: input.query });
  const conflicts = input.database.conflictingStatementIds(input.repositoryId, [...candidates.keys()]);
  for (const statement of candidates.values()) if (input.database.hasContradictoryEvidence(statement.id)) conflicts.add(statement.id);
  const ranked = rankContext({
    lexical,
    semantic,
    resolveStatement: (id) => {
      try { return candidates.get(id); }
      catch { return undefined; }
    },
    applicability,
    conflicts,
    paths,
    maxItems: Math.min(Math.max(input.maxItems ?? 12, 1), 12)
  });
  const rendered = renderContextResult(ranked, input.runId);
  const retrievalId = input.database.logRetrieval({ repositoryId: input.repositoryId, ...(input.runId ? { runId: input.runId } : {}), gitViewId: input.gitViewId, query: input.query, paths, providerStatus, renderedTokenCount: rendered.tokenCount, items: rendered.items });
  return { retrievalId, ...(input.runId ? { runId: input.runId } : {}), items: rendered.items, rendered: rendered.rendered, conflicts: rendered.conflicts, providerStatus };
}
