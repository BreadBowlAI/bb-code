import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("QKV document privacy", () => {
  it("never hydrates prompts, tool output, or secret excerpts into remote documents", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.setKnowledgeMode(fixture.repositoryId, "strict", owner);
      const sessionId = fixture.database.startSession({ repositoryId: fixture.repositoryId, worktreeId: fixture.worktreeId, host: "codex", externalSessionId: "privacy" });
      const runId = fixture.database.startRun({ sessionId, prompt: "PROMPT_PRIVATE_VALUE", gitViewId: fixture.gitViewId });
      fixture.database.addRunEvent(runId, { kind: "after_tool", externalEventId: "tool-secret", gitViewId: fixture.gitViewId, toolName: "Edit", paths: ["src/a.ts"], outputExcerpt: "Authorization: Bearer TOOL_SECRET_VALUE", evidenceKind: "file_change", evidenceSummary: "One reviewed file-change observation", consequential: true });
      const candidateId = fixture.database.propose(fixture.repositoryId, runId, { operation: "create", kind: "belief", body: "The authentication module is path scoped", scope: { kind: "path", prefix: "src/a.ts" }, attributes: { confidence: 0.8 }, rationale: "Reviewed observation", evidencePaths: ["src/a.ts"], evidenceNotes: [] }, fixture.gitViewId);
      const statement = fixture.database.resolveCandidate(candidateId, "accept", owner)!;
      const document = fixture.database.indexDocument(statement.id)!;
      expect(document.text).not.toContain("PROMPT_PRIVATE_VALUE");
      expect(document.text).not.toContain("TOOL_SECRET_VALUE");
      expect(JSON.stringify(document)).not.toContain("Authorization");
    } finally { fixture.dispose(); }
  });
});
