import { describe, expect, it } from "vitest";
import { CandidateProposalSchema } from "../../../src/domain/knowledge.js";

describe("candidate revise validation", () => {
  it("rejects revisions that do not propose a field change", () => {
    expect(CandidateProposalSchema.safeParse({ operation: "revise", targetStatementId: "bel_1", rationale: "No actual change" }).success).toBe(false);
  });
});
