import type { StatementApplicability } from "../../domain/context.js";
import type { CurrentStatement } from "../../domain/knowledge.js";

export type BeliefAnchorFact = {
  dirty: boolean;
  sameWorktree: boolean;
  sameDirtyFingerprint: boolean;
  reachable: boolean;
  mergeReachable: boolean;
  branchMentioned: boolean;
  blobs: "unchanged" | "changed" | "unknown";
};

function scopeApplies(statement: CurrentStatement, paths: string[]): StatementApplicability | undefined {
  if (statement.status !== "active" && statement.status !== "accepted") return { applies: false, freshness: "unknown", reason: `status:${statement.status}` };
  if (statement.scope.kind === "repository") return undefined;
  const prefix = statement.scope.prefix;
  if (paths.length === 0) return { applies: true, freshness: "unknown", reason: `path:${prefix} (request path unknown)` };
  const matched = paths.some((path) => path === prefix || path.startsWith(`${prefix}/`) || prefix.startsWith(`${path}/`));
  return matched ? undefined : { applies: false, freshness: "unknown", reason: `outside:${prefix}` };
}

export function evaluateApplicability(input: { statement: CurrentStatement; paths: string[]; beliefFacts?: BeliefAnchorFact[] }): StatementApplicability {
  const scoped = scopeApplies(input.statement, input.paths);
  if (scoped) return scoped;
  const scopeReason = input.statement.scope.kind === "repository" ? "repository-wide" : `path:${input.statement.scope.prefix}`;
  if (input.statement.kind !== "belief") return { applies: true, freshness: "fresh", reason: scopeReason };
  const facts = input.beliefFacts ?? [];
  if (facts.length === 0) return { applies: true, freshness: "unknown", reason: `${scopeReason}; no Git anchor` };
  const exactDirty = facts.find((fact) => fact.dirty && fact.sameWorktree && fact.sameDirtyFingerprint);
  if (exactDirty) return { applies: true, freshness: exactDirty.blobs === "changed" ? "stale" : "fresh", reason: `${scopeReason}; same dirty worktree` };
  const cleanFacts = facts.filter((fact) => !fact.dirty);
  const reachable = cleanFacts.find((fact) => fact.reachable);
  if (reachable) return { applies: true, freshness: reachable.blobs === "changed" ? "stale" : reachable.blobs === "unchanged" ? "fresh" : "unknown", reason: `${scopeReason}; evidence commit is an ancestor` };
  const mergeOrNamed = cleanFacts.find((fact) => fact.mergeReachable || fact.branchMentioned);
  if (mergeOrNamed) return { applies: true, freshness: mergeOrNamed.blobs === "changed" ? "stale" : "unknown", reason: `${scopeReason}; divergent evidence explicitly in scope` };
  if (cleanFacts.length === 0) return { applies: false, freshness: "unknown", reason: "dirty evidence belongs to a different worktree state" };
  return { applies: false, freshness: "unknown", reason: "evidence commit is on a divergent branch" };
}
