import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { BbError } from "../../domain/errors.js";
import type { GitView } from "../../domain/runtime.js";

const runFile = promisify(execFile);
export const CLEAN_DIRTY_FINGERPRINT = createHash("sha256").update("").digest("hex");

async function git(cwd: string, arguments_: string[], allowFailure = false): Promise<string> {
  try {
    const { stdout } = await runFile("git", arguments_, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) return "";
    throw new BbError(`Git command failed: git ${arguments_.join(" ")}`, "git_error", { cause: error instanceof Error ? error.message : String(error) });
  }
}

async function gitWithInput(cwd: string, arguments_: string[], input: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", arguments_, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString("utf8").trim());
      else reject(new BbError(`Git command failed: git ${arguments_.join(" ")}`, "git_error", { stderr: Buffer.concat(stderr).toString("utf8").slice(0, 1000) }));
    });
    child.stdin.end(input);
  });
}

async function absoluteGitPath(root: string, value: string): Promise<string> {
  return realpath(isAbsolute(value) ? value : resolve(root, value));
}

function statusEntries(status: string): Array<{ identity: string; path: string }> {
  const records = status.split("\0").filter(Boolean);
  const result: Array<{ identity: string; path: string }> = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const kind = record[0];
    if (kind === "!" || kind === "#") continue;
    let path = "";
    if (kind === "?") path = record.slice(2);
    else {
      const fields = record.split(" ");
      const pathIndex = kind === "1" ? 8 : kind === "2" ? 9 : kind === "u" ? 10 : fields.length - 1;
      path = fields.slice(pathIndex).join(" ");
      if (kind === "2") index += 1;
    }
    if (path) result.push({ identity: record.slice(0, 2), path: path.replaceAll("\\", "/") });
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

async function stablePatchId(cwd: string, revision: string): Promise<string | undefined> {
  const patch = await git(cwd, ["show", "--pretty=format:", "--binary", revision], true);
  if (!patch) return undefined;
  try {
    const output = await gitWithInput(cwd, ["patch-id", "--stable"], patch);
    return output.split(/\s+/, 1)[0] || undefined;
  } catch {
    return undefined;
  }
}

export type GitSnapshot = {
  root: string;
  gitCommonDir: string;
  gitDir: string;
  headCommitSha: string;
  headTreeSha: string;
  parentShas: string[];
  dirtyFingerprint: string;
  changedPaths: string[];
  stablePatchId?: string;
  branchLabel?: string;
  mergeHeadShas: string[];
};

export async function inspectGit(cwd: string, options: { includePatchId?: boolean; lightweight?: boolean } = {}): Promise<GitSnapshot> {
  const combined = (await git(cwd, ["rev-parse", "--show-toplevel", "--git-common-dir", "--git-dir", "HEAD", "HEAD^{tree}"], true)).split("\n");
  const root = await realpath(combined.length >= 5 ? combined[0]! : await git(cwd, ["rev-parse", "--show-toplevel"]));
  const gitCommonDir = await absoluteGitPath(root, combined.length >= 5 ? combined[1]! : await git(root, ["rev-parse", "--git-common-dir"]));
  const gitDir = await absoluteGitPath(root, combined.length >= 5 ? combined[2]! : await git(root, ["rev-parse", "--git-dir"]));
  const headCommitSha = combined.length >= 5 ? combined[3]! : await git(root, ["rev-parse", "HEAD"], true) || "unborn";
  const headTreeSha = combined.length >= 5 ? combined[4]! : headCommitSha === "unborn" ? "unborn" : await git(root, ["rev-parse", "HEAD^{tree}"]);
  const parents = options.lightweight || headCommitSha === "unborn" ? [] : (await git(root, ["rev-list", "--parents", "-n", "1", "HEAD"])).split(/\s+/).slice(1);
  const rawStatus = await git(root, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]);
  const branchHeader = rawStatus.split("\0").find((record) => record.startsWith("# branch.head "));
  const status = statusEntries(rawStatus);
  const dirtyFingerprint = createHash("sha256").update(status.map((item) => `${item.identity}:${item.path}`).join("\0")).digest("hex");
  const branchValue = branchHeader?.slice("# branch.head ".length);
  const branchLabel = branchValue && branchValue !== "(detached)" ? branchValue : undefined;
  const mergeHead = options.lightweight ? "" : await git(root, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], true);
  const patchId = options.includePatchId === false || headCommitSha === "unborn" ? undefined : await stablePatchId(root, headCommitSha);
  return {
    root,
    gitCommonDir,
    gitDir,
    headCommitSha,
    headTreeSha,
    parentShas: parents,
    dirtyFingerprint,
    changedPaths: status.map((item) => item.path),
    ...(patchId ? { stablePatchId: patchId } : {}),
    ...(branchLabel ? { branchLabel } : {}),
    mergeHeadShas: mergeHead ? mergeHead.split(/\s+/) : []
  };
}

export async function inspectKnownWorktree(input: { root: string; gitCommonDir: string; gitDir: string; previous: GitView }): Promise<GitSnapshot> {
  const rawStatus = await git(input.root, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]);
  const records = rawStatus.split("\0");
  const oid = records.find((record) => record.startsWith("# branch.oid "))?.slice("# branch.oid ".length);
  const branchValue = records.find((record) => record.startsWith("# branch.head "))?.slice("# branch.head ".length);
  const headCommitSha = oid && oid !== "(initial)" ? oid : "unborn";
  const headTreeSha = headCommitSha === input.previous.headCommitSha ? input.previous.headTreeSha : headCommitSha === "unborn" ? "unborn" : await git(input.root, ["rev-parse", "HEAD^{tree}"]);
  const status = statusEntries(rawStatus);
  const dirtyFingerprint = createHash("sha256").update(status.map((item) => `${item.identity}:${item.path}`).join("\0")).digest("hex");
  const branchLabel = branchValue && branchValue !== "(detached)" ? branchValue : undefined;
  return {
    root: input.root,
    gitCommonDir: input.gitCommonDir,
    gitDir: input.gitDir,
    headCommitSha,
    headTreeSha,
    parentShas: [],
    dirtyFingerprint,
    changedPaths: status.map((item) => item.path),
    ...(branchLabel ? { branchLabel } : {}),
    mergeHeadShas: []
  };
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

export async function workingBlobSha(cwd: string, path: string): Promise<string | undefined> {
  const value = await git(cwd, ["hash-object", "--", path], true);
  return value || undefined;
}

export async function changedPathsSince(cwd: string, revision: string): Promise<string[]> {
  if (revision === "unborn") return [];
  const value = await git(cwd, ["diff", "--name-only", "-z", `${revision}..HEAD`], true);
  return value.split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/"));
}

export async function findPatchIdMatches(cwd: string, patchId: string, limit = 200): Promise<string[]> {
  const commits = (await git(cwd, ["log", `--max-count=${limit}`, "--format=%H"], true)).split("\n").filter(Boolean);
  const matches: string[] = [];
  for (const commit of commits) {
    if (await stablePatchId(cwd, commit) === patchId) matches.push(commit);
  }
  return matches;
}
