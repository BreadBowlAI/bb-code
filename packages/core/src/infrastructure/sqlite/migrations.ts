import type { DatabaseSync } from "node:sqlite";

const VERSION_1 = `
  CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS repositories(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, schema_version INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS repository_locations(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), canonical_root TEXT NOT NULL UNIQUE, git_common_dir TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS worktrees(id TEXT PRIMARY KEY, repository_location_id TEXT NOT NULL REFERENCES repository_locations(id), canonical_root TEXT NOT NULL UNIQUE, git_dir TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS git_views(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), worktree_id TEXT NOT NULL REFERENCES worktrees(id), head_commit_sha TEXT NOT NULL, head_tree_sha TEXT NOT NULL, dirty_fingerprint TEXT NOT NULL, branch_label TEXT, observed_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS agent_sessions(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), worktree_id TEXT NOT NULL REFERENCES worktrees(id), host TEXT NOT NULL, external_session_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, metadata_json TEXT NOT NULL, UNIQUE(host, external_session_id, worktree_id));
  CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, agent_session_id TEXT NOT NULL REFERENCES agent_sessions(id), external_turn_id TEXT, prompt TEXT NOT NULL, status TEXT NOT NULL, start_git_view_id TEXT NOT NULL REFERENCES git_views(id), end_git_view_id TEXT REFERENCES git_views(id), summary TEXT, verification_json TEXT NOT NULL DEFAULT '[]', finish_tool_called INTEGER NOT NULL DEFAULT 0, stop_nudge_count INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT);
  CREATE TABLE IF NOT EXISTS run_events(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), sequence INTEGER NOT NULL, kind TEXT NOT NULL, external_event_id TEXT, tool_name TEXT, outcome TEXT, paths_json TEXT NOT NULL, input_summary TEXT, output_excerpt TEXT, sanitized_payload_json TEXT NOT NULL, occurred_at TEXT NOT NULL, UNIQUE(run_id, sequence));
  CREATE TABLE IF NOT EXISTS statements(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), kind TEXT NOT NULL, current_revision_id TEXT, created_by_json TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS statement_revisions(id TEXT PRIMARY KEY, statement_id TEXT NOT NULL REFERENCES statements(id), revision_number INTEGER NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, scope_kind TEXT NOT NULL, scope_path TEXT, attributes_json TEXT NOT NULL, source_candidate_id TEXT, created_by_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(statement_id, revision_number));
  CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), run_id TEXT REFERENCES runs(id), git_view_id TEXT REFERENCES git_views(id), kind TEXT NOT NULL, summary TEXT NOT NULL, excerpt TEXT, locator_json TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS evidence_paths(evidence_id TEXT NOT NULL REFERENCES evidence(id), path TEXT NOT NULL, blob_sha TEXT, PRIMARY KEY(evidence_id, path));
  CREATE TABLE IF NOT EXISTS revision_evidence(revision_id TEXT NOT NULL REFERENCES statement_revisions(id), evidence_id TEXT NOT NULL REFERENCES evidence(id), relationship TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(revision_id, evidence_id, relationship));
  CREATE TABLE IF NOT EXISTS candidate_updates(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), run_id TEXT REFERENCES runs(id), target_statement_id TEXT REFERENCES statements(id), operation TEXT NOT NULL, proposal_json TEXT NOT NULL, rationale TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT, resolved_by_json TEXT, resolution_note TEXT);
  CREATE TABLE IF NOT EXISTS statement_search_documents(statement_id TEXT PRIMARY KEY REFERENCES statements(id), revision_id TEXT NOT NULL REFERENCES statement_revisions(id), searchable_text TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE VIRTUAL TABLE IF NOT EXISTS statement_fts USING fts5(statement_id UNINDEXED, revision_id UNINDEXED, searchable_text);
  CREATE TABLE IF NOT EXISTS retrieval_provider_state(repository_id TEXT NOT NULL REFERENCES repositories(id), provider TEXT NOT NULL, remote_index_id TEXT, model TEXT, model_version TEXT, status TEXT NOT NULL, last_synced_at TEXT, PRIMARY KEY(repository_id, provider));
  CREATE TABLE IF NOT EXISTS retrieval_jobs(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), provider TEXT NOT NULL, operation TEXT NOT NULL, statement_id TEXT NOT NULL REFERENCES statements(id), revision_id TEXT REFERENCES statement_revisions(id), state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_error TEXT, UNIQUE(provider, operation, statement_id, revision_id));
  CREATE TABLE IF NOT EXISTS retrievals(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), run_id TEXT REFERENCES runs(id), git_view_id TEXT NOT NULL REFERENCES git_views(id), query TEXT NOT NULL, paths_json TEXT NOT NULL, provider_status_json TEXT NOT NULL, rendered_token_count INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS retrieval_items(retrieval_id TEXT NOT NULL REFERENCES retrievals(id), statement_id TEXT NOT NULL REFERENCES statements(id), revision_id TEXT NOT NULL REFERENCES statement_revisions(id), rank INTEGER NOT NULL, lexical_rank INTEGER, semantic_rank INTEGER, final_score REAL NOT NULL, applicability_reason TEXT NOT NULL, freshness TEXT NOT NULL, PRIMARY KEY(retrieval_id, statement_id));
  CREATE TABLE IF NOT EXISTS context_effects(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), statement_id TEXT NOT NULL REFERENCES statements(id), effect TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL);
  INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, datetime('now'));
`;

