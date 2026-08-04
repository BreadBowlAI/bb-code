import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { inspectGit } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("linked worktree identity", () => {
  it("shares the Git common directory while retaining a physical worktree path", async () => {
    const fixture = createGitFixture();
    try {
      const linked = join(fixture.directory, "linked");
      fixture.run("worktree", "add", "-b", "linked", linked);
      const main = await inspectGit(fixture.root, { includePatchId: false });
      const worktree = await inspectGit(linked, { includePatchId: false });
      expect(worktree.gitCommonDir).toBe(main.gitCommonDir);
      expect(worktree.gitDir).not.toBe(main.gitDir);
      expect(worktree.root).toBe(realpathSync(linked));
    } finally { fixture.dispose(); }
  });
});
