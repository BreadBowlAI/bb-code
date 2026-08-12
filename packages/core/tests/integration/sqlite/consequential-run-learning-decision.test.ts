import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("consequential run learning decision", () => {
  it("requires a proposal or an explicit no-learning reason", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "learning-decision" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Implement a feature", gitViewId: fixture.gitViewId });
      fixture.database.addRunEvent(runId, { kind: "after_tool", toolName: "apply_patch", paths: ["src/feature.ts"], consequential: true });
      const completion = { runId, outcome: "completed", summary: "Implemented the feature", verification: [], effects: [], endGitViewId: fixture.gitViewId, proposals: [] };

      expect(() => fixture.database.completeRun(fixture.repositoryId, completion)).toThrow(/noDurableLearningReason/);
      expect(() => fixture.database.completeRun(fixture.repositoryId, { ...completion, noDurableLearningReason: "The change only applied an already reviewed commitment and introduced no reusable project fact." })).not.toThrow();
    } finally { fixture.dispose(); }
  });
});
