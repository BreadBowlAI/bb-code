import { confirm, input, select } from "@inquirer/prompts";
import type { Command } from "commander";
import { CandidateProposalSchema, addStatement, getContext, openWorkspace, type CandidateProposal, type CurrentStatement, type Scope, type StatementAttributes, type StatementKind } from "@breadbowl/bb-core";
import { configuredSemantic } from "../composition/semantic-provider.js";
import { humanActor, print } from "./io.js";

function orderedChoices<T extends string>(current: T, values: readonly T[]): Array<{ name: T; value: T }> {
  return [current, ...values.filter((value) => value !== current)].map((value) => ({ name: value, value }));
}

async function promptScope(current: Scope): Promise<Scope> {
  const kind = await select({ message: "Scope", choices: orderedChoices(current.kind, ["repository", "path"] as const) });
  if (kind === "repository") return { kind };
  const defaultPrefix = current.kind === "path" ? current.prefix : "";
  return { kind, prefix: await input({ message: "Path prefix:", default: defaultPrefix, validate: (value) => value.trim().length > 0 || "Path prefix is required" }) };
}

async function promptAttributes(kind: StatementKind, current?: StatementAttributes): Promise<StatementAttributes> {
  if (kind === "belief") {
    const confidence = current && "confidence" in current ? current.confidence : 0.8;
    return { confidence: Number(await input({ message: "Confidence (0 to 1):", default: String(confidence), validate: (value) => Number(value) >= 0 && Number(value) <= 1 || "Enter a number from 0 to 1" })) };
  }
  if (kind === "intent") {
    const priority = current && "priority" in current ? current.priority : "normal";
    const successConditions = current && "successConditions" in current ? current.successConditions : [];
    const conditions = await input({ message: "Success conditions (semicolon-separated):", default: successConditions.join("; ") });
    return { owner: current && "owner" in current ? current.owner : humanActor, priority: await select({ message: "Priority", choices: orderedChoices(priority, ["low", "normal", "high"] as const) }), successConditions: conditions.split(";").map((value) => value.trim()).filter(Boolean) };
  }
  const rationale = current && "rationale" in current ? current.rationale : "Human-reviewed project constraint";
  const revisitCondition = current && "revisitCondition" in current ? current.revisitCondition : undefined;
  const revisit = await input({ message: "Revisit condition (optional):", default: revisitCondition ?? "" });
  return { rationale: await input({ message: "Why must future work preserve this?", default: rationale }), authority: current && "authority" in current ? current.authority : humanActor, ...(revisit.trim() ? { revisitCondition: revisit.trim() } : {}) };
}

async function editCandidateProposal(candidate: { proposal: CandidateProposal; target?: CurrentStatement }): Promise<CandidateProposal> {
  const proposal = candidate.proposal;
  if (proposal.operation !== "create" && proposal.operation !== "reclassify" && proposal.operation !== "revise" && proposal.operation !== "supersede") {
    return CandidateProposalSchema.parse({ ...proposal, rationale: await input({ message: "Rationale:", default: proposal.rationale }) });
  }
  const currentKind = proposal.kind ?? candidate.target?.kind ?? "belief";
  const kind = proposal.operation === "revise" || proposal.operation === "supersede"
    ? currentKind
    : await select({ message: "Statement kind", choices: orderedChoices(currentKind, ["intent", "belief", "commitment"] as const) });
  const body = await input({ message: "Statement text:", default: proposal.body ?? candidate.target?.body ?? "" });
  const scope = await promptScope(proposal.scope ?? candidate.target?.scope ?? { kind: "repository" });
  const currentAttributes = proposal.kind === kind ? proposal.attributes : candidate.target?.kind === kind ? candidate.target.attributes : undefined;
  const attributes = await promptAttributes(kind, currentAttributes);
  const rationale = await input({ message: "Proposal rationale:", default: proposal.rationale });
  const initialStatus = kind === "intent" && (proposal.operation === "create" || proposal.operation === "reclassify")
    ? await select({ message: "Intent state", choices: orderedChoices(proposal.kind === "intent" ? proposal.initialStatus : "active", ["active", "satisfied", "abandoned"] as const) })
    : undefined;
  return CandidateProposalSchema.parse({ ...proposal, kind, body, scope, attributes, rationale, ...(initialStatus ? { initialStatus } : {}) });
}

