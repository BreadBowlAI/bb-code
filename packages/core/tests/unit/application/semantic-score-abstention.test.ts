import { describe, expect, it } from "vitest";
import { selectRelevantSemanticHits } from "../../../src/application/context/rank-context.js";

describe("semantic score abstention", () => {
  it("abstains when a provider returns a flat uninformative score distribution", () => {
    expect(selectRelevantSemanticHits(Array.from({ length: 10 }, (_, index) => ({ statementId: `bel_${index}`, score: 0.4 })))).toEqual([]);
  });
});
