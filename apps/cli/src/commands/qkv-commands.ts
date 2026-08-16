import { confirm, input, password } from "@inquirer/prompts";
import type { Command } from "commander";
import { openWorkspace } from "@breadbowl/bb-core";
import { configuredQkvClient, resolveQkvConfiguration, writeQkvConfiguration } from "../composition/qkv-config.js";
import { print } from "./io.js";

const DISCLOSURE = "QKV will process current statements activated by repository policy and a bounded secret-filtered term/path projection of active request queries. Source code, diffs, stored/raw prompts, tool input/output, transcripts, environment values, and secrets are never indexed.";

async function confirmDisclosure(yes: boolean): Promise<void> {
  print(DISCLOSURE);
  if (yes) return;
  if (!process.stdin.isTTY) throw new Error("Use --yes to acknowledge the QKV disclosure in a non-interactive shell");
  if (!(await confirm({ message: "Enable QKV with this data boundary?", default: false }))) throw new Error("QKV enablement cancelled");
}

type ResolvedQkvClient = ReturnType<typeof configuredQkvClient>;

export function qkvCredentialSetupMode(
  configuration: ReturnType<typeof resolveQkvConfiguration>,
  interactive: boolean
): "ready" | "prompt" | "error" {
  if (configuration.apiUrl && configuration.apiKey) return "ready";
  return interactive ? "prompt" : "error";
}

async function promptForQkvConfiguration(): Promise<string> {
  const current = resolveQkvConfiguration();
  const apiUrl = await input({ message: "QKV API URL:", ...(current.apiUrl ? { default: current.apiUrl } : {}) });
  const apiKey = await password({ message: "QKV API key:" });
  if (!apiUrl || !apiKey) throw new Error("QKV API URL and API key are required");
  return writeQkvConfiguration({ apiUrl: String(apiUrl), apiKey: String(apiKey) });
}

async function configuredQkvClientForCli(reason: string): Promise<ResolvedQkvClient> {
  const configuration = resolveQkvConfiguration();
  const mode = qkvCredentialSetupMode(configuration, Boolean(process.stdin.isTTY && process.stdout.isTTY));
  if (mode === "error") throw new Error("QKV credentials are missing. Run `bb qkv configure` or set BB_QKV_API_URL and BB_QKV_API_KEY first");
  if (mode === "prompt") {
    const accepted = await confirm({ message: `QKV credentials are missing. Configure them now to ${reason}?`, default: true });
    if (!accepted) throw new Error("QKV credential setup cancelled; run `bb qkv configure` when ready");
    const path = await promptForQkvConfiguration();
    print(`Saved QKV credentials for CLI, hooks, and MCP at ${path}`);
  }
  return configuredQkvClient();
}

