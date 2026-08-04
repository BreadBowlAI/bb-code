import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("cross-host continuity", () => {
  it("makes a Codex proposal retrievable to Claude only after human review", () => {
    const fixture = createSqliteFixture();
    try {
      const codexSession = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "codex-1" });
      const runId = fixture.database.startRun({ sessionId: codexSession, prompt: "Keep accounts optional", gitViewId: fixture.gitViewId });
      const candidateId = fixture.database.propose(fixture.repositoryId, runId, { operation: "create", kind: "commitment", body: "Accounts remain optional", scope: { kind: "repository" }, attributes: { rationale: "Local-first product", authority: owner }, rationale: "The owner confirmed the boundary", evidencePaths: [], evidenceNotes: [] }, fixture.gitViewId);
      expect(fixture.database.searchLexical(fixture.repositoryId, "accounts optional")).toEqual([]);
      fixture.database.resolveCandidate(candidateId, "accept", owner);
      fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "claude", externalSessionId: "claude-1" });
      expect(fixture.database.searchLexical(fixture.repositoryId, "accounts optional")[0]?.statement.body).toBe("Accounts remain optional");
    } finally { fixture.dispose(); }
  });
});
