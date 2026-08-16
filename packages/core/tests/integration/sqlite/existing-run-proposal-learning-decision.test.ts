import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("existing run proposal learning decision", () => {
  it("does not require the finish call to duplicate a proposal submitted during the run", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "existing-proposal" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Implement storage", gitViewId: fixture.gitViewId });
      fixture.database.addRunEvent(runId, { kind: "after_tool", toolName: "apply_patch", paths: ["src/storage.ts"], consequential: true });
      fixture.database.propose(fixture.repositoryId, runId, {
        operation: "create",
        kind: "belief",
        body: "Storage uses SQLite",
        scope: { kind: "path", prefix: "src/storage.ts" },
        attributes: { confidence: 0.9 },
        rationale: "Observed during implementation",
        evidencePaths: ["src/storage.ts"],
        evidenceNotes: []
      }, fixture.gitViewId);

      expect(() => fixture.database.completeRun(fixture.repositoryId, { runId, outcome: "completed", summary: "Implemented storage", verification: [], effects: [], requestIntent: { disposition: "ephemeral", reason: "The test request is scoped to this run" }, endGitViewId: fixture.gitViewId, proposals: [] })).not.toThrow();
    } finally { fixture.dispose(); }
  });
});
