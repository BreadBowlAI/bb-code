import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { BbError } from "../../domain/errors.js";

const runFile = promisify(execFile);

async function git(cwd: string, arguments_: string[], allowFailure = false): Promise<string> {
  try {
    const { stdout } = await runFile("git", arguments_, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) return "";
    throw new BbError(`Git command failed: git ${arguments_.join(" ")}`, "git_error", { cause: error instanceof Error ? error.message : String(error) });
  }
}

async function absoluteGitPath(root: string, value: string): Promise<string> {
  return realpath(isAbsolute(value) ? value : resolve(root, value));
}

export type GitSnapshot = { root: string; gitCommonDir: string; gitDir: string; headCommitSha: string; headTreeSha: string; dirtyFingerprint: string; branchLabel?: string };

export async function inspectGit(cwd: string): Promise<GitSnapshot> {
  const root = await realpath(await git(cwd, ["rev-parse", "--show-toplevel"]));
  const gitCommonDir = await absoluteGitPath(root, await git(root, ["rev-parse", "--git-common-dir"]));
  const gitDir = await absoluteGitPath(root, await git(root, ["rev-parse", "--git-dir"]));
  const headCommitSha = await git(root, ["rev-parse", "HEAD"], true) || "unborn";
  const headTreeSha = headCommitSha === "unborn" ? "unborn" : await git(root, ["rev-parse", "HEAD^{tree}"]);
  const status = await git(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]);
  const pathIdentities = status.split("\0").filter(Boolean).map((line) => line.replace(/^[12u?]\s+/, "")).sort();
  const dirtyFingerprint = createHash("sha256").update(pathIdentities.join("\0")).digest("hex");
  const branchLabel = await git(root, ["branch", "--show-current"], true) || undefined;
  return { root, gitCommonDir, gitDir, headCommitSha, headTreeSha, dirtyFingerprint, ...(branchLabel ? { branchLabel } : {}) };
}

export async function isAncestor(cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  if (ancestor === "unborn" || descendant === "unborn") return ancestor === descendant;
  try { await runFile("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd }); return true; }
  catch { return false; }
}

export async function blobSha(cwd: string, path: string, revision = "HEAD"): Promise<string | undefined> {
  const value = await git(cwd, ["rev-parse", `${revision}:${path}`], true);
  return value || undefined;
}
