import { processRuntimeEvent, type RuntimeEffect, type RuntimeEventResult, type RuntimeProcessingPolicy } from "@breadbowl/bb-core";
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
    const policy = runtimePolicyForHost(host, nativeEventName);
    const semantic = event.event === "start_run" && policy.contextAtRunStart === "retrieve"
      ? await configuredSemantic(event.cwd)
      : undefined;
    const output = await processRuntimeEvent(event, undefined, semantic, policy);
    const response = host === "codex"
      ? renderCodexResponse(nativeEventName, output)
      : host === "claude"
        ? renderClaudeResponse(nativeEventName, output)
        : renderCursorResponse(nativeEventName, output);
    if (response) process.stdout.write(JSON.stringify(response));
  } catch (error) {
    process.stderr.write(`[bb-code] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 0;
  }
}

type HostHookCapabilities = {
  promptContext: "inline" | "mcp";
  postToolContext: boolean;
  unfinishedStop: "block_once" | "observe";
  pathCommitments: "inject" | "deny_once";
};

export const HOST_HOOK_CAPABILITIES: Record<Host, HostHookCapabilities> = {
  codex: { promptContext: "inline", postToolContext: true, unfinishedStop: "block_once", pathCommitments: "inject" },
  claude: { promptContext: "inline", postToolContext: true, unfinishedStop: "block_once", pathCommitments: "inject" },
  cursor: { promptContext: "mcp", postToolContext: true, unfinishedStop: "observe", pathCommitments: "deny_once" }
};

export function runtimePolicyForHost(host: Host, nativeEventName: string): RuntimeProcessingPolicy {
  const capabilities = HOST_HOOK_CAPABILITIES[host];
  return {
    contextAtRunStart: capabilities.promptContext === "inline" ? "retrieve" : "defer",
    completionReminder: capabilities.postToolContext && capabilities.unfinishedStop === "observe" && nativeEventName === "postToolUse" ? "after_first_consequential_tool" : "none",
    unfinishedStop: capabilities.unfinishedStop === "block_once" ? "nudge_once" : "finalize_partial"
  };
}

function contentEffect(output: RuntimeEventResult): Extract<RuntimeEffect, { content: string }> | undefined {
  return output.effects.find((effect): effect is Extract<RuntimeEffect, { content: string }> => "content" in effect);
}

function effectOfType<T extends RuntimeEffect["type"]>(output: RuntimeEventResult, type: T): Extract<RuntimeEffect, { type: T }> | undefined {
  return output.effects.find((effect): effect is Extract<RuntimeEffect, { type: T }> => effect.type === type);
}

export function renderCodexResponse(nativeEventName: string, output: RuntimeEventResult): Record<string, unknown> | undefined {
  const context = contentEffect(output);
  if (context && context.type !== "completion_nudge") return { hookSpecificOutput: { hookEventName: nativeEventName, additionalContext: context.content } };
  const nudge = effectOfType(output, "completion_nudge");
  if (nudge) return { decision: "block", reason: nudge.content };
  return undefined;
}

export function renderClaudeResponse(nativeEventName: string, output: RuntimeEventResult): Record<string, unknown> | undefined {
  const context = contentEffect(output);
  if (context && context.type !== "completion_nudge") return { hookSpecificOutput: { hookEventName: nativeEventName, additionalContext: context.content } };
  const nudge = effectOfType(output, "completion_nudge");
  if (nudge) return { decision: "block", reason: nudge.content };
  return undefined;
}

export function renderCursorResponse(nativeEventName: string, output: RuntimeEventResult): Record<string, unknown> | undefined {
  const pathCommitments = effectOfType(output, "path_commitments");
  if (pathCommitments && nativeEventName === "preToolUse") return { permission: "deny", agent_message: pathCommitments.content };
  const context = contentEffect(output);
  if (context && nativeEventName === "sessionStart") return { additional_context: context.content };
  if (context && nativeEventName === "postToolUse") return { additional_context: context.content };
  if (nativeEventName === "beforeSubmitPrompt") return { continue: true };
  if (nativeEventName === "preToolUse") return { permission: "allow" };
  return undefined;
}
