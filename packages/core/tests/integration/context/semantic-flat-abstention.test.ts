import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { retrieveContext } from "../../../src/application/context/retrieve-context.js";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { createGitFixture } from "../../support/git-fixture.js";
import { commitmentDraft } from "../../support/statements.js";

describe("flat semantic result abstention", () => {
  it("injects nothing when lexical search misses and semantic scores carry no separation", async () => {
    const git = createGitFixture();
    try {
      const workspace = await openWorkspace(git.root, { create: true, databasePath: join(git.directory, "bb.db") });
      const statements = Array.from({ length: 10 }, (_, index) => workspace.database.createStatement(workspace.repositoryId, commitmentDraft(`Unrelated project rule ${index}`)));
      const result = await retrieveContext({ database: workspace.database, repositoryId: workspace.repositoryId, gitViewId: workspace.gitViewId, git: workspace.git, query: "How do I start the iOS app?", semantic: { search: async () => statements.map((statement) => ({ statementId: statement.id, score: 0.4 })) } });
      expect(result.items).toEqual([]);
      expect(result.providerStatus.semantic).toBe("abstained");
      workspace.database.close();
    } finally { git.dispose(); }
  });
});
