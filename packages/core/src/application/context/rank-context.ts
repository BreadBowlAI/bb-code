import type { ContextItem, StatementApplicability } from "../../domain/context.js";
import type { CurrentStatement } from "../../domain/knowledge.js";
import type { SemanticHit } from "../../ports/semantic-retrieval.js";
import { evaluateApplicability } from "./evaluate-applicability.js";

const RECIPROCAL_RANK_K = 60;

type LexicalHit = { statement: CurrentStatement; rank: number };
type RankedCandidate = { statement: CurrentStatement; score: number; lexicalRank?: number; semanticRank?: number };

function multiplier(statement: CurrentStatement, paths: string[], freshness: StatementApplicability["freshness"]): number {
  const kindWeight = statement.kind === "commitment" ? 1.35 : statement.kind === "intent" ? 1.2 : 1;
  const freshnessWeight = freshness === "stale" ? 0.6 : 1;
  if (statement.scope.kind !== "path") return kindWeight * freshnessWeight;
  const prefix = statement.scope.prefix;
  if (paths.some((path) => path === prefix)) return kindWeight * 1.25 * freshnessWeight;
  if (paths.some((path) => path.startsWith(`${prefix}/`) || prefix.startsWith(`${path}/`))) return kindWeight * 1.1 * freshnessWeight;
  return kindWeight * freshnessWeight;
}

export function rankContext(input: {
  lexical: LexicalHit[];
  semantic: SemanticHit[];
  fallback?: CurrentStatement[];
  resolveStatement: (id: string) => CurrentStatement | undefined;
  applicability?: Map<string, StatementApplicability>;
  conflicts?: Set<string>;
  paths: string[];
  maxItems: number;
}): ContextItem[] {
  const scores = new Map<string, RankedCandidate>();
  for (const hit of input.lexical) {
    scores.set(hit.statement.id, { statement: hit.statement, score: 1 / (RECIPROCAL_RANK_K + hit.rank), lexicalRank: hit.rank });
  }
  input.semantic.forEach((hit, index) => {
    const existing = scores.get(hit.statementId);
    const statement = existing?.statement ?? input.resolveStatement(hit.statementId);
    if (!statement || (hit.revisionId && hit.revisionId !== statement.revisionId)) return;
    const semanticRank = index + 1;
    scores.set(hit.statementId, { statement, score: (existing?.score ?? 0) + 1 / (RECIPROCAL_RANK_K + semanticRank), ...(existing?.lexicalRank ? { lexicalRank: existing.lexicalRank } : {}), semanticRank });
  });
  return [...scores.values()]
    .map((candidate) => ({ ...candidate, applicability: input.applicability?.get(candidate.statement.id) ?? evaluateApplicability({ statement: candidate.statement, paths: input.paths }) }))
    .filter((candidate) => candidate.applicability.applies)
    .map((candidate) => ({ ...candidate, score: candidate.score * multiplier(candidate.statement, input.paths, candidate.applicability.freshness) }))
    .sort((left, right) => right.score - left.score || left.statement.id.localeCompare(right.statement.id))
    .slice(0, input.maxItems)
    .map((candidate, index) => ({
      ...candidate.statement,
      rank: index + 1,
      finalScore: candidate.score,
      ...(candidate.lexicalRank ? { lexicalRank: candidate.lexicalRank } : {}),
      ...(candidate.semanticRank ? { semanticRank: candidate.semanticRank } : {}),
      freshness: candidate.applicability.freshness,
      applicabilityReason: candidate.applicability.reason,
      ...(input.conflicts?.has(candidate.statement.id) ? { conflict: true } : {})
    }));
}
