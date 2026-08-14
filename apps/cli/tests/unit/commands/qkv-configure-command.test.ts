import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerQkvCommands } from "../../../src/commands/qkv-commands.js";

describe("QKV configure command", () => {
  it("provides a persistent credential setup path for hooks and MCP", () => {
    const program = new Command();
    registerQkvCommands(program);

    const qkv = program.commands.find((command) => command.name() === "qkv");
    expect(qkv?.commands.some((command) => command.name() === "configure")).toBe(true);
  });
});
