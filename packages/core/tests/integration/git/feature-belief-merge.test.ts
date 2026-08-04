import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { openWorkspace } from "../../../src/application/workspace/open-workspace.js";
import { retrieveContext } from "../../../src/application/context/retrieve-context.js";
import { blobSha } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";
import { owner } from "../../support/statements.js";

describe("feature belief merge applicability", () => {
  it("hides a divergent belief from main until its evidence commit is merged", async () => {
    const git = createGitFixture();
    const databasePath = join(git.directory, "bb.db");
    try {
      const initialized = await openWorkspace(git.root, { create: true, databasePath });
      initialized.database.close();
      git.commit("initialize bb-code");
      git.run("checkout", "-b", "topic-only");
      git.write("src/queue.ts", "export const queue = true;\n");
      git.commit("add queue");
      const feature = await openWorkspace(git.root, { databasePath });
      const sha = await blobSha(git.root, "src/queue.ts");
      const statement = feature.database.createStatement(feature.repositoryId, { kind: "belief", body: "Queue architecture uses a local worker", status: "active", scope: { kind: "path", prefix: "src/queue.ts" }, attributes: { confidence: 0.8 }, actor: owner, evidence: { kind: "user_statement", summary: "Reviewed on topic branch", gitViewId: feature.gitViewId, paths: ["src/queue.ts"], pathBlobs: { "src/queue.ts": sha! } } });
      feature.database.close();
      git.run("checkout", "main");
      const main = await openWorkspace(git.root, { databasePath });
      const before = await retrieveContext({ database: main.database, repositoryId: main.repositoryId, gitViewId: main.gitViewId, git: main.git, query: "queue architecture", paths: ["src/queue.ts"] });
      expect(before.items).toEqual([]);
      main.database.close();
      git.run("merge", "--no-ff", "topic-only", "-m", "merge topic");
      const merged = await openWorkspace(git.root, { databasePath });
      const after = await retrieveContext({ database: merged.database, repositoryId: merged.repositoryId, gitViewId: merged.gitViewId, git: merged.git, query: "queue architecture", paths: ["src/queue.ts"] });
      expect(after.items[0]?.id).toBe(statement.id);
      merged.database.close();
    } finally { git.dispose(); }
  });
});
