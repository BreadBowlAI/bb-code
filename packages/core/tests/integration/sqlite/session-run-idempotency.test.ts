import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("session and run idempotency", () => {
  it("reuses host session and turn identities", () => {
    const fixture = createSqliteFixture();
    try {
      const input = { repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "same-session" };
      const firstSession = fixture.database.startSession(input);
      const secondSession = fixture.database.startSession(input);
      expect(secondSession).toBe(firstSession);

      const runInput = { sessionId: firstSession, externalTurnId: "same-turn", prompt: "Same request", gitViewId: fixture.gitViewId };
      const firstRun = fixture.database.startRun(runInput);
      const secondRun = fixture.database.startRun(runInput);
      expect(secondRun).toBe(firstRun);
    } finally {
      fixture.dispose();
    }
  });
});
