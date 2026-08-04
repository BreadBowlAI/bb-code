#!/usr/bin/env node
import { Command } from "commander";
import { registerKnowledgeCommands } from "./commands/knowledge-commands.js";
import { registerQkvCommands } from "./commands/qkv-commands.js";
import { registerRuntimeCommands } from "./commands/runtime-commands.js";
import { registerSetupCommands } from "./commands/setup-commands.js";

const program = new Command().name("bb").description("Durable project context for coding agents").version("0.1.0");
registerSetupCommands(program);
registerKnowledgeCommands(program);
registerQkvCommands(program);
registerRuntimeCommands(program);

program.parseAsync().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
