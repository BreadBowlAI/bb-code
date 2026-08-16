import type { ContextItem } from "../../domain/context.js";
import { invariant } from "../../domain/errors.js";
import { shouldAutoAcceptProposal, type ActorRef, type CandidateProposal, type CurrentStatement, type KnowledgeMode, type StatementDraft } from "../../domain/knowledge.js";
import type { GitView, RequestIntentDecision } from "../../domain/runtime.js";
import { KnowledgeStore, type CandidateRecord, type EvidenceAnchor, type QkvIndexDocument } from "./knowledge-store.js";
import { RepositoryStore, type RepositoryRegistration, type KnownWorktree } from "./repository-store.js";
import { RunStore, type FinishRunRecord, type RunEventInput } from "./run-store.js";
import { SearchStore } from "./search-store.js";
import { SqliteConnection } from "./connection.js";

/**
 * Stable persistence facade used by application services.
 *
 * SQL is implemented by focused stores; callers do not depend on table layout.
 */
export class BbDatabase {
  private readonly connection: SqliteConnection;
  private readonly repositories: RepositoryStore;
  private readonly runs: RunStore;
  private readonly search: SearchStore;
  private readonly knowledge: KnowledgeStore;

  constructor(readonly filename: string) {
    this.connection = new SqliteConnection(filename);
    this.repositories = new RepositoryStore(this.connection);
    this.runs = new RunStore(this.connection);
    this.search = new SearchStore(this.connection);
    this.knowledge = new KnowledgeStore(this.connection, this.search, this.runs);
  }

  close(): void { this.connection.close(); }

  registerRepository(input: Parameters<RepositoryStore["register"]>[0]): RepositoryRegistration { return this.repositories.register(input); }
  getGitView(id: string): GitView | undefined { return this.repositories.getGitView(id); }
  knownWorktree(repositoryId: string, root: string): KnownWorktree | undefined { return this.repositories.knownWorktree(repositoryId, root); }
  knowledgePolicy(repositoryId: string): ReturnType<RepositoryStore["knowledgePolicy"]> { return this.repositories.knowledgePolicy(repositoryId); }
  setKnowledgeMode(repositoryId: string, mode: KnowledgeMode, actor: ActorRef): ReturnType<RepositoryStore["setKnowledgeMode"]> { return this.repositories.setKnowledgeMode(repositoryId, mode, actor); }

  startSession(input: Parameters<RunStore["startSession"]>[0]): string { return this.runs.startSession(input); }
  endSession(host: string, externalSessionId: string): void { this.runs.endSession(host, externalSessionId); }
  startRun(input: Parameters<RunStore["startRun"]>[0]): string { return this.runs.startRun(input); }
  latestRunningRun(host: string, externalSessionId: string): string | undefined { return this.runs.latestRunningRun(host, externalSessionId); }
  latestRunningRunForRequest(repositoryId: string, worktreeId: string, prompt: string): string | undefined { return this.runs.latestRunningRunForRequest(repositoryId, worktreeId, prompt); }
  addRunEvent(runId: string, event: RunEventInput): boolean { return this.runs.addEvent(runId, event); }
  finishRun(input: FinishRunRecord): void { this.runs.finish(input); }
  handleStop(runId: string, policy?: Parameters<RunStore["handleStop"]>[1]): "none" | "nudge" | "finalized" { return this.runs.handleStop(runId, policy); }
  hostRunCounts(repositoryId: string): Record<string, number> { return this.runs.hostRunCounts(repositoryId); }
  runStartGitView(runId: string): GitView | undefined {
    const id = this.runs.startGitViewId(runId);
    return id ? this.repositories.getGitView(id) : undefined;
  }

