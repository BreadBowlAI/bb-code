import { describe, expect, it } from "vitest";
import { findPatchIdMatches, inspectGit } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("rebase patch identity", () => {
  it("finds one equivalent rewritten commit without silently changing an anchor", async () => {
    const fixture = createGitFixture();
    try {
      fixture.run("checkout", "-b", "feature");
      fixture.write("feature.txt", "same patch\n");
      fixture.commit("feature");
      const before = await inspectGit(fixture.root);
      fixture.run("checkout", "main");
      fixture.write("main.txt", "new base\n");
      fixture.commit("main");
      fixture.run("checkout", "feature");
      fixture.run("rebase", "main");
      const after = await inspectGit(fixture.root);
      expect(after.headCommitSha).not.toBe(before.headCommitSha);
      expect(after.stablePatchId).toBe(before.stablePatchId);
      expect(await findPatchIdMatches(fixture.root, before.stablePatchId!)).toEqual([after.headCommitSha]);
    } finally { fixture.dispose(); }
  });
});
