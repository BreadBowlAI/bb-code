import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installCursorProjectIntegration } from "../../../src/adapters/cursor-integration.js";

describe("Cursor project integration", () => {
  it("merges bb-code into existing project hooks and MCP configuration idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "bb-cursor-integration-"));
    try {
      await mkdir(join(root, ".cursor"));
      await writeFile(join(root, ".cursor/hooks.json"), JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: "format-project" }] } }));
      await writeFile(join(root, ".cursor/mcp.json"), JSON.stringify({ mcpServers: { existing: { command: "existing-mcp" } } }));
      await installCursorProjectIntegration(root);
      const first = await installCursorProjectIntegration(root);
      const hooks = JSON.parse(await readFile(first.hooksPath, "utf8")) as { hooks: Record<string, Array<{ command: string }>> };
      const mcp = JSON.parse(await readFile(first.mcpPath, "utf8")) as { mcpServers: Record<string, unknown> };

      expect(hooks.hooks.beforeSubmitPrompt).toEqual([{ command: "bb adapter cursor beforeSubmitPrompt" }]);
      expect(hooks.hooks.stop).toEqual([{ command: "bb adapter cursor stop" }]);
      expect(hooks.hooks.afterFileEdit).toEqual([{ command: "format-project" }]);
      expect(mcp.mcpServers["bb-code"]).toEqual({ command: "bb", args: ["mcp", "serve"] });
      expect(mcp.mcpServers.existing).toEqual({ command: "existing-mcp" });
      expect(await readFile(first.rulePath, "utf8")).toContain("call `bb_context` exactly once");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
