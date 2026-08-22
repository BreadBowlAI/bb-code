import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getContext } from "../../../src/application/context/get-context.js";
import { finishRun } from "../../../src/application/runs/run-learning.js";
import { processRuntimeEvent } from "../../../src/application/runtime/process-runtime-event.js";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("Cursor MCP context binding", () => {
  it("binds an exact request to the run started by the prompt hook", async () => {
    const fixture = createGitFixture();
    const databasePath = join(fixture.directory, "bb.db");
    try {
      const workspace = await openWorkspace(fixture.root, { create: true, databasePath });
      const belief = workspace.database.createStatement(workspace.repositoryId, {
        kind: "belief",
        body: "Authentication sessions are stored in secure cookies",
        status: "active",
        scope: { kind: "repository" },
        attributes: { confidence: 0.9 },
        actor: { kind: "repository_document", id: "src/auth.ts" },
        evidence: { kind: "repository_document", summary: "Authentication implementation" }
      });
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

      const runId = started.runId!;
      const focused = await getContext({ cwd: fixture.root, request: "Where are secure cookie sessions stored?", runId, databasePath });
      expect(focused.runId).toBe(runId);
      expect(focused.rendered).toContain(`Registered statement IDs from this lookup for the run: ${belief.id}`);
      await expect(finishRun(fixture.root, {
        runId,
        outcome: "completed",
        summary: "Found the session storage",
        verification: [],
        contextEffects: [{ statementId: belief.id, effect: "changed_plan" }],
        commitmentReconciliations: [],
        requestIntent: { disposition: "ephemeral", reason: "This was a focused lookup" },
        proposals: [],
        noDurableLearningReason: "The retrieved belief already captures the durable implementation fact"
      }, databasePath)).resolves.toEqual({ candidateIds: [] });
    } finally {
      fixture.dispose();
    }
  });
});
