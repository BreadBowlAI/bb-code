import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("tool event deduplication", () => {
  it("records one Git-backed evidence item for a repeated host tool-use ID", () => {
    const fixture = createSqliteFixture();
    try {
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "claude", externalSessionId: "dedupe" });
      const runId = fixture.database.startRun({ sessionId, prompt: "Edit file", gitViewId: fixture.gitViewId });
      const event = { kind: "after_tool", externalEventId: "tool-1", gitViewId: fixture.gitViewId, toolName: "Edit", paths: ["src/a.ts"], pathBlobs: { "src/a.ts": "blob-1" }, consequential: true, evidenceKind: "file_change", evidenceSummary: "Edit completed" };
      expect(fixture.database.addRunEvent(runId, event)).toBe(true);
      expect(fixture.database.addRunEvent(runId, event)).toBe(false);
      const candidateId = fixture.database.propose(fixture.repositoryId, runId, { operation: "create", kind: "belief", body: "The file changed", scope: { kind: "path", prefix: "src/a.ts" }, attributes: { confidence: 0.8 }, rationale: "Observed edit", evidencePaths: ["src/a.ts"], evidenceNotes: [] }, fixture.gitViewId);
      const statement = fixture.database.resolveCandidate(candidateId, "accept", owner)!;
      const evidence = fixture.database.explainStatement(statement.id).history[0]!.evidence as Array<Record<string, unknown>>;
      expect(evidence.filter((item) => item.kind === "file_change")).toHaveLength(1);
    } finally { fixture.dispose(); }
  });
});
