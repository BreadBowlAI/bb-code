import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("completed request intent", () => {
  it("automatically accepts a satisfied request intent in standard mode without making it retrievable", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "completed-intent" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Ship account deletion", gitViewId: fixture.gitViewId });
      const [candidateId] = fixture.database.completeRun(fixture.repositoryId, {
        runId,
        outcome: "completed",
        summary: "Shipped account deletion",
        verification: [],
        effects: [],
        requestIntent: {
          disposition: "durable",
          proposal: { operation: "create", kind: "intent", body: "Ship account deletion", scope: { kind: "repository" }, attributes: { owner, priority: "normal", successConditions: ["Account deletion is verified"] }, initialStatus: "satisfied", rationale: "The owner requested and completed this outcome", evidencePaths: [], evidenceNotes: ["Direct user request"] }
        },
        proposals: [],
        endGitViewId: fixture.gitViewId
      });
      expect(fixture.database.listCandidates(fixture.repositoryId, "auto_accepted")[0]?.id).toBe(candidateId);
      const statement = fixture.database.listStatements(fixture.repositoryId)[0]!;
      expect(statement).toMatchObject({ kind: "intent", status: "satisfied", body: "Ship account deletion" });
      expect(fixture.database.searchLexical(fixture.repositoryId, "account deletion")).toEqual([]);
      expect(fixture.database.retrievalJobSummary(fixture.repositoryId, "qkv")).toMatchObject({ pending: 0, failed: 0, completed: 0 });
    } finally { fixture.dispose(); }
  });
});
