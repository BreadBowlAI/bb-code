import { createHash } from "node:crypto";
import { BbError, invariant } from "../../domain/errors.js";
import { createId, statementPrefix } from "../../domain/ids.js";
import {
  CandidateProposalSchema,
  ScopeSchema,
  validateStatementValues,
  type ActorRef,
  type CandidateProposal,
  type CurrentStatement,
  type Scope,
  type StatementAttributes,
  type StatementDraft,
  type StatementKind,
  type StatementStatus
} from "../../domain/knowledge.js";
import type { RunStore } from "./run-store.js";
import type { SearchStore } from "./search-store.js";
import type { SqliteConnection } from "./connection.js";
import { fromJson, now, toJson } from "./values.js";

const ACTIVE_STATUSES = new Set<StatementStatus>(["active", "accepted"]);

export type EvidenceAnchor = {
  evidenceId: string;
  relationship: "defines" | "supports" | "contradicts";
  gitViewId?: string;
  worktreeId?: string;
  headCommitSha?: string;
  dirtyFingerprint?: string;
  branchLabel?: string;
  stablePatchId?: string;
  paths: Array<{ path: string; blobSha?: string }>;
};

export type CandidateRecord = {
  id: string;
  proposal: CandidateProposal;
  acceptedProposal?: CandidateProposal;
  state: string;
  createdAt: string;
  runId?: string;
  target?: CurrentStatement;
  evidence: Array<Record<string, unknown>>;
};

export type QkvIndexDocument = {
  id: string;
  revisionId: string;
  kind: StatementKind;
  status: StatementStatus;
  text: string;
};

export class KnowledgeStore {
  constructor(
    private readonly connection: SqliteConnection,
    private readonly search: SearchStore,
    private readonly runs: RunStore
  ) {}

