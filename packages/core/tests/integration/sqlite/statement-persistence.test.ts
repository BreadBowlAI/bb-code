import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { commitmentDraft } from "../../support/statements.js";

describe("statement persistence", () => {
  it("stores an evidence-backed statement and indexes it in FTS", () => {
    const fixture = createSqliteFixture();
    try {
      const statement = fixture.database.createStatement(fixture.repositoryId, commitmentDraft());
      expect(statement.id).toMatch(/^com_/);
      expect(fixture.database.searchLexical(fixture.repositoryId, "remote source privacy")[0]?.statement.id).toBe(statement.id);
      expect(fixture.database.explainStatement(statement.id).history[0]?.evidence).toHaveLength(1);
    } finally { fixture.dispose(); }
  });
});
