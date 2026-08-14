import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveQkvConfiguration, writeQkvConfiguration } from "../../../src/composition/qkv-config.js";

describe("QKV user configuration", () => {
  it("stores credentials with owner-only permissions and resolves them outside the project", () => {
    const directory = mkdtempSync(join(tmpdir(), "bb-qkv-config-"));
    const path = join(directory, "credentials.env");
    const environment = { BB_QKV_CONFIG_FILE: path };
    try {
      expect(writeQkvConfiguration({ apiUrl: "https://qkv.test/", apiKey: "secret" }, environment)).toBe(path);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(readFileSync(path, "utf8")).not.toContain("undefined");
      expect(resolveQkvConfiguration(environment)).toMatchObject({ apiUrl: "https://qkv.test", apiKey: "secret", source: "user_config", deprecatedUrl: false });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
