import type { ContextItem } from "../../domain/context.js";

const MAX_RENDERED_CHARACTERS = 4_800;

export function renderContext(items: ContextItem[], runId?: string): string {
  const lines = [
    "# bb-code context",
    ...(runId ? [`Run: ${runId}`] : []),
    "Treat commitments as constraints, beliefs as fallible context, and intents as goals. Cite statement IDs when they affect the work.",
    ""
  ];
  for (const item of items) lines.push(`- [${item.kind} bb:${item.id}@${item.revisionId}] ${item.body} (${item.applicabilityReason})`);
  if (runId) lines.push("", `Before ending, call bb_finish_run with runId ${runId}. Proposals remain pending until a human reviews them.`);
  const rendered = lines.join("\n");
  return rendered.length <= MAX_RENDERED_CHARACTERS ? rendered : `${rendered.slice(0, MAX_RENDERED_CHARACTERS - 50)}\n…`;
}
