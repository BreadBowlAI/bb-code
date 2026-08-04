import { z } from "zod";

export const StatementKindSchema = z.enum(["intent", "belief", "commitment"]);
export type StatementKind = z.infer<typeof StatementKindSchema>;

export const ScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repository") }),
  z.object({
    kind: z.literal("path"),
    prefix: z.string().min(1).transform((value) => value.replace(/^\.\//, "").replace(/\\/g, "/"))
  })
]);
export type Scope = z.infer<typeof ScopeSchema>;

export const ActorRefSchema = z.object({
  kind: z.enum(["human", "agent", "repository_document"]),
  id: z.string().min(1),
  label: z.string().min(1).optional()
});
export type ActorRef = z.infer<typeof ActorRefSchema>;

export const IntentAttributesSchema = z.object({
  owner: ActorRefSchema,
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  successConditions: z.array(z.string().min(1)).default([])
});

export const BeliefAttributesSchema = z.object({ confidence: z.number().min(0).max(1) });

export const CommitmentAttributesSchema = z.object({
  rationale: z.string().min(1),
  authority: ActorRefSchema,
  revisitCondition: z.string().min(1).optional()
});

export type IntentAttributes = z.infer<typeof IntentAttributesSchema>;
export type BeliefAttributes = z.infer<typeof BeliefAttributesSchema>;
export type CommitmentAttributes = z.infer<typeof CommitmentAttributesSchema>;
export type StatementAttributes = IntentAttributes | BeliefAttributes | CommitmentAttributes;

export const IntentStatusSchema = z.enum(["active", "satisfied", "abandoned", "superseded"]);
export const BeliefStatusSchema = z.enum(["active", "contradicted", "superseded"]);
export const CommitmentStatusSchema = z.enum(["accepted", "superseded", "retired"]);
export const StatementStatusSchema = z.union([IntentStatusSchema, BeliefStatusSchema, CommitmentStatusSchema]);
export type StatementStatus = z.infer<typeof StatementStatusSchema>;

export function attributesSchemaFor(kind: StatementKind) {
  if (kind === "intent") return IntentAttributesSchema;
  if (kind === "belief") return BeliefAttributesSchema;
  return CommitmentAttributesSchema;
}

export function statusesFor(kind: StatementKind): readonly StatementStatus[] {
  if (kind === "intent") return IntentStatusSchema.options;
  if (kind === "belief") return BeliefStatusSchema.options;
  return CommitmentStatusSchema.options;
}

export const CandidateOperationSchema = z.enum(["create", "revise", "confirm", "contradict", "satisfy", "supersede", "retire"]);
export type CandidateOperation = z.infer<typeof CandidateOperationSchema>;

export const CandidateProposalSchema = z.object({
  operation: CandidateOperationSchema,
  kind: StatementKindSchema.optional(),
  targetStatementId: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  scope: ScopeSchema.optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  rationale: z.string().min(1),
  evidencePaths: z.array(z.string().min(1)).default([]),
  evidenceNotes: z.array(z.string().min(1)).default([])
}).superRefine((proposal, context) => {
  if (proposal.operation === "create") {
    if (!proposal.kind) context.addIssue({ code: "custom", message: "create requires kind", path: ["kind"] });
    if (!proposal.body) context.addIssue({ code: "custom", message: "create requires body", path: ["body"] });
    if (!proposal.scope) context.addIssue({ code: "custom", message: "create requires scope", path: ["scope"] });
    if (!proposal.attributes) context.addIssue({ code: "custom", message: "create requires attributes", path: ["attributes"] });
    else if (proposal.kind) {
      const parsed = attributesSchemaFor(proposal.kind).safeParse(proposal.attributes);
      if (!parsed.success) context.addIssue({ code: "custom", message: parsed.error.message, path: ["attributes"] });
    }
  } else if (!proposal.targetStatementId) {
    context.addIssue({ code: "custom", message: `${proposal.operation} requires targetStatementId`, path: ["targetStatementId"] });
  }
});
export type CandidateProposal = z.infer<typeof CandidateProposalSchema>;

export type CurrentStatement = {
  id: string;
  revisionId: string;
  kind: StatementKind;
  body: string;
  status: StatementStatus;
  scope: Scope;
  attributes: StatementAttributes;
  revisionNumber: number;
  createdAt: string;
};

export type StatementDraft = {
  kind: StatementKind;
  body: string;
  status: StatementStatus;
  scope: Scope;
  attributes: StatementAttributes;
  actor: ActorRef;
  evidence: { kind: string; summary: string; paths?: string[]; runId?: string; gitViewId?: string };
};
