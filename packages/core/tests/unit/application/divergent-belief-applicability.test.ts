import { describe, expect, it } from "vitest";
import { evaluateApplicability } from "../../../src/application/context/evaluate-applicability.js";
import type { CurrentStatement } from "../../../src/domain/knowledge.js";

const belief: CurrentStatement = { id: "bel_1", revisionId: "rev_1", kind: "belief", body: "The feature branch uses a queue", status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, revisionNumber: 1, createdAt: "2026-01-01T00:00:00Z" };

describe("divergent belief applicability", () => {
  it("includes divergent evidence only when its branch is explicitly named", () => {
    const base = { dirty: false, sameWorktree: true, sameDirtyFingerprint: true, reachable: false, mergeReachable: false, blobs: "unchanged" as const };
    expect(evaluateApplicability({ statement: belief, paths: [], beliefFacts: [{ ...base, branchMentioned: false }] }).applies).toBe(false);
    expect(evaluateApplicability({ statement: belief, paths: [], beliefFacts: [{ ...base, branchMentioned: true }] }).applies).toBe(true);
  });
});
