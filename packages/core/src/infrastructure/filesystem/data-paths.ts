import { homedir, platform } from "node:os";
import { join } from "node:path";

export function defaultDataDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.BB_DATA_DIR) return environment.BB_DATA_DIR;
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "bb-code");
  if (platform() === "win32") return join(environment.LOCALAPPDATA ?? homedir(), "bb-code");
  return join(environment.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "bb-code");
}

export function defaultDatabasePath(environment: NodeJS.ProcessEnv = process.env): string {
  return join(defaultDataDirectory(environment), "bb.db");
}
