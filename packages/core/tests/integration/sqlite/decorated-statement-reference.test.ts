import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { beliefDraft, commitmentDraft } from "../../support/statements.js";

describe("decorated statement references", () => {
  it("round-trips rendered citations through explain, context effects, and reconciliation", () => {
    const fixture = createSqliteFixture();
    try {
      const commitment = fixture.database.createStatement(fixture.repositoryId, commitmentDraft());
      const citation = `bb:${commitment.id}@${commitment.revisionId}`;
      expect(fixture.database.explainStatement(citation).current.id).toBe(commitment.id);
      const belief = fixture.database.createStatement(fixture.repositoryId, beliefDraft("Authentication uses bearer tokens"));
      fixture.database.propose(fixture.repositoryId, undefined, { operation: "revise", targetStatementId: `bb:${belief.id}@${belief.revisionId}`, body: "Authentication uses secure bearer tokens", rationale: "The implementation was inspected", evidencePaths: [], evidenceNotes: [] });
      expect(fixture.database.getStatement(belief.id).body).toBe("Authentication uses secure bearer tokens");

      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "cursor", externalSessionId: "decorated" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Respect privacy", gitViewId: fixture.gitViewId });
      fixture.database.logRetrieval({ repositoryId: fixture.repositoryId, runId, gitViewId: fixture.gitViewId, query: "privacy", paths: [], providerStatus: { local: "ok" }, renderedTokenCount: 20, items: [{ ...commitment, rank: 1, finalScore: 1, freshness: "fresh", applicabilityReason: "repository-wide" }] });
      expect(() => fixture.database.completeRun(fixture.repositoryId, {
        runId,
        outcome: "completed",
        summary: "Respected privacy",
        verification: [],
        effects: [{ statementId: citation, effect: "avoided_violation" }],
        reconciliations: [{ statementId: citation, disposition: "preserved", reason: "The work remains compatible" }],
        requestIntent: { disposition: "ephemeral", reason: "The request is complete" },
        endGitViewId: fixture.gitViewId,
        proposals: []
      })).not.toThrow();
      expect(fixture.database.explainStatement(citation).reconciliations).toContainEqual(expect.objectContaining({ disposition: "preserved", reason: "The work remains compatible" }));
    } finally { fixture.dispose(); }
  });
});
