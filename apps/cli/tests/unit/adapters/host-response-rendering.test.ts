import { describe, expect, it } from "vitest";
import { renderClaudeResponse, renderCodexResponse } from "../../../src/adapters/hook-adapter.js";

describe("host hook response rendering", () => {
  it("renders context and one-time stop continuation through host-specific boundaries", () => {
    expect(renderCodexResponse("UserPromptSubmit", { effects: [{ type: "retrieved_context", content: "context" }] })).toEqual({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "context" } });
    expect(renderClaudeResponse("Stop", { effects: [{ type: "completion_nudge", content: "finish the run" }] })).toEqual({ decision: "block", reason: "finish the run" });
  });
});
