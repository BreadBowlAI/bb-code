import type { CandidateProposal } from "../../domain/knowledge.js";
import { FinishRunInputSchema } from "../../domain/runtime.js";
import { openWorkspace } from "../workspace/open-workspace.js";

export async function proposeUpdate(cwd: string, runId: string, proposal: CandidateProposal, databasePath?: string): Promise<string> {
  const workspace = await openWorkspace(cwd, databasePath ? { databasePath } : {});
  try { return workspace.database.propose(workspace.repositoryId, runId, proposal, workspace.gitViewId); }
  finally { workspace.database.close(); }
}

export async function finishRun(cwd: string, raw: unknown, databasePath?: string): Promise<{ candidateIds: string[] }> {
  const input = FinishRunInputSchema.parse(raw);
  const workspace = await openWorkspace(cwd, databasePath ? { databasePath } : {});
  try {
    const candidateIds = workspace.database.completeRun(workspace.repositoryId, {
      runId: input.runId,
      outcome: input.outcome,
      summary: input.summary,
      verification: input.verification,
      effects: input.contextEffects.map((effect) => ({ statementId: effect.statementId, effect: effect.effect, ...(effect.note ? { note: effect.note } : {}) })),
      requestIntent: input.requestIntent,
      endGitViewId: workspace.gitViewId,
      proposalGitViewId: workspace.gitViewId,
      proposals: input.proposals,
      ...(input.noDurableLearningReason ? { noDurableLearningReason: input.noDurableLearningReason } : {})
    });
    return { candidateIds };
  } finally { workspace.database.close(); }
}
