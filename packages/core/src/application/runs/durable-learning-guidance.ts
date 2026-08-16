export const DURABLE_LEARNING_RUBRIC = `Classify durable learning by meaning, not importance:
- intent: an active outcome someone is pursuing;
- belief: a fallible claim about the current codebase, behavior, environment, or implementation that could affect future work;
- commitment: an explicit rule, constraint, or chosen decision future work should preserve.
A current implementation fact is a belief unless it was explicitly chosen as a future constraint. Implementing, verifying, or approving code does not by itself turn that fact into a commitment. For example, "the repository currently uses PostgreSQL" is a belief; "production persistence must use PostgreSQL" is a commitment. Requested deliverables remain intents even when they narrow the next phase of work.
For requestIntent, classify the user's request separately: use durable with an intent proposal when the outcome should survive this run, including initialStatus satisfied or abandoned for an outcome that ended in this run; otherwise use ephemeral with a specific reason. Do not repeat the requestIntent proposal in proposals.
After tool-assisted work, inspect discoveries, decisions, failures, and completed goals. Read-only investigation can produce a belief: lack of a code change is not a reason to discard a non-obvious finding that would save a future agent from repeating the investigation. Propose only knowledge likely to change how a future agent works. Do not propose trivial-to-rediscover facts or temporary implementation details.
Before creating a statement, compare the retrieved context. Prefer revise, satisfy, abandon, supersede, retire, or reclassify when the durable subject already exists. If uncertain, query bb_context using the proposed claim and call bb_explain for a possible target. Never create a replacement that merely says it supersedes another statement while leaving the old statement active.`;

export const CONTEXT_EFFECT_GUIDANCE = `For every retrieved statement that materially affected this run, include one contextEffects entry using its statement ID: changed_plan, caused_clarification, avoided_violation, or changed_verification. Use no_effect only when a retrieved statement was considered but did not affect the work. Do not fabricate effects for context that was not used.`;

export function finishRunGuidance(runId: string): string {
  return `Before ending, call bb_finish_run with runId ${runId}. Always include requestIntent. ${DURABLE_LEARNING_RUBRIC} ${CONTEXT_EFFECT_GUIDANCE} Submit useful proposals for resolution under the repository knowledge mode; after any tool-assisted work, if there are none beyond requestIntent, provide a specific noDurableLearningReason.`;
}
