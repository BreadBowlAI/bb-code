import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { beliefDraft } from "../../support/statements.js";

describe("repository-scoped search", () => {
  it("abstains instead of leaking or falling back to another repository", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.createStatement(fixture.repositoryId, beliefDraft("Only alpha contains narwhal authentication"));
      const second = fixture.database.registerRepository({ repositoryId: "repo_second", root: `${fixture.database.filename}-repo-2`, gitCommonDir: `${fixture.database.filename}-repo-2/.git`, gitDir: `${fixture.database.filename}-repo-2/.git`, headCommitSha: "abc", headTreeSha: "def", dirtyFingerprint: "clean", branchLabel: "main" });
      expect(second.repositoryId).toBe("repo_second");
      expect(fixture.database.searchLexical("repo_second", "narwhal authentication")).toEqual([]);
      expect(fixture.database.searchLexical(fixture.repositoryId, "completely irrelevant query")).toEqual([]);
    } finally { fixture.dispose(); }
  });
});
