import type { ContextItem } from "../../domain/context.js";

const MAX_RENDERED_CHARACTERS = 4_800;
const MAX_RENDERED_TOKENS = 1_200;

export function countRenderedTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value, "utf8") / 4);
}

export function renderContextResult(items: ContextItem[], runId?: string): { rendered: string; items: ContextItem[]; tokenCount: number; conflicts: string[] } {
  const lines = [
    "# bb-code context",
    ...(runId ? [`Run: ${runId}`] : []),
    "Treat commitments as constraints, beliefs as fallible context, and intents as goals. Cite statement IDs when they affect the work.",
    ""
  ];
  const footer = runId ? [
    "",
    `Before ending, call bb_finish_run with runId ${runId}. Evaluate whether the work created or changed a durable intent, belief, commitment, contradiction, or completed intent. Submit useful proposals for human review; after consequential work, if there are none, provide noDurableLearningReason. Proposal attributes: intent={owner:{kind,id},priority,successConditions}; belief={confidence}; commitment={rationale,authority:{kind,id},revisitCondition?}. Actor kind is human, agent, or repository_document and id is always required.`
  ] : [];
  const selected: ContextItem[] = [];
  const conflicts: string[] = [];
  if (items.length === 0) lines.push("No relevant reviewed bb-code context was found.");
  for (const item of items) {
    const warning = item.conflict ? " WARNING: reviewed contradictory evidence exists." : "";
    const line = `- [${item.kind} bb:${item.id}@${item.revisionId}] ${item.body} (${item.applicabilityReason}; freshness:${item.freshness})${warning}`;
    const candidate = [...lines, line, ...footer].join("\n");
    if (candidate.length > MAX_RENDERED_CHARACTERS || countRenderedTokens(candidate) > MAX_RENDERED_TOKENS) break;
    lines.push(line);
    selected.push(item);
    if (item.conflict) conflicts.push(`bb:${item.id}@${item.revisionId} has reviewed contradictory evidence`);
  }
  lines.push(...footer);
  const rendered = lines.join("\n");
  return { rendered, items: selected, tokenCount: countRenderedTokens(rendered), conflicts };
}

export function renderContext(items: ContextItem[], runId?: string): string {
  return renderContextResult(items, runId).rendered;
}
