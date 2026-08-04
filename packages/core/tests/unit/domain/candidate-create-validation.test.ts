import { describe, expect, it } from "vitest";
import { CandidateProposalSchema } from "../../../src/domain/knowledge.js";

describe("candidate create validation", () => {
  it("requires the kind-specific statement fields", () => {
    expect(CandidateProposalSchema.safeParse({ operation: "create", rationale: "missing fields" }).success).toBe(false);
    expect(CandidateProposalSchema.safeParse({ operation: "create", kind: "belief", body: "A fact", scope: { kind: "repository" }, attributes: { confidence: 0.7 }, rationale: "Evidence" }).success).toBe(true);
  });
});
