import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const output = resolve(packageRoot, "dist/plugins");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(repositoryRoot, "plugins/bb-code"), resolve(output, "codex"), { recursive: true });
await cp(resolve(repositoryRoot, "plugins/claude/bb-code"), resolve(output, "claude"), { recursive: true });
await mkdir(resolve(output, "claude-marketplace/.claude-plugin"), { recursive: true });
await mkdir(resolve(output, "claude-marketplace/plugins/claude"), { recursive: true });
await cp(resolve(repositoryRoot, ".claude-plugin/marketplace.json"), resolve(output, "claude-marketplace/.claude-plugin/marketplace.json"));
await cp(resolve(repositoryRoot, "plugins/claude/bb-code"), resolve(output, "claude-marketplace/plugins/claude/bb-code"), { recursive: true });
