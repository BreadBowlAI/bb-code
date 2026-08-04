import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("run stop policy", () => {
  it("nudges once and then finalizes a consequential unfinished run", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "claude", externalSessionId: "session-2" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Change a file", gitViewId: fixture.gitViewId });
      fixture.database.addRunEvent(runId, { kind: "after_tool", toolName: "Edit", paths: ["src/a.ts"] });
      expect(fixture.database.handleStop(runId)).toBe("nudge");
      expect(fixture.database.handleStop(runId)).toBe("finalized");
      expect(fixture.database.handleStop(runId)).toBe("none");
    } finally { fixture.dispose(); }
  });
});
