import { describe, expect, it } from "vitest";
import { FinishRunInputSchema } from "../../../src/domain/runtime.js";

describe("request intent decision", () => {
  it("requires every explicit finish call to classify the request separately from other learning", () => {
    const base = { runId: "run_1", outcome: "completed", summary: "Done", verification: [], contextEffects: [], proposals: [] };
    expect(FinishRunInputSchema.safeParse(base).success).toBe(false);
    expect(FinishRunInputSchema.safeParse({ ...base, requestIntent: { disposition: "ephemeral", reason: "This was an operational request" } }).success).toBe(true);
  });
});
