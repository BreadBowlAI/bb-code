import { openWorkspace, type SemanticRetrievalProvider } from "@breadbowl/bb-core";
import { QkvClient, semanticProvider } from "@breadbowl/bb-qkv-client";

export async function configuredSemantic(cwd: string): Promise<SemanticRetrievalProvider | undefined> {
  if (!process.env.BB_QKV_URL || !process.env.BB_QKV_API_KEY) return undefined;
  const workspace = await openWorkspace(cwd);
  const state = workspace.database.getProviderState(workspace.repositoryId, "qkv");
  if (state?.status !== "enabled" || typeof state.remote_index_id !== "string") return undefined;
  return semanticProvider(new QkvClient({ baseUrl: process.env.BB_QKV_URL, apiKey: process.env.BB_QKV_API_KEY }), state.remote_index_id);
}