  createStatement(repositoryId: string, draft: StatementDraft, sourceCandidateId?: string): CurrentStatement { return this.knowledge.createStatement(repositoryId, draft, sourceCandidateId); }
  getStatement(id: string, repositoryId?: string): CurrentStatement { return this.knowledge.getStatement(id, repositoryId); }
  listStatements(repositoryId: string): CurrentStatement[] { return this.knowledge.listStatements(repositoryId); }
  audit(repositoryId: string): { policy: ReturnType<RepositoryStore["knowledgePolicy"]>; knowledge: ReturnType<KnowledgeStore["audit"]>; learning: ReturnType<RunStore["learningMetrics"]> } { return { policy: this.repositories.knowledgePolicy(repositoryId), knowledge: this.knowledge.audit(repositoryId), learning: this.runs.learningMetrics(repositoryId) }; }
  explainStatement(id: string): { current: CurrentStatement; history: Array<Record<string, unknown>> } { return this.knowledge.explainStatement(id); }
  propose(repositoryId: string, runId: string | undefined, input: CandidateProposal, gitViewId?: string): string { return this.proposeWithPolicy(repositoryId, runId, input, gitViewId); }
  listCandidates(repositoryId: string, state = "pending"): CandidateRecord[] { return this.knowledge.listCandidates(repositoryId, state); }
  resolveCandidate(id: string, decision: "accept" | "reject" | "defer", actor: ActorRef, note?: string, editedProposal?: CandidateProposal): CurrentStatement | undefined { return this.knowledge.resolveCandidate(id, decision, actor, note, editedProposal); }
  statementAnchors(statementId: string): EvidenceAnchor[] { return this.knowledge.anchors(statementId); }
  ensureReanchorCandidate(repositoryId: string, statementId: string, oldCommit: string, matchedCommit: string, gitViewId: string): string | undefined {
    return this.connection.transaction(() => {
      const candidateId = this.knowledge.ensureReanchorCandidate(repositoryId, statementId, oldCommit, matchedCommit, gitViewId);
      if (!candidateId) return undefined;
      const candidate = this.knowledge.listCandidates(repositoryId).find((item) => item.id === candidateId);
      if (candidate) this.resolveCandidateByPolicy(repositoryId, candidateId, candidate.proposal, candidate.target?.kind);
      return candidateId;
    });
  }
  hasContradictoryEvidence(statementId: string): boolean { return this.knowledge.hasContradictoryEvidence(statementId); }
  conflictingStatementIds(repositoryId: string, statementIds: string[]): Set<string> { return this.knowledge.conflictingStatementIds(repositoryId, statementIds); }
  indexDocument(statementId: string): QkvIndexDocument | undefined { return this.knowledge.indexDocument(statementId); }
  listIndexDocuments(repositoryId: string): QkvIndexDocument[] { return this.knowledge.listIndexDocuments(repositoryId); }

  completeRun(repositoryId: string, input: FinishRunRecord & { proposals: CandidateProposal[]; proposalGitViewId?: string }): string[] {
    if (!this.runs.belongsToRepository(input.runId, repositoryId) || !this.runs.isRunning(input.runId)) throw new Error(`Running run ${input.runId} was not found in this repository`);
    const requestIntent = input.requestIntent as RequestIntentDecision;
    const requestProposal = requestIntent.disposition === "durable" ? this.knowledge.validateProposal(repositoryId, requestIntent.proposal) : undefined;
    if (requestProposal && requestProposal.operation !== "create" && requestProposal.operation !== "reclassify") {
      invariant(this.knowledge.getStatement(requestProposal.targetStatementId, repositoryId).kind === "intent", "requestIntent lifecycle proposals must target an intent", "invalid_request_intent");
    }
    const proposals = input.proposals.map((proposal) => this.knowledge.validateProposal(repositoryId, proposal));
    if (requestProposal) {
      const encoded = JSON.stringify(requestProposal);
      invariant(!proposals.some((proposal) => JSON.stringify(proposal) === encoded), "Do not repeat the requestIntent proposal in proposals", "duplicate_request_intent");
    }
    const noDurableLearningReason = input.noDurableLearningReason?.trim();
    const hasLearningDecision = proposals.length > 0 || this.knowledge.hasCandidatesForRun(input.runId) || Boolean(noDurableLearningReason);
    invariant(!this.runs.hasToolEvents(input.runId) || hasLearningDecision, `Tool-assisted run ${input.runId} must include a proposal or noDurableLearningReason explaining why no durable project knowledge was learned`, "missing_learning_decision");
    return this.connection.transaction(() => {
      const candidateIds = [...(requestProposal ? [requestProposal] : []), ...proposals].map((proposal) => this.proposeWithPolicy(repositoryId, input.runId, proposal, input.proposalGitViewId ?? input.endGitViewId));
      this.runs.finish({ ...input, ...(noDurableLearningReason ? { noDurableLearningReason } : {}) });
      return candidateIds;
    });
  }

