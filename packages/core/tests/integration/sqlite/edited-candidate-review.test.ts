import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("edited candidate review", () => {
  it("preserves the agent proposal separately from the accepted human edit", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.setKnowledgeMode(fixture.repositoryId, "strict", owner);
      const original = { operation: "create" as const, kind: "belief" as const, body: "Original agent wording", scope: { kind: "repository" as const }, attributes: { confidence: 0.6 }, rationale: "Agent rationale", evidencePaths: [], evidenceNotes: [] };
      const id = fixture.database.propose(fixture.repositoryId, undefined, original, fixture.gitViewId);
      fixture.database.resolveCandidate(id, "accept", owner, "Clarified", { ...original, body: "Human-reviewed wording", rationale: "Human-reviewed rationale" });
      const reviewed = fixture.database.listCandidates(fixture.repositoryId, "edited")[0]!;
      expect(reviewed.proposal.body).toBe("Original agent wording");
      expect(reviewed.acceptedProposal?.body).toBe("Human-reviewed wording");
    } finally { fixture.dispose(); }
  });
});
