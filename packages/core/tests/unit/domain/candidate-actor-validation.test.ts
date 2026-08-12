import { describe, expect, it } from "vitest";
import { CandidateProposalSchema } from "../../../src/domain/knowledge.js";

describe("candidate actor validation", () => {
  it("reports missing actor fields at their exact proposal paths", () => {
    const result = CandidateProposalSchema.safeParse({
      operation: "create",
      kind: "intent",
      body: "Ship the first release",
      scope: { kind: "repository" },
      attributes: { owner: {}, priority: "normal", successConditions: [] },
      rationale: "The user requested it"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining([
        "attributes.owner.kind",
        "attributes.owner.id"
      ]));
    }
  });
});
