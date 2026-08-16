import type { Command } from "commander";
import { runHookAdapter } from "../adapters/hook-adapter.js";
import { serveMcp } from "../mcp/server.js";

export function registerRuntimeCommands(program: Command): void {
  program.command("mcp").command("serve").description("Run the stdio MCP server").action(serveMcp);
  program.command("adapter").argument("<host>").argument("<event>").action(async (host, event) => {
    if (host !== "codex" && host !== "claude" && host !== "cursor") throw new Error("host must be codex, claude, or cursor");
    await runHookAdapter(host, event);
  });
}
