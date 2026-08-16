import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("candidate kind edit", () => {
  it("lets a human correct a create proposal's classification during review", () => {
    const fixture = createSqliteFixture();
    try {
      const original = { operation: "create" as const, kind: "commitment" as const, body: "The API currently exposes password recovery", scope: { kind: "repository" as const }, attributes: { rationale: "Implemented API", authority: { kind: "agent" as const, id: "codex" } }, rationale: "Observed during implementation", evidencePaths: [], evidenceNotes: [] };
      const candidateId = fixture.database.propose(fixture.repositoryId, undefined, original, fixture.gitViewId);
      const corrected = { operation: "create" as const, kind: "belief" as const, body: original.body, scope: original.scope, attributes: { confidence: 0.9 }, rationale: "Human corrected this current fact", evidencePaths: [], evidenceNotes: [] };
      const statement = fixture.database.resolveCandidate(candidateId, "accept", owner, "Reclassified", corrected)!;
      expect(statement.kind).toBe("belief");
      expect(fixture.database.listCandidates(fixture.repositoryId, "edited")[0]?.acceptedProposal?.kind).toBe("belief");
    } finally { fixture.dispose(); }
  });
});
