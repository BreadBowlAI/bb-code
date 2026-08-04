import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { finishRun } from "../../../src/application/runs/run-learning.js";
import { processRuntimeEvent } from "../../../src/application/runtime/process-runtime-event.js";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import type { ActorRef } from "../../../src/domain/knowledge.js";
import { createGitFixture } from "../../support/git-fixture.js";

const owner: ActorRef = { kind: "human", id: "mvp-owner" };

describe("cross-agent MVP release flow", () => {
  it("carries reviewed context from Codex proposal through human review into Claude retrieval", async () => {
    const fixture = createGitFixture();
    const databasePath = join(fixture.directory, "bb.db");
    try {
      const initialized = await openWorkspace(fixture.root, { create: true, databasePath });
      const commitment = initialized.database.createStatement(initialized.repositoryId, {
        kind: "commitment",
        body: "Keep local storage authoritative",
        status: "accepted",
        scope: { kind: "repository" },
        attributes: { rationale: "The product is local-first", authority: owner },
        actor: owner,
        evidence: { kind: "user_statement", summary: "Accepted during initialization", gitViewId: initialized.gitViewId }
      });
      initialized.database.close();

      const codex = await processRuntimeEvent({
        schemaVersion: 1,
        host: "codex",
        event: "start_task",
        externalSessionId: "codex-release",
        externalTurnId: "turn-1",
        cwd: fixture.root,
        occurredAt: "2026-01-01T00:00:00.000Z",
        payload: { prompt: "Change storage while keeping local storage authoritative" }
      }, databasePath);
      expect(codex.output).toContain("Keep local storage authoritative");
      expect(codex.runId).toBeTruthy();

      fixture.write("src/storage.ts", "export const sourceOfTruth = 'sqlite';\n");
      await processRuntimeEvent({
        schemaVersion: 1,
        host: "codex",
        event: "after_tool",
        externalSessionId: "codex-release",
        externalTurnId: "turn-1",
        externalToolUseId: "tool-1",
        cwd: fixture.root,
        occurredAt: "2026-01-01T00:01:00.000Z",
        payload: { tool_name: "Edit", outcome: "success" }
      }, databasePath);

      await finishRun(fixture.root, {
        runId: codex.runId,
        outcome: "completed",
        summary: "Kept SQLite as the source of truth",
        verification: [{ kind: "test", result: "passed", summary: "Storage tests passed" }],
        contextEffects: [{ statementId: commitment.id, effect: "avoided_violation", note: "Prevented remote authority" }],
        proposals: [{
          operation: "create",
          kind: "belief",
          body: "Storage state is persisted in SQLite",
          scope: { kind: "path", prefix: "src/storage.ts" },
          attributes: { confidence: 0.9 },
          rationale: "Implemented and verified in the storage module",
          evidencePaths: ["src/storage.ts"],
          evidenceNotes: ["Storage tests passed"]
        }]
      }, databasePath);

      const review = await openWorkspace(fixture.root, { databasePath });
      const [candidate] = review.database.listCandidates(review.repositoryId);
      expect(candidate?.proposal.body).toBe("Storage state is persisted in SQLite");
      expect(review.database.searchLexical(review.repositoryId, "persisted SQLite")).toEqual([]);
      review.database.resolveCandidate(candidate!.id, "accept", owner);
      review.database.close();

      const claude = await processRuntimeEvent({
        schemaVersion: 1,
        host: "claude",
        event: "start_task",
        externalSessionId: "claude-release",
        externalTurnId: "turn-2",
        cwd: fixture.root,
        occurredAt: "2026-01-01T00:02:00.000Z",
        payload: { prompt: "Where is storage state persisted?" }
      }, databasePath);
      expect(claude.output).toContain("Storage state is persisted in SQLite");
    } finally {
      fixture.dispose();
    }
  });
});
