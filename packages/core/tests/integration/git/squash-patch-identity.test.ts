import { describe, expect, it } from "vitest";
import { findPatchIdMatches, inspectGit } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("squash patch identity", () => {
  it("recognizes one-commit squash equivalence after the source branch is deleted", async () => {
    const git = createGitFixture();
    try {
      git.run("checkout", "-b", "squash-source");
      git.write("squashed.txt", "same content\n");
      git.commit("source patch");
      const source = await inspectGit(git.root);
      git.run("checkout", "main");
      git.run("merge", "--squash", "squash-source");
      git.commit("squashed patch");
      git.run("branch", "-D", "squash-source");
      const squashed = await inspectGit(git.root);
      expect(squashed.stablePatchId).toBe(source.stablePatchId);
      expect(await findPatchIdMatches(git.root, source.stablePatchId!)).toEqual([squashed.headCommitSha]);
    } finally { git.dispose(); }
  });
});
