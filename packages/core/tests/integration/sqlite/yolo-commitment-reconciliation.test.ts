import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { commitmentDraft, owner } from "../../support/statements.js";

describe("yolo commitment reconciliation", () => {
  it("atomically supersedes a retrieved commitment instead of leaving stale constraints active", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.setKnowledgeMode(fixture.repositoryId, "yolo", owner);
      const commitment = fixture.database.createStatement(fixture.repositoryId, commitmentDraft("Profile completion must block access to the homepage"));
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "cursor", externalSessionId: "yolo-reversal" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Let incomplete profiles use the homepage", gitViewId: fixture.gitViewId });
      fixture.database.logRetrieval({ repositoryId: fixture.repositoryId, runId, gitViewId: fixture.gitViewId, query: "incomplete profiles homepage", paths: [], providerStatus: { local: "ok" }, renderedTokenCount: 20, items: [{ ...commitment, rank: 1, finalScore: 1, freshness: "fresh", applicabilityReason: "repository-wide" }] });

      fixture.database.completeRun(fixture.repositoryId, {
        runId,
        outcome: "completed",
        summary: "Changed the profile gate",
        verification: [],
        effects: [{ statementId: commitment.id, effect: "changed_plan" }],
        reconciliations: [{ statementId: commitment.id, disposition: "superseded", reason: "The owner explicitly reversed the old gate" }],
        requestIntent: { disposition: "ephemeral", reason: "The requested change is complete" },
        endGitViewId: fixture.gitViewId,
        proposals: [{ operation: "supersede", targetStatementId: commitment.id, body: "Incomplete profiles may use the homepage but cannot browse other profiles", rationale: "The owner replaced the old blocking flow", evidencePaths: [], evidenceNotes: [] }]
      });

      expect(fixture.database.getStatement(commitment.id).status).toBe("superseded");
      expect(fixture.database.listStatements(fixture.repositoryId)).toContainEqual(expect.objectContaining({ kind: "commitment", status: "accepted", body: "Incomplete profiles may use the homepage but cannot browse other profiles" }));
    } finally { fixture.dispose(); }
  });
});
