import { describe, expect, it } from "vitest";
import { evaluateApplicability } from "../../../src/application/context/evaluate-applicability.js";
import type { CurrentStatement } from "../../../src/domain/knowledge.js";

const belief: CurrentStatement = { id: "bel_1", revisionId: "rev_1", kind: "belief", body: "The parser is generated", status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, revisionNumber: 1, createdAt: "2026-01-01T00:00:00Z" };

describe("dirty belief applicability", () => {
  it("requires the same worktree and dirty fingerprint", () => {
    const result = evaluateApplicability({ statement: belief, paths: [], beliefFacts: [{ dirty: true, sameWorktree: true, sameDirtyFingerprint: false, reachable: false, mergeReachable: false, branchMentioned: false, blobs: "unknown" }] });
    expect(result).toMatchObject({ applies: false, reason: "dirty evidence belongs to a different worktree state" });
  });
});
