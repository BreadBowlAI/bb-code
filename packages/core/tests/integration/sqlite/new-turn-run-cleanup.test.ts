import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("new-turn run cleanup", () => {
  it("closes an older unfinished generation before starting the next one", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "cursor", externalSessionId: "conversation" });
      const firstRunId = fixture.database.startRun({ sessionId, externalTurnId: "generation-1", prompt: "First request", gitViewId: fixture.gitViewId });
      fixture.database.startRun({ sessionId, externalTurnId: "generation-2", prompt: "Second request", gitViewId: fixture.gitViewId });

      const raw = new DatabaseSync(fixture.database.filename);
      try {
        expect(raw.prepare("SELECT status,completion_reason FROM runs WHERE id=?").get(firstRunId)).toEqual({ status: "partial", completion_reason: "missing_finish" });
      } finally {
        raw.close();
      }
    } finally {
      fixture.dispose();
    }
  });
});
