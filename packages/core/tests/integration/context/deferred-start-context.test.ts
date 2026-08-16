import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { processRuntimeEvent } from "../../../src/application/runtime/process-runtime-event.js";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("deferred run-start context", () => {
  it("starts and binds a run without performing an unusable retrieval", async () => {
    const fixture = createGitFixture();
    const databasePath = join(fixture.directory, "bb.db");
    const search = vi.fn(async () => []);
    try {
      const workspace = await openWorkspace(fixture.root, { create: true, databasePath });
      workspace.database.close();
      const result = await processRuntimeEvent({
        schemaVersion: 1,
        host: "cursor",
        event: "start_run",
        externalSessionId: "deferred-context",
        externalTurnId: "generation-1",
        cwd: fixture.root,
        occurredAt: "2026-01-01T00:00:00.000Z",
        payload: { prompt: "Add authentication" }
      }, databasePath, { search }, {
        contextAtRunStart: "defer",
        completionReminder: "none",
        unfinishedStop: "finalize_partial"
      });

      expect(result.runId).toBeTruthy();
      expect(result.effects).toEqual([]);
      expect(search).not.toHaveBeenCalled();
    } finally {
      fixture.dispose();
    }
  });
});
