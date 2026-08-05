import { describe, expect, it } from "vitest";
import { normalizeHookEvent } from "../../../src/adapters/normalize-hook-event.js";

describe("Claude hook normalization", () => {
  it("maps UserPromptSubmit to the shared start-run protocol", () => {
    const event = normalizeHookEvent({ host: "claude", nativeEventName: "UserPromptSubmit", defaultCwd: "/repo", occurredAt: "2026-01-01T00:00:00.000Z", payload: { session_id: "session-1", prompt: "Add authentication" } });
    expect(event).toMatchObject({ host: "claude", event: "start_run", externalSessionId: "session-1", cwd: "/repo", payload: { prompt: "Add authentication" } });
  });
});
