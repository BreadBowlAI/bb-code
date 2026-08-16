import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("quiet run stop policy", () => {
  it("nudges for an explicit request-intent decision even without tool events", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "claude", externalSessionId: "quiet-run" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Help me brainstorm", gitViewId: fixture.gitViewId });
      expect(fixture.database.handleStop(runId)).toBe("nudge");
      expect(fixture.database.handleStop(runId)).toBe("finalized");
    } finally { fixture.dispose(); }
  });
});
