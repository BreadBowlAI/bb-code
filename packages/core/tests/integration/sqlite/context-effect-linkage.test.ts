import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { beliefDraft } from "../../support/statements.js";

describe("context effect linkage", () => {
  it("accepts an effect only for a statement logged in that run's retrieval", () => {
    const fixture = createSqliteFixture();
    try {
      const statement = fixture.database.createStatement(fixture.repositoryId, beliefDraft("Use SQLite FTS5 locally"));
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "effects" });
      const runId = fixture.database.startRun({ sessionId, prompt: "search", gitViewId: fixture.gitViewId });
      fixture.database.logRetrieval({ repositoryId: fixture.repositoryId, runId, gitViewId: fixture.gitViewId, query: "search", paths: [], providerStatus: { local: "ok" }, renderedTokenCount: 20, items: [{ ...statement, rank: 1, finalScore: 1, freshness: "fresh", applicabilityReason: "repository-wide" }] });
      expect(() => fixture.database.completeRun(fixture.repositoryId, { runId, outcome: "completed", summary: "Used prior context", verification: [], effects: [{ statementId: statement.id, effect: "changed_plan" }], requestIntent: { disposition: "ephemeral", reason: "The test request is scoped to this run" }, endGitViewId: fixture.gitViewId, proposals: [] })).not.toThrow();
    } finally { fixture.dispose(); }
  });
});
