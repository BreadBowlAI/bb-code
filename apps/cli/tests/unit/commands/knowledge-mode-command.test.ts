import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerKnowledgeCommands } from "../../../src/commands/knowledge-commands.js";

describe("knowledge mode command", () => {
  it("exposes strict, standard, and yolo policy configuration", () => {
    const program = new Command();
    registerKnowledgeCommands(program);

    const mode = program.commands.find((command) => command.name() === "mode");
    expect(mode).toBeDefined();
    expect(mode?.options.some((option) => option.long === "--yes")).toBe(true);
  });
});
