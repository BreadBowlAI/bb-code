import type { ContextItem } from "../../domain/context.js";
import { invariant } from "../../domain/errors.js";
import type { ActorRef, CandidateProposal, CurrentStatement, StatementDraft } from "../../domain/knowledge.js";
import type { GitView } from "../../domain/runtime.js";
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

  startSession(input: Parameters<RunStore["startSession"]>[0]): string { return this.runs.startSession(input); }
  endSession(host: string, externalSessionId: string): void { this.runs.endSession(host, externalSessionId); }
  startRun(input: Parameters<RunStore["startRun"]>[0]): string { return this.runs.startRun(input); }
  latestRunningRun(host: string, externalSessionId: string): string | undefined { return this.runs.latestRunningRun(host, externalSessionId); }
  addRunEvent(runId: string, event: RunEventInput): boolean { return this.runs.addEvent(runId, event); }
  finishRun(input: FinishRunRecord): void { this.runs.finish(input); }
  handleStop(runId: string): "none" | "nudge" | "finalized" { return this.runs.handleStop(runId); }
  hostRunCounts(repositoryId: string): Record<string, number> { return this.runs.hostRunCounts(repositoryId); }
  runStartGitView(runId: string): GitView | undefined {
    const id = this.runs.startGitViewId(runId);
    return id ? this.repositories.getGitView(id) : undefined;
  }

  createStatement(repositoryId: string, draft: StatementDraft, sourceCandidateId?: string): CurrentStatement { return this.knowledge.createStatement(repositoryId, draft, sourceCandidateId); }
  getStatement(id: string, repositoryId?: string): CurrentStatement { return this.knowledge.getStatement(id, repositoryId); }
  listStatements(repositoryId: string): CurrentStatement[] { return this.knowledge.listStatements(repositoryId); }
  explainStatement(id: string): { current: CurrentStatement; history: Array<Record<string, unknown>> } { return this.knowledge.explainStatement(id); }
  propose(repositoryId: string, runId: string | undefined, input: CandidateProposal, gitViewId?: string): string { return this.knowledge.propose(repositoryId, runId, input, gitViewId); }
  listCandidates(repositoryId: string, state = "pending"): CandidateRecord[] { return this.knowledge.listCandidates(repositoryId, state); }
  resolveCandidate(id: string, decision: "accept" | "reject" | "defer", actor: ActorRef, note?: string, editedProposal?: CandidateProposal): CurrentStatement | undefined { return this.knowledge.resolveCandidate(id, decision, actor, note, editedProposal); }
  statementAnchors(statementId: string): EvidenceAnchor[] { return this.knowledge.anchors(statementId); }
  ensureReanchorCandidate(repositoryId: string, statementId: string, oldCommit: string, matchedCommit: string, gitViewId: string): string | undefined { return this.knowledge.ensureReanchorCandidate(repositoryId, statementId, oldCommit, matchedCommit, gitViewId); }
  hasContradictoryEvidence(statementId: string): boolean { return this.knowledge.hasContradictoryEvidence(statementId); }
  conflictingStatementIds(repositoryId: string, statementIds: string[]): Set<string> { return this.knowledge.conflictingStatementIds(repositoryId, statementIds); }
  indexDocument(statementId: string): QkvIndexDocument | undefined { return this.knowledge.indexDocument(statementId); }
  listIndexDocuments(repositoryId: string): QkvIndexDocument[] { return this.knowledge.listIndexDocuments(repositoryId); }

  completeRun(repositoryId: string, input: FinishRunRecord & { proposals: CandidateProposal[]; proposalGitViewId?: string }): string[] {
    if (!this.runs.belongsToRepository(input.runId, repositoryId) || !this.runs.isRunning(input.runId)) throw new Error(`Running run ${input.runId} was not found in this repository`);
    const proposals = input.proposals.map((proposal) => this.knowledge.validateProposal(repositoryId, proposal));
    const noDurableLearningReason = input.noDurableLearningReason?.trim();
    const hasLearningDecision = proposals.length > 0 || this.knowledge.hasCandidatesForRun(input.runId) || Boolean(noDurableLearningReason);
    invariant(!this.runs.hasConsequentialEvents(input.runId) || hasLearningDecision, `Consequential run ${input.runId} must include a proposal or noDurableLearningReason explaining why no durable project knowledge was learned`, "missing_learning_decision");
    return this.connection.transaction(() => {
      const candidateIds = proposals.map((proposal) => this.knowledge.propose(repositoryId, input.runId, proposal, input.proposalGitViewId ?? input.endGitViewId));
      this.runs.finish({ ...input, ...(noDurableLearningReason ? { noDurableLearningReason } : {}) });
      return candidateIds;
    });
  }

  searchLexical(repositoryId: string, query: string, limit = 40): Array<{ statement: CurrentStatement; rank: number }> {
    const ids = this.search.lexicalStatementIds(repositoryId, query, limit);
    return ids.map((id, index) => ({ statement: this.knowledge.getStatement(id, repositoryId), rank: index + 1 }));
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
}

export type { RepositoryRegistration } from "./repository-store.js";
