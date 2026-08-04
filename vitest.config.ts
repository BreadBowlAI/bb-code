import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { reporter: ["text", "json", "html"] },
    include: ["packages/**/tests/**/*.test.ts", "apps/**/tests/**/*.test.ts"],
    testTimeout: 10_000
  }
});
