import { describe, expect, it } from "vitest";
import { renderCursorResponse } from "../../../src/adapters/hook-adapter.js";

describe("Cursor path commitment rendering", () => {
  it("denies the first constrained tool call with agent-only guidance", () => {
    expect(renderCursorResponse("preToolUse", {
      effects: [{ type: "path_commitments", content: "Keep this path local-only" }]
    })).toEqual({ permission: "deny", agent_message: "Keep this path local-only" });
  });
});