  createStatement(repositoryId: string, rawDraft: StatementDraft, sourceCandidateId?: string): CurrentStatement {
    invariant(rawDraft.body.trim().length > 0, "Statement body is required", "invalid_statement");
    const scope = ScopeSchema.parse(rawDraft.scope);
    const attributes = validateStatementValues({ kind: rawDraft.kind, status: rawDraft.status, attributes: rawDraft.attributes });
    invariant(this.connection.database.prepare("SELECT 1 FROM repositories WHERE id=?").get(repositoryId), `Repository ${repositoryId} was not found`, "not_found");
    const draft = { ...rawDraft, body: rawDraft.body.trim(), scope, attributes };
    const statementId = createId(statementPrefix(draft.kind));
    const revisionId = createId("rev");
    const timestamp = now();
    const database = this.connection.database;
    this.connection.transaction(() => {
      database.prepare("INSERT INTO statements VALUES(?,?,?,?,?,?)").run(statementId, repositoryId, draft.kind, null, toJson(draft.actor), timestamp);
      database.prepare("INSERT INTO statement_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(revisionId, statementId, 1, draft.body, draft.status, draft.scope.kind, draft.scope.kind === "path" ? draft.scope.prefix : null, toJson(draft.attributes), sourceCandidateId ?? null, toJson(draft.actor), timestamp);
      database.prepare("UPDATE statements SET current_revision_id=? WHERE id=?").run(revisionId, statementId);
      const evidenceId = this.insertEvidence(repositoryId, revisionId, "defines", draft.evidence);
      if (sourceCandidateId) database.prepare("INSERT OR IGNORE INTO candidate_evidence VALUES(?,?)").run(sourceCandidateId, evidenceId);
      this.updateSearch(repositoryId, { ...this.getStatement(statementId), revisionId });
    });
    return this.getStatement(statementId);
  }

  getStatement(id: string, repositoryId?: string): CurrentStatement {
    const row = this.connection.database.prepare(`SELECT s.id,s.repository_id,s.kind,s.created_at,r.id revision_id,r.revision_number,r.body,r.status,r.scope_kind,r.scope_path,r.attributes_json
      FROM statements s JOIN statement_revisions r ON r.id=s.current_revision_id WHERE s.id=?`).get(id) as Record<string, unknown> | undefined;
    if (!row || (repositoryId && row.repository_id !== repositoryId)) throw new BbError(`Statement ${id} was not found`, "not_found");
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
      const evidenceRows = database.prepare(`SELECT e.id,e.kind,e.summary,e.run_id,e.git_view_id,re.relationship,e.created_at,
        g.head_commit_sha,g.head_tree_sha,g.dirty_fingerprint,g.branch_label,g.stable_patch_id
        FROM revision_evidence re JOIN evidence e ON e.id=re.evidence_id
        LEFT JOIN git_views g ON g.id=e.git_view_id WHERE re.revision_id=? ORDER BY e.created_at`).all(String(revision.id)) as Array<Record<string, unknown>>;
      const evidence = evidenceRows.map((item) => ({ ...item, paths: database.prepare("SELECT path,blob_sha FROM evidence_paths WHERE evidence_id=? ORDER BY path").all(String(item.id)) as Array<Record<string, unknown>> }));
      return { ...revision, attributes: fromJson(revision.attributes_json), createdBy: fromJson(revision.created_by_json), evidence };
    });
    return { current, history };
  }

  anchors(statementId: string): EvidenceAnchor[] {
    const database = this.connection.database;
    const rows = database.prepare(`SELECT e.id,re.relationship,e.git_view_id,g.worktree_id,g.head_commit_sha,g.dirty_fingerprint,g.branch_label,g.stable_patch_id
      FROM statements s JOIN revision_evidence re ON re.revision_id=s.current_revision_id
      JOIN evidence e ON e.id=re.evidence_id LEFT JOIN git_views g ON g.id=e.git_view_id
      WHERE s.id=? ORDER BY e.created_at DESC`).all(statementId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      evidenceId: String(row.id),
      relationship: String(row.relationship) as EvidenceAnchor["relationship"],
      ...(row.git_view_id ? { gitViewId: String(row.git_view_id) } : {}),
      ...(row.worktree_id ? { worktreeId: String(row.worktree_id) } : {}),
      ...(row.head_commit_sha ? { headCommitSha: String(row.head_commit_sha) } : {}),
      ...(row.dirty_fingerprint ? { dirtyFingerprint: String(row.dirty_fingerprint) } : {}),
      ...(row.branch_label ? { branchLabel: String(row.branch_label) } : {}),
      ...(row.stable_patch_id ? { stablePatchId: String(row.stable_patch_id) } : {}),
      paths: (database.prepare("SELECT path,blob_sha FROM evidence_paths WHERE evidence_id=? ORDER BY path").all(String(row.id)) as Array<Record<string, unknown>>).map((path) => ({ path: String(path.path), ...(path.blob_sha ? { blobSha: String(path.blob_sha) } : {}) }))
    }));
  }

  hasContradictoryEvidence(statementId: string): boolean {
    return Boolean(this.connection.database.prepare("SELECT 1 FROM statements s JOIN revision_evidence re ON re.revision_id=s.current_revision_id WHERE s.id=? AND re.relationship='contradicts' LIMIT 1").get(statementId));
  }

  conflictingStatementIds(repositoryId: string, statementIds: string[]): Set<string> {
    const candidates = this.listStatements(repositoryId).filter((statement) => statement.kind === "belief" && statement.status === "active" && statementIds.includes(statement.id));
    const conflicts = new Set<string>();
    const normalize = (body: string) => body.toLowerCase().replace(/\b(?:not|never|no|cannot|can't|isn't|aren't|mustn't)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const negated = (body: string) => /\b(?:not|never|no|cannot|can't|isn't|aren't|mustn't)\b/i.test(body);
    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        const first = candidates[left]!;
        const second = candidates[right]!;
        if (toJson(first.scope) !== toJson(second.scope)) continue;
        if (negated(first.body) === negated(second.body) || normalize(first.body) !== normalize(second.body)) continue;
        conflicts.add(first.id);
        conflicts.add(second.id);
      }
    }
    return conflicts;
  }

  validateProposal(repositoryId: string, raw: CandidateProposal): CandidateProposal {
    const proposal = CandidateProposalSchema.parse(raw);
    if (proposal.operation === "create") {
      const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
      const duplicate = this.listStatements(repositoryId).find((statement) => statement.kind === proposal.kind && normalize(statement.body) === normalize(proposal.body));
      invariant(!duplicate, `A current ${proposal.kind} with the same statement already exists: ${duplicate?.id}. Revise, satisfy, supersede, or retire the existing statement instead.`, "duplicate_statement");
      return proposal;
    }
    const current = this.getStatement(proposal.targetStatementId!, repositoryId);
    this.validateOperation(proposal.operation, current.kind);
    if (proposal.operation !== "confirm") invariant(ACTIVE_STATUSES.has(current.status), `Cannot ${proposal.operation} a ${current.status} ${current.kind}`, "invalid_transition");
    if (proposal.kind && proposal.kind !== current.kind) throw new BbError(`Candidate kind ${proposal.kind} does not match target kind ${current.kind}`, "invalid_candidate_kind");
    if (proposal.attributes) validateStatementValues({ kind: current.kind, status: current.status, attributes: proposal.attributes as StatementAttributes });
    if (proposal.operation === "revise") {
      const changed = (proposal.body !== undefined && proposal.body !== current.body)
        || (proposal.scope !== undefined && toJson(ScopeSchema.parse(proposal.scope)) !== toJson(current.scope))
        || (proposal.attributes !== undefined && toJson(proposal.attributes) !== toJson(current.attributes));
      invariant(changed, "revise must change at least one field", "empty_revision");
    }
    return proposal;
  }

  propose(repositoryId: string, runId: string | undefined, input: CandidateProposal, gitViewId?: string): string {
    const proposal = this.validateProposal(repositoryId, input);
    if (runId) invariant(this.runs.belongsToRepository(runId, repositoryId), `Run ${runId} was not found in this repository`, "not_found");
    const id = createId("cand");
    const database = this.connection.database;
    database.prepare("INSERT INTO candidate_updates(id,repository_id,run_id,target_statement_id,operation,proposal_json,rationale,state,created_at,created_git_view_id) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, repositoryId, runId ?? null, proposal.targetStatementId ?? null, proposal.operation, toJson(proposal), proposal.rationale, "pending", now(), gitViewId ?? null);
    if (runId && proposal.evidencePaths.length) {
      const placeholders = proposal.evidencePaths.map(() => "?").join(",");
      const rows = database.prepare(`SELECT DISTINCT e.id FROM evidence e JOIN evidence_paths ep ON ep.evidence_id=e.id WHERE e.run_id=? AND ep.path IN (${placeholders})`).all(runId, ...proposal.evidencePaths) as Array<{ id: string }>;
      for (const row of rows) database.prepare("INSERT OR IGNORE INTO candidate_evidence VALUES(?,?)").run(id, row.id);
    }
    return id;
  }

  ensureReanchorCandidate(repositoryId: string, statementId: string, oldCommit: string, matchedCommit: string, gitViewId: string): string | undefined {
    const database = this.connection.database;
    const existing = database.prepare("SELECT id FROM candidate_updates WHERE repository_id=? AND target_statement_id=? AND operation='confirm' AND state IN ('pending','deferred') AND rationale LIKE ? LIMIT 1").get(repositoryId, statementId, `%${matchedCommit}%`) as { id: string } | undefined;
    if (existing) return undefined;
    return this.propose(repositoryId, undefined, {
      operation: "confirm",
      targetStatementId: statementId,
      rationale: `Git history changed: evidence at ${oldCommit} has one stable patch-ID match at ${matchedCommit}. Confirm this re-anchor; bb-code will never remap it automatically.`,
      evidencePaths: [],
      evidenceNotes: [`old_commit:${oldCommit}`, `matched_commit:${matchedCommit}`]
    }, gitViewId);
  }

  listCandidates(repositoryId: string, state = "pending"): CandidateRecord[] {
    const database = this.connection.database;
    const rows = database.prepare("SELECT * FROM candidate_updates WHERE repository_id=? AND state=? ORDER BY created_at").all(repositoryId, state) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const targetId = row.target_statement_id ? String(row.target_statement_id) : undefined;
      const evidence = database.prepare(`SELECT e.*,g.head_commit_sha,g.branch_label,g.dirty_fingerprint
        FROM candidate_evidence ce JOIN evidence e ON e.id=ce.evidence_id LEFT JOIN git_views g ON g.id=e.git_view_id
        WHERE ce.candidate_id=? ORDER BY e.created_at`).all(String(row.id)) as Array<Record<string, unknown>>;
      return {
        id: String(row.id),
        proposal: CandidateProposalSchema.parse(fromJson(row.proposal_json)),
        ...(row.accepted_proposal_json ? { acceptedProposal: CandidateProposalSchema.parse(fromJson(row.accepted_proposal_json)) } : {}),
        state: String(row.state),
        createdAt: String(row.created_at),
        ...(row.run_id ? { runId: String(row.run_id) } : {}),
        ...(targetId ? { target: this.getStatement(targetId, repositoryId) } : {}),
        evidence
      };
    });
  }

  hasCandidatesForRun(runId: string): boolean {
    return Boolean(this.connection.database.prepare("SELECT 1 FROM candidate_updates WHERE run_id=? LIMIT 1").get(runId));
  }

  resolveCandidate(id: string, decision: "accept" | "reject" | "defer", actor: ActorRef, note?: string, editedProposal?: CandidateProposal): CurrentStatement | undefined {
    const database = this.connection.database;
    return this.connection.transaction(() => {
      const row = database.prepare("SELECT * FROM candidate_updates WHERE id=?").get(id) as Record<string, unknown> | undefined;
      invariant(row, `Candidate ${id} was not found`, "not_found");
      invariant(row.state === "pending" || row.state === "deferred", `Candidate ${id} is already resolved`, "invalid_state");
      if (decision !== "accept") {
        database.prepare("UPDATE candidate_updates SET state=?,resolved_at=?,resolved_by_json=?,resolution_note=? WHERE id=?").run(decision === "reject" ? "rejected" : "deferred", now(), toJson(actor), note ?? null, id);
        return undefined;
      }
      const original = CandidateProposalSchema.parse(fromJson(row.proposal_json));
      let proposal = original;
      if (editedProposal) {
        proposal = this.validateProposal(String(row.repository_id), editedProposal);
        invariant(proposal.operation === original.operation && proposal.targetStatementId === original.targetStatementId, "Edits cannot change the candidate operation or target", "invalid_edit");
      } else proposal = this.validateProposal(String(row.repository_id), original);
      const result = this.acceptProposal(row, proposal, actor, id);
      database.prepare("UPDATE candidate_updates SET state=?,accepted_proposal_json=?,resolved_at=?,resolved_by_json=?,resolution_note=? WHERE id=?").run(editedProposal ? "edited" : "accepted", editedProposal ? toJson(proposal) : null, now(), toJson(actor), note ?? null, id);
      return result;
    });
  }

  indexDocument(statementId: string): QkvIndexDocument | undefined {
    const current = this.getStatement(statementId);
    if (!ACTIVE_STATUSES.has(current.status)) return undefined;
    const evidence = this.explainStatement(statementId).history.at(-1)?.evidence as Array<Record<string, unknown>> | undefined;
    const reviewedEvidence = (evidence ?? []).slice(0, 3).map((item) => String(item.summary)).join("; ");
    const details = current.kind === "commitment"
      ? `rationale: ${String((current.attributes as { rationale: string }).rationale)}`
      : current.kind === "intent"
        ? `success conditions: ${((current.attributes as { successConditions: string[] }).successConditions).join("; ")}`
        : `confidence: ${String((current.attributes as { confidence: number }).confidence)}`;
    const scope = current.scope.kind === "repository" ? "repository" : `path:${current.scope.prefix}`;
    return { id: current.id, revisionId: current.revisionId, kind: current.kind, status: current.status, text: `${current.kind}\n${current.body}\n${details}\nscope: ${scope}${reviewedEvidence ? `\nreviewed evidence: ${reviewedEvidence}` : ""}` };
  }

  listIndexDocuments(repositoryId: string): QkvIndexDocument[] {
    return this.listStatements(repositoryId).flatMap((statement) => {
      const document = this.indexDocument(statement.id);
      return document ? [document] : [];
    });
  }

  private acceptProposal(row: Record<string, unknown>, proposal: CandidateProposal, actor: ActorRef, candidateId: string): CurrentStatement {
    const repositoryId = String(row.repository_id);
    const runId = row.run_id ? String(row.run_id) : undefined;
    const evidence = { kind: "agent_proposal", summary: proposal.rationale, paths: proposal.evidencePaths, ...(runId ? { runId } : {}), ...(row.created_git_view_id ? { gitViewId: String(row.created_git_view_id) } : {}) };
    if (proposal.operation === "create") {
      const created = this.createStatement(repositoryId, { kind: proposal.kind!, body: proposal.body!, status: proposal.kind === "commitment" ? "accepted" : "active", scope: proposal.scope!, attributes: proposal.attributes as StatementAttributes, actor, evidence }, candidateId);
      this.linkCandidateEvidence(candidateId, created.revisionId, "supports");
      return created;
    }
    const current = this.getStatement(proposal.targetStatementId!, repositoryId);
    if (proposal.operation === "confirm") {
      const evidenceId = this.insertEvidence(repositoryId, current.revisionId, "supports", evidence);
      this.connection.database.prepare("INSERT OR IGNORE INTO candidate_evidence VALUES(?,?)").run(candidateId, evidenceId);
      this.linkCandidateEvidence(candidateId, current.revisionId, "supports");
      this.updateSearch(repositoryId, current);
      return current;
    }
    const status: StatementStatus = proposal.operation === "contradict" ? "contradicted" : proposal.operation === "satisfy" ? "satisfied" : proposal.operation === "retire" ? "retired" : proposal.operation === "supersede" ? "superseded" : current.status;
    let result = this.appendRevision(current, {
      body: proposal.operation === "supersede" ? current.body : proposal.body ?? current.body,
      status,
      scope: proposal.scope ?? current.scope,
      attributes: (proposal.attributes as StatementAttributes | undefined) ?? current.attributes,
      actor,
      sourceCandidateId: candidateId,
      evidence,
      relationship: proposal.operation === "contradict" ? "contradicts" : "supports"
    });
    if (proposal.operation === "supersede" && proposal.body) {
      result = this.createStatement(repositoryId, { kind: current.kind, body: proposal.body, status: current.kind === "commitment" ? "accepted" : "active", scope: proposal.scope ?? current.scope, attributes: (proposal.attributes as StatementAttributes | undefined) ?? current.attributes, actor, evidence }, candidateId);
    }
    return result;
  }

  private appendRevision(current: CurrentStatement, input: { body: string; status: StatementStatus; scope: Scope; attributes: StatementAttributes; actor: ActorRef; sourceCandidateId: string; evidence: StatementDraft["evidence"]; relationship: "supports" | "contradicts" }): CurrentStatement {
    validateStatementValues({ kind: current.kind, status: input.status, attributes: input.attributes });
    const database = this.connection.database;
    const revisionId = createId("rev");
    database.prepare("INSERT INTO statement_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(revisionId, current.id, current.revisionNumber + 1, input.body, input.status, input.scope.kind, input.scope.kind === "path" ? input.scope.prefix : null, toJson(input.attributes), input.sourceCandidateId, toJson(input.actor), now());
    database.prepare("UPDATE statements SET current_revision_id=? WHERE id=?").run(revisionId, current.id);
    const repository = database.prepare("SELECT repository_id FROM statements WHERE id=?").get(current.id) as { repository_id: string };
    const evidenceId = this.insertEvidence(repository.repository_id, revisionId, input.relationship, input.evidence);
    database.prepare("INSERT OR IGNORE INTO candidate_evidence VALUES(?,?)").run(input.sourceCandidateId, evidenceId);
    this.linkCandidateEvidence(input.sourceCandidateId, revisionId, input.relationship);
    const result = this.getStatement(current.id);
    this.updateSearch(repository.repository_id, result);
    return result;
  }

  private insertEvidence(repositoryId: string, revisionId: string, relationship: "defines" | "supports" | "contradicts", evidence: StatementDraft["evidence"]): string {
    const database = this.connection.database;
    const evidenceId = createId("ev");
    const timestamp = now();
    database.prepare("INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?,?)").run(evidenceId, repositoryId, evidence.runId ?? null, evidence.gitViewId ?? null, evidence.kind, evidence.summary, null, "{}", createHash("sha256").update(evidence.summary).digest("hex"), timestamp);
    for (const path of evidence.paths ?? []) database.prepare("INSERT INTO evidence_paths VALUES(?,?,?)").run(evidenceId, path, evidence.pathBlobs?.[path] ?? null);
    database.prepare("INSERT INTO revision_evidence VALUES(?,?,?,?)").run(revisionId, evidenceId, relationship, timestamp);
    return evidenceId;
  }

  private updateSearch(repositoryId: string, statement: CurrentStatement): void {
    if (ACTIVE_STATUSES.has(statement.status)) {
      this.search.indexStatement(statement.id, statement.revisionId, this.searchableText(statement));
      this.search.enqueueStatement(repositoryId, statement.id, statement.revisionId, "upsert");
    } else {
      this.search.removeStatementIndex(statement.id);
      this.search.enqueueStatement(repositoryId, statement.id, undefined, "delete");
    }
  }

  private linkCandidateEvidence(candidateId: string, revisionId: string, relationship: "supports" | "contradicts"): void {
    const database = this.connection.database;
    const rows = database.prepare("SELECT evidence_id FROM candidate_evidence WHERE candidate_id=?").all(candidateId) as Array<{ evidence_id: string }>;
    const alreadyLinked = database.prepare("SELECT 1 FROM revision_evidence WHERE revision_id=? AND evidence_id=? LIMIT 1");
    const link = database.prepare("INSERT INTO revision_evidence VALUES(?,?,?,?)");
    for (const row of rows) {
      if (alreadyLinked.get(revisionId, row.evidence_id)) continue;
      link.run(revisionId, row.evidence_id, relationship, now());
    }
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

  private searchableText(statement: CurrentStatement): string {
    const scope = statement.scope.kind === "repository" ? "repository" : statement.scope.prefix;
    return `${statement.id} ${statement.kind} ${statement.body} ${scope} ${toJson(statement.attributes)}`;
  }
}
