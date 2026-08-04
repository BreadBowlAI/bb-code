import type { ActorRef, StatementDraft } from "../../domain/knowledge.js";
import { openWorkspace } from "./open-workspace.js";

export async function addStatement(cwd: string, draft: Omit<StatementDraft, "actor" | "evidence"> & { evidenceSummary?: string }, databasePath?: string) {
  const workspace = await openWorkspace(cwd, databasePath ? { databasePath } : {});
  const actor: ActorRef = { kind: "human", id: process.env.USER ?? "local-user" };
  return workspace.database.createStatement(workspace.repositoryId, { ...draft, actor, evidence: { kind: "user_statement", summary: draft.evidenceSummary ?? "Entered directly by the repository owner", gitViewId: workspace.gitViewId } });
}
