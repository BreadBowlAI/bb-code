# Data model

Only `.bb/repo.json` is committed. It contains a stable repository ID and schema version. All developer-specific state lives in the operating system's bb-code data directory in `bb.db`.

The schema has five groups:

- Repository identity: `repositories`, `repository_locations`, `worktrees`, and `git_views`.
- Agent execution: `agent_sessions`, `runs`, and ordered `run_events`.
- Knowledge: `statements`, immutable `statement_revisions`, `evidence`, evidence paths, and revision/evidence links.
- Governance: `candidate_updates`, whose state is pending, accepted, edited, rejected, or deferred.
- Retrieval and evaluation: current search documents, FTS5, provider state/jobs, logged retrievals/items, and context effects.

Every statement has a kind-specific status and attributes. “Proposed” is never a statement status because proposals are separate records. `current_revision_id` is the only mutable knowledge pointer. Accepting a candidate appends a revision and advances that pointer in one transaction.

Migration v2 is additive: Git views gain parents, stable patch IDs, and changed paths; run events gain Git linkage, external-event deduplication, and consequential classification; candidates preserve a separate accepted edit and link evidence; context effects link to the retrieval that actually supplied the statement. Repository-scoped indexes keep search and job hydration isolated.

Migration v3 makes external tool-event identity phase-aware: one `before_tool` and one `after_tool` row may share a host tool-use ID, while duplicate delivery of either phase is still idempotent. Runs also store an optional `no_durable_learning_reason`, making the agent's explicit decision auditable when consequential work produces no proposals.

SQLite uses WAL, foreign keys, normal synchronous mode, and a five-second busy timeout. IDs are ULIDs with readable prefixes such as `repo_`, `run_`, `bel_`, and `com_`.
