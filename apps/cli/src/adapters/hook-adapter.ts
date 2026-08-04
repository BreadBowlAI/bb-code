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
    if (output.output) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: nativeEventName, additionalContext: output.output } }));
    else if (output.nudge) process.stdout.write(JSON.stringify({ decision: "block", reason: output.nudge }));
  } catch (error) {
    process.stderr.write(`[bb-code] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 0;
  }
}
