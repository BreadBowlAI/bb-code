import { describe, expect, it } from "vitest";
import { inspectGit } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("detached HEAD identity", () => {
  it("retains commit identity without inventing a branch label", async () => {
    const fixture = createGitFixture();
    try {
      const head = fixture.run("rev-parse", "HEAD");
      fixture.run("checkout", "--detach", head);
      const snapshot = await inspectGit(fixture.root);

      expect(snapshot.headCommitSha).toBe(head);
      expect(snapshot.branchLabel).toBeUndefined();
      expect(snapshot.parentShas).toEqual([]);
    } finally {
      fixture.dispose();
    }
  });
});
