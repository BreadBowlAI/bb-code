import { describe, expect, it } from "vitest";
import { CLEAN_DIRTY_FINGERPRINT, inspectGit } from "../../../src/infrastructure/git/git-client.js";
import { createGitFixture } from "../../support/git-fixture.js";

describe("clean and dirty Git snapshots", () => {
  it("captures parents, patch identity, and path-only dirty identity", async () => {
    const fixture = createGitFixture();
    try {
      const clean = await inspectGit(fixture.root);
      expect(clean.dirtyFingerprint).toBe(CLEAN_DIRTY_FINGERPRINT);
      expect(clean.changedPaths).toEqual([]);
      expect(clean.stablePatchId).toBeTruthy();
      fixture.write("src/a.ts", "export const secret = 1;\n");
      const dirty = await inspectGit(fixture.root, { includePatchId: false });
      expect(dirty.dirtyFingerprint).not.toBe(CLEAN_DIRTY_FINGERPRINT);
      expect(dirty.changedPaths).toEqual(["src/a.ts"]);
      expect(dirty.dirtyFingerprint).not.toContain("secret");
    } finally { fixture.dispose(); }
  });
});
