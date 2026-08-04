import { describe, expect, it } from "vitest";
import { evaluateApplicability } from "../../../src/application/context/evaluate-applicability.js";
import type { CurrentStatement } from "../../../src/domain/knowledge.js";

const belief: CurrentStatement = { id: "bel_1", revisionId: "rev_1", kind: "belief", body: "The parser is generated", status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, revisionNumber: 1, createdAt: "2026-01-01T00:00:00Z" };

describe("stale belief applicability", () => {
  it("keeps reachable beliefs visible with stale freshness when a supporting blob changed", () => {
    const result = evaluateApplicability({ statement: belief, paths: [], beliefFacts: [{ dirty: false, sameWorktree: true, sameDirtyFingerprint: true, reachable: true, mergeReachable: false, branchMentioned: false, blobs: "changed" }] });
    expect(result).toMatchObject({ applies: true, freshness: "stale" });
  });
});
