import { describe, expect, it } from "vitest";
import { HOST_HOOK_CAPABILITIES, runtimePolicyForHost } from "../../../src/adapters/hook-adapter.js";

describe("Cursor runtime capabilities", () => {
  it("defers prompt context, injects one post-tool reminder, and observes Stop", () => {
    expect(HOST_HOOK_CAPABILITIES.cursor).toEqual({
      promptContext: "mcp",
      postToolContext: true,
      unfinishedStop: "observe",
      pathCommitments: "deny_once"
    });
    expect(runtimePolicyForHost("cursor", "postToolUse")).toEqual({
      contextAtRunStart: "defer",
      completionReminder: "after_first_consequential_tool",
      unfinishedStop: "finalize_partial"
    });
  });
});
