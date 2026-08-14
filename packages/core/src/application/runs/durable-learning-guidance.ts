export const DURABLE_LEARNING_RUBRIC = `Classify durable learning by meaning, not importance:
- intent: an active outcome someone is pursuing;
- belief: a fallible claim about the current codebase, behavior, environment, or implementation that could affect future work;
- commitment: an explicit rule, constraint, or chosen decision future work should preserve.
A current implementation fact is a belief unless it was explicitly chosen as a future constraint. Implementing, verifying, or approving code does not by itself turn that fact into a commitment. For example, "the repository currently uses PostgreSQL" is a belief; "production persistence must use PostgreSQL" is a commitment. Requested deliverables remain intents even when they narrow the next phase of work.
After consequential work, inspect discoveries, decisions, failures, and completed goals. Propose only knowledge likely to change how a future agent works. Do not propose trivial-to-rediscover facts or temporary implementation details.
Before creating a statement, compare the retrieved context. Prefer revise, satisfy, supersede, or retire when the durable subject already exists. If uncertain, query bb_context using the proposed claim and call bb_explain for a possible target. Never create a replacement that merely says it supersedes another statement while leaving the old statement active.`;

export const CONTEXT_EFFECT_GUIDANCE = `For every retrieved statement that materially affected this run, include one contextEffects entry using its statement ID: changed_plan, caused_clarification, avoided_violation, or changed_verification. Use no_effect only when a retrieved statement was considered but did not affect the work. Do not fabricate effects for context that was not used.`;

export function finishRunGuidance(runId: string): string {
  return `Before ending, call bb_finish_run with runId ${runId}. ${DURABLE_LEARNING_RUBRIC} ${CONTEXT_EFFECT_GUIDANCE} Submit useful proposals for human review; if consequential work produced none, provide a specific noDurableLearningReason.`;
}
