import { processRuntimeEvent } from "@breadbowl/bb-core";
import { configuredSemantic } from "../composition/semantic-provider.js";
import { normalizeHookEvent, type Host } from "./normalize-hook-event.js";

async function readStdin(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

export async function runHookAdapter(host: Host, nativeEventName: string): Promise<void> {
  try {
    const event = normalizeHookEvent({ host, nativeEventName, payload: await readStdin(), defaultCwd: process.cwd() });
    if (!event) return;
    const output = await processRuntimeEvent(event, undefined, await configuredSemantic(event.cwd));
    const response = host === "codex" ? renderCodexResponse(nativeEventName, output) : renderClaudeResponse(nativeEventName, output);
    if (response) process.stdout.write(JSON.stringify(response));
  } catch (error) {
    process.stderr.write(`[bb-code] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 0;
  }
}

export function renderCodexResponse(nativeEventName: string, output: { output?: string; nudge?: string }): Record<string, unknown> | undefined {
  if (output.output) return { hookSpecificOutput: { hookEventName: nativeEventName, additionalContext: output.output } };
  if (output.nudge) return { decision: "block", reason: output.nudge };
  return undefined;
}

export function renderClaudeResponse(nativeEventName: string, output: { output?: string; nudge?: string }): Record<string, unknown> | undefined {
  if (output.output) return { hookSpecificOutput: { hookEventName: nativeEventName, additionalContext: output.output } };
  if (output.nudge) return { decision: "block", reason: output.nudge };
  return undefined;
}
