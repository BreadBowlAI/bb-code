import { describe, expect, it } from "vitest";
import { isAncestor } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("reset reachability", () => {
  it("treats a reset-away observation commit as unreachable without deleting it", async () => {
    const git = createGitFixture();
    try {
      const base = git.run("rev-parse", "HEAD");
      git.write("temporary.txt", "temporary\n");
      const removed = git.commit("temporary observation");
      git.run("reset", "--hard", base);
      expect(await isAncestor(git.root, removed, "HEAD")).toBe(false);
      expect(git.run("cat-file", "-t", removed)).toBe("commit");
    } finally { git.dispose(); }
  });
});
