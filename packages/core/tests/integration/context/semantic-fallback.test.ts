import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { retrieveContext } from "../../../src/application/context/retrieve-context.js";
import { createGitFixture } from "../../support/git-fixture.js";
import { beliefDraft } from "../../support/statements.js";

describe("semantic retrieval fallback", () => {
  it("returns lexical context immediately when the semantic provider fails", async () => {
    const git = createGitFixture();
    try {
      const workspace = await openWorkspace(git.root, { create: true, databasePath: join(git.directory, "bb.db") });
      const statement = workspace.database.createStatement(workspace.repositoryId, { ...beliefDraft("Authentication uses signed cookies"), evidence: { kind: "user_statement", summary: "Owner statement", gitViewId: workspace.gitViewId } });
      let candidateK = 0;
      const result = await retrieveContext({ database: workspace.database, repositoryId: workspace.repositoryId, gitViewId: workspace.gitViewId, git: workspace.git, query: "signed cookie authentication", semantic: { search: async (input) => { candidateK = input.candidateK; throw new Error("offline"); } } });
      expect(result.items[0]?.id).toBe(statement.id);
      expect(result.providerStatus.semantic).toBe("degraded");
      expect(candidateK).toBe(100);
      workspace.database.close();
    } finally { git.dispose(); }
  });
});