const VERSION_2 = `
  ALTER TABLE git_views ADD COLUMN parent_shas_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE git_views ADD COLUMN stable_patch_id TEXT;
  ALTER TABLE git_views ADD COLUMN changed_paths_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE run_events ADD COLUMN git_view_id TEXT REFERENCES git_views(id);
  ALTER TABLE run_events ADD COLUMN consequential INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE candidate_updates ADD COLUMN accepted_proposal_json TEXT;
  ALTER TABLE candidate_updates ADD COLUMN created_git_view_id TEXT REFERENCES git_views(id);
  ALTER TABLE context_effects ADD COLUMN retrieval_id TEXT REFERENCES retrievals(id);
  CREATE TABLE candidate_evidence(
    candidate_id TEXT NOT NULL REFERENCES candidate_updates(id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL REFERENCES evidence(id),
    PRIMARY KEY(candidate_id, evidence_id)
  );
  CREATE UNIQUE INDEX run_events_external_event
    ON run_events(run_id, external_event_id)
    WHERE external_event_id IS NOT NULL;
  CREATE INDEX statements_repository_kind ON statements(repository_id, kind);
  CREATE INDEX evidence_run ON evidence(run_id);
  CREATE INDEX evidence_git_view ON evidence(git_view_id);
  CREATE INDEX retrievals_repository_created ON retrievals(repository_id, created_at DESC);
  CREATE INDEX retrieval_jobs_ready ON retrieval_jobs(repository_id, provider, state, next_attempt_at);
  CREATE INDEX git_views_repository_commit ON git_views(repository_id, head_commit_sha);
  INSERT INTO schema_migrations(version, applied_at) VALUES(2, datetime('now'));
`;

const VERSION_3 = `
  DROP INDEX run_events_external_event;
  CREATE UNIQUE INDEX run_events_external_event
    ON run_events(run_id, kind, external_event_id)
    WHERE external_event_id IS NOT NULL;
  ALTER TABLE runs ADD COLUMN no_durable_learning_reason TEXT;
  INSERT INTO schema_migrations(version, applied_at) VALUES(3, datetime('now'));
`;

const VERSION_4 = `
  DELETE FROM revision_evidence
  WHERE relationship = 'supports'
    AND EXISTS (
      SELECT 1
      FROM revision_evidence AS defining
      WHERE defining.revision_id = revision_evidence.revision_id
        AND defining.evidence_id = revision_evidence.evidence_id
        AND defining.relationship = 'defines'
    );
  INSERT INTO schema_migrations(version, applied_at) VALUES(4, datetime('now'));
`;

const VERSION_5 = `
  ALTER TABLE runs ADD COLUMN request_intent_json TEXT;
  ALTER TABLE retrieval_items ADD COLUMN lexical_score REAL;
  ALTER TABLE retrieval_items ADD COLUMN semantic_score REAL;
  DELETE FROM statement_fts;
  DELETE FROM statement_search_documents;
  INSERT INTO statement_search_documents(statement_id,revision_id,searchable_text,updated_at)
    SELECT s.id,r.id,s.id || ' ' || r.body || ' ' || CASE WHEN r.scope_kind='path' THEN r.scope_path ELSE 'repository' END,datetime('now')
    FROM statements s JOIN statement_revisions r ON r.id=s.current_revision_id
    WHERE r.status IN ('active','accepted');
  INSERT INTO statement_fts(statement_id,revision_id,searchable_text)
    SELECT statement_id,revision_id,searchable_text FROM statement_search_documents;
  INSERT INTO schema_migrations(version, applied_at) VALUES(5, datetime('now'));
`;

const VERSION_6 = `
  ALTER TABLE repositories ADD COLUMN knowledge_mode TEXT NOT NULL DEFAULT 'standard' CHECK(knowledge_mode IN ('strict','standard','yolo'));
  ALTER TABLE repositories ADD COLUMN knowledge_mode_updated_at TEXT;
  ALTER TABLE repositories ADD COLUMN knowledge_mode_updated_by_json TEXT;
  UPDATE repositories
    SET knowledge_mode_updated_at=datetime('now'),
        knowledge_mode_updated_by_json='{"kind":"repository_document","id":"docs/PRODUCT_DECISIONS.md","label":"bb-code default policy"}'
    WHERE knowledge_mode_updated_at IS NULL;
  INSERT INTO schema_migrations(version, applied_at) VALUES(6, datetime('now'));
`;

const VERSION_7 = `
  ALTER TABLE runs ADD COLUMN completion_reason TEXT CHECK(completion_reason IN ('reported','missing_finish','session_ended'));
  UPDATE runs SET completion_reason=CASE
    WHEN finish_tool_called=1 THEN 'reported'
    WHEN status='abandoned' THEN 'session_ended'
    WHEN status!='running' THEN 'missing_finish'
    ELSE NULL
  END;
  INSERT INTO schema_migrations(version, applied_at) VALUES(7, datetime('now'));
`;

const MIGRATIONS = [
  { version: 2, sql: VERSION_2 },
  { version: 3, sql: VERSION_3 },
  { version: 4, sql: VERSION_4 },
  { version: 5, sql: VERSION_5 },
  { version: 6, sql: VERSION_6 },
  { version: 7, sql: VERSION_7 }
] as const;

export function migrate(database: DatabaseSync): void {
  database.exec(VERSION_1);
  const applied = new Set(
    (database.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((row) => row.version)
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
