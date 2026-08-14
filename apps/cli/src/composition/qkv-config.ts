import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { defaultDataDirectory } from "@breadbowl/bb-core";
import { QkvClient } from "@breadbowl/bb-qkv-client";

const QKV_ENV_KEYS = ["BB_QKV_API_URL", "BB_QKV_URL", "BB_QKV_API_KEY"] as const;

export type QkvRuntimeConfiguration = {
  apiUrl?: string;
  apiKey?: string;
  deprecatedUrl: boolean;
  source: "environment" | "user_config" | "mixed" | "unconfigured";
  configPath: string;
};

export function qkvConfigPath(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.BB_QKV_CONFIG_FILE ?? join(defaultDataDirectory(environment), "qkv.env");
}

function readStoredEnvironment(path: string): Record<string, string | undefined> {
  try { return parseEnv(readFileSync(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Unable to read QKV configuration at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function configuredValue(environment: NodeJS.ProcessEnv | Record<string, string | undefined>, key: typeof QKV_ENV_KEYS[number]): string | undefined {
  const value = environment[key]?.trim();
  return value || undefined;
}

export function resolveQkvConfiguration(environment: NodeJS.ProcessEnv = process.env, configPath = qkvConfigPath(environment)): QkvRuntimeConfiguration {
  const stored = readStoredEnvironment(configPath);
  const apiUrl = configuredValue(environment, "BB_QKV_API_URL") ?? configuredValue(environment, "BB_QKV_URL") ?? configuredValue(stored, "BB_QKV_API_URL") ?? configuredValue(stored, "BB_QKV_URL");
  const apiKey = configuredValue(environment, "BB_QKV_API_KEY") ?? configuredValue(stored, "BB_QKV_API_KEY");
  const environmentUsed = QKV_ENV_KEYS.some((key) => configuredValue(environment, key));
  const storedUsed = (!configuredValue(environment, "BB_QKV_API_URL") && !configuredValue(environment, "BB_QKV_URL") && Boolean(configuredValue(stored, "BB_QKV_API_URL") ?? configuredValue(stored, "BB_QKV_URL")))
    || (!configuredValue(environment, "BB_QKV_API_KEY") && Boolean(configuredValue(stored, "BB_QKV_API_KEY")));
  const source = environmentUsed && storedUsed ? "mixed" : environmentUsed ? "environment" : storedUsed ? "user_config" : "unconfigured";
  const deprecatedUrl = !configuredValue(environment, "BB_QKV_API_URL")
    && !configuredValue(stored, "BB_QKV_API_URL")
    && Boolean(configuredValue(environment, "BB_QKV_URL") ?? configuredValue(stored, "BB_QKV_URL"));
  return { ...(apiUrl ? { apiUrl } : {}), ...(apiKey ? { apiKey } : {}), deprecatedUrl, source, configPath };
}

export function writeQkvConfiguration(input: { apiUrl: string; apiKey: string }, environment: NodeJS.ProcessEnv = process.env): string {
  const apiUrl = input.apiUrl.trim().replace(/\/$/, "");
  const parsedUrl = new URL(apiUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error("QKV API URL must use http or https");
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("QKV API key is required");
  const path = qkvConfigPath(environment);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `BB_QKV_API_URL=${JSON.stringify(apiUrl)}\nBB_QKV_API_KEY=${JSON.stringify(apiKey)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export function configuredQkvClient(environment: NodeJS.ProcessEnv = process.env): { client: QkvClient; deprecatedUrl: boolean; configuration: QkvRuntimeConfiguration } {
  const configuration = resolveQkvConfiguration(environment);
  if (!configuration.apiKey || !configuration.apiUrl) throw new Error("Run `bb qkv configure` or set BB_QKV_API_URL and BB_QKV_API_KEY first");
  return { client: new QkvClient({ baseUrl: configuration.apiUrl, apiKey: configuration.apiKey }), deprecatedUrl: configuration.deprecatedUrl, configuration };
}
