import { describe, expect, it } from "vitest";
import { StatementReferenceSchema } from "../../../src/domain/ids.js";

describe("statement reference normalization", () => {
  it("accepts rendered citations anywhere a raw statement ID is expected", () => {
    expect(StatementReferenceSchema.parse("bb:com_123@rev_456")).toBe("com_123");
    expect(StatementReferenceSchema.parse("bel_123")).toBe("bel_123");
  });
});
