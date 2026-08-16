import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("atomic run completion", () => {
  it("rolls back candidates when a context effect is invalid", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "atomic" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Learn safely", gitViewId: fixture.gitViewId });
      expect(() => fixture.database.completeRun(fixture.repositoryId, { runId, outcome: "completed", summary: "done", verification: [], effects: [{ statementId: "bel_missing", effect: "changed_plan" }], requestIntent: { disposition: "ephemeral", reason: "The test request is scoped to this run" }, endGitViewId: fixture.gitViewId, proposals: [{ operation: "create", kind: "belief", body: "A pending belief", scope: { kind: "repository" }, attributes: { confidence: 0.7 }, rationale: "Observed", evidencePaths: [], evidenceNotes: [] }] })).toThrow();
      expect(fixture.database.listCandidates(fixture.repositoryId)).toEqual([]);
    } finally { fixture.dispose(); }
  });
});
