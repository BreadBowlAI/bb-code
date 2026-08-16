import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { commitmentDraft, owner } from "../../support/statements.js";

describe("statement reclassification", () => {
  it("supersedes the old identity and creates a correctly typed replacement atomically", () => {
    const fixture = createSqliteFixture();
    try {
      const original = fixture.database.createStatement(fixture.repositoryId, commitmentDraft("The repository currently uses PostgreSQL"));
      const candidateId = fixture.database.propose(fixture.repositoryId, undefined, { operation: "reclassify", kind: "belief", targetStatementId: original.id, body: original.body, scope: original.scope, attributes: { confidence: 0.9 }, rationale: "This is a current implementation fact, not a future constraint", evidencePaths: [], evidenceNotes: [] }, fixture.gitViewId);
      const replacement = fixture.database.resolveCandidate(candidateId, "accept", owner)!;
      expect(fixture.database.getStatement(original.id).status).toBe("superseded");
      expect(replacement).toMatchObject({ kind: "belief", status: "active", body: original.body });
      expect(replacement.id).not.toBe(original.id);
    } finally { fixture.dispose(); }
  });
});
