import type { RuntimeEvent } from "@breadbowl/bb-core";

export type Host = "codex" | "claude" | "cursor";

const EVENT_NAMES: Record<string, RuntimeEvent["event"]> = {
  SessionStart: "session_start",
  UserPromptSubmit: "start_run",
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
  PostToolUseFailure: "after_tool",
  PostToolUseBatch: "after_tool",
  Stop: "finish_run",
  SessionEnd: "session_end",
  sessionStart: "session_start",
  beforeSubmitPrompt: "start_run",
  preToolUse: "before_tool",
  postToolUse: "after_tool",
  postToolUseFailure: "after_tool",
  stop: "finish_run",
  sessionEnd: "session_end"
};

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function verificationCategory(toolName: unknown, toolInput: Record<string, unknown>): "test" | "build" | "lint" | undefined {
  const name = typeof toolName === "string" ? toolName.toLowerCase() : "";
  const command = [toolInput.command, toolInput.cmd]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const text = `${name} ${command}`;
  if (/\b(?:vitest|jest|pytest|cargo\s+test|go\s+test|test(?::[a-z0-9_-]+)?)\b/.test(text)) return "test";
  if (/\b(?:build|tsup|webpack|rollup|vite\s+build)\b/.test(text)) return "build";
  if (/\b(?:lint|eslint|biome|ruff|typecheck|tsc\b.*--noemit)\b/.test(text)) return "lint";
  return undefined;
}

function batchRecords(payload: Record<string, unknown>): Record<string, unknown>[] {
  const value = payload.tool_uses ?? payload.toolUses ?? payload.results;
  return Array.isArray(value) ? value.map(record) : [];
}

export function normalizeHookEvent(input: { host: Host; nativeEventName: string; payload: Record<string, unknown>; defaultCwd: string; occurredAt?: string }): RuntimeEvent | undefined {
  const event = EVENT_NAMES[input.nativeEventName];
  if (!event) return undefined;
  const payload = input.payload;
  const nativeTurnId = payload.turn_id ?? payload.turnId ?? payload.generation_id;
  const turnId = typeof nativeTurnId === "string" ? nativeTurnId : undefined;
  const batch = batchRecords(payload);
  const batchIds = batch.map((item) => item.tool_use_id ?? item.toolUseId ?? item.id).filter((value): value is string => typeof value === "string");
  const nativeToolUseId = payload.tool_use_id ?? payload.toolUseId ?? payload.batch_id ?? payload.batchId;
  const toolUseId = typeof nativeToolUseId === "string" ? nativeToolUseId : batchIds.length ? `batch:${batchIds.join(",")}` : undefined;
  const toolInput = record(payload.tool_input ?? payload.toolInput);
  const batchInputs = batch.map((item) => record(item.tool_input ?? item.toolInput ?? item.input));
  const batchPaths = batchInputs
    .flatMap((item) => [item.path, item.file_path, ...(Array.isArray(item.paths) ? item.paths : [])])
    .filter((value): value is string => typeof value === "string");
  const toolName = payload.tool_name ?? payload.toolName ?? (batch.length ? "Batch" : undefined);
  const category = verificationCategory(toolName, toolInput)
    ?? batch.map((item, index) => verificationCategory(item.tool_name ?? item.toolName ?? item.name, batchInputs[index] ?? {})).find(Boolean);
  const explicitOutcome = payload.outcome ?? payload.exit_code ?? payload.exitCode;
  const batchFailed = batch.some((item) => item.success === false || item.outcome === "failed" || item.error !== undefined);
  const safePayload: Record<string, unknown> = {
    prompt: payload.prompt ?? payload.user_prompt,
    tool_name: toolName,
    tool_category: category,
    outcome: explicitOutcome ?? (payload.success === false || batchFailed || ["PostToolUseFailure", "postToolUseFailure"].includes(input.nativeEventName) ? "failed" : payload.success === true || ["PostToolUse", "postToolUse"].includes(input.nativeEventName) ? "success" : undefined),
    path: payload.path ?? payload.file_path ?? toolInput.path ?? toolInput.file_path,
    paths: payload.paths ?? toolInput.paths ?? (batchPaths.length ? batchPaths : undefined),
    duration_ms: payload.duration_ms ?? payload.durationMs ?? payload.duration
  };
  return {
    schemaVersion: 1,
    host: input.host,
    event,
    externalSessionId: text(payload.session_id ?? payload.sessionId ?? payload.conversation_id, `${input.host}-unknown`),
    ...(turnId ? { externalTurnId: turnId } : {}),
    ...(toolUseId ? { externalToolUseId: toolUseId } : {}),
    cwd: text(payload.cwd, input.defaultCwd),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: Object.fromEntries(Object.entries(safePayload).filter(([, value]) => value !== undefined))
  };
}
