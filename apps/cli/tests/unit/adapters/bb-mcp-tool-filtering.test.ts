import { describe, expect, it } from "vitest";
import { isBbMcpToolName, normalizeHookEvent } from "../../../src/adapters/normalize-hook-event.js";

describe("bb-code MCP hook filtering", () => {
  it("filters native self-tool events before they can enter runtime policy", () => {
    for (const toolName of ["bb_context", "MCP:bb_context", "mcp__bb-code__bb_context", "MCP:bb_finish_run"]) {
      expect(isBbMcpToolName(toolName)).toBe(true);
      expect(normalizeHookEvent({
        host: "cursor",
        nativeEventName: "preToolUse",
        defaultCwd: "/repo",
        payload: {
          conversation_id: "conversation-1",
          tool_use_id: `tool-${toolName}`,
          tool_name: toolName,
          tool_input: { request: "Update profile", paths: ["apps/mobile/edit-profile.tsx"] }
        }
      })).toBeUndefined();
    }

    expect(isBbMcpToolName("MCP:other_context")).toBe(false);
  });
});
