import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("accepted create evidence deduplication", () => {
  it("links the proposal evidence to its new revision only as defining evidence", () => {
    const fixture = createSqliteFixture();
    try {
      const candidateId = fixture.database.propose(fixture.repositoryId, undefined, {
        operation: "create",
        kind: "commitment",
        body: "Services run in containers",
        scope: { kind: "repository" },
        attributes: { rationale: "Deployment consistency", authority: owner },
        rationale: "The owner required container deployment",
        evidencePaths: [],
        evidenceNotes: []
      });
      const statement = fixture.database.resolveCandidate(candidateId, "accept", owner)!;
      const evidence = fixture.database.explainStatement(statement.id).history[0]!.evidence as Array<Record<string, unknown>>;

      expect(evidence).toHaveLength(1);
      expect(evidence[0]).toMatchObject({ kind: "agent_proposal", relationship: "defines" });
    } finally { fixture.dispose(); }
  });
});
