import type { StatementApplicability } from "../../domain/context.js";
import type { CurrentStatement } from "../../domain/knowledge.js";
import { CLEAN_DIRTY_FINGERPRINT, blobSha, findPatchIdMatches, isAncestor, workingBlobSha, type GitSnapshot } from "../../infrastructure/git/git-client.js";
import type { BbDatabase } from "../../infrastructure/sqlite/bb-database.js";
import { evaluateApplicability, type BeliefAnchorFact } from "./evaluate-applicability.js";

async function blobFreshness(root: string, paths: Array<{ path: string; blobSha?: string }>, current: GitSnapshot): Promise<BeliefAnchorFact["blobs"]> {
  const anchored = paths.filter((path): path is { path: string; blobSha: string } => Boolean(path.blobSha));
  if (anchored.length === 0) return "unknown";
  for (const item of anchored) {
    const currentSha = current.changedPaths.includes(item.path) ? await workingBlobSha(root, item.path) : await blobSha(root, item.path);
    if (currentSha !== item.blobSha) return "changed";
  }
  return "unchanged";
}

export async function resolveApplicability(input: {
  database: BbDatabase;
  repositoryId: string;
  gitViewId: string;
  git: GitSnapshot;
  statements: CurrentStatement[];
  paths: string[];
  query: string;
}): Promise<Map<string, StatementApplicability>> {
  const results = new Map<string, StatementApplicability>();
  const currentView = input.database.getGitView(input.gitViewId);
  const ancestry = new Map<string, Promise<boolean>>();
  const patchMatches = new Map<string, Promise<string[]>>();
  const reachableFromHead = (commit: string) => {
    let value = ancestry.get(commit);
    if (!value) { value = isAncestor(input.git.root, commit, input.git.headCommitSha); ancestry.set(commit, value); }
    return value;
  };
  for (const statement of input.statements) {
    if (statement.kind !== "belief") {
      results.set(statement.id, evaluateApplicability({ statement, paths: input.paths }));
      continue;
    }
    const anchors = input.database.statementAnchors(statement.id);
    const facts: BeliefAnchorFact[] = [];
    for (const anchor of anchors) {
      if (!anchor.headCommitSha || !anchor.dirtyFingerprint) continue;
      const dirty = anchor.dirtyFingerprint !== CLEAN_DIRTY_FINGERPRINT;
      const reachable = !dirty && await reachableFromHead(anchor.headCommitSha);
      const mergeReachable = !dirty && !reachable && (await Promise.all(input.git.mergeHeadShas.map((mergeHead) => isAncestor(input.git.root, anchor.headCommitSha!, mergeHead)))).some(Boolean);
      facts.push({
        dirty,
        sameWorktree: anchor.worktreeId === currentView?.worktreeId,
        sameDirtyFingerprint: anchor.dirtyFingerprint === input.git.dirtyFingerprint,
        reachable,
        mergeReachable,
        branchMentioned: Boolean(anchor.branchLabel && input.query.toLowerCase().includes(anchor.branchLabel.toLowerCase())),
        blobs: await blobFreshness(input.git.root, anchor.paths, input.git)
      });
      if (!dirty && !reachable && anchor.stablePatchId) {
        let matchesPromise = patchMatches.get(anchor.stablePatchId);
        if (!matchesPromise) { matchesPromise = findPatchIdMatches(input.git.root, anchor.stablePatchId, 200); patchMatches.set(anchor.stablePatchId, matchesPromise); }
        const matches = await matchesPromise;
        if (matches.length === 1) input.database.ensureReanchorCandidate(input.repositoryId, statement.id, anchor.headCommitSha, matches[0]!, input.gitViewId);
      }
    }
    results.set(statement.id, evaluateApplicability({ statement, paths: input.paths, beliefFacts: facts }));
  }
  return results;
}
