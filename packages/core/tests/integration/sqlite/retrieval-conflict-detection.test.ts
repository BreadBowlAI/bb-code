import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { beliefDraft } from "../../support/statements.js";

describe("retrieval conflict detection", () => {
  it("flags directly contradictory reviewed beliefs with the same scope", () => {
    const fixture = createSqliteFixture();
    try {
      const positive = fixture.database.createStatement(fixture.repositoryId, beliefDraft("Remote indexing stores source code"));
      const negative = fixture.database.createStatement(fixture.repositoryId, beliefDraft("Remote indexing never stores source code"));
      expect(fixture.database.conflictingStatementIds(fixture.repositoryId, [positive.id, negative.id])).toEqual(new Set([positive.id, negative.id]));
    } finally { fixture.dispose(); }
  });
});
