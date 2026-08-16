import { describe, expect, it } from "vitest";
import { renderCursorResponse } from "../../../src/adapters/hook-adapter.js";

describe("Cursor hook response rendering", () => {
  it("uses hidden context and never turns Stop guidance into a user message", () => {
    expect(renderCursorResponse("beforeSubmitPrompt", { effects: [] })).toEqual({ continue: true });
    expect(renderCursorResponse("postToolUse", { effects: [{ type: "completion_reminder", content: "finish the run" }] })).toEqual({ additional_context: "finish the run" });
    expect(renderCursorResponse("stop", { effects: [{ type: "completion_missing" }] })).toBeUndefined();
  });
});
