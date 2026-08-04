import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "bb-code-package-"));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, arguments_, cwd = root) {
  const result = spawnSync(command, arguments_, { cwd, encoding: "utf8", stdio: "pipe", timeout: 120_000 });
  if (result.status !== 0) throw new Error(`${command} ${arguments_.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  for (const name of ["@breadbowl/bb-core", "@breadbowl/bb-qkv-client", "@breadbowl/bb-code"]) run(pnpm, ["--filter", name, "pack", "--pack-destination", directory]);
  const tarballs = readdirSync(directory).filter((name) => name.endsWith(".tgz")).map((name) => join(directory, name));
  if (tarballs.length !== 3) throw new Error(`Expected three package tarballs, found ${tarballs.length}`);
  run(npm, ["install", "--prefix", directory, "--cache", join(directory, "npm-cache"), "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs]);
  const binary = join(directory, "node_modules/@breadbowl/bb-code/dist/launcher.js");
  const help = run(process.execPath, [binary, "--help"], directory);
  if (!help.includes("Durable project context")) throw new Error("Installed bb binary did not return its help output");
  process.stdout.write("Packaged bb CLI installs and starts successfully.\n");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
