import type { ContextItem } from "../../domain/context.js";
import { createId } from "../../domain/ids.js";
import type { SqliteConnection } from "./connection.js";
import { now, toJson } from "./values.js";

export class SearchStore {
  constructor(private readonly connection: SqliteConnection) {}

  indexStatement(statementId: string, revisionId: string, searchableText: string): void {
    const database = this.connection.database;
    database.prepare("DELETE FROM statement_fts WHERE statement_id=?").run(statementId);
    database.prepare("INSERT OR REPLACE INTO statement_search_documents VALUES(?,?,?,?)").run(statementId, revisionId, searchableText, now());
    database.prepare("INSERT INTO statement_fts VALUES(?,?,?)").run(statementId, revisionId, searchableText);
  }

  enqueueStatement(repositoryId: string, statementId: string, revisionId: string): void {
    this.connection.database.prepare("INSERT OR IGNORE INTO retrieval_jobs(id,repository_id,provider,operation,statement_id,revision_id,state,attempts) VALUES(?,?,?,?,?,?,?,0)").run(createId("job"), repositoryId, "qkv", "upsert", statementId, revisionId, "pending");
  }

  lexicalStatementIds(query: string, limit = 40): string[] {
    const terms = query.toLowerCase().match(/[a-z0-9_/-]{2,}/g)?.slice(0, 12) ?? [];
    if (terms.length === 0) return [];
    const match = terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
    const rows = this.connection.database.prepare("SELECT statement_id FROM statement_fts WHERE statement_fts MATCH ? ORDER BY bm25(statement_fts) LIMIT ?").all(match, limit) as Array<{ statement_id: string }>;
    return rows.map((row) => row.statement_id);
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
    this.connection.database.prepare("INSERT INTO retrieval_provider_state VALUES(?,?,?,?,?,?,?) ON CONFLICT(repository_id,provider) DO UPDATE SET remote_index_id=excluded.remote_index_id,model=excluded.model,model_version=excluded.model_version,status=excluded.status,last_synced_at=excluded.last_synced_at").run(repositoryId, provider, state.remoteIndexId ?? null, state.model ?? null, state.modelVersion ?? null, state.status, state.lastSyncedAt ?? null);
  }

  pendingJobs(repositoryId: string): Array<Record<string, unknown>> {
    return this.connection.database.prepare("SELECT * FROM retrieval_jobs WHERE repository_id=? AND state IN ('pending','failed') ORDER BY rowid").all(repositoryId) as Array<Record<string, unknown>>;
  }

  completeJob(id: string, error?: string): void {
    this.connection.database.prepare("UPDATE retrieval_jobs SET state=?,attempts=attempts+1,last_error=? WHERE id=?").run(error ? "failed" : "completed", error ?? null, id);
  }
}
