import { confirm, input, select } from "@inquirer/prompts";
import type { Command } from "commander";
import { CandidateProposalSchema, addStatement, getContext, openWorkspace, type CandidateProposal, type Scope, type StatementAttributes } from "@breadbowl/bb-core";
import { configuredSemantic } from "../composition/semantic-provider.js";
import { humanActor, print } from "./io.js";

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
      `old: ${candidate.target?.body ?? "(new statement)"}`,
      `new: ${candidate.proposal.body ?? candidate.target?.body ?? "(unchanged)"}`,
      `scope: ${JSON.stringify(candidate.proposal.scope ?? candidate.target?.scope ?? null)}`,
      `confidence: ${proposedConfidence}`,
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
      const body = candidate.proposal.operation === "confirm" || candidate.proposal.operation === "contradict" || candidate.proposal.operation === "satisfy" || candidate.proposal.operation === "retire"
        ? candidate.proposal.body
        : await input({ message: "Statement text:", default: candidate.proposal.body ?? candidate.target?.body ?? "" });
      const rationale = await input({ message: "Rationale:", default: candidate.proposal.rationale });
      edited = CandidateProposalSchema.parse({ ...candidate.proposal, ...(body ? { body } : {}), rationale });
    }
    const decision = action === "reject" ? "reject" : action === "defer" ? "defer" : "accept";
    const resolved = workspace.database.resolveCandidate(id, decision, humanActor, options.note, edited);
    print(resolved ? `Accepted as ${resolved.id} revision ${resolved.revisionNumber}` : `${decision}ed ${id}`);
  });
}
