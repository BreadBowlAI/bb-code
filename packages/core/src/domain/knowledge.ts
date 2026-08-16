import { z } from "zod";

export const StatementKindSchema = z.enum(["intent", "belief", "commitment"]);
export type StatementKind = z.infer<typeof StatementKindSchema>;

export const KnowledgeModeSchema = z.enum(["strict", "standard", "yolo"]);
export type KnowledgeMode = z.infer<typeof KnowledgeModeSchema>;

export const ScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repository") }),
  z.object({
    kind: z.literal("path"),
    prefix: z.string().min(1).transform((value) => value.replace(/^\.\//, "").replace(/\\/g, "/"))
  })
]);
export type Scope = z.infer<typeof ScopeSchema>;

export const ActorRefSchema = z.object({
  kind: z.enum(["human", "agent", "repository_document"]).describe("Authority/source type. Use human for a user-stated decision, agent for agent-owned work, or repository_document for an explicit repository source."),
  id: z.string().min(1).describe("Stable actor identifier, for example repository-owner, codex, or docs/ARCHITECTURE.md."),
  label: z.string().min(1).optional().describe("Optional human-readable actor label.")
}).describe("Actor reference, for example { kind: 'human', id: 'repository-owner' }.");
export type ActorRef = z.infer<typeof ActorRefSchema>;

export const IntentAttributesSchema = z.object({
  owner: ActorRefSchema,
  priority: z.enum(["low", "normal", "high"]).default("normal").describe("Intent priority."),
  successConditions: z.array(z.string().min(1)).default([]).describe("Observable conditions that would satisfy the intent.")
}).describe("Intent attributes. Required shape: { owner: { kind, id, label? }, priority, successConditions }.");

export const BeliefAttributesSchema = z.object({
  confidence: z.number().min(0).max(1).describe("Confidence from 0 to 1 based on available evidence.")
}).describe("Belief attributes. Required shape: { confidence: number between 0 and 1 }.");

export const CommitmentAttributesSchema = z.object({
  rationale: z.string().min(1).describe("Why this constraint or decision matters."),
  authority: ActorRefSchema,
  revisitCondition: z.string().min(1).optional().describe("Condition under which a human should reconsider the commitment.")
}).describe("Commitment attributes. Required shape: { rationale, authority: { kind, id, label? }, revisitCondition? }.");

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

export const CandidateOperationSchema = z.enum(["create", "revise", "confirm", "contradict", "satisfy", "abandon", "supersede", "retire", "reclassify"]);
export type CandidateOperation = z.infer<typeof CandidateOperationSchema>;

const CandidateEvidenceFields = {
  rationale: z.string().min(1).describe("Why this proposal is useful and what evidence supports it."),
  evidencePaths: z.array(z.string().min(1)).default([]).describe("Repository-relative paths that support the proposal. Never include file contents."),
  evidenceNotes: z.array(z.string().min(1)).default([]).describe("Short evidence summaries; do not include raw code, tool output, secrets, or transcripts.")
};

const CreateCandidateProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    operation: z.literal("create"),
    kind: z.literal("intent"),
    targetStatementId: z.never().optional(),
    body: z.string().min(1),
    scope: ScopeSchema,
    attributes: IntentAttributesSchema,
    initialStatus: z.enum(["active", "satisfied", "abandoned"]).default("active").describe("The reviewed intent's initial lifecycle state. Use satisfied or abandoned when a request ends in the same run that discovered it."),
    ...CandidateEvidenceFields
  }).describe("Create an intent. attributes must contain owner, priority, and successConditions; initialStatus records whether the outcome remains active."),
  z.object({
    operation: z.literal("create"),
    kind: z.literal("belief"),
    targetStatementId: z.never().optional(),
    body: z.string().min(1),
    scope: ScopeSchema,
    attributes: BeliefAttributesSchema,
    ...CandidateEvidenceFields
  }).describe("Create a belief. attributes must contain confidence from 0 to 1."),
  z.object({
    operation: z.literal("create"),
    kind: z.literal("commitment"),
    targetStatementId: z.never().optional(),
    body: z.string().min(1),
    scope: ScopeSchema,
    attributes: CommitmentAttributesSchema,
    ...CandidateEvidenceFields
  }).describe("Create a commitment. attributes must contain rationale and authority; agent authority never substitutes for human authority.")
]);

const ReclassifyCandidateProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    operation: z.literal("reclassify"),
    kind: z.literal("intent"),
    targetStatementId: z.string().min(1),
    body: z.string().min(1).optional(),
    scope: ScopeSchema.optional(),
    attributes: IntentAttributesSchema,
    initialStatus: z.enum(["active", "satisfied", "abandoned"]).default("active"),
    ...CandidateEvidenceFields
  }),
  z.object({
    operation: z.literal("reclassify"),
    kind: z.literal("belief"),
    targetStatementId: z.string().min(1),
    body: z.string().min(1).optional(),
    scope: ScopeSchema.optional(),
    attributes: BeliefAttributesSchema,
    ...CandidateEvidenceFields
  }),
  z.object({
    operation: z.literal("reclassify"),
    kind: z.literal("commitment"),
    targetStatementId: z.string().min(1),
    body: z.string().min(1).optional(),
    scope: ScopeSchema.optional(),
    attributes: CommitmentAttributesSchema,
    ...CandidateEvidenceFields
  })
]).describe("Atomically supersede an incorrectly classified statement and create its reviewed replacement with a new identity.");

const ExistingStatementCandidateProposalSchema = z.object({
  operation: z.enum(["revise", "confirm", "contradict", "satisfy", "abandon", "supersede", "retire"]),
  kind: StatementKindSchema.optional(),
  targetStatementId: z.string().min(1).describe("Existing bb-code statement ID. Call bb_explain first when its kind or current attributes are uncertain."),
  body: z.string().min(1).optional(),
  scope: ScopeSchema.optional(),
  attributes: z.union([IntentAttributesSchema, BeliefAttributesSchema, CommitmentAttributesSchema]).optional().describe("When revising attributes, provide the complete kind-specific attributes object returned by bb_explain."),
  ...CandidateEvidenceFields
}).superRefine((proposal, context) => {
  if (proposal.operation === "revise" && proposal.body === undefined && proposal.scope === undefined && proposal.attributes === undefined) {
    context.addIssue({ code: "custom", message: "revise requires at least one changed field", path: ["operation"] });
  }
});

export const CandidateProposalSchema = z.discriminatedUnion("operation", [
  CreateCandidateProposalSchema,
  ExistingStatementCandidateProposalSchema,
  ReclassifyCandidateProposalSchema
]).describe("Durable knowledge proposal resolved according to the repository knowledge mode. For create, choose the kind first and use exactly that kind's attributes shape.");
export type CandidateProposal = z.infer<typeof CandidateProposalSchema>;

export function proposalKinds(proposal: CandidateProposal, targetKind?: StatementKind): Set<StatementKind> {
  if (proposal.operation === "create") return new Set([proposal.kind]);
  if (proposal.operation === "reclassify") return new Set([proposal.kind, ...(targetKind ? [targetKind] : [])]);
  return new Set([...(proposal.kind ? [proposal.kind] : []), ...(targetKind ? [targetKind] : [])]);
}

export function shouldAutoAcceptProposal(mode: KnowledgeMode, proposal: CandidateProposal, targetKind?: StatementKind): boolean {
  if (mode === "strict") return false;
  if (mode === "yolo") return true;
  const kinds = proposalKinds(proposal, targetKind);
  return kinds.size > 0 && !kinds.has("commitment");
}

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
  evidence: {
    kind: string;
    summary: string;
    paths?: string[];
    pathBlobs?: Record<string, string>;
    runId?: string;
    gitViewId?: string;
  };
};

export function validateStatementValues(input: {
  kind: StatementKind;
  status: StatementStatus;
  attributes: StatementAttributes;
}): StatementAttributes {
  if (!statusesFor(input.kind).includes(input.status)) {
    throw new Error(`Status ${input.status} is not valid for ${input.kind}`);
  }
  return attributesSchemaFor(input.kind).parse(input.attributes) as StatementAttributes;
}
