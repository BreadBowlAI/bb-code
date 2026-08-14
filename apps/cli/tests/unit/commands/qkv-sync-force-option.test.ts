import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerQkvCommands } from "../../../src/commands/qkv-commands.js";

describe("QKV sync command", () => {
  it("exposes an explicit force-retry option", () => {
    const program = new Command();
    registerQkvCommands(program);

    const sync = program.commands.find((command) => command.name() === "sync");
    expect(sync?.options.some((option) => option.long === "--force")).toBe(true);
  });
});
