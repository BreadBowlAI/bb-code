import type { Command } from "commander";
import { openWorkspace } from "@breadbowl/bb-core";
import { QkvClient } from "@breadbowl/bb-qkv-client";
import { print } from "./io.js";

function configuredClient(): QkvClient {
  if (!process.env.BB_QKV_API_KEY || !process.env.BB_QKV_URL) throw new Error("Set BB_QKV_API_KEY and BB_QKV_URL first");
  return new QkvClient({ baseUrl: process.env.BB_QKV_URL, apiKey: process.env.BB_QKV_API_KEY });
}

export function registerQkvCommands(program: Command): void {
  const qkv = program.command("qkv").description("Manage optional proprietary semantic retrieval");
  qkv.command("enable").option("--index <id>").action(async (options) => {
    const workspace = await openWorkspace(process.cwd());
    const indexId = options.index ?? (await configuredClient().createIndex(`bb-${workspace.repositoryId}`)).id;
    workspace.database.setProviderState(workspace.repositoryId, "qkv", { remoteIndexId: indexId, status: "enabled" });
    print(`QKV enabled for index ${indexId}`);
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

  program.command("sync").description("Push pending statement documents to QKV").action(async () => {
    const workspace = await openWorkspace(process.cwd());
    const state = workspace.database.getProviderState(workspace.repositoryId, "qkv");
    const indexId = state?.remote_index_id;
    if (state?.status !== "enabled" || typeof indexId !== "string") throw new Error("QKV is not fully configured");
    const client = configuredClient();
    for (const job of workspace.database.pendingRetrievalJobs(workspace.repositoryId)) {
      try {
        const statement = workspace.database.getStatement(String(job.statement_id));
        await client.upsertDocument(indexId, { id: statement.id, text: `${statement.kind}: ${statement.body}`, metadata: { statement_id: statement.id, revision_id: statement.revisionId, kind: statement.kind } });
        workspace.database.completeRetrievalJob(String(job.id));
      } catch (error) {
        workspace.database.completeRetrievalJob(String(job.id), error instanceof Error ? error.message : String(error));
      }
    }
    workspace.database.setProviderState(workspace.repositoryId, "qkv", { remoteIndexId: indexId, status: "enabled", lastSyncedAt: new Date().toISOString() });
    print("QKV sync complete");
  });
}
