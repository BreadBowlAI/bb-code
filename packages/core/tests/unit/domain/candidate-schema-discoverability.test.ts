import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CandidateProposalSchema } from "../../../src/domain/knowledge.js";

describe("candidate schema discoverability", () => {
  it("advertises every kind-specific attribute field to tool clients", () => {
    const schema = JSON.stringify(z.toJSONSchema(CandidateProposalSchema, { unrepresentable: "any" }));

    for (const field of ["owner", "priority", "successConditions", "confidence", "rationale", "authority", "revisitCondition", "repository-owner"]) {
      expect(schema).toContain(field);
    }
  });
});
