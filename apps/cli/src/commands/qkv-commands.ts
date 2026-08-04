import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import { openWorkspace } from "@breadbowl/bb-core";
import { configuredQkvClient } from "../composition/qkv-config.js";
import { print } from "./io.js";

const DISCLOSURE = "QKV will process reviewed current statements and a bounded secret-filtered term/path projection of active task queries. Source code, diffs, stored/raw prompts, tool input/output, transcripts, environment values, and secrets are never indexed.";

async function confirmDisclosure(yes: boolean): Promise<void> {
  print(DISCLOSURE);
  if (yes) return;
  if (!process.stdin.isTTY) throw new Error("Use --yes to acknowledge the QKV disclosure in a non-interactive shell");
  if (!(await confirm({ message: "Enable QKV with this data boundary?", default: false }))) throw new Error("QKV enablement cancelled");
}

export function registerQkvCommands(program: Command): void {
  const qkv = program.command("qkv").description("Manage optional proprietary semantic retrieval");
  qkv.command("enable").option("--index <id>").option("--model <name>").option("--model-version <version>").option("--yes", "acknowledge the remote-processing disclosure").action(async (options) => {
    await confirmDisclosure(Boolean(options.yes));
    const workspace = await openWorkspace(process.cwd());
    const configured = configuredQkvClient();
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
    print(workspace.database.getProviderState(workspace.repositoryId, "qkv") ?? { status: "disabled" }, true);
  });

  program.command("sync").description("Push pending reviewed statement documents to QKV").action(async () => {
    const workspace = await openWorkspace(process.cwd());
    const state = workspace.database.getProviderState(workspace.repositoryId, "qkv");
    const indexId = state?.remote_index_id;
    if (state?.status !== "enabled" || typeof indexId !== "string") throw new Error("QKV is not fully configured");
    const configured = configuredQkvClient();
    if (configured.deprecatedUrl) process.stderr.write("[bb-code] BB_QKV_URL is deprecated; use BB_QKV_API_URL.\n");
    for (const job of workspace.database.pendingRetrievalJobs(workspace.repositoryId)) {
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
      } catch (error) {
        workspace.database.completeRetrievalJob(job.id, error instanceof Error ? error.message : String(error));
      }
    }
    workspace.database.setProviderState(workspace.repositoryId, "qkv", {
      remoteIndexId: indexId,
      ...(typeof state.model === "string" ? { model: state.model } : {}),
      ...(typeof state.model_version === "string" ? { modelVersion: state.model_version } : {}),
      status: "enabled",
      lastSyncedAt: new Date().toISOString()
    });
    print("QKV sync complete");
  });
}
