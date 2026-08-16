import { describe, expect, it } from "vitest";
import { normalizeHookEvent } from "../../../src/adapters/normalize-hook-event.js";

describe("Cursor hook normalization", () => {
  it("maps native prompt and tool metadata without retaining raw tool content", () => {
    const prompt = normalizeHookEvent({ host: "cursor", nativeEventName: "beforeSubmitPrompt", defaultCwd: "/repo", occurredAt: "2026-01-01T00:00:00.000Z", payload: { conversation_id: "conversation-1", generation_id: "generation-1", prompt: "Add authentication", transcript_path: "/private/transcript.jsonl" } });
    const tool = normalizeHookEvent({ host: "cursor", nativeEventName: "postToolUse", defaultCwd: "/repo", occurredAt: "2026-01-01T00:01:00.000Z", payload: { conversation_id: "conversation-1", generation_id: "generation-1", tool_use_id: "tool-1", tool_name: "Write", tool_input: { file_path: "src/auth.ts", content: "private source" }, tool_output: "private output", duration: 42 } });

    expect(prompt).toMatchObject({ host: "cursor", event: "start_run", externalSessionId: "conversation-1", externalTurnId: "generation-1", payload: { prompt: "Add authentication" } });
    expect(tool).toMatchObject({ host: "cursor", event: "after_tool", externalSessionId: "conversation-1", externalToolUseId: "tool-1", payload: { tool_name: "Write", path: "src/auth.ts", outcome: "success", duration_ms: 42 } });
    expect(JSON.stringify(tool)).not.toContain("private source");
    expect(JSON.stringify(tool)).not.toContain("private output");
    expect(JSON.stringify(prompt)).not.toContain("transcript");
  });
});
