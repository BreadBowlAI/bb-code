import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { commitmentDraft } from "../../support/statements.js";

describe("commitment reconciliation transition linkage", () => {
  it("rejects a lifecycle disposition without the matching proposal", () => {
    const fixture = createSqliteFixture();
    try {
      const commitment = fixture.database.createStatement(fixture.repositoryId, commitmentDraft());
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "cursor", externalSessionId: "transition-linkage" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Retire the privacy constraint", gitViewId: fixture.gitViewId });
      fixture.database.logRetrieval({ repositoryId: fixture.repositoryId, runId, gitViewId: fixture.gitViewId, query: "privacy constraint", paths: [], providerStatus: { local: "ok" }, renderedTokenCount: 20, items: [{ ...commitment, rank: 1, finalScore: 1, freshness: "fresh", applicabilityReason: "repository-wide" }] });

      expect(() => fixture.database.completeRun(fixture.repositoryId, {
        runId,
        outcome: "completed",
        summary: "Claimed to retire the constraint",
        verification: [],
        effects: [],
        reconciliations: [{ statementId: commitment.id, disposition: "retired", reason: "The owner changed direction" }],
        requestIntent: { disposition: "ephemeral", reason: "The request is complete" },
        endGitViewId: fixture.gitViewId,
        proposals: []
      })).toThrow(/requires a matching lifecycle proposal/);
    } finally { fixture.dispose(); }
  });
});
