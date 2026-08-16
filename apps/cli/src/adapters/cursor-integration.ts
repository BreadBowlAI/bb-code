import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CURSOR_HOOK_COMMANDS = {
  sessionStart: "bb adapter cursor sessionStart",
  beforeSubmitPrompt: "bb adapter cursor beforeSubmitPrompt",
  preToolUse: "bb adapter cursor preToolUse",
  postToolUse: "bb adapter cursor postToolUse",
  postToolUseFailure: "bb adapter cursor postToolUseFailure",
  stop: "bb adapter cursor stop",
  sessionEnd: "bb adapter cursor sessionEnd"
} as const;

export const CURSOR_RULE = `---
description: Use bb-code context and finish active bb-code runs
alwaysApply: true
---

At the start of every coding request, call \`bb_context\` exactly once with the user's request and any relevant paths before planning or editing. A normal result, including "No relevant bb-code context was found," is successful; retry only when Cursor reports that the MCP call itself failed. Treat returned commitments as constraints, beliefs as fallible context, and intents as goals. Report statement IDs through \`contextEffects\` when they materially affect the work.

The \`bb_context\` result includes the active run ID when its request exactly matches the current user prompt. Before your final response after tool-assisted work, call \`bb_finish_run\` with that run ID. Propose only durable knowledge likely to change future work; repository knowledge mode resolves proposals. If there is no useful durable learning, provide a specific \`noDurableLearningReason\`.
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJsonObject(path: string, fallback: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isRecord(value)) throw new Error(`${path} must contain a JSON object`);
    return value;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return fallback;
    throw error;
  }
}

function mergeHook(existing: unknown, command: string, eventName: string): Array<Record<string, unknown>> {
  if (existing !== undefined && !Array.isArray(existing)) throw new Error(`Cursor hook ${eventName} must be an array`);
  const definitions = (existing ?? []) as unknown[];
  const filtered = definitions.filter((entry) => !(isRecord(entry) && entry.command === command));
  return [...filtered.map((entry) => {
    if (!isRecord(entry)) throw new Error(`Cursor hook ${eventName} contains an invalid definition`);
    return entry;
  }), { command }];
}

export async function installCursorProjectIntegration(root: string): Promise<{ hooksPath: string; mcpPath: string; rulePath: string }> {
  const cursorDirectory = resolve(root, ".cursor");
  const rulesDirectory = resolve(cursorDirectory, "rules");
  await mkdir(rulesDirectory, { recursive: true });

  const hooksPath = resolve(cursorDirectory, "hooks.json");
  const hooksDocument = await readJsonObject(hooksPath, { version: 1, hooks: {} });
  const hooks = hooksDocument.hooks === undefined ? {} : hooksDocument.hooks;
  if (!isRecord(hooks)) throw new Error(`${hooksPath} field hooks must be a JSON object`);
  const mergedHooks = Object.fromEntries(Object.entries(CURSOR_HOOK_COMMANDS).map(([eventName, command]) => [eventName, mergeHook(hooks[eventName], command, eventName)]));
  await writeFile(hooksPath, `${JSON.stringify({ ...hooksDocument, version: hooksDocument.version ?? 1, hooks: { ...hooks, ...mergedHooks } }, null, 2)}\n`);

  const mcpPath = resolve(cursorDirectory, "mcp.json");
  const mcpDocument = await readJsonObject(mcpPath, { mcpServers: {} });
  const mcpServers = mcpDocument.mcpServers === undefined ? {} : mcpDocument.mcpServers;
  if (!isRecord(mcpServers)) throw new Error(`${mcpPath} field mcpServers must be a JSON object`);
  await writeFile(mcpPath, `${JSON.stringify({ ...mcpDocument, mcpServers: { ...mcpServers, "bb-code": { command: "bb", args: ["mcp", "serve"] } } }, null, 2)}\n`);

  const rulePath = resolve(rulesDirectory, "bb-code.mdc");
  await writeFile(rulePath, CURSOR_RULE);
  return { hooksPath, mcpPath, rulePath };
}
