import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processRuntimeEvent, type RuntimeProcessingPolicy } from "../../../src/application/runtime/process-runtime-event.js";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import type { ActorRef } from "../../../src/domain/knowledge.js";
import { createGitFixture } from "../../support/git-fixture.js";

const policy: RuntimeProcessingPolicy = { contextAtRunStart: "defer", completionReminder: "none", unfinishedStop: "finalize_partial" };
const owner: ActorRef = { kind: "human", id: "repository-owner" };

describe("path commitment guidance", () => {
  it("emits each applicable commitment notice once so a host retry cannot loop", async () => {
    const fixture = createGitFixture();
    const databasePath = join(fixture.directory, "bb.db");
    try {
      const workspace = await openWorkspace(fixture.root, { create: true, databasePath });
      workspace.database.createStatement(workspace.repositoryId, {
        kind: "commitment",
        body: "Authentication code must not persist plaintext secrets",
        status: "accepted",
        scope: { kind: "path", prefix: "src/auth" },
        attributes: { rationale: "Protect credentials", authority: owner },
        actor: owner,
        evidence: { kind: "user_statement", summary: "Repository owner constraint", gitViewId: workspace.gitViewId }
      });
      workspace.database.close();
      await processRuntimeEvent({ schemaVersion: 1, host: "cursor", event: "start_run", externalSessionId: "path-guidance", externalTurnId: "generation-1", cwd: fixture.root, occurredAt: "2026-01-01T00:00:00.000Z", payload: { prompt: "Update authentication" } }, databasePath, undefined, policy);

      const first = await processRuntimeEvent({ schemaVersion: 1, host: "cursor", event: "before_tool", externalSessionId: "path-guidance", externalToolUseId: "tool-1", cwd: fixture.root, occurredAt: "2026-01-01T00:01:00.000Z", payload: { tool_name: "Write", path: "src/auth/login.ts" } }, databasePath, undefined, policy);
      const retry = await processRuntimeEvent({ schemaVersion: 1, host: "cursor", event: "before_tool", externalSessionId: "path-guidance", externalToolUseId: "tool-2", cwd: fixture.root, occurredAt: "2026-01-01T00:01:10.000Z", payload: { tool_name: "Write", path: "src/auth/login.ts" } }, databasePath, undefined, policy);

      expect(first.effects).toContainEqual(expect.objectContaining({ type: "path_commitments", content: expect.stringContaining("must not persist plaintext secrets") }));
      expect(retry.effects).toEqual([]);
    } finally {
      fixture.dispose();
    }
  });
});
