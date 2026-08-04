import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve(import.meta.dirname, "validate_plugins.py");
const commands = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
for (const command of commands) {
  const result = spawnSync(command, [script], { stdio: "inherit" });
  if (result.error?.code === "ENOENT") continue;
  process.exit(result.status ?? 1);
}
throw new Error("Python 3 is required to validate bundled plugins");
