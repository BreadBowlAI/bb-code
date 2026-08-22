import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getContext } from "../../../src/application/context/get-context.js";
import { finishRun } from "../../../src/application/runs/run-learning.js";
import { processRuntimeEvent, type RuntimeProcessingPolicy } from "../../../src/application/runtime/process-runtime-event.js";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { createGitFixture } from "../../support/git-fixture.js";

const policy: RuntimeProcessingPolicy = { contextAtRunStart: "defer", completionReminder: "none", unfinishedStop: "finalize_partial" };

describe("pending commitment reconciliation", () => {
  it("warns about the disputed commitment without enforcing it at the path boundary", async () => {
    const fixture = createGitFixture();
    const databasePath = join(fixture.directory, "bb.db");
    try {
      const workspace = await openWorkspace(fixture.root, { create: true, databasePath });
      const commitment = workspace.database.createStatement(workspace.repositoryId, {
        kind: "commitment",
        body: "Authentication code must not use session cookies",
        status: "accepted",
        scope: { kind: "path", prefix: "src/auth" },
        attributes: { rationale: "Original authentication decision", authority: { kind: "human", id: "repository-owner" } },
        actor: { kind: "human", id: "repository-owner" },
        evidence: { kind: "user_statement", summary: "Original owner decision", gitViewId: workspace.gitViewId }
      });
      workspace.database.close();

      const first = await processRuntimeEvent({ schemaVersion: 1, host: "cursor", event: "start_run", externalSessionId: "reconcile", externalTurnId: "turn-1", cwd: fixture.root, occurredAt: "2026-01-01T00:00:00.000Z", payload: { prompt: "Change authentication to use session cookies" } }, databasePath, undefined, policy);
      await getContext({ cwd: fixture.root, request: "Change authentication to use session cookies", paths: ["src/auth/login.ts"], databasePath });
      await finishRun(fixture.root, {
        runId: first.runId,
        outcome: "completed",
        summary: "Prepared the requested authentication change",
        verification: [],
        contextEffects: [{ statementId: commitment.id, effect: "changed_plan" }],
        commitmentReconciliations: [{ statementId: commitment.id, disposition: "revised", reason: "The owner explicitly requested session cookies" }],
        requestIntent: { disposition: "ephemeral", reason: "The requested implementation change is complete" },
        proposals: [{ operation: "revise", targetStatementId: commitment.id, body: "Authentication code may use secure session cookies", rationale: "The owner changed the authentication decision", evidencePaths: [], evidenceNotes: [] }]
      }, databasePath);

      const second = await processRuntimeEvent({ schemaVersion: 1, host: "cursor", event: "start_run", externalSessionId: "reconcile", externalTurnId: "turn-2", cwd: fixture.root, occurredAt: "2026-01-01T00:02:00.000Z", payload: { prompt: "Update authentication session cookies" } }, databasePath, undefined, policy);
      const context = await getContext({ cwd: fixture.root, request: "Update authentication session cookies", paths: ["src/auth/login.ts"], databasePath });
      expect(context.rendered).toContain("awaiting human review");
      expect(context.rendered).toContain("do not enforce this statement as a hard constraint");

      const beforeTool = await processRuntimeEvent({ schemaVersion: 1, host: "cursor", event: "before_tool", externalSessionId: "reconcile", externalTurnId: "turn-2", externalToolUseId: "tool-1", cwd: fixture.root, occurredAt: "2026-01-01T00:03:00.000Z", payload: { tool_name: "Write", path: "src/auth/login.ts" } }, databasePath, undefined, policy);
      expect(beforeTool.runId).toBe(second.runId);
      expect(beforeTool.effects).toEqual([]);
    } finally { fixture.dispose(); }
  });
});
