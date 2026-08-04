import { describe, expect, it } from "vitest";
import { isAncestor } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("branch divergence, merge, and deletion", () => {
  it("uses commit reachability rather than branch-name existence", async () => {
    const fixture = createGitFixture();
    try {
      const base = fixture.run("rev-parse", "HEAD");
      fixture.run("checkout", "-b", "feature");
      fixture.write("feature.txt", "feature\n");
      const feature = fixture.commit("feature");
      fixture.run("checkout", "main");
      fixture.write("main.txt", "main\n");
      fixture.commit("main");
      expect(await isAncestor(fixture.root, base, "HEAD")).toBe(true);
      expect(await isAncestor(fixture.root, feature, "HEAD")).toBe(false);
      fixture.run("merge", "--no-ff", "feature", "-m", "merge feature");
      fixture.run("branch", "-d", "feature");
      expect(await isAncestor(fixture.root, feature, "HEAD")).toBe(true);
    } finally { fixture.dispose(); }
  });
});
