import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("silent Stop finalization", () => {
  it("closes an unfinished run immediately with a structured missing-finish reason", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "cursor", externalSessionId: "silent-stop" });
      const runId = fixture.database.startRun({ sessionId, externalTurnId: "generation-1", prompt: "Change a file", gitViewId: fixture.gitViewId });
      expect(fixture.database.handleStop(runId, "finalize_partial")).toBe("finalized");

      const raw = new DatabaseSync(fixture.database.filename);
      try {
        expect(raw.prepare("SELECT status,completion_reason,stop_nudge_count FROM runs WHERE id=?").get(runId)).toEqual({ status: "partial", completion_reason: "missing_finish", stop_nudge_count: 0 });
      } finally {
        raw.close();
      }
    } finally {
      fixture.dispose();
    }
  });
});
