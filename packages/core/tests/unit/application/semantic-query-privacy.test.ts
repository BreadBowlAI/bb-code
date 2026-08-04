import { describe, expect, it } from "vitest";
import { buildSemanticQuery } from "../../../src/application/context/build-query.js";

describe("semantic query privacy", () => {
  it("uses a bounded deterministic projection without code blocks or obvious secrets", () => {
    const query = buildSemanticQuery("Fix authentication API_KEY=super-secret-value-12345678901234567890 ```ts\nconst password = 'private';\n``` in src/auth.ts", ["src/auth.ts"]);
    expect(query).toContain("authentication");
    expect(query).toContain("src/auth.ts");
    expect(query).not.toContain("super-secret");
    expect(query).not.toContain("password");
    expect(query).not.toContain("const");
    expect(query.length).toBeLessThanOrEqual(512);
  });
});
