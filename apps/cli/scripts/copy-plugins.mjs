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
