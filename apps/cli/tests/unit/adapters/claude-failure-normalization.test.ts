import { describe, expect, it } from "vitest";
import { normalizeHookEvent } from "../../../src/adapters/normalize-hook-event.js";

describe("Claude failed tool normalization", () => {
  it("maps failure events without retaining the tool response", () => {
    const event = normalizeHookEvent({ host: "claude", nativeEventName: "PostToolUseFailure", defaultCwd: "/repo", occurredAt: "2026-01-01T00:00:00.000Z", payload: { session_id: "session-1", tool_use_id: "tool-1", tool_name: "Bash", tool_response: "SECRET_OUTPUT" } });
    expect(event).toMatchObject({ event: "after_tool", externalToolUseId: "tool-1", payload: { outcome: "failed" } });
    expect(JSON.stringify(event)).not.toContain("SECRET_OUTPUT");
  });
});
