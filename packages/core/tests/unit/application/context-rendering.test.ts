import { describe, expect, it } from "vitest";
import { renderContext } from "../../../src/application/context/render-context.js";

describe("context rendering", () => {
  it("includes stable statement citations and the run completion instruction", () => {
    const rendered = renderContext([{ id: "bel_1", revisionId: "rev_1", kind: "belief", body: "Auth uses cookies", status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, revisionNumber: 1, createdAt: "2026-01-01T00:00:00Z", rank: 1, finalScore: 1, freshness: "fresh", applicabilityReason: "repository-wide" }], "run_1");
    expect(rendered).toContain("bb:bel_1@rev_1");
    expect(rendered).toContain("call bb_finish_run with runId run_1");
    expect(rendered).toContain("Include requestIntent and contextEffects");
    expect(rendered).toContain("a specific noDurableLearningReason");
    expect(rendered).not.toContain("Proposal attributes:");
  });
});
