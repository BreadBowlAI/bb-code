import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processRuntimeEvent, type RuntimeProcessingPolicy } from "../../../src/application/runtime/process-runtime-event.js";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { createGitFixture } from "../../support/git-fixture.js";

const policy: RuntimeProcessingPolicy = {
  contextAtRunStart: "defer",
  completionReminder: "after_first_consequential_tool",
  unfinishedStop: "finalize_partial"
};

describe("inline completion reminder", () => {
  it("emits hidden guidance only after the first consequential tool event", async () => {
    const fixture = createGitFixture();
    const databasePath = join(fixture.directory, "bb.db");
    try {
      const workspace = await openWorkspace(fixture.root, { create: true, databasePath });
      workspace.database.close();
      await processRuntimeEvent({ schemaVersion: 1, host: "cursor", event: "start_run", externalSessionId: "reminder", externalTurnId: "generation-1", cwd: fixture.root, occurredAt: "2026-01-01T00:00:00.000Z", payload: { prompt: "Change storage" } }, databasePath, undefined, policy);
      fixture.write("src/storage.ts", "export const storage = 'local';\n");

      const first = await processRuntimeEvent({ schemaVersion: 1, host: "cursor", event: "after_tool", externalSessionId: "reminder", externalToolUseId: "tool-1", cwd: fixture.root, occurredAt: "2026-01-01T00:01:00.000Z", payload: { tool_name: "Write", outcome: "success" } }, databasePath, undefined, policy);
      const second = await processRuntimeEvent({ schemaVersion: 1, host: "cursor", event: "after_tool", externalSessionId: "reminder", externalToolUseId: "tool-2", cwd: fixture.root, occurredAt: "2026-01-01T00:02:00.000Z", payload: { tool_name: "Read", outcome: "success" } }, databasePath, undefined, policy);

      expect(first.effects).toContainEqual(expect.objectContaining({ type: "completion_reminder", content: expect.stringContaining("bb_finish_run") }));
      expect(second.effects).toEqual([]);
    } finally {
      fixture.dispose();
    }
  });
});
