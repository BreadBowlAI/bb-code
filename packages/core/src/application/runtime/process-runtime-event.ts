import { createHash } from "node:crypto";
import { isAbsolute, relative } from "node:path";
import type { SemanticRetrievalProvider } from "../../ports/semantic-retrieval.js";
import { RuntimeEventSchema, type RuntimeEvent } from "../../domain/runtime.js";
import { changedPathsSince, workingBlobSha } from "../../infrastructure/git/git-client.js";
import { retrieveContext } from "../context/retrieve-context.js";
import { finishRunGuidance } from "../runs/durable-learning-guidance.js";
import { openWorkspace } from "../workspace/open-workspace.js";

export type RuntimeEffect =
  | { type: "retrieved_context"; content: string }
  | { type: "path_commitments"; content: string }
  | { type: "completion_reminder"; content: string }
  | { type: "completion_nudge"; content: string }
  | { type: "completion_missing" };

export type RuntimeEventResult = { effects: RuntimeEffect[]; runId?: string };

export type RuntimeProcessingPolicy = {
  contextAtRunStart: "retrieve" | "defer";
  completionReminder: "none" | "after_first_consequential_tool";
  unfinishedStop: "nudge_once" | "finalize_partial";
};

export const DEFAULT_RUNTIME_PROCESSING_POLICY: RuntimeProcessingPolicy = {
  contextAtRunStart: "retrieve",
  completionReminder: "none",
  unfinishedStop: "nudge_once"
};

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : typeof value === "number" ? String(value) : undefined;
}

function safePath(root: string, value: string): string | undefined {
  const normalized = (isAbsolute(value) ? relative(root, value) : value).replace(/^\.\//, "").replaceAll("\\", "/");
  return normalized && normalized !== ".." && !normalized.startsWith("../") ? normalized : undefined;
}

function payloadPaths(root: string, payload: Record<string, unknown>): string[] {
  const candidates = [payload.path, payload.file_path];
  if (Array.isArray(payload.paths)) candidates.push(...payload.paths);
  return [...new Set(candidates.filter((value): value is string => typeof value === "string").map((value) => safePath(root, value)).filter((value): value is string => Boolean(value)))].slice(0, 100);
}

function promptPaths(root: string, prompt: string): string[] {
  const matches = prompt.match(/(?:\.?\.?\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.@-]+)+(?:\.[A-Za-z0-9]+)?|[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|py|go|rs|java|kt|swift|css|scss|html|sql|yaml|yml)/g) ?? [];
  return [...new Set(matches.map((value) => safePath(root, value)).filter((value): value is string => Boolean(value)))].slice(0, 30);
}

function pathCommitmentApplies(statement: { scope: { kind: "repository" } | { kind: "path"; prefix: string } }, paths: string[]): boolean {
  if (statement.scope.kind !== "path") return false;
  const prefix = statement.scope.prefix;
  return paths.some((path) => path === prefix || path.startsWith(`${prefix}/`) || prefix.startsWith(`${path}/`));
}

function isBbTool(toolName: string | undefined): boolean {
  if (!toolName) return false;
  const normalized = toolName.toLowerCase();
  return normalized.startsWith("bb_") || normalized.includes("__bb-code__") || normalized.includes("__bb_code__");
}

function classifyTool(toolName: string | undefined, toolCategory: string | undefined, outcome: string | undefined, changedPaths: string[]): { consequential: boolean; evidenceKind?: string; evidenceSummary?: string } {
  const name = toolName?.toLowerCase() ?? "tool";
  const failed = Boolean(outcome && !["0", "ok", "success", "passed", "completed"].includes(outcome.toLowerCase()));
  let kind: string | undefined;
  if (toolCategory === "test" || name.includes("test")) kind = "test_result";
  else if (toolCategory === "build" || name.includes("build")) kind = "build_result";
  else if (toolCategory === "lint" || name.includes("lint") || name.includes("typecheck")) kind = "lint_result";
  else if (changedPaths.length) kind = "file_change";
  else if (failed) kind = "tool_failure";
  return {
    consequential: Boolean(kind),
    ...(kind ? { evidenceKind: kind, evidenceSummary: `${toolName ?? "Tool"} ${failed ? "failed" : "completed"}${changedPaths.length ? `; ${changedPaths.length} changed path(s)` : ""}` } : {})
  };
}

function guidanceKey(kind: string, values: string[]): string {
  return `${kind}:${createHash("sha256").update(JSON.stringify(values)).digest("hex")}`;
}