export function registerKnowledgeCommands(program: Command): void {
  const add = program.command("add").description("Add reviewed project context directly");
  for (const kind of ["intent", "belief", "commitment"] as const) {
    add.command(kind).description(`Add a ${kind}`).option("--body <text>").option("--path <prefix>").option("--yes", "confirm a commitment non-interactively").action(async (options) => {
      const body = options.body ?? await input({ message: `${kind}:` });
      const scope: Scope = options.path ? { kind: "path", prefix: options.path } : { kind: "repository" };
      let attributes: StatementAttributes;
      if (kind === "intent") attributes = { owner: humanActor, priority: "normal", successConditions: [] };
      else if (kind === "belief") attributes = { confidence: Number(await input({ message: "Confidence (0 to 1):", default: "0.7" })) };
      else {
        if (!options.yes && !(await confirm({ message: "Accept this as a durable commitment?", default: false }))) return;
        attributes = { rationale: await input({ message: "Rationale:" }), authority: humanActor };
      }
      const statement = await addStatement(process.cwd(), { kind, body, status: kind === "commitment" ? "accepted" : "active", scope, attributes });
      print(`${statement.id} added`);
    });
  }

  program.command("status").description("List current statements and pending proposals").option("--json").action(async (options) => {
    const workspace = await openWorkspace(process.cwd());
    const value = { statements: workspace.database.listStatements(workspace.repositoryId), candidates: workspace.database.listCandidates(workspace.repositoryId) };
    if (options.json) print(value, true);
    else {
      for (const item of value.statements) print(`${item.id}  ${item.kind.padEnd(10)} ${item.status.padEnd(12)} ${item.body}`);
      print(`${value.candidates.length} pending candidate(s)`);
    }
  });

  program.command("audit").description("Show statement balance, lifecycle use, review risks, and consequential-recall metrics").option("--json").action(async (options) => {
    const workspace = await openWorkspace(process.cwd());
    const value = workspace.database.audit(workspace.repositoryId);
    if (options.json) return print(value, true);
    print([
      `statements: ${value.knowledge.statements.active} active / ${value.knowledge.statements.total} total — ${JSON.stringify(value.knowledge.statements.byKind)}`,
      `candidate operations: ${JSON.stringify(value.knowledge.candidates.byOperation)}`,
      `lifecycle transitions: ${JSON.stringify(value.knowledge.lifecycleTransitions)}`,
      `request intents: ${JSON.stringify(value.learning.requestIntents)}`,
      `retrieval: ${value.learning.retrievedItems} items across ${value.learning.retrievals} retrievals`,
      `context effects: ${value.learning.contextEffects.material} material / ${value.learning.contextEffects.noEffect} no-effect`,
      `review agent-authority commitments: ${value.knowledge.review.agentAuthorityCommitmentIds.join(", ") || "none"}`,
      `active intents: ${value.knowledge.review.activeIntentIds.join(", ") || "none"}`
    ].join("\n"));
  });

  program.command("reclassify <statement-id> <kind>").description("Queue an atomic human-reviewed statement reclassification").option("--body <text>").option("--path <prefix>").option("--reason <text>").action(async (statementId, kindValue, options) => {
    const kind = kindValue as StatementKind;
    if (!["intent", "belief", "commitment"].includes(kind)) throw new Error("kind must be intent, belief, or commitment");
    const workspace = await openWorkspace(process.cwd());
    const current = workspace.database.getStatement(statementId, workspace.repositoryId);
    if (current.kind === kind) throw new Error(`${statementId} is already a ${kind}`);
    const scope: Scope = options.path ? { kind: "path", prefix: options.path } : current.scope;
    const attributes = await promptAttributes(kind);
    const rationale = options.reason ?? await input({ message: "Why was the original classification wrong?", validate: (value) => value.trim().length > 0 || "A reason is required" });
    const proposal = CandidateProposalSchema.parse({ operation: "reclassify", kind, targetStatementId: statementId, body: options.body ?? current.body, scope, attributes, ...(kind === "intent" ? { initialStatus: "active" } : {}), rationale, evidencePaths: [], evidenceNotes: [`Human-requested reclassification from ${current.kind} to ${kind}`] });
    const candidateId = workspace.database.propose(workspace.repositoryId, undefined, proposal, workspace.gitViewId);
    print(`${candidateId} queued; run \`bb review ${candidateId}\` to inspect and accept it.`);
  });

  program.command("context <request>").description("Retrieve relevant project context").option("--path <path...>").option("--max-items <count>").option("--json").action(async (request, options) => {
    const semantic = await configuredSemantic(process.cwd());
    const context = await getContext({ cwd: process.cwd(), request, ...(options.path ? { paths: options.path } : {}), ...(options.maxItems ? { maxItems: Number(options.maxItems) } : {}), ...(semantic ? { semantic } : {}) });
    print(options.json ? context : context.rendered, Boolean(options.json));
  });

  program.command("explain <statement-id>").description("Explain one current statement").option("--json").action(async (statementId, options) => {
    const workspace = await openWorkspace(process.cwd());
    const explanation = workspace.database.explainStatement(statementId);
    const statement = explanation.current;
    const evidence = explanation.history.flatMap((revision) => revision.evidence as Array<Record<string, unknown>>);
    print(options.json ? explanation : `${statement.id}\n${statement.body}\nstatus: ${statement.status}\nscope: ${JSON.stringify(statement.scope)}\nrevision: ${statement.revisionNumber}\nevidence:\n${evidence.map((item) => `- ${item.kind}: ${item.summary}`).join("\n")}`, Boolean(options.json));
  });

  program.command("review [candidate-id]").description("Review an agent-proposed context update").option("--accept").option("--edit", "edit and accept").option("--reject").option("--defer").option("--explain").option("--note <text>").action(async (candidateId, options) => {
    const workspace = await openWorkspace(process.cwd());
    const candidates = workspace.database.listCandidates(workspace.repositoryId);
    if (candidates.length === 0) return print("No pending candidates.");
    const id = candidateId ?? await select({ message: "Candidate", choices: candidates.map((candidate) => ({ name: `${candidate.id}: ${candidate.proposal.operation} — ${candidate.proposal.body ?? candidate.proposal.targetStatementId}`, value: candidate.id })) });
    const candidate = candidates.find((item) => item.id === id);
    if (!candidate) throw new Error(`Pending candidate ${id} was not found`);
    const proposedConfidence = candidate.proposal.attributes && "confidence" in candidate.proposal.attributes ? String(candidate.proposal.attributes.confidence) : "n/a";
    const targetConflict = candidate.target ? workspace.database.hasContradictoryEvidence(candidate.target.id) : false;
    print([
      `${candidate.id} — ${candidate.proposal.operation}`,
      `kind: ${candidate.proposal.kind ?? candidate.target?.kind ?? "unknown"}`,
      `old: ${candidate.target?.body ?? "(new statement)"}`,
      `new: ${candidate.proposal.body ?? candidate.target?.body ?? "(unchanged)"}`,
      `scope: ${JSON.stringify(candidate.proposal.scope ?? candidate.target?.scope ?? null)}`,
      `confidence: ${proposedConfidence}`,
      `attributes: ${JSON.stringify(candidate.proposal.attributes ?? candidate.target?.attributes ?? null)}`,
      `rationale: ${candidate.proposal.rationale}`,
      `evidence: ${candidate.evidence.length ? candidate.evidence.map((item) => `${String(item.kind)} at ${String(item.head_commit_sha ?? "uncommitted")}`).join(", ") : "proposal notes/paths only"}`,
      `contradictions: ${targetConflict ? "reviewed contradictory evidence exists" : "none recorded"}`
    ].join("\n"));
    if (options.explain) return;
    let action: "accept" | "edit" | "reject" | "defer" | "explain" | undefined = options.edit ? "edit" : options.accept ? "accept" : options.reject ? "reject" : options.defer ? "defer" : undefined;
    action ??= await select({ message: "Decision", choices: [
      { name: "accept", value: "accept" as const },
      { name: "edit and accept", value: "edit" as const },
      { name: "reject", value: "reject" as const },
      { name: "defer", value: "defer" as const },
      { name: "explain only", value: "explain" as const }
    ] });
    if (action === "explain") return;
    let edited: CandidateProposal | undefined;
    if (action === "edit") {
      edited = await editCandidateProposal(candidate);
    }
    const decision = action === "reject" ? "reject" : action === "defer" ? "defer" : "accept";
    const resolved = workspace.database.resolveCandidate(id, decision, humanActor, options.note, edited);
    print(resolved ? `Accepted as ${resolved.id} revision ${resolved.revisionNumber}` : `${decision}ed ${id}`);
  });
}
