import { openWorkspace, type SemanticRetrievalProvider } from "@breadbowl/bb-core";
import { QkvClient, semanticProvider } from "@breadbowl/bb-qkv-client";
import { qkvApiUrl } from "./qkv-config.js";

export async function configuredSemantic(cwd: string): Promise<SemanticRetrievalProvider | undefined> {
  const resolved = qkvApiUrl();
  if (!resolved.url || !process.env.BB_QKV_API_KEY) return undefined;
  if (resolved.deprecated) process.stderr.write("[bb-code] BB_QKV_URL is deprecated; use BB_QKV_API_URL.\n");
  const workspace = await openWorkspace(cwd);
  let state: Record<string, unknown> | undefined;
  try { state = workspace.database.getProviderState(workspace.repositoryId, "qkv"); }
  finally { workspace.database.close(); }
  if (state?.status !== "enabled" || typeof state.remote_index_id !== "string") return undefined;
  return semanticProvider(new QkvClient({ baseUrl: resolved.url, apiKey: process.env.BB_QKV_API_KEY }), state.remote_index_id);
}
