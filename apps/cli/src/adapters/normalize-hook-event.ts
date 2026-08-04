import type { RuntimeEvent } from "@breadbowl/bb-core";

export type Host = "codex" | "claude";

const EVENT_NAMES: Record<string, RuntimeEvent["event"]> = {
  SessionStart: "session_start",
  UserPromptSubmit: "start_task",
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
  Stop: "finish_task",
  SessionEnd: "session_end"
};

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeHookEvent(input: { host: Host; nativeEventName: string; payload: Record<string, unknown>; defaultCwd: string; occurredAt?: string }): RuntimeEvent | undefined {
  const event = EVENT_NAMES[input.nativeEventName];
  if (!event) return undefined;
  const payload = input.payload;
  const turnId = typeof (payload.turn_id ?? payload.turnId) === "string" ? String(payload.turn_id ?? payload.turnId) : undefined;
  const toolUseId = typeof (payload.tool_use_id ?? payload.toolUseId) === "string" ? String(payload.tool_use_id ?? payload.toolUseId) : undefined;
  const toolInput = record(payload.tool_input ?? payload.toolInput);
  const safePayload: Record<string, unknown> = {
    prompt: payload.prompt ?? payload.user_prompt,
    tool_name: payload.tool_name ?? payload.toolName,
    outcome: payload.outcome ?? payload.exit_code ?? payload.exitCode,
    path: payload.path ?? payload.file_path ?? toolInput.path ?? toolInput.file_path,
    paths: payload.paths ?? toolInput.paths,
    duration_ms: payload.duration_ms ?? payload.durationMs
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
