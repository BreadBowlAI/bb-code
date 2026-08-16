import type { ContextItem } from "../../domain/context.js";
import { createId } from "../../domain/ids.js";
import type { SqliteConnection } from "./connection.js";
import { now, toJson } from "./values.js";

const LEXICAL_STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "a", "an", "are", "as", "at", "be", "by", "can", "could", "did", "do", "does", "how", "i", "in", "is", "it", "of", "on", "or", "please", "should", "to", "we", "what", "when", "where", "which", "who", "why", "would", "you", "your"
]);

export type LexicalMatch = { statementId: string; score: number };

function lexicalTerms(value: string, limit?: number): string[] {
  const terms = [...new Set(value.toLowerCase().match(/[a-z0-9_/-]{2,}/g)?.filter((term) => !LEXICAL_STOP_WORDS.has(term)) ?? [])];
  return limit === undefined ? terms : terms.slice(0, limit);
}

function minimumTermMatches(termCount: number): number {
  if (termCount <= 1) return termCount;
  if (termCount === 2) return 2;
  return Math.min(4, Math.ceil(termCount / 2));
}

function termMatchesDocument(term: string, documentTokens: Set<string>): boolean {
  if (documentTokens.has(term)) return true;
  if (term.length < 4) return false;
  for (const token of documentTokens) if (token.startsWith(term) || term.startsWith(token)) return true;
  return false;
}

export type RetrievalJob = {
  id: string;
  repository_id: string;
  provider: string;
  operation: "upsert" | "delete";
  statement_id: string;
  revision_id: string | null;
  state: string;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
};

export type RetrievalJobSummary = {
  pending: number;
  failed: number;
  completed: number;
  ready: number;
  waiting: number;
  exhausted: number;
  nextRetryAt?: string;
  lastError?: string;
};

export class SearchStore {
  constructor(private readonly connection: SqliteConnection) {}

  indexStatement(statementId: string, revisionId: string, searchableText: string): void {
    const database = this.connection.database;
    database.prepare("DELETE FROM statement_fts WHERE statement_id=?").run(statementId);
    database.prepare("INSERT OR REPLACE INTO statement_search_documents VALUES(?,?,?,?)").run(statementId, revisionId, searchableText, now());
    database.prepare("INSERT INTO statement_fts VALUES(?,?,?)").run(statementId, revisionId, searchableText);
  }

  removeStatementIndex(statementId: string): void {
    const database = this.connection.database;
    database.prepare("DELETE FROM statement_fts WHERE statement_id=?").run(statementId);
    database.prepare("DELETE FROM statement_search_documents WHERE statement_id=?").run(statementId);
  }

  hasIndexedStatement(statementId: string): boolean {
    return Boolean(this.connection.database.prepare("SELECT 1 FROM statement_search_documents WHERE statement_id=?").get(statementId));
  }

  enqueueStatement(repositoryId: string, statementId: string, revisionId: string | undefined, operation: "upsert" | "delete" = "upsert"): void {
    const database = this.connection.database;
    database.prepare("DELETE FROM retrieval_jobs WHERE repository_id=? AND provider='qkv' AND statement_id=?").run(repositoryId, statementId);
    database.prepare("INSERT INTO retrieval_jobs(id,repository_id,provider,operation,statement_id,revision_id,state,attempts,next_attempt_at,last_error) VALUES(?,?,?,?,?,?,?,0,NULL,NULL)").run(createId("job"), repositoryId, "qkv", operation, statementId, revisionId ?? null, "pending");
  }

  lexicalMatches(repositoryId: string, query: string, limit = 40): LexicalMatch[] {
    const exactIds = [...query.matchAll(/(?:bb:)?((?:int|bel|com)_[0-9A-Za-z_-]+)/g)].map((match) => match[1]!).slice(0, limit);
    const terms = lexicalTerms(query, 16);
    const matches: LexicalMatch[] = [];
    for (const id of exactIds) {
      const exists = this.connection.database.prepare("SELECT 1 FROM statements WHERE id=? AND repository_id=?").get(id, repositoryId);
      if (exists && !matches.some((match) => match.statementId === id)) matches.push({ statementId: id, score: 1 });
    }
    if (terms.length === 0 || matches.length >= limit) return matches;
    const ftsMatch = terms.map((term) => `"${term.replaceAll('"', '""')}"${term.length >= 4 ? "*" : ""}`).join(" OR ");
    const rows = this.connection.database.prepare(`SELECT f.statement_id,d.searchable_text,bm25(statement_fts) AS bm25_score
      FROM statement_fts f JOIN statements s ON s.id=f.statement_id JOIN statement_search_documents d ON d.statement_id=f.statement_id
      WHERE statement_fts MATCH ? AND s.repository_id=? ORDER BY bm25(statement_fts) LIMIT ?`).all(ftsMatch, repositoryId, Math.max(limit * 4, 40)) as Array<{ statement_id: string; searchable_text: string; bm25_score: number }>;
    const required = minimumTermMatches(terms.length);
    const scored = rows.flatMap((row) => {
      const documentTokens = new Set(lexicalTerms(row.searchable_text));
      const matched = terms.filter((term) => termMatchesDocument(term, documentTokens)).length;
      const exactPathMatch = terms.some((term) => term.includes("/") && documentTokens.has(term));
      if (matched < required && !exactPathMatch) return [];
      const coverage = matched / terms.length;
      const bm25TieBreaker = 1 / (1 + Math.abs(row.bm25_score));
      return [{ statementId: row.statement_id, score: exactPathMatch ? Math.max(0.95, coverage) : Math.min(1, coverage * 0.9 + bm25TieBreaker * 0.1) }];
    }).sort((left, right) => right.score - left.score);
    for (const match of scored) if (!matches.some((item) => item.statementId === match.statementId)) matches.push(match);
    return matches.slice(0, limit);
  }

