import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getContext } from "../../../src/application/context/get-context.js";
import { processRuntimeEvent } from "../../../src/application/runtime/process-runtime-event.js";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("Cursor MCP context binding", () => {
  it("binds an exact request to the run started by the prompt hook", async () => {
    const fixture = createGitFixture();
    const databasePath = join(fixture.directory, "bb.db");
    try {
      const workspace = await openWorkspace(fixture.root, { create: true, databasePath });
      workspace.database.close();
      const started = await processRuntimeEvent({
        schemaVersion: 1,
        host: "cursor",
        event: "start_run",
        externalSessionId: "cursor-conversation",
        externalTurnId: "cursor-generation",
        cwd: fixture.root,
        occurredAt: "2026-01-01T00:00:00.000Z",
        payload: { prompt: "Add authentication" }
      }, databasePath, undefined, { contextAtRunStart: "defer", completionReminder: "none", unfinishedStop: "finalize_partial" });

      const context = await getContext({ cwd: fixture.root, request: "Add authentication", databasePath });
      expect(context.rendered).toContain(`Run: ${started.runId}`);
      expect(context.rendered).toContain(`call bb_finish_run with runId ${started.runId}`);
    } finally {
      fixture.dispose();
    }
  });
});
