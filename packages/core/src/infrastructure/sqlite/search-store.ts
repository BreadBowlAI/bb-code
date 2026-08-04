import type { ContextItem } from "../../domain/context.js";
import { createId } from "../../domain/ids.js";
import type { SqliteConnection } from "./connection.js";
import { now, toJson } from "./values.js";

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

  enqueueStatement(repositoryId: string, statementId: string, revisionId: string | undefined, operation: "upsert" | "delete" = "upsert"): void {
    const database = this.connection.database;
    database.prepare("DELETE FROM retrieval_jobs WHERE repository_id=? AND provider='qkv' AND statement_id=?").run(repositoryId, statementId);
    database.prepare("INSERT INTO retrieval_jobs(id,repository_id,provider,operation,statement_id,revision_id,state,attempts,next_attempt_at,last_error) VALUES(?,?,?,?,?,?,?,0,NULL,NULL)").run(createId("job"), repositoryId, "qkv", operation, statementId, revisionId ?? null, "pending");
  }

  lexicalStatementIds(repositoryId: string, query: string, limit = 40): string[] {
    const exactIds = [...query.matchAll(/(?:bb:)?((?:int|bel|com)_[0-9A-Za-z_-]+)/g)].map((match) => match[1]!).slice(0, limit);
    const terms = query.toLowerCase().match(/[a-z0-9_/-]{2,}/g)?.filter((term) => !["the", "and", "for", "with", "from", "this", "that"].includes(term)).slice(0, 16) ?? [];
    const ids: string[] = [];
    for (const id of exactIds) {
      const exists = this.connection.database.prepare("SELECT 1 FROM statements WHERE id=? AND repository_id=?").get(id, repositoryId);
      if (exists && !ids.includes(id)) ids.push(id);
    }
    if (terms.length === 0 || ids.length >= limit) return ids;
    const match = terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
    const rows = this.connection.database.prepare("SELECT f.statement_id FROM statement_fts f JOIN statements s ON s.id=f.statement_id WHERE statement_fts MATCH ? AND s.repository_id=? ORDER BY bm25(statement_fts) LIMIT ?").all(match, repositoryId, limit) as Array<{ statement_id: string }>;
    for (const row of rows) if (!ids.includes(row.statement_id)) ids.push(row.statement_id);
    return ids.slice(0, limit);
  }

  logRetrieval(input: { repositoryId: string; runId?: string; gitViewId: string; query: string; paths: string[]; providerStatus: unknown; renderedTokenCount: number; items: ContextItem[] }): string {
    const database = this.connection.database;
    const id = createId("ret");
    database.prepare("INSERT INTO retrievals VALUES(?,?,?,?,?,?,?,?,?)").run(id, input.repositoryId, input.runId ?? null, input.gitViewId, input.query, toJson(input.paths), toJson(input.providerStatus), input.renderedTokenCount, now());
    for (const item of input.items) database.prepare("INSERT INTO retrieval_items VALUES(?,?,?,?,?,?,?,?,?)").run(id, item.id, item.revisionId, item.rank, item.lexicalRank ?? null, item.semanticRank ?? null, item.finalScore, item.applicabilityReason, item.freshness);
    return id;
  }

  getProviderState(repositoryId: string, provider: string): Record<string, unknown> | undefined {
    return this.connection.database.prepare("SELECT * FROM retrieval_provider_state WHERE repository_id=? AND provider=?").get(repositoryId, provider) as Record<string, unknown> | undefined;
  }

  setProviderState(repositoryId: string, provider: string, state: { remoteIndexId?: string; model?: string; modelVersion?: string; status: string; lastSyncedAt?: string }): void {
    this.connection.database.prepare("INSERT INTO retrieval_provider_state VALUES(?,?,?,?,?,?,?) ON CONFLICT(repository_id,provider) DO UPDATE SET remote_index_id=excluded.remote_index_id,model=COALESCE(excluded.model,retrieval_provider_state.model),model_version=COALESCE(excluded.model_version,retrieval_provider_state.model_version),status=excluded.status,last_synced_at=excluded.last_synced_at").run(repositoryId, provider, state.remoteIndexId ?? null, state.model ?? null, state.modelVersion ?? null, state.status, state.lastSyncedAt ?? null);
  }

  pendingJobs(repositoryId: string): RetrievalJob[] {
    return this.connection.database.prepare("SELECT * FROM retrieval_jobs WHERE repository_id=? AND state IN ('pending','failed') AND attempts < 8 AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY rowid").all(repositoryId, now()) as RetrievalJob[];
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
