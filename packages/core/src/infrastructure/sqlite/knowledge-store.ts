import { createHash } from "node:crypto";
import { BbError, invariant } from "../../domain/errors.js";
import { createId, statementPrefix } from "../../domain/ids.js";
import { CandidateProposalSchema, type ActorRef, type CandidateProposal, type CurrentStatement, type Scope, type StatementAttributes, type StatementDraft, type StatementKind, type StatementStatus } from "../../domain/knowledge.js";
import type { RunStore } from "./run-store.js";
import type { SearchStore } from "./search-store.js";
import type { SqliteConnection } from "./connection.js";
import { fromJson, now, toJson } from "./values.js";

export class KnowledgeStore {
  constructor(
    private readonly connection: SqliteConnection,
    private readonly search: SearchStore,
    private readonly runs: RunStore
  ) {}

  createStatement(repositoryId: string, draft: StatementDraft, sourceCandidateId?: string): CurrentStatement {
    const statementId = createId(statementPrefix(draft.kind));
    const revisionId = createId("rev");
    const evidenceId = createId("ev");
    const timestamp = now();
    const database = this.connection.database;
    this.connection.transaction(() => {
      database.prepare("INSERT INTO statements VALUES(?,?,?,?,?,?)").run(statementId, repositoryId, draft.kind, null, toJson(draft.actor), timestamp);
      database.prepare("INSERT INTO statement_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(revisionId, statementId, 1, draft.body, draft.status, draft.scope.kind, draft.scope.kind === "path" ? draft.scope.prefix : null, toJson(draft.attributes), sourceCandidateId ?? null, toJson(draft.actor), timestamp);
      database.prepare("UPDATE statements SET current_revision_id=? WHERE id=?").run(revisionId, statementId);
      database.prepare("INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?,?)").run(evidenceId, repositoryId, draft.evidence.runId ?? null, draft.evidence.gitViewId ?? null, draft.evidence.kind, draft.evidence.summary, null, "{}", createHash("sha256").update(draft.evidence.summary).digest("hex"), timestamp);
      for (const path of draft.evidence.paths ?? []) database.prepare("INSERT INTO evidence_paths VALUES(?,?,NULL)").run(evidenceId, path);
      database.prepare("INSERT INTO revision_evidence VALUES(?,?,?,?)").run(revisionId, evidenceId, "defines", timestamp);
      this.search.indexStatement(statementId, revisionId, this.searchableText(draft.kind, draft.body, draft.attributes));
      this.search.enqueueStatement(repositoryId, statementId, revisionId);
    });
    return this.getStatement(statementId);
  }

  getStatement(id: string): CurrentStatement {
    const row = this.connection.database.prepare("SELECT s.id,s.kind,s.created_at,r.id revision_id,r.revision_number,r.body,r.status,r.scope_kind,r.scope_path,r.attributes_json FROM statements s JOIN statement_revisions r ON r.id=s.current_revision_id WHERE s.id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new BbError(`Statement ${id} was not found`, "not_found");
    return this.mapStatement(row);
  }

  listStatements(repositoryId: string): CurrentStatement[] {
    const rows = this.connection.database.prepare("SELECT s.id,s.kind,s.created_at,r.id revision_id,r.revision_number,r.body,r.status,r.scope_kind,r.scope_path,r.attributes_json FROM statements s JOIN statement_revisions r ON r.id=s.current_revision_id WHERE s.repository_id=? ORDER BY s.created_at").all(repositoryId) as Record<string, unknown>[];
    return rows.map((row) => this.mapStatement(row));
  }

  explainStatement(id: string): { current: CurrentStatement; history: Array<Record<string, unknown>> } {
    const database = this.connection.database;
    const current = this.getStatement(id);
    const revisions = database.prepare("SELECT id,revision_number,body,status,scope_kind,scope_path,attributes_json,created_by_json,created_at FROM statement_revisions WHERE statement_id=? ORDER BY revision_number").all(id) as Array<Record<string, unknown>>;
    const history = revisions.map((revision) => {
      const evidenceRows = database.prepare("SELECT e.id,e.kind,e.summary,e.run_id,e.git_view_id,re.relationship,e.created_at FROM revision_evidence re JOIN evidence e ON e.id=re.evidence_id WHERE re.revision_id=? ORDER BY e.created_at").all(String(revision.id)) as Array<Record<string, unknown>>;
      const evidence = evidenceRows.map((item) => ({ ...item, paths: database.prepare("SELECT path,blob_sha FROM evidence_paths WHERE evidence_id=? ORDER BY path").all(String(item.id)) as Array<Record<string, unknown>> }));
      return { ...revision, attributes: fromJson(revision.attributes_json), createdBy: fromJson(revision.created_by_json), evidence };
    });
    return { current, history };
  }

  propose(repositoryId: string, runId: string | undefined, input: CandidateProposal): string {
    const proposal = CandidateProposalSchema.parse(input);
    if (runId) invariant(this.runs.belongsToRepository(runId, repositoryId), `Run ${runId} was not found in this repository`, "not_found");
    const id = createId("cand");
    this.connection.database.prepare("INSERT INTO candidate_updates VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)").run(id, repositoryId, runId ?? null, proposal.targetStatementId ?? null, proposal.operation, toJson(proposal), proposal.rationale, "pending", now());
    return id;
  }

  listCandidates(repositoryId: string, state = "pending"): Array<{ id: string; proposal: CandidateProposal; state: string; createdAt: string }> {
    const rows = this.connection.database.prepare("SELECT id,proposal_json,state,created_at FROM candidate_updates WHERE repository_id=? AND state=? ORDER BY created_at").all(repositoryId, state) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), proposal: CandidateProposalSchema.parse(fromJson(row.proposal_json)), state: String(row.state), createdAt: String(row.created_at) }));
  }

  resolveCandidate(id: string, decision: "accept" | "reject" | "defer", actor: ActorRef, note?: string): CurrentStatement | undefined {
    const database = this.connection.database;
    const row = database.prepare("SELECT * FROM candidate_updates WHERE id=?").get(id) as Record<string, unknown> | undefined;
    invariant(row, `Candidate ${id} was not found`, "not_found");
    invariant(row.state === "pending" || row.state === "deferred", `Candidate ${id} is already resolved`, "invalid_state");
    if (decision !== "accept") {
      database.prepare("UPDATE candidate_updates SET state=?,resolved_at=?,resolved_by_json=?,resolution_note=? WHERE id=?").run(decision === "reject" ? "rejected" : "deferred", now(), toJson(actor), note ?? null, id);
      return undefined;
    }
    const proposal = CandidateProposalSchema.parse(fromJson(row.proposal_json));
    let result: CurrentStatement;
    this.connection.transaction(() => {
      result = this.acceptProposal(row, proposal, actor, id);
      database.prepare("UPDATE candidate_updates SET state='accepted',resolved_at=?,resolved_by_json=?,resolution_note=? WHERE id=?").run(now(), toJson(actor), note ?? null, id);
    });
    return result!;
  }

  private acceptProposal(row: Record<string, unknown>, proposal: CandidateProposal, actor: ActorRef, candidateId: string): CurrentStatement {
    const repositoryId = String(row.repository_id);
    const runId = row.run_id ? String(row.run_id) : undefined;
    if (proposal.operation === "create") {
      return this.createStatement(repositoryId, { kind: proposal.kind!, body: proposal.body!, status: proposal.kind === "commitment" ? "accepted" : "active", scope: proposal.scope!, attributes: proposal.attributes as StatementAttributes, actor, evidence: { kind: "agent_proposal", summary: proposal.rationale, paths: proposal.evidencePaths, ...(runId ? { runId } : {}) } }, candidateId);
    }
    const current = this.getStatement(proposal.targetStatementId!);
    this.validateOperation(proposal.operation, current.kind);
    if (proposal.operation === "confirm") {
      this.attachEvidence(current, repositoryId, proposal.rationale, "supports", runId, proposal.evidencePaths);
      return current;
    }
    const status: StatementStatus = proposal.operation === "contradict" ? "contradicted" : proposal.operation === "satisfy" ? "satisfied" : proposal.operation === "retire" ? "retired" : proposal.operation === "supersede" ? "superseded" : current.status;
    let result = this.appendRevision(current, { body: proposal.operation === "supersede" ? current.body : proposal.body ?? current.body, status, scope: proposal.scope ?? current.scope, attributes: (proposal.attributes as StatementAttributes | undefined) ?? current.attributes, actor, sourceCandidateId: candidateId, evidenceSummary: proposal.rationale, ...(runId ? { runId } : {}), paths: proposal.evidencePaths, relationship: proposal.operation === "contradict" ? "contradicts" : "supports" });
    if (proposal.operation === "supersede" && proposal.body) {
      result = this.createStatement(repositoryId, { kind: current.kind, body: proposal.body, status: current.kind === "commitment" ? "accepted" : "active", scope: proposal.scope ?? current.scope, attributes: (proposal.attributes as StatementAttributes | undefined) ?? current.attributes, actor, evidence: { kind: "agent_proposal", summary: proposal.rationale, paths: proposal.evidencePaths, ...(runId ? { runId } : {}) } }, candidateId);
    }
    return result;
  }

  private appendRevision(current: CurrentStatement, input: { body: string; status: StatementStatus; scope: Scope; attributes: StatementAttributes; actor: ActorRef; sourceCandidateId: string; evidenceSummary: string; runId?: string; paths?: string[]; relationship: "supports" | "contradicts" }): CurrentStatement {
    const database = this.connection.database;
    const revisionId = createId("rev");
    database.prepare("INSERT INTO statement_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(revisionId, current.id, current.revisionNumber + 1, input.body, input.status, input.scope.kind, input.scope.kind === "path" ? input.scope.prefix : null, toJson(input.attributes), input.sourceCandidateId, toJson(input.actor), now());
    database.prepare("UPDATE statements SET current_revision_id=? WHERE id=?").run(revisionId, current.id);
    this.search.indexStatement(current.id, revisionId, this.searchableText(current.kind, input.body, input.attributes));
    const repository = database.prepare("SELECT repository_id FROM statements WHERE id=?").get(current.id) as { repository_id: string };
    this.attachEvidence({ ...current, revisionId }, repository.repository_id, input.evidenceSummary, input.relationship, input.runId, input.paths);
    this.search.enqueueStatement(repository.repository_id, current.id, revisionId);
    return this.getStatement(current.id);
  }

  private attachEvidence(statement: CurrentStatement, repositoryId: string, summary: string, relationship: "defines" | "supports" | "contradicts", runId?: string, paths?: string[]): void {
    const database = this.connection.database;
    const evidenceId = createId("ev");
    const timestamp = now();
    database.prepare("INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?,?)").run(evidenceId, repositoryId, runId ?? null, null, "agent_proposal", summary, null, "{}", createHash("sha256").update(summary).digest("hex"), timestamp);
    for (const path of paths ?? []) database.prepare("INSERT INTO evidence_paths VALUES(?,?,NULL)").run(evidenceId, path);
    database.prepare("INSERT INTO revision_evidence VALUES(?,?,?,?)").run(statement.revisionId, evidenceId, relationship, timestamp);
  }

  private validateOperation(operation: CandidateProposal["operation"], kind: StatementKind): void {
    if (operation === "contradict" && kind !== "belief") throw new BbError("Only beliefs may be contradicted", "invalid_operation");
    if (operation === "satisfy" && kind !== "intent") throw new BbError("Only intents may be satisfied", "invalid_operation");
    if (operation === "retire" && kind !== "commitment") throw new BbError("Only commitments may be retired", "invalid_operation");
  }

  private mapStatement(row: Record<string, unknown>): CurrentStatement {
    const scope: Scope = row.scope_kind === "path" ? { kind: "path", prefix: String(row.scope_path) } : { kind: "repository" };
    return { id: String(row.id), revisionId: String(row.revision_id), kind: String(row.kind) as StatementKind, body: String(row.body), status: String(row.status) as StatementStatus, scope, attributes: fromJson<StatementAttributes>(row.attributes_json), revisionNumber: Number(row.revision_number), createdAt: String(row.created_at) };
  }

  private searchableText(kind: StatementKind, body: string, attributes: StatementAttributes): string {
    return `${kind} ${body} ${toJson(attributes)}`;
  }
}
