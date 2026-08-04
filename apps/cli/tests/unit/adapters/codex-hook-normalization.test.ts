import { describe, expect, it } from "vitest";
import { normalizeHookEvent } from "../../../src/adapters/normalize-hook-event.js";

describe("Codex hook normalization", () => {
  it("maps PreToolUse without retaining raw tool input", () => {
    const event = normalizeHookEvent({ host: "codex", nativeEventName: "PreToolUse", defaultCwd: "/repo", occurredAt: "2026-01-01T00:00:00.000Z", payload: { session_id: "session-1", tool_name: "Edit", tool_input: { file_path: "src/a.ts", content: "private source" } } });
    expect(event).toMatchObject({ host: "codex", event: "before_tool", externalSessionId: "session-1", payload: { tool_name: "Edit", path: "src/a.ts" } });
    expect(JSON.stringify(event)).not.toContain("private source");
  });
});
