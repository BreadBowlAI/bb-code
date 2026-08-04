import type { SemanticRetrievalProvider } from "../../ports/semantic-retrieval.js";
import { RuntimeEventSchema, type RuntimeEvent } from "../../domain/runtime.js";
import { retrieveContext } from "../context/retrieve-context.js";
import { openWorkspace } from "../workspace/open-workspace.js";

export type RuntimeEventResult = { output?: string; runId?: string; nudge?: string };

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function payloadPaths(payload: Record<string, unknown>): string[] {
  const candidates = [payload.path, payload.file_path, payload.cwd];
  if (Array.isArray(payload.paths)) candidates.push(...payload.paths);
  return candidates.filter((value): value is string => typeof value === "string").slice(0, 100);
}

function pathCommitmentApplies(statement: { scope: { kind: "repository" } | { kind: "path"; prefix: string } }, paths: string[]): boolean {
  if (statement.scope.kind !== "path") return false;
  const prefix = statement.scope.prefix;
  return paths.some((path) => path === prefix || path.startsWith(`${prefix}/`));
}

export async function processRuntimeEvent(raw: unknown, databasePath?: string, semantic?: SemanticRetrievalProvider): Promise<RuntimeEventResult> {
  const event: RuntimeEvent = RuntimeEventSchema.parse(raw);
  const workspace = await openWorkspace(event.cwd, databasePath ? { databasePath } : {});
  if (event.event === "session_start") {
    workspace.database.startSession({ repositoryId: workspace.repositoryId, worktreeId: workspace.worktreeId, host: event.host, externalSessionId: event.externalSessionId, metadata: { schemaVersion: event.schemaVersion } });
    return {};
  }
  if (event.event === "session_end") {
    workspace.database.endSession(event.host, event.externalSessionId);
    return {};
  }
  const sessionId = workspace.database.startSession({ repositoryId: workspace.repositoryId, worktreeId: workspace.worktreeId, host: event.host, externalSessionId: event.externalSessionId });
  if (event.event === "start_task") {
    const prompt = stringValue(event.payload.prompt) ?? stringValue(event.payload.user_prompt) ?? "Coding task";
    const runId = workspace.database.startRun({ sessionId, ...(event.externalTurnId ? { externalTurnId: event.externalTurnId } : {}), prompt, gitViewId: workspace.gitViewId });
    const context = await retrieveContext({ database: workspace.database, repositoryId: workspace.repositoryId, gitViewId: workspace.gitViewId, query: prompt, runId, ...(semantic ? { semantic } : {}) });
    return { runId, output: context.rendered };
  }
  const runId = workspace.database.latestRunningRun(event.host, event.externalSessionId);
  if (!runId) return {};
  if (event.event === "before_tool" || event.event === "after_tool") {
    const toolName = stringValue(event.payload.tool_name) ?? stringValue(event.payload.toolName);
    if (toolName?.startsWith("mcp__bb-code__") || toolName?.startsWith("bb_")) return { runId };
    const outcome = stringValue(event.payload.outcome);
    const paths = payloadPaths(event.payload);
    workspace.database.addRunEvent(runId, { kind: event.event, ...(toolName ? { toolName } : {}), ...(outcome ? { outcome } : {}), paths, payload: { toolName: toolName ?? null, outcome: outcome ?? null, pathCount: paths.length }, occurredAt: event.occurredAt });
    if (event.event === "before_tool" && paths.length) {
      const commitments = workspace.database.listStatements(workspace.repositoryId).filter((statement) => statement.kind === "commitment" && statement.status === "accepted" && pathCommitmentApplies(statement, paths));
      if (commitments.length) return { runId, output: `# bb-code path commitments\n${commitments.map((statement) => `- [bb:${statement.id}@${statement.revisionId}] ${statement.body}`).join("\n")}` };
    }
    return { runId };
  }
  if (event.event === "finish_task" && workspace.database.handleStop(runId) === "nudge") {
    return { runId, nudge: `Call bb_finish_run with runId ${runId} before finishing so the task outcome and proposed learnings are recorded.` };
  }
  return { runId };
}
