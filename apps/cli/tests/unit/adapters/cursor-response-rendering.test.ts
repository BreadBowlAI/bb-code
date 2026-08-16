import { describe, expect, it } from "vitest";
import { renderCursorResponse } from "../../../src/adapters/hook-adapter.js";

describe("Cursor hook response rendering", () => {
  it("uses Cursor's non-blocking prompt and one-time stop continuation schemas", () => {
    expect(renderCursorResponse("beforeSubmitPrompt", { output: "context is retrieved by MCP" })).toEqual({ continue: true });
    expect(renderCursorResponse("stop", { nudge: "finish the run" })).toEqual({ followup_message: "finish the run" });
  });
});
