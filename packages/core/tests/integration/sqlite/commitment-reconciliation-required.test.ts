import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { commitmentDraft } from "../../support/statements.js";

describe("commitment reconciliation", () => {
  it("requires exactly one disposition for every commitment retrieved into a run", () => {
    const fixture = createSqliteFixture();
    try {
      const commitment = fixture.database.createStatement(fixture.repositoryId, commitmentDraft());
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "cursor", externalSessionId: "reconciliation" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Keep storage private", gitViewId: fixture.gitViewId });
      fixture.database.logRetrieval({ repositoryId: fixture.repositoryId, runId, gitViewId: fixture.gitViewId, query: "storage private", paths: [], providerStatus: { local: "ok" }, renderedTokenCount: 20, items: [{ ...commitment, rank: 1, finalScore: 1, freshness: "fresh", applicabilityReason: "repository-wide" }] });
      const completion = { runId, outcome: "completed" as const, summary: "Kept storage private", verification: [], effects: [], requestIntent: { disposition: "ephemeral" as const, reason: "The request completed in this run" }, endGitViewId: fixture.gitViewId, proposals: [] };

      expect(() => fixture.database.completeRun(fixture.repositoryId, completion)).toThrow(/requires a commitmentReconciliations entry/);
      expect(() => fixture.database.completeRun(fixture.repositoryId, { ...completion, reconciliations: [{ statementId: commitment.id, disposition: "preserved", reason: "The request remains compatible" }] })).not.toThrow();
    } finally { fixture.dispose(); }
  });
});
