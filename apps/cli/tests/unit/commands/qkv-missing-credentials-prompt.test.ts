import { describe, expect, it } from "vitest";
import { qkvCredentialSetupMode } from "../../../src/commands/qkv-commands.js";

describe("QKV missing credential setup", () => {
  it("offers setup only in an interactive terminal", () => {
    const configuration = {
      apiUrl: "https://embed.example.test",
      deprecatedUrl: false,
      source: "unconfigured" as const,
      configPath: "/tmp/qkv.env"
    };

    expect(qkvCredentialSetupMode(configuration, true)).toBe("prompt");
    expect(qkvCredentialSetupMode(configuration, false)).toBe("error");
  });
});