  lexicalStatementIds(repositoryId: string, query: string, limit = 40): string[] {
    return this.lexicalMatches(repositoryId, query, limit).map((match) => match.statementId);
  }

  logRetrieval(input: { repositoryId: string; runId?: string; gitViewId: string; query: string; paths: string[]; providerStatus: unknown; renderedTokenCount: number; items: ContextItem[] }): string {
    const database = this.connection.database;
    const id = createId("ret");
    database.prepare("INSERT INTO retrievals VALUES(?,?,?,?,?,?,?,?,?)").run(id, input.repositoryId, input.runId ?? null, input.gitViewId, input.query, toJson(input.paths), toJson(input.providerStatus), input.renderedTokenCount, now());
    for (const item of input.items) database.prepare(`INSERT INTO retrieval_items(
      retrieval_id,statement_id,revision_id,rank,lexical_rank,semantic_rank,final_score,applicability_reason,freshness,lexical_score,semantic_score
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, item.id, item.revisionId, item.rank, item.lexicalRank ?? null, item.semanticRank ?? null, item.finalScore, item.applicabilityReason, item.freshness, item.lexicalScore ?? null, item.semanticScore ?? null);
    return id;
  }

  getProviderState(repositoryId: string, provider: string): Record<string, unknown> | undefined {
    return this.connection.database.prepare("SELECT * FROM retrieval_provider_state WHERE repository_id=? AND provider=?").get(repositoryId, provider) as Record<string, unknown> | undefined;
  }

  setProviderState(repositoryId: string, provider: string, state: { remoteIndexId?: string; model?: string; modelVersion?: string; status: string; lastSyncedAt?: string }): void {
    this.connection.database.prepare("INSERT INTO retrieval_provider_state VALUES(?,?,?,?,?,?,?) ON CONFLICT(repository_id,provider) DO UPDATE SET remote_index_id=COALESCE(excluded.remote_index_id,retrieval_provider_state.remote_index_id),model=COALESCE(excluded.model,retrieval_provider_state.model),model_version=COALESCE(excluded.model_version,retrieval_provider_state.model_version),status=excluded.status,last_synced_at=COALESCE(excluded.last_synced_at,retrieval_provider_state.last_synced_at)").run(repositoryId, provider, state.remoteIndexId ?? null, state.model ?? null, state.modelVersion ?? null, state.status, state.lastSyncedAt ?? null);
  }

  pendingJobs(repositoryId: string): RetrievalJob[] {
    return this.connection.database.prepare("SELECT * FROM retrieval_jobs WHERE repository_id=? AND state IN ('pending','failed') AND attempts < 8 AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY rowid").all(repositoryId, now()) as RetrievalJob[];
  }

  resetFailedJobsForRetry(repositoryId: string, provider: string): number {
    const result = this.connection.database.prepare("UPDATE retrieval_jobs SET attempts=0,next_attempt_at=NULL WHERE repository_id=? AND provider=? AND state='failed'").run(repositoryId, provider);
    return Number(result.changes);
  }

  jobSummary(repositoryId: string, provider: string): RetrievalJobSummary {
    const rows = this.connection.database.prepare("SELECT * FROM retrieval_jobs WHERE repository_id=? AND provider=? ORDER BY rowid").all(repositoryId, provider) as RetrievalJob[];
    const timestamp = now();
    const retryTimes = rows.flatMap((job) => job.state === "failed" && job.attempts < 8 && job.next_attempt_at && job.next_attempt_at > timestamp ? [job.next_attempt_at] : []);
    const lastError = [...rows].reverse().find((job) => job.last_error)?.last_error ?? undefined;
    return {
      pending: rows.filter((job) => job.state === "pending").length,
      failed: rows.filter((job) => job.state === "failed").length,
      completed: rows.filter((job) => job.state === "completed").length,
      ready: rows.filter((job) => (job.state === "pending" || job.state === "failed") && job.attempts < 8 && (!job.next_attempt_at || job.next_attempt_at <= timestamp)).length,
      waiting: retryTimes.length,
      exhausted: rows.filter((job) => job.state === "failed" && job.attempts >= 8).length,
      ...(retryTimes.length ? { nextRetryAt: retryTimes.sort()[0] } : {}),
      ...(lastError ? { lastError } : {})
    };
  }

  completeJob(id: string, error?: string): void {
    const database = this.connection.database;
    if (!error) {
      database.prepare("UPDATE retrieval_jobs SET state='completed',attempts=attempts+1,last_error=NULL,next_attempt_at=NULL WHERE id=?").run(id);
      return;
    }
    const row = database.prepare("SELECT attempts FROM retrieval_jobs WHERE id=?").get(id) as { attempts: number } | undefined;
    const attempts = (row?.attempts ?? 0) + 1;
    const delayMilliseconds = Math.min(60 * 60 * 1000, 1_000 * 2 ** Math.min(attempts - 1, 12));
    database.prepare("UPDATE retrieval_jobs SET state='failed',attempts=?,last_error=?,next_attempt_at=? WHERE id=?").run(attempts, error.slice(0, 1000), new Date(Date.now() + delayMilliseconds).toISOString(), id);
  }
}