export function registerQkvCommands(program: Command): void {
  const qkv = program.command("qkv").description("Manage optional proprietary semantic retrieval");
  qkv.command("configure").description("Save QKV credentials for CLI, hooks, and MCP").option("--api-url <url>").option("--from-env", "save BB_QKV_API_URL and BB_QKV_API_KEY from the current environment").action(async (options) => {
    const current = resolveQkvConfiguration();
    const environmentUrl = process.env.BB_QKV_API_URL ?? process.env.BB_QKV_URL;
    if (!options.fromEnv && !(process.stdin.isTTY && process.stdout.isTTY)) throw new Error("Interactive QKV configuration requires a terminal; use `bb qkv configure --from-env`");
    const apiUrl = options.fromEnv ? environmentUrl : options.apiUrl ?? await input({ message: "QKV API URL:", ...(current.apiUrl ? { default: current.apiUrl } : {}) });
    const apiKey = options.fromEnv ? process.env.BB_QKV_API_KEY : await password({ message: "QKV API key:" });
    if (!apiUrl || !apiKey) throw new Error(options.fromEnv ? "BB_QKV_API_URL and BB_QKV_API_KEY must be set" : "QKV API URL and API key are required");
    const path = writeQkvConfiguration({ apiUrl: String(apiUrl), apiKey: String(apiKey) });
    print(`Saved QKV credentials for CLI, hooks, and MCP at ${path}`);
  });
  qkv.command("enable").option("--index <id>").option("--model <name>").option("--model-version <version>").option("--yes", "acknowledge the remote-processing disclosure").action(async (options) => {
    await confirmDisclosure(Boolean(options.yes));
    const workspace = await openWorkspace(process.cwd());
    const configured = await configuredQkvClientForCli("enable semantic retrieval");
    if (configured.deprecatedUrl) process.stderr.write("[bb-code] BB_QKV_URL is deprecated; use BB_QKV_API_URL.\n");
    const created = options.index ? { id: String(options.index), model: options.model, model_version: options.modelVersion } : await configured.client.createIndex(`bb-${workspace.repositoryId}`);
    if (!created.model || !created.model_version) throw new Error("QKV must return an immutable model and model_version; existing indexes require --model and --model-version");
    workspace.database.setProviderState(workspace.repositoryId, "qkv", { remoteIndexId: created.id, model: created.model, modelVersion: created.model_version, status: "enabled" });
    workspace.database.enqueueIndexDocuments(workspace.repositoryId);
    print(`QKV enabled for index ${created.id} (${created.model}@${created.model_version})`);
  });
  qkv.command("disable").action(async () => {
    const workspace = await openWorkspace(process.cwd());
    workspace.database.setProviderState(workspace.repositoryId, "qkv", { status: "disabled" });
    print("QKV disabled");
  });
  qkv.command("status").action(async () => {
    const workspace = await openWorkspace(process.cwd());
    const state = workspace.database.getProviderState(workspace.repositoryId, "qkv") ?? { status: "disabled" };
    const configuration = resolveQkvConfiguration();
    const indexConfigured = state.status === "enabled" && typeof state.remote_index_id === "string";
    print({
      provider: state,
      runtime: {
        credentialSource: configuration.source,
        apiUrlConfigured: Boolean(configuration.apiUrl),
        apiKeyConfigured: Boolean(configuration.apiKey),
        semanticReady: indexConfigured && Boolean(configuration.apiUrl) && Boolean(configuration.apiKey),
        configPath: configuration.configPath
      },
      jobs: workspace.database.retrievalJobSummary(workspace.repositoryId, "qkv")
    }, true);
  });

  program.command("sync").description("Push pending policy-activated statement documents to QKV").option("--force", "retry all failed jobs immediately and reset their attempt counters").action(async (options) => {
    const workspace = await openWorkspace(process.cwd());
    const state = workspace.database.getProviderState(workspace.repositoryId, "qkv");
    const indexId = state?.remote_index_id;
    if (state?.status !== "enabled" || typeof indexId !== "string") throw new Error("QKV is not fully configured");
    const configured = await configuredQkvClientForCli("synchronize policy-activated statements");
    if (configured.deprecatedUrl) process.stderr.write("[bb-code] BB_QKV_URL is deprecated; use BB_QKV_API_URL.\n");
    const resetCount = options.force ? workspace.database.resetFailedRetrievalJobsForRetry(workspace.repositoryId, "qkv") : 0;
    const jobs = workspace.database.pendingRetrievalJobs(workspace.repositoryId);
    let succeeded = 0;
    let failed = 0;
    for (const job of jobs) {
      try {
        const docId = `bb:${job.statement_id}`;
        if (job.operation === "delete") await configured.client.deleteDocument(indexId, docId);
        else {
          const document = workspace.database.indexDocument(job.statement_id);
          if (!document || document.revisionId !== job.revision_id) await configured.client.deleteDocument(indexId, docId);
          else await configured.client.upsertDocument(indexId, {
            id: docId,
            text: document.text,
            metadata: { statement_id: document.id, revision_id: document.revisionId, kind: document.kind, status: document.status }
          });
        }
        workspace.database.completeRetrievalJob(job.id);
        succeeded += 1;
      } catch (error) {
        workspace.database.completeRetrievalJob(job.id, error instanceof Error ? error.message : String(error));
        failed += 1;
      }
    }
    const remaining = workspace.database.retrievalJobSummary(workspace.repositoryId, "qkv");
    const fullySynchronized = remaining.pending === 0 && remaining.failed === 0;
    workspace.database.setProviderState(workspace.repositoryId, "qkv", {
      remoteIndexId: indexId,
      ...(typeof state.model === "string" ? { model: state.model } : {}),
      ...(typeof state.model_version === "string" ? { modelVersion: state.model_version } : {}),
      status: "enabled",
      ...(fullySynchronized ? { lastSyncedAt: new Date().toISOString() } : {})
    });
    const forced = options.force ? `; ${resetCount} failed job(s) reset` : "";
    if (!fullySynchronized) throw new Error(`QKV sync incomplete: ${succeeded} succeeded, ${failed} failed; ${remaining.pending} pending, ${remaining.failed} failed in queue${forced}`);
    print(`QKV sync complete: ${succeeded} succeeded${forced}`);
  });
}
