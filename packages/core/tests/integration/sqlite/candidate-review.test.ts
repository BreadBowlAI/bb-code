import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("candidate review", () => {
  it("does not create durable context before human acceptance", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "session-1" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Add a belief", gitViewId: fixture.gitViewId });
      const candidateId = fixture.database.propose(fixture.repositoryId, runId, { operation: "create", kind: "belief", body: "SQLite FTS5 is available", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, rationale: "Observed in tests", evidencePaths: [], evidenceNotes: [] });
      expect(fixture.database.listStatements(fixture.repositoryId)).toHaveLength(0);
      expect(fixture.database.resolveCandidate(candidateId, "accept", owner)?.kind).toBe("belief");
    } finally { fixture.dispose(); }
  });
});
