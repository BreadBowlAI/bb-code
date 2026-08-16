import type { ContextItem, StatementApplicability } from "../../domain/context.js";
import type { CurrentStatement } from "../../domain/knowledge.js";
import type { SemanticHit } from "../../ports/semantic-retrieval.js";
import { evaluateApplicability } from "./evaluate-applicability.js";

const RECIPROCAL_RANK_K = 60;

type LexicalHit = { statement: CurrentStatement; rank: number; score?: number };
type RankedCandidate = { statement: CurrentStatement; score: number; lexicalRank?: number; semanticRank?: number; lexicalScore?: number; semanticScore?: number };

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function selectRelevantSemanticHits(hits: SemanticHit[]): SemanticHit[] {
  const ranked = hits.filter((hit) => Number.isFinite(hit.score)).sort((left, right) => right.score - left.score);
  if (ranked.length <= 2) return ranked;
  const scores = ranked.map((hit) => hit.score);
  const center = median(scores);
  const deviation = median(scores.map((score) => Math.abs(score - center)));
  const spread = scores[0]! - scores.at(-1)!;
  if (Math.abs(spread) <= Number.EPSILON) return [];
  const cutoff = center + Math.max(deviation, spread * 0.1);
  return ranked.filter((hit) => hit.score >= cutoff).slice(0, 12);
}

function statementTerms(statement: CurrentStatement): Set<string> {
  return new Set(statement.body.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? []);
}

function materiallyDuplicates(left: CurrentStatement, right: CurrentStatement): boolean {
  const a = statementTerms(left);
  const b = statementTerms(right);
  if (!a.size || !b.size) return false;
  let intersection = 0;
  for (const term of a) if (b.has(term)) intersection += 1;
  return intersection / Math.min(a.size, b.size) >= 0.82;
}

function multiplier(statement: CurrentStatement, paths: string[], freshness: StatementApplicability["freshness"]): number {
  const freshnessWeight = freshness === "stale" ? 0.6 : 1;
  if (statement.scope.kind !== "path") return freshnessWeight;
  const prefix = statement.scope.prefix;
  if (paths.some((path) => path === prefix)) return 1.25 * freshnessWeight;
  if (paths.some((path) => path.startsWith(`${prefix}/`) || prefix.startsWith(`${path}/`))) return 1.1 * freshnessWeight;
  return freshnessWeight;
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
    const lexicalScore = hit.score ?? 1;
    scores.set(hit.statement.id, { statement: hit.statement, score: (1 / (RECIPROCAL_RANK_K + hit.rank)) * (0.5 + lexicalScore * 0.5), lexicalRank: hit.rank, lexicalScore });
  }
  const semantic = [...input.semantic].sort((left, right) => right.score - left.score);
  const semanticHigh = semantic[0]?.score;
  const semanticLow = semantic.at(-1)?.score;
  semantic.forEach((hit, index) => {
    const existing = scores.get(hit.statementId);
    const statement = existing?.statement ?? input.resolveStatement(hit.statementId);
    if (!statement || (hit.revisionId && hit.revisionId !== statement.revisionId)) return;
    const semanticRank = index + 1;
    const normalized = semanticHigh === semanticLow ? 1 : (hit.score - semanticLow!) / (semanticHigh! - semanticLow!);
    const semanticContribution = (1 / (RECIPROCAL_RANK_K + semanticRank)) * (0.5 + normalized * 0.5);
    scores.set(hit.statementId, { statement, score: (existing?.score ?? 0) + semanticContribution, ...(existing?.lexicalRank ? { lexicalRank: existing.lexicalRank } : {}), ...(existing?.lexicalScore !== undefined ? { lexicalScore: existing.lexicalScore } : {}), semanticRank, semanticScore: hit.score });
  });
  const ordered = [...scores.values()]
    .map((candidate) => ({ ...candidate, applicability: input.applicability?.get(candidate.statement.id) ?? evaluateApplicability({ statement: candidate.statement, paths: input.paths }) }))
    .filter((candidate) => candidate.applicability.applies)
    .map((candidate) => ({ ...candidate, score: candidate.score * multiplier(candidate.statement, input.paths, candidate.applicability.freshness) }))
    .sort((left, right) => right.score - left.score || left.statement.id.localeCompare(right.statement.id));
  const diversified: typeof ordered = [];
  for (const candidate of ordered) {
    if (diversified.some((selected) => materiallyDuplicates(selected.statement, candidate.statement))) continue;
    diversified.push(candidate);
    if (diversified.length >= input.maxItems) break;
  }
  return diversified
    .map((candidate, index) => ({
      ...candidate.statement,
      rank: index + 1,
      finalScore: candidate.score,
      ...(candidate.lexicalRank ? { lexicalRank: candidate.lexicalRank } : {}),
      ...(candidate.semanticRank ? { semanticRank: candidate.semanticRank } : {}),
      ...(candidate.lexicalScore !== undefined ? { lexicalScore: candidate.lexicalScore } : {}),
      ...(candidate.semanticScore !== undefined ? { semanticScore: candidate.semanticScore } : {}),
      freshness: candidate.applicability.freshness,
      applicabilityReason: candidate.applicability.reason,
      ...(input.conflicts?.has(candidate.statement.id) ? { conflict: true } : {})
    }));
}