export async function processRuntimeEvent(
  raw: unknown,
  databasePath?: string,
  semantic?: SemanticRetrievalProvider,
  policy: RuntimeProcessingPolicy = DEFAULT_RUNTIME_PROCESSING_POLICY
): Promise<RuntimeEventResult> {
  const event: RuntimeEvent = RuntimeEventSchema.parse(raw);
  const inspectPatchId = event.event === "start_run" || event.event === "finish_run" || event.event === "session_end";
  const workspace = await openWorkspace(event.cwd, { ...(databasePath ? { databasePath } : {}), inspectPatchId, lightweightGit: event.event === "before_tool" || event.event === "after_tool" });
  try {
  if (event.event === "session_start") {
    workspace.database.startSession({ repositoryId: workspace.repositoryId, worktreeId: workspace.worktreeId, host: event.host, externalSessionId: event.externalSessionId, metadata: { schemaVersion: event.schemaVersion } });
    return { effects: [] };
  }
  if (event.event === "session_end") {
    workspace.database.endSession(event.host, event.externalSessionId);
    return { effects: [] };
  }
  const sessionId = workspace.database.startSession({ repositoryId: workspace.repositoryId, worktreeId: workspace.worktreeId, host: event.host, externalSessionId: event.externalSessionId });
  if (event.event === "start_run") {
    const prompt = stringValue(event.payload.prompt) ?? stringValue(event.payload.user_prompt) ?? "Coding request";
    const runId = workspace.database.startRun({ sessionId, ...(event.externalTurnId ? { externalTurnId: event.externalTurnId } : {}), prompt, gitViewId: workspace.gitViewId });
    if (policy.contextAtRunStart === "defer") return { runId, effects: [] };
    const context = await retrieveContext({ database: workspace.database, repositoryId: workspace.repositoryId, gitViewId: workspace.gitViewId, git: workspace.git, query: prompt, paths: promptPaths(workspace.root, prompt), runId, ...(semantic ? { semantic } : {}) });
    return { runId, effects: [{ type: "retrieved_context", content: context.rendered }] };
  }
  const runId = workspace.database.latestRunningRun(event.host, event.externalSessionId);
  if (!runId) return { effects: [] };
  if (event.event === "before_tool" || event.event === "after_tool") {
    const toolName = stringValue(event.payload.tool_name) ?? stringValue(event.payload.toolName);
    const toolCategory = stringValue(event.payload.tool_category);
    if (isBbTool(toolName)) return { runId, effects: [] };
    const outcome = stringValue(event.payload.outcome);
    const inputPaths = payloadPaths(workspace.root, event.payload);
    let paths = inputPaths;
    if (event.event === "after_tool") {
      const start = workspace.database.runStartGitView(runId);
      const committed = start ? await changedPathsSince(workspace.root, start.headCommitSha) : [];
      paths = [...new Set([...workspace.git.changedPaths, ...committed])].slice(0, 100);
    }
    const classification = event.event === "after_tool" ? classifyTool(toolName, toolCategory, outcome, paths) : { consequential: false };
    const pathBlobs: Record<string, string> = {};
    if (event.event === "after_tool") {
      for (const path of paths) {
        const sha = await workingBlobSha(workspace.root, path);
        if (sha) pathBlobs[path] = sha;
      }
    }
    const inserted = workspace.database.addRunEvent(runId, {
      kind: event.event,
      ...(event.externalToolUseId ? { externalEventId: event.externalToolUseId } : {}),
      gitViewId: workspace.gitViewId,
      ...(toolName ? { toolName } : {}),
      ...(outcome ? { outcome } : {}),
      paths,
      pathBlobs,
      payload: { toolName: toolName ?? null, toolCategory: toolCategory ?? null, outcome: outcome ?? null, pathCount: paths.length, durationMs: event.payload.duration_ms ?? null },
      occurredAt: event.occurredAt,
      ...classification
    });
    if (event.event === "before_tool" && paths.length) {
      const commitments = workspace.database.listStatements(workspace.repositoryId).filter((statement) => statement.kind === "commitment" && statement.status === "accepted" && pathCommitmentApplies(statement, paths));
      const noticeKey = guidanceKey("path-commitments", [...commitments.map((statement) => statement.id).sort(), ...paths.slice().sort()]);
      if (commitments.length && inserted && workspace.database.addRunEvent(runId, {
        kind: "guidance",
        externalEventId: noticeKey,
        gitViewId: workspace.gitViewId,
        paths,
        payload: { guidance: "path_commitments", statementIds: commitments.map((statement) => statement.id) },
        occurredAt: event.occurredAt,
        consequential: false
      })) {
        return { runId, effects: [{ type: "path_commitments", content: `# bb-code path commitments\n${commitments.map((statement) => `- [bb:${statement.id}@${statement.revisionId}] ${statement.body}`).join("\n")}\nReview these constraints, then retry the tool if the action is compatible.` }] };
      }
    }
    if (
      event.event === "after_tool"
      && inserted
      && classification.consequential
      && policy.completionReminder === "after_first_consequential_tool"
      && workspace.database.addRunEvent(runId, {
        kind: "guidance",
        externalEventId: "completion-reminder",
        gitViewId: workspace.gitViewId,
        payload: { guidance: "completion_reminder" },
        occurredAt: event.occurredAt,
        consequential: false
      })
    ) {
      return { runId, effects: [{ type: "completion_reminder", content: `bb-code run ${runId} is now consequential. Before your final response, call bb_finish_run with this runId.` }] };
    }
    return { runId, effects: [] };
  }
  if (event.event === "finish_run") {
    const stop = workspace.database.handleStop(runId, policy.unfinishedStop);
    if (stop === "nudge") return { runId, effects: [{ type: "completion_nudge", content: finishRunGuidance(runId) }] };
    if (stop === "finalized") return { runId, effects: [{ type: "completion_missing" }] };
  }
  return { runId, effects: [] };
  } finally { workspace.database.close(); }
}
