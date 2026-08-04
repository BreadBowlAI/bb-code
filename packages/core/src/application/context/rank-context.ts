import type { ContextItem } from "../../domain/context.js";
import type { CurrentStatement } from "../../domain/knowledge.js";
import type { SemanticHit } from "../../ports/semantic-retrieval.js";

const ACTIVE_STATUSES = new Set(["active", "accepted"]);
const RECIPROCAL_RANK_K = 60;

type LexicalHit = { statement: CurrentStatement; rank: number };
type RankedCandidate = { statement: CurrentStatement; score: number; lexicalRank?: number; semanticRank?: number };

function applicability(statement: CurrentStatement, paths: string[]): { applies: boolean; reason: string } {
  if (!ACTIVE_STATUSES.has(statement.status)) return { applies: false, reason: `status:${statement.status}` };
  if (statement.scope.kind === "repository") return { applies: true, reason: "repository-wide" };
  const prefix = statement.scope.prefix;
  if (paths.length === 0) return { applies: true, reason: `path:${prefix} (task path unknown)` };
  const matched = paths.some((path) => path === prefix || path.startsWith(`${prefix}/`));
  return { applies: matched, reason: matched ? `path:${prefix}` : `outside:${prefix}` };
}

function multiplier(statement: CurrentStatement, paths: string[]): number {
  const kindWeight = statement.kind === "commitment" ? 1.35 : statement.kind === "intent" ? 1.2 : 1;
  if (statement.scope.kind !== "path") return kindWeight;
  const prefix = statement.scope.prefix;
  if (paths.some((path) => path === prefix)) return kindWeight * 1.25;
  if (paths.some((path) => path.startsWith(`${prefix}/`))) return kindWeight * 1.1;
  return kindWeight;
}

export function rankContext(input: {
  lexical: LexicalHit[];
  semantic: SemanticHit[];
  fallback: CurrentStatement[];
  resolveStatement: (id: string) => CurrentStatement | undefined;
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
    if (!statement) return;
    const semanticRank = index + 1;
    scores.set(hit.statementId, { statement, score: (existing?.score ?? 0) + 1 / (RECIPROCAL_RANK_K + semanticRank), ...(existing?.lexicalRank ? { lexicalRank: existing.lexicalRank } : {}), semanticRank });
  });
  if (scores.size === 0) {
    for (const statement of input.fallback) scores.set(statement.id, { statement, score: 0.001 });
  }
  return [...scores.values()]
    .map((candidate) => ({ ...candidate, applicability: applicability(candidate.statement, input.paths) }))
    .filter((candidate) => candidate.applicability.applies)
    .map((candidate) => ({ ...candidate, score: candidate.score * multiplier(candidate.statement, input.paths) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, input.maxItems)
    .map((candidate, index) => ({
      ...candidate.statement,
      rank: index + 1,
      finalScore: candidate.score,
      ...(candidate.lexicalRank ? { lexicalRank: candidate.lexicalRank } : {}),
      ...(candidate.semanticRank ? { semanticRank: candidate.semanticRank } : {}),
      freshness: "unknown",
      applicabilityReason: candidate.applicability.reason
    }));
}
