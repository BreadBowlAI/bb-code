import { z } from "zod";
import { StatementReferenceSchema } from "./ids.js";
import { CandidateProposalSchema } from "./knowledge.js";

export const VerificationSchema = z.object({
  kind: z.enum(["test", "build", "lint", "manual", "none"]),
  command: z.string().min(1).optional(),
  result: z.enum(["passed", "failed", "not_run"]),
  note: z.string().min(1).optional(),
  paths: z.array(z.string().min(1)).default([])
});
export type Verification = z.infer<typeof VerificationSchema>;

export const ContextEffectSchema = z.object({
  statementId: StatementReferenceSchema,
  effect: z.enum(["changed_plan", "caused_clarification", "avoided_violation", "changed_verification", "no_effect"]),
  note: z.string().min(1).optional()
});
export type ContextEffect = z.infer<typeof ContextEffectSchema>;

export const CommitmentReconciliationSchema = z.object({
  statementId: StatementReferenceSchema,
  disposition: z.enum(["preserved", "revised", "superseded", "retired", "pending"]),
  reason: z.string().trim().min(1)
}).describe("The run's explicit treatment of one retrieved commitment. A lifecycle disposition requires the matching proposal; pending requires an unresolved human review.");
export type CommitmentReconciliation = z.infer<typeof CommitmentReconciliationSchema>;

export const RequestIntentDecisionSchema = z.discriminatedUnion("disposition", [
  z.object({
    disposition: z.literal("ephemeral"),
    reason: z.string().trim().min(1).describe("Why this request is conversational, operational, or fully represented by existing durable context.")
  }),
  z.object({
    disposition: z.literal("durable"),
    proposal: CandidateProposalSchema.describe("An intent create, revise, satisfy, abandon, supersede, or reclassify proposal resolved by repository knowledge mode.")
  })
]).superRefine((decision, context) => {
  if (decision.disposition !== "durable") return;
  const proposal = decision.proposal;
  const isIntentCreate = proposal.operation === "create" && proposal.kind === "intent";
  const isIntentReclassification = proposal.operation === "reclassify" && proposal.kind === "intent";
  const isIntentLifecycle = ["revise", "satisfy", "abandon", "supersede"].includes(proposal.operation) && (proposal.kind === undefined || proposal.kind === "intent");
  if (!isIntentCreate && !isIntentReclassification && !isIntentLifecycle) {
    context.addIssue({ code: "custom", message: "A durable requestIntent must propose an intent create or lifecycle transition", path: ["proposal"] });
  }
});
export type RequestIntentDecision = z.infer<typeof RequestIntentDecisionSchema>;

export const FinishRunInputSchema = z.object({
  runId: z.string().min(1),
  outcome: z.enum(["completed", "partial", "blocked", "failed"]),
  summary: z.string().min(1),
  verification: z.array(VerificationSchema).default([]),
  contextEffects: z.array(ContextEffectSchema).default([]),
  commitmentReconciliations: z.array(CommitmentReconciliationSchema).default([]),
  requestIntent: RequestIntentDecisionSchema,
  proposals: z.array(CandidateProposalSchema).default([]),
  noDurableLearningReason: z.string().trim().min(1).optional()
});
export type FinishRunInput = z.infer<typeof FinishRunInputSchema>;

export const RuntimeEventSchema = z.object({
  schemaVersion: z.literal(1),
  host: z.enum(["codex", "claude", "cursor"]),
  event: z.enum(["session_start", "start_run", "before_tool", "after_tool", "finish_run", "session_end"]),
  externalSessionId: z.string().min(1),
  externalTurnId: z.string().min(1).optional(),
  externalToolUseId: z.string().min(1).optional(),
  cwd: z.string().min(1),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown())
});
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

export type GitView = {
  repositoryId: string;
  worktreeId: string;
  root: string;
  headCommitSha: string;
  headTreeSha: string;
  parentShas: string[];
  dirtyFingerprint: string;
  changedPaths: string[];
  stablePatchId?: string;
  branchLabel?: string;
  observedAt: string;
};
