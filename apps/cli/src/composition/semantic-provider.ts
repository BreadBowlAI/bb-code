import { openWorkspace, type SemanticRetrievalProvider } from "@breadbowl/bb-core";
import { QkvClient, semanticProvider } from "@breadbowl/bb-qkv-client";
import { resolveQkvConfiguration } from "./qkv-config.js";

export async function configuredSemantic(cwd: string): Promise<SemanticRetrievalProvider | undefined> {
  const configuration = resolveQkvConfiguration();
  if (!configuration.apiUrl || !configuration.apiKey) return undefined;
  if (configuration.deprecatedUrl) process.stderr.write("[bb-code] BB_QKV_URL is deprecated; use BB_QKV_API_URL.\n");
  const workspace = await openWorkspace(cwd);
  let state: Record<string, unknown> | undefined;
  try { state = workspace.database.getProviderState(workspace.repositoryId, "qkv"); }
  finally { workspace.database.close(); }
  if (state?.status !== "enabled" || typeof state.remote_index_id !== "string") return undefined;
  return semanticProvider(new QkvClient({ baseUrl: configuration.apiUrl, apiKey: configuration.apiKey }), state.remote_index_id);
}
