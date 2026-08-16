import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { commitmentDraft } from "../../support/statements.js";

describe("lexical hard negative", () => {
  it("abstains when a request shares only generic words with reviewed statements", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.createStatement(fixture.repositoryId, commitmentDraft("Protected discovery RPCs do not accept actor user IDs"));
      fixture.database.createStatement(fixture.repositoryId, commitmentDraft("The broader app UI remains deferred"));
      expect(fixture.database.searchLexical(fixture.repositoryId, "How do I start the iOS app?")).toEqual([]);
    } finally { fixture.dispose(); }
  });
});
