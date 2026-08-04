import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const core = join(root, "packages/core/src");

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]));
  return nested.flat().filter((file) => extname(file) === ".ts");
}

const violations = [];
for (const file of await files(core)) {
  const path = relative(core, file);
  const source = await readFile(file, "utf8");
  if (path.startsWith("domain/") && /from ["']\.\.\/(application|infrastructure|ports)\//.test(source)) violations.push(`${path}: domain cannot depend on outer layers`);
  if (path.startsWith("ports/") && /from ["']\.\.\/(application|infrastructure)\//.test(source)) violations.push(`${path}: ports cannot depend on implementations`);
  if (path.startsWith("infrastructure/") && /from ["'].*application\//.test(source)) violations.push(`${path}: infrastructure cannot depend on application workflows`);
  if (source.includes("@breadbowl/bb-qkv-client") || source.includes("@modelcontextprotocol/sdk")) violations.push(`${path}: core cannot depend on delivery transports`);
  if (path.endsWith(".test.ts")) violations.push(`${path}: tests belong under a package tests directory`);
}

if (violations.length) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Architecture boundaries are valid.\n");
}
