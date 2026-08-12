import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("tool event phase deduplication", () => {
  it("records one before and one after event for the same host tool-use ID", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "paired-events" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Edit a file", gitViewId: fixture.gitViewId });
      const shared = { externalEventId: "tool-1", gitViewId: fixture.gitViewId, toolName: "apply_patch" };

      expect(fixture.database.addRunEvent(runId, { ...shared, kind: "before_tool" })).toBe(true);
      expect(fixture.database.addRunEvent(runId, { ...shared, kind: "after_tool", paths: ["src/a.ts"], consequential: true, evidenceKind: "file_change", evidenceSummary: "apply_patch completed" })).toBe(true);
      expect(fixture.database.addRunEvent(runId, { ...shared, kind: "after_tool", paths: ["src/a.ts"], consequential: true })).toBe(false);
    } finally { fixture.dispose(); }
  });
});
