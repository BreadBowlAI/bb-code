import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type GitFixture = {
  directory: string;
  root: string;
  run: (...arguments_: string[]) => string;
  write: (path: string, content: string) => void;
  commit: (message: string) => string;
  dispose: () => void;
};

export function createGitFixture(): GitFixture {
  const directory = mkdtempSync(join(tmpdir(), "bb-code-git-"));
  const root = join(directory, "repo");
  mkdirSync(root);
  const run = (...arguments_: string[]) => execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }).trim();
  run("init", "-b", "main");
  run("config", "user.name", "bb-code tests");
  run("config", "user.email", "tests@bb-code.invalid");
  const write = (path: string, content: string) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  const commit = (message: string) => {
    run("add", "-A");
    run("commit", "-m", message);
    return run("rev-parse", "HEAD");
  };
  write("README.md", "fixture\n");
  commit("initial");
  return { directory, root, run, write, commit, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}
