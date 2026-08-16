import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { retrieveContext } from "../../../src/application/context/retrieve-context.js";
import { blobSha } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";
import { owner } from "../../support/statements.js";

describe("rebase re-anchor policy", () => {
  it("automatically confirms an unambiguous belief patch match in standard mode without remapping it", async () => {
    const git = createGitFixture();
    const databasePath = join(git.directory, "bb.db");
    try {
      const initialized = await openWorkspace(git.root, { create: true, databasePath });
      initialized.database.close();
      git.commit("initialize bb-code");
      git.run("checkout", "-b", "feature");
      git.write("src/rebased.ts", "export const rebased = true;\n");
      const originalCommit = git.commit("feature patch");
      const observed = await openWorkspace(git.root, { databasePath });
      const pathBlob = await blobSha(git.root, "src/rebased.ts");
      const belief = observed.database.createStatement(observed.repositoryId, {
        kind: "belief",
        body: "The rebased feature owns this module",
        status: "active",
        scope: { kind: "path", prefix: "src/rebased.ts" },
        attributes: { confidence: 0.8 },
        actor: owner,
        evidence: { kind: "user_statement", summary: "Reviewed before rebase", gitViewId: observed.gitViewId, paths: ["src/rebased.ts"], pathBlobs: { "src/rebased.ts": pathBlob! } }
      });
      observed.database.close();

      git.run("checkout", "main");
      git.write("src/base.ts", "export const base = true;\n");
      git.commit("advance main");
      git.run("checkout", "feature");
      git.run("rebase", "main");

      const current = await openWorkspace(git.root, { databasePath });
      await retrieveContext({ database: current.database, repositoryId: current.repositoryId, gitViewId: current.gitViewId, git: current.git, query: "rebased feature module", paths: ["src/rebased.ts"] });
      const candidates = current.database.listCandidates(current.repositoryId, "auto_accepted");
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ proposal: { operation: "confirm", targetStatementId: belief.id } });
      expect(candidates[0]!.proposal.rationale).toContain(originalCommit);
      const anchors = current.database.statementAnchors(belief.id).map((anchor) => anchor.headCommitSha);
      expect(anchors).toContain(originalCommit);
      expect(anchors).toContain(current.git.headCommitSha);
      expect(current.database.getStatement(belief.id)).toMatchObject({ id: belief.id, revisionNumber: 1 });
      current.database.close();
    } finally {
      git.dispose();
    }
  });
});
