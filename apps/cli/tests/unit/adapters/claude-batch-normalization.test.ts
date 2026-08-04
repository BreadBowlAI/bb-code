import { describe, expect, it } from "vitest";
import { normalizeHookEvent } from "../../../src/adapters/normalize-hook-event.js";

describe("Claude batch tool normalization", () => {
  it("retains only deduplication, category, outcome, and path metadata", () => {
    const event = normalizeHookEvent({
      host: "claude",
      nativeEventName: "PostToolUseBatch",
      defaultCwd: "/repo",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: {
        session_id: "session-1",
        tool_uses: [
          { tool_use_id: "tool-1", tool_name: "Bash", tool_input: { command: "pnpm test", file_path: "src/a.ts", secret: "DO_NOT_KEEP" }, tool_response: "PRIVATE_OUTPUT" },
          { tool_use_id: "tool-2", tool_name: "Edit", tool_input: { file_path: "src/b.ts", content: "PRIVATE_SOURCE" } }
        ]
      }
    });

    expect(event).toMatchObject({
      event: "after_tool",
      externalToolUseId: "batch:tool-1,tool-2",
      payload: { tool_name: "Batch", tool_category: "test", paths: ["src/a.ts", "src/b.ts"] }
    });
    expect(JSON.stringify(event)).not.toMatch(/pnpm test|DO_NOT_KEEP|PRIVATE_OUTPUT|PRIVATE_SOURCE/);
  });
});
