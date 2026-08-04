import type { CandidateProposal } from "../../domain/knowledge.js";
import { FinishRunInputSchema } from "../../domain/runtime.js";
import { openWorkspace } from "../workspace/open-workspace.js";

export async function proposeUpdate(cwd: string, runId: string, proposal: CandidateProposal, databasePath?: string): Promise<string> {
  const workspace = await openWorkspace(cwd, databasePath ? { databasePath } : {});
  return workspace.database.propose(workspace.repositoryId, runId, proposal);
}

export async function finishRun(cwd: string, raw: unknown, databasePath?: string): Promise<{ candidateIds: string[] }> {
  const input = FinishRunInputSchema.parse(raw);
  const workspace = await openWorkspace(cwd, databasePath ? { databasePath } : {});
  const candidateIds = input.proposals.map((proposal) => workspace.database.propose(workspace.repositoryId, input.runId, proposal));
  workspace.database.finishRun({
    runId: input.runId,
    outcome: input.outcome,
    summary: input.summary,
    verification: input.verification,
    effects: input.contextEffects.map((effect) => ({ statementId: effect.statementId, effect: effect.effect, ...(effect.note ? { note: effect.note } : {}) })),
    endGitViewId: workspace.gitViewId
  });
  return { candidateIds };
}
