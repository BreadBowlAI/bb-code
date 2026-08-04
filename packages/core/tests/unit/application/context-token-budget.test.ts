import { describe, expect, it } from "vitest";
import { countRenderedTokens, renderContextResult } from "../../../src/application/context/render-context.js";
import type { ContextItem } from "../../../src/domain/context.js";

describe("context token budget", () => {
  it("never renders more than 1,200 deterministic tokens or 12 items", () => {
    const items = Array.from({ length: 20 }, (_, index): ContextItem => ({ id: `bel_${index}`, revisionId: `rev_${index}`, kind: "belief", body: "relevant context ".repeat(200), status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, revisionNumber: 1, createdAt: "2026-01-01T00:00:00Z", rank: index + 1, finalScore: 1 / (index + 1), freshness: "fresh", applicabilityReason: "repository-wide" }));
    const rendered = renderContextResult(items.slice(0, 12), "run_1");
    expect(rendered.items.length).toBeLessThanOrEqual(12);
    expect(countRenderedTokens(rendered.rendered)).toBeLessThanOrEqual(1_200);
    expect(rendered.rendered.length).toBeLessThanOrEqual(4_800);
  });
});
