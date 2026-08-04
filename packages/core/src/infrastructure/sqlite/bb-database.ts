import type { ContextItem } from "../../domain/context.js";
import type { ActorRef, CandidateProposal, CurrentStatement, StatementDraft } from "../../domain/knowledge.js";
import { KnowledgeStore } from "./knowledge-store.js";
import { RepositoryStore, type RepositoryRegistration } from "./repository-store.js";
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

  startSession(input: Parameters<RunStore["startSession"]>[0]): string { return this.runs.startSession(input); }
  endSession(host: string, externalSessionId: string): void { this.runs.endSession(host, externalSessionId); }
  startRun(input: Parameters<RunStore["startRun"]>[0]): string { return this.runs.startRun(input); }
  latestRunningRun(host: string, externalSessionId: string): string | undefined { return this.runs.latestRunningRun(host, externalSessionId); }
  addRunEvent(runId: string, event: RunEventInput): void { this.runs.addEvent(runId, event); }
  finishRun(input: FinishRunRecord): void { this.runs.finish(input); }
  handleStop(runId: string): "none" | "nudge" | "finalized" { return this.runs.handleStop(runId); }

  createStatement(repositoryId: string, draft: StatementDraft, sourceCandidateId?: string): CurrentStatement { return this.knowledge.createStatement(repositoryId, draft, sourceCandidateId); }
  getStatement(id: string): CurrentStatement { return this.knowledge.getStatement(id); }
  listStatements(repositoryId: string): CurrentStatement[] { return this.knowledge.listStatements(repositoryId); }
  explainStatement(id: string): { current: CurrentStatement; history: Array<Record<string, unknown>> } { return this.knowledge.explainStatement(id); }
  propose(repositoryId: string, runId: string | undefined, input: CandidateProposal): string { return this.knowledge.propose(repositoryId, runId, input); }
  listCandidates(repositoryId: string, state = "pending"): Array<{ id: string; proposal: CandidateProposal; state: string; createdAt: string }> { return this.knowledge.listCandidates(repositoryId, state); }
  resolveCandidate(id: string, decision: "accept" | "reject" | "defer", actor: ActorRef, note?: string): CurrentStatement | undefined { return this.knowledge.resolveCandidate(id, decision, actor, note); }

  searchLexical(repositoryId: string, query: string, limit = 40): Array<{ statement: CurrentStatement; rank: number }> {
    const ids = this.search.lexicalStatementIds(query, limit);
    if (ids.length === 0) return this.knowledge.listStatements(repositoryId).slice(0, limit).map((statement, index) => ({ statement, rank: index + 1 }));
    return ids.map((id, index) => ({ statement: this.knowledge.getStatement(id), rank: index + 1 }));
  }

  logRetrieval(input: { repositoryId: string; runId?: string; gitViewId: string; query: string; paths: string[]; providerStatus: unknown; renderedTokenCount: number; items: ContextItem[] }): string { return this.search.logRetrieval(input); }
  getProviderState(repositoryId: string, provider: string): Record<string, unknown> | undefined { return this.search.getProviderState(repositoryId, provider); }
  setProviderState(repositoryId: string, provider: string, state: Parameters<SearchStore["setProviderState"]>[2]): void { this.search.setProviderState(repositoryId, provider, state); }
  pendingRetrievalJobs(repositoryId: string): Array<Record<string, unknown>> { return this.search.pendingJobs(repositoryId); }
  completeRetrievalJob(id: string, error?: string): void { this.search.completeJob(id, error); }
}

export type { RepositoryRegistration } from "./repository-store.js";
