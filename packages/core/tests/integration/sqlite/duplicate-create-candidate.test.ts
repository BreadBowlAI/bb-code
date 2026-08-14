import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { beliefDraft } from "../../support/statements.js";

describe("duplicate create candidate", () => {
  it("directs an exact duplicate toward the existing statement lifecycle", () => {
    const fixture = createSqliteFixture();
    try {
      const current = fixture.database.createStatement(fixture.repositoryId, beliefDraft("The account API supports password recovery"));
      expect(() => fixture.database.propose(fixture.repositoryId, undefined, {
        operation: "create",
        kind: "belief",
        body: "  the account API supports   password recovery ",
        scope: { kind: "repository" },
        attributes: { confidence: 0.9 },
        rationale: "Observed again",
        evidencePaths: [],
        evidenceNotes: []
      })).toThrow(current.id);
    } finally { fixture.dispose(); }
  });
});
