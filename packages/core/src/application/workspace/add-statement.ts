import type { ActorRef, StatementDraft } from "../../domain/knowledge.js";
import { workingBlobSha } from "../../infrastructure/git/git-client.js";
import { openWorkspace } from "./open-workspace.js";

export async function addStatement(cwd: string, draft: Omit<StatementDraft, "actor" | "evidence"> & { evidenceSummary?: string }, databasePath?: string) {
  const workspace = await openWorkspace(cwd, databasePath ? { databasePath } : {});
  try {
    const actor: ActorRef = { kind: "human", id: process.env.USER ?? "local-user" };
    const paths = draft.scope.kind === "path" ? [draft.scope.prefix] : [];
    const pathBlobs: Record<string, string> = {};
    for (const path of paths) {
      const sha = await workingBlobSha(workspace.root, path);
      if (sha) pathBlobs[path] = sha;
    }
    return workspace.database.createStatement(workspace.repositoryId, { ...draft, actor, evidence: { kind: "user_statement", summary: draft.evidenceSummary ?? "Entered directly by the repository owner", gitViewId: workspace.gitViewId, paths, pathBlobs } });
  } finally { workspace.database.close(); }
}
