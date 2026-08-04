import { confirm, input, select } from "@inquirer/prompts";
import type { Command } from "commander";
import { addStatement, getContext, openWorkspace, type Scope, type StatementAttributes } from "@breadbowl/bb-core";
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

  program.command("context <task>").description("Retrieve relevant project context").option("--path <path...>").option("--max-items <count>").option("--json").action(async (task, options) => {
    const semantic = await configuredSemantic(process.cwd());
    const context = await getContext({ cwd: process.cwd(), task, ...(options.path ? { paths: options.path } : {}), ...(options.maxItems ? { maxItems: Number(options.maxItems) } : {}), ...(semantic ? { semantic } : {}) });
    print(options.json ? context : context.rendered, Boolean(options.json));
  });

  program.command("explain <statement-id>").description("Explain one current statement").option("--json").action(async (statementId, options) => {
    const workspace = await openWorkspace(process.cwd());
    const explanation = workspace.database.explainStatement(statementId);
    const statement = explanation.current;
    const evidence = explanation.history.flatMap((revision) => revision.evidence as Array<Record<string, unknown>>);
    print(options.json ? explanation : `${statement.id}\n${statement.body}\nstatus: ${statement.status}\nscope: ${JSON.stringify(statement.scope)}\nrevision: ${statement.revisionNumber}\nevidence:\n${evidence.map((item) => `- ${item.kind}: ${item.summary}`).join("\n")}`, Boolean(options.json));
  });

  program.command("review [candidate-id]").description("Review an agent-proposed context update").option("--accept").option("--reject").option("--defer").option("--note <text>").action(async (candidateId, options) => {
    const workspace = await openWorkspace(process.cwd());
    const candidates = workspace.database.listCandidates(workspace.repositoryId);
    if (candidates.length === 0) return print("No pending candidates.");
    const id = candidateId ?? await select({ message: "Candidate", choices: candidates.map((candidate) => ({ name: `${candidate.id}: ${candidate.proposal.operation} — ${candidate.proposal.body ?? candidate.proposal.targetStatementId}`, value: candidate.id })) });
    let decision: "accept" | "reject" | "defer" | undefined = options.accept ? "accept" : options.reject ? "reject" : options.defer ? "defer" : undefined;
    decision ??= await select({ message: "Decision", choices: ["accept", "reject", "defer"].map((value) => ({ name: value, value: value as "accept" | "reject" | "defer" })) });
    const resolved = workspace.database.resolveCandidate(id, decision, humanActor, options.note);
    print(resolved ? `Accepted as ${resolved.id} revision ${resolved.revisionNumber}` : `${decision}ed ${id}`);
  });
}
