import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processRuntimeEvent } from "../../../src/application/runtime/process-runtime-event.js";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("verification tool consequences", () => {
  it("treats a sanitized successful test event as evidence worth one Stop nudge", async () => {
    const fixture = createGitFixture();
    const databasePath = join(fixture.directory, "bb.db");
    try {
      const workspace = await openWorkspace(fixture.root, { create: true, databasePath });
      workspace.database.close();
      await processRuntimeEvent({
        schemaVersion: 1,
        host: "claude",
        event: "start_run",
        externalSessionId: "verification-session",
        cwd: fixture.root,
        occurredAt: "2026-01-01T00:00:00.000Z",
        payload: { prompt: "Verify the implementation" }
      }, databasePath);
      await processRuntimeEvent({
        schemaVersion: 1,
        host: "claude",
        event: "before_tool",
        externalSessionId: "verification-session",
        externalToolUseId: "test-tool",
        cwd: fixture.root,
        occurredAt: "2026-01-01T00:00:30.000Z",
        payload: { tool_name: "Bash", tool_category: "test" }
      }, databasePath);
      await processRuntimeEvent({
        schemaVersion: 1,
        host: "claude",
        event: "after_tool",
        externalSessionId: "verification-session",
        externalToolUseId: "test-tool",
        cwd: fixture.root,
        occurredAt: "2026-01-01T00:01:00.000Z",
        payload: { tool_name: "Bash", tool_category: "test", outcome: "success" }
      }, databasePath);
      const stop = await processRuntimeEvent({
        schemaVersion: 1,
        host: "claude",
        event: "finish_run",
        externalSessionId: "verification-session",
        cwd: fixture.root,
        occurredAt: "2026-01-01T00:02:00.000Z",
        payload: {}
      }, databasePath);

      expect(stop.nudge).toContain("bb_finish_run");
      expect(stop.nudge).toContain("fallible claim");
      expect(stop.nudge).toContain("explicit rule, constraint, or chosen decision");
    } finally {
      fixture.dispose();
    }
  });
});
