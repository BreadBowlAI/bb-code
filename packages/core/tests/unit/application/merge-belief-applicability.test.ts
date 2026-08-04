import { describe, expect, it } from "vitest";
import { evaluateApplicability } from "../../../src/application/context/evaluate-applicability.js";
import type { CurrentStatement } from "../../../src/domain/knowledge.js";

const belief: CurrentStatement = { id: "bel_merge", revisionId: "rev_merge", kind: "belief", body: "The topic branch uses a queue", status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, revisionNumber: 1, createdAt: "2026-01-01T00:00:00Z" };

describe("active merge belief applicability", () => {
  it("includes divergent evidence when an active merge head contains its anchor", () => {
    const result = evaluateApplicability({
      statement: belief,
      paths: [],
      beliefFacts: [{ dirty: false, sameWorktree: true, sameDirtyFingerprint: true, reachable: false, mergeReachable: true, branchMentioned: false, blobs: "unchanged" }]
    });

    expect(result).toMatchObject({ applies: true, reason: expect.stringContaining("divergent evidence explicitly in scope") });
  });
});
