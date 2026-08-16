import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("learning audit", () => {
  it("reports request-intent coverage separately from consequential context effects", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "audit" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Explain the project", gitViewId: fixture.gitViewId });
      fixture.database.completeRun(fixture.repositoryId, { runId, outcome: "completed", summary: "Explained", verification: [], effects: [], requestIntent: { disposition: "ephemeral", reason: "This was an explanation" }, proposals: [], endGitViewId: fixture.gitViewId });
      expect(fixture.database.audit(fixture.repositoryId).learning).toMatchObject({ runs: 1, requestIntents: { durable: 0, ephemeral: 1, missing: 0 }, contextEffects: { material: 0, noEffect: 0 } });
    } finally { fixture.dispose(); }
  });
});
