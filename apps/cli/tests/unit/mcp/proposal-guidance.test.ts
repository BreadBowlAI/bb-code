import { describe, expect, it } from "vitest";
import { PROPOSAL_GUIDANCE } from "../../../src/mcp/server.js";

describe("proposal guidance", () => {
  it("distinguishes observed implementation facts from explicit constraints", () => {
    expect(PROPOSAL_GUIDANCE).toContain('"the repository currently uses PostgreSQL" is a belief');
    expect(PROPOSAL_GUIDANCE).toContain('"production persistence must use PostgreSQL" is a commitment');
    expect(PROPOSAL_GUIDANCE).toContain("knowledge likely to change how a future agent works");
    expect(PROPOSAL_GUIDANCE).toContain("Prefer revise, satisfy, supersede, or retire");
  });
});
