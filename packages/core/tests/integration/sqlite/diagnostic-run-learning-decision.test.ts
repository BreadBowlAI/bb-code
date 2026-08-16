import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("diagnostic run learning decision", () => {
  it("requires a belief proposal or reason after read-only tool work", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "diagnostic-learning" });
      const runId = fixture.database.startRun({ sessionId, prompt: "How does login work?", gitViewId: fixture.gitViewId });
      fixture.database.addRunEvent(runId, { kind: "after_tool", toolName: "Read", paths: [], consequential: false });
      const completion = { runId, outcome: "completed", summary: "Inspected login", verification: [], effects: [], requestIntent: { disposition: "ephemeral" as const, reason: "This was a question, not an ongoing outcome" }, proposals: [], endGitViewId: fixture.gitViewId };
      expect(() => fixture.database.completeRun(fixture.repositoryId, completion)).toThrow(/Tool-assisted run/);
      expect(() => fixture.database.completeRun(fixture.repositoryId, { ...completion, noDurableLearningReason: "The login behavior is already represented by reviewed context." })).not.toThrow();
    } finally { fixture.dispose(); }
  });
});
