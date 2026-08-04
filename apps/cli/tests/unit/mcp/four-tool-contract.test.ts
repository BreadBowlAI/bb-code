import { describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES } from "../../../src/mcp/server.js";

describe("MCP four-tool contract", () => {
  it("exposes exactly the accepted tool names", () => {
    expect(MCP_TOOL_NAMES).toEqual(["bb_context", "bb_explain", "bb_propose_update", "bb_finish_run"]);
  });
});
