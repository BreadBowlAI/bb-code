import type { ContextItem } from "../../domain/context.js";
import { finishRunReminder } from "../runs/durable-learning-guidance.js";

const MAX_RENDERED_CHARACTERS = 4_800;
const MAX_RENDERED_TOKENS = 1_200;

export function countRenderedTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value, "utf8") / 4);
}

export function renderContextResult(items: ContextItem[], runId?: string): { rendered: string; items: ContextItem[]; tokenCount: number; conflicts: string[] } {
  const lines = [
    "# bb-code context",
    ...(runId ? [`Run: ${runId}`] : []),
    "Treat commitments as constraints, beliefs as fallible context, and intents as goals. A current request does not silently erase a commitment: propose its lifecycle change and reconcile it. Report statement IDs through contextEffects when they affect the work.",
    ""
  ];
  const footer = (selected: ContextItem[]) => runId ? [
    "",
    ...(selected.length ? [`Registered statement IDs from this lookup for the run: ${selected.map((item) => item.id).join(", ")}.`] : []),
    ...(selected.some((item) => item.kind === "commitment") ? [`Reconcile every registered commitment in commitmentReconciliations: ${selected.filter((item) => item.kind === "commitment").map((item) => item.id).join(", ")}.`] : []),
    finishRunReminder(runId)
  ] : [];
  const selected: ContextItem[] = [];
  const conflicts: string[] = [];
  if (items.length === 0) lines.push("No relevant reviewed bb-code context was found.");
  for (const item of items) {
    const warning = item.conflictReason === "pending_commitment_reconciliation"
      ? " WARNING: a commitment transition is awaiting human review; do not enforce this statement as a hard constraint."
      : item.conflict ? " WARNING: reviewed contradictory evidence exists." : "";
    const line = `- [${item.kind} bb:${item.id}@${item.revisionId}] ${item.body} (${item.applicabilityReason}; freshness:${item.freshness})${warning}`;
    const candidateItems = [...selected, item];
    const candidate = [...lines, line, ...footer(candidateItems)].join("\n");
    if (candidate.length > MAX_RENDERED_CHARACTERS || countRenderedTokens(candidate) > MAX_RENDERED_TOKENS) break;
    lines.push(line);
    selected.push(item);
    if (item.conflict) conflicts.push(item.conflictReason === "pending_commitment_reconciliation" ? `bb:${item.id}@${item.revisionId} has a transition awaiting human review` : `bb:${item.id}@${item.revisionId} has reviewed contradictory evidence`);
  }
  lines.push(...footer(selected));
  const rendered = lines.join("\n");
  return { rendered, items: selected, tokenCount: countRenderedTokens(rendered), conflicts };
}

export function renderContext(items: ContextItem[], runId?: string): string {
  return renderContextResult(items, runId).rendered;
}
