import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { retrieveContext } from "../../../src/application/context/retrieve-context.js";
import { blobSha } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";
import { owner } from "../../support/statements.js";

describe("changed supporting blob freshness", () => {
  it("keeps a reachable belief visible with the stale multiplier", async () => {
    const git = createGitFixture();
    const databasePath = join(git.directory, "bb.db");
    try {
      const initialized = await openWorkspace(git.root, { create: true, databasePath });
      initialized.database.close();
      git.write("src/parser.ts", "export const parser = 'v1';\n");
      git.commit("add parser and bb-code identity");
      const observed = await openWorkspace(git.root, { databasePath });
      const sha = await blobSha(git.root, "src/parser.ts");
      const statement = observed.database.createStatement(observed.repositoryId, { kind: "belief", body: "Parser behavior is version one", status: "active", scope: { kind: "path", prefix: "src/parser.ts" }, attributes: { confidence: 0.8 }, actor: owner, evidence: { kind: "user_statement", summary: "Reviewed parser", gitViewId: observed.gitViewId, paths: ["src/parser.ts"], pathBlobs: { "src/parser.ts": sha! } } });
      observed.database.close();
      git.write("src/parser.ts", "export const parser = 'v2';\n");
      git.commit("change parser");
      const current = await openWorkspace(git.root, { databasePath });
      const result = await retrieveContext({ database: current.database, repositoryId: current.repositoryId, gitViewId: current.gitViewId, git: current.git, query: "parser behavior", paths: ["src/parser.ts"] });
      expect(result.items[0]).toMatchObject({ id: statement.id, freshness: "stale" });
      current.database.close();
    } finally { git.dispose(); }
  });
});
