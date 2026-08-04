import { z } from "zod";
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
  statementId: z.string().min(1),
  effect: z.enum(["changed_plan", "caused_clarification", "avoided_violation", "changed_verification", "no_effect"]),
  note: z.string().min(1).optional()
});
export type ContextEffect = z.infer<typeof ContextEffectSchema>;

export const FinishRunInputSchema = z.object({
  runId: z.string().min(1),
  outcome: z.enum(["completed", "partial", "blocked", "failed"]),
  summary: z.string().min(1),
  verification: z.array(VerificationSchema).default([]),
  contextEffects: z.array(ContextEffectSchema).default([]),
  proposals: z.array(CandidateProposalSchema).default([])
});
export type FinishRunInput = z.infer<typeof FinishRunInputSchema>;

export const RuntimeEventSchema = z.object({
  schemaVersion: z.literal(1),
  host: z.enum(["codex", "claude"]),
  event: z.enum(["session_start", "start_task", "before_tool", "after_tool", "finish_task", "session_end"]),
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