  searchLexical(repositoryId: string, query: string, limit = 40): Array<{ statement: CurrentStatement; rank: number; score: number }> {
    const matches = this.search.lexicalMatches(repositoryId, query, limit);
    return matches.map((match, index) => ({ statement: this.knowledge.getStatement(match.statementId, repositoryId), rank: index + 1, score: match.score }));
  }

  logRetrieval(input: { repositoryId: string; runId?: string; gitViewId: string; query: string; paths: string[]; providerStatus: unknown; renderedTokenCount: number; items: ContextItem[] }): string { return this.search.logRetrieval(input); }
  getProviderState(repositoryId: string, provider: string): Record<string, unknown> | undefined { return this.search.getProviderState(repositoryId, provider); }
  setProviderState(repositoryId: string, provider: string, state: Parameters<SearchStore["setProviderState"]>[2]): void { this.search.setProviderState(repositoryId, provider, state); }
  enqueueIndexDocuments(repositoryId: string): void {
    for (const statement of this.knowledge.listStatements(repositoryId)) {
      const document = this.knowledge.indexDocument(statement.id);
      this.search.enqueueStatement(repositoryId, statement.id, document?.revisionId, document ? "upsert" : "delete");
    }
  }
  pendingRetrievalJobs(repositoryId: string): ReturnType<SearchStore["pendingJobs"]> { return this.search.pendingJobs(repositoryId); }
  resetFailedRetrievalJobsForRetry(repositoryId: string, provider: string): number { return this.search.resetFailedJobsForRetry(repositoryId, provider); }
  retrievalJobSummary(repositoryId: string, provider: string): ReturnType<SearchStore["jobSummary"]> { return this.search.jobSummary(repositoryId, provider); }
  completeRetrievalJob(id: string, error?: string): void { this.search.completeJob(id, error); }

  health(): { schemaVersion: number; journalMode: string; foreignKeys: boolean } {
    const database = this.connection.database;
    const schema = database.prepare("SELECT MAX(version) version FROM schema_migrations").get() as { version: number };
    const journal = database.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    const foreign = database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    return { schemaVersion: schema.version, journalMode: journal.journal_mode, foreignKeys: foreign.foreign_keys === 1 };
  }

  private proposeWithPolicy(repositoryId: string, runId: string | undefined, proposal: CandidateProposal, gitViewId?: string): string {
    return this.connection.transaction(() => {
      const candidateId = this.knowledge.propose(repositoryId, runId, proposal, gitViewId);
      const targetKind = proposal.operation === "create" ? undefined : this.knowledge.getStatement(proposal.targetStatementId, repositoryId).kind;
      this.resolveCandidateByPolicy(repositoryId, candidateId, proposal, targetKind);
      return candidateId;
    });
  }

  private resolveCandidateByPolicy(repositoryId: string, candidateId: string, proposal: CandidateProposal, targetKind?: CurrentStatement["kind"]): void {
    const mode = this.repositories.knowledgePolicy(repositoryId).mode;
    if (!shouldAutoAcceptProposal(mode, proposal, targetKind)) return;
    const actor: ActorRef = { kind: "agent", id: "bb-code-auto-accept", label: `bb-code ${mode} mode` };
    this.knowledge.resolveCandidate(candidateId, "accept", actor, `Automatically accepted by repository knowledge mode: ${mode}`, undefined, "auto_accepted");
  }
}

export type { RepositoryRegistration } from "./repository-store.js";
