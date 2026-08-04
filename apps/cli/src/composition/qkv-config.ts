import { QkvClient } from "@breadbowl/bb-qkv-client";

export function qkvApiUrl(environment: NodeJS.ProcessEnv = process.env): { url?: string; deprecated: boolean } {
  if (environment.BB_QKV_API_URL) return { url: environment.BB_QKV_API_URL, deprecated: false };
  if (environment.BB_QKV_URL) return { url: environment.BB_QKV_URL, deprecated: true };
  return { deprecated: false };
}

export function configuredQkvClient(environment: NodeJS.ProcessEnv = process.env): { client: QkvClient; deprecatedUrl: boolean } {
  const resolved = qkvApiUrl(environment);
  if (!environment.BB_QKV_API_KEY || !resolved.url) throw new Error("Set BB_QKV_API_URL and BB_QKV_API_KEY first");
  return { client: new QkvClient({ baseUrl: resolved.url, apiKey: environment.BB_QKV_API_KEY }), deprecatedUrl: resolved.deprecated };
}
