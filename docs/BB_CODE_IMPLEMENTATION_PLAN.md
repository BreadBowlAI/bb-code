# bb-code MVP Implementation Plan

Status: normative implementation source of truth  
Version: 0.1  
Updated: 2026-08-05

The product rationale and longer-term architecture live in
[`BB_CODE_MVP.md`](BB_CODE_MVP.md). Implementers should use this document for
MVP scope, interfaces, data structures, processes, tests, and acceptance.

## Outcome

Build bb-code as a separate Apache-2.0 TypeScript repository and local-first
runtime. It preserves reviewed intents, beliefs, commitments, and supporting
evidence across Codex and Claude Code.

The MVP includes:

- a local SQLite database and CLI;
- Codex and Claude Code plugins using lifecycle hooks;
- an MCP server for retrieval, explanation, proposals, and structured run
  completion;
- local FTS5 retrieval without an account;
- optional proprietary QKV retrieval as a semantic quality upgrade;
- Git-aware applicability across commits, branches, dirty worktrees, merges,
  and rebases;
- human approval before agent-proposed knowledge becomes durable.

It excludes OpenCode, team synchronization, a web dashboard, a master-agent
interface, autonomous acceptance, and hard enforcement.

The MVP succeeds when a commitment accepted during a Codex run is
automatically supplied during a later relevant Claude Code request, and the
developer can identify a consequential mistake or repeated explanation it
prevented.

## Repository and runtime architecture

Create a separate public `bb-code` repository:

```text
bb-code/
  apps/
    cli/                  bb executable, MCP server, adapter entrypoints
  packages/
    core/                 domain, SQLite, Git, retrieval, workflows
    qkv-client/           optional client for the proprietary REST API
  plugins/
    codex/                manifest, hooks, MCP config, bootstrap skill
    claude/               manifest, hooks, MCP config, bootstrap skill
  fixtures/
    codex-hooks/
    claude-hooks/
    git-repositories/
  .agents/plugins/        Codex marketplace
  .claude-plugin/         Claude marketplace
```

Use TypeScript, strict ESM, Node.js 24 or later, pnpm, `node:sqlite`, Zod, the
official MCP TypeScript SDK, ULIDs with readable prefixes, and committed
sequential SQL migrations. Publish bundled JavaScript so the open-source
runtime has no dependency on the proprietary QKV repository.

```text
Codex / Claude Code
  ├── lifecycle hooks ──> host adapter ──> normalized runtime events
  └── MCP tools <────────────────────────> bb-core
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                         SQLite + FTS5              optional QKV REST API
```

Hooks guarantee timing. MCP provides model-driven depth. Host-native JSON ends
at the adapter; transcript files, private state, and undocumented messages are
not bb-code interfaces.

## Public interfaces

### CLI

Publish `@breadbowl/bb-code` with binary `bb`:

```text
bb init
bb integrate codex
bb integrate claude
bb doctor

bb add intent
bb add belief
bb add commitment
bb status
bb context "<request>" [--path <path>] [--json]
bb explain <statement-id> [--json]
bb review [candidate-id]
bb review --accept|--reject|--defer <candidate-id>

bb qkv enable
bb qkv disable
bb qkv status
bb sync

bb mcp serve
bb adapter codex <event>
bb adapter claude <event>
```

`bb add commitment` requires explicit confirmation. Agent-facing interfaces
may only propose commitments.

### MCP tools

Expose exactly four tools:

```ts
bb_context({
  request: string,
  paths?: string[],
  maxItems?: number,
  runId?: string
})

bb_explain({
  statementId: string
})  

bb_propose_update({
  runId: string,
  proposal: CandidateProposal
})

bb_finish_run({
  runId: string,
  outcome: "completed" | "partial" | "blocked" | "failed",
  summary: string,
  verification: Verification[],
  contextEffects: ContextEffect[],
  commitmentReconciliations: CommitmentReconciliation[],
  requestIntent: RequestIntentDecision,
  proposals: CandidateProposal[],
  noDurableLearningReason?: string
})
```

`bb_finish_run` is the reliable end-of-run learning boundary. The active
coding agent submits structured learning using its existing reasoning; bb-code
does not call a second extraction model. Consequential runs must submit at
least one proposal during the run or explicitly explain why no durable
learning was produced.

```ts
type Verification = {
  kind: "test" | "build" | "lint" | "manual" | "none"
  command?: string
  result: "passed" | "failed" | "not_run"
  note?: string
  paths?: string[]
}

type ContextEffect = {
  statementId: string
  effect:
    | "changed_plan"
    | "caused_clarification"
    | "avoided_violation"
    | "changed_verification"
    | "no_effect"
  note?: string
}
```

### Domain types

```ts
type StatementKind = "intent" | "belief" | "commitment"

type Scope =
  | { kind: "repository" }
  | { kind: "path"; prefix: string }

type ActorRef = {
  kind: "human" | "agent" | "repository_document"
  id: string
  label?: string
}

type IntentAttributes = {
  owner: ActorRef
  priority: "low" | "normal" | "high"
  successConditions: string[]
}

type BeliefAttributes = {
  confidence: number
}

type CommitmentAttributes = {
  rationale: string
  authority: ActorRef
  revisitCondition?: string
}
```

Type-specific statuses:

```text
Intent:      active | satisfied | abandoned | superseded
Belief:      active | contradicted | superseded
Commitment:  accepted | superseded | retired
```

“Proposed” is not a statement status. Proposals live in the candidate queue.

```ts
type CandidateOperation =
  | "create"
  | "revise"
  | "confirm"
  | "contradict"
  | "satisfy"
  | "supersede"
  | "retire"

type CandidateProposal = {
  operation: CandidateOperation
  kind?: StatementKind
  targetStatementId?: string
  body?: string
  scope?: Scope
  attributes?: IntentAttributes | BeliefAttributes | CommitmentAttributes
  rationale: string
  evidencePaths?: string[]
  evidenceNotes?: string[]
}
```

Validation:

- `create` requires kind, body, scope, and matching attributes;
- every other operation requires a target statement;
- only beliefs may be contradicted;
- only intents may be satisfied;
- only commitments may be retired;
- supersession may atomically close the target and create a replacement;
- every proposal enters the candidate ledger before repository knowledge mode resolves it; `strict` reviews all, default `standard` auto-accepts intent/belief-only changes, and `yolo` auto-accepts all.

### Normalized runtime protocol

```ts
type RuntimeEvent = {
  schemaVersion: 1
  host: "codex" | "claude"
  event:
    | "session_start"
    | "start_run"
    | "before_tool"
    | "after_tool"
    | "finish_run"
    | "session_end"
  externalSessionId: string
  externalTurnId?: string
  externalToolUseId?: string
  cwd: string
  occurredAt: string
  payload: Record<string, unknown>
}
```

All payload variants are discriminated Zod schemas. The core never imports
Codex or Claude event types.

## SQLite data model

Enable:

```text
journal_mode = WAL
foreign_keys = ON
synchronous = NORMAL
busy_timeout = 5000
```

Use one OS data directory:

```text
macOS:   ~/Library/Application Support/bb-code/bb.db
Linux:  $XDG_DATA_HOME/bb-code/bb.db
Windows: %LOCALAPPDATA%\bb-code\bb.db
```

Commit only `.bb/repo.json`:

```json
{
  "repository_id": "repo_01...",
  "schema_version": 1
}
```

### Repository and Git

```text
repositories
  id PK, created_at, schema_version

repository_locations
  id PK, repository_id FK, canonical_root, git_common_dir,
  first_seen_at, last_seen_at

worktrees
  id PK, repository_location_id FK, canonical_root, git_dir,
  first_seen_at, last_seen_at

git_views
  id PK, repository_id FK, worktree_id FK, head_commit_sha,
  head_tree_sha, dirty_fingerprint, branch_label nullable, observed_at
```

The dirty fingerprint covers staged, unstaged, and untracked path identities
without embedding diff content in the identifier.

### Agent execution

```text
agent_sessions
  id PK, repository_id FK, worktree_id FK, host, external_session_id,
  started_at, ended_at nullable, metadata_json

runs
  id PK, agent_session_id FK, external_turn_id nullable, prompt,
  status, start_git_view_id FK, end_git_view_id nullable, summary nullable,
  verification_json, finish_tool_called, stop_nudge_count,
  no_durable_learning_reason nullable,
  started_at, finished_at nullable

run_events
  id PK, run_id FK, sequence, kind, external_event_id nullable,
  tool_name nullable, outcome nullable, paths_json, input_summary nullable,
  output_excerpt nullable, sanitized_payload_json, occurred_at
```

Host tool events are idempotent by run, phase, and external tool-use ID. This
preserves one before/after pair while suppressing duplicate delivery of the
same phase.

Run status is `running | completed | partial | blocked | failed | abandoned`.

Default capture policy:

- store prompts locally;
- store tool names, paths, exit status, duration, and short sanitized excerpts;
- truncate excerpts to 4 KiB;
- redact obvious secret assignments and authorization headers;
- never parse or store host transcript JSONL;
- never send raw code, tool input, or output excerpts to QKV.

### Knowledge

```text
statements
  id PK, repository_id FK, kind, current_revision_id FK,
  created_by_json, created_at

statement_revisions
  id PK, statement_id FK, revision_number, body, status,
  scope_kind, scope_path nullable, attributes_json,
  source_candidate_id nullable, created_by_json, created_at

evidence
  id PK, repository_id FK, run_id nullable FK, git_view_id nullable FK,
  kind, summary, excerpt nullable, locator_json, content_hash, created_at

evidence_paths
  evidence_id FK, path, blob_sha nullable,
  PRIMARY KEY(evidence_id, path)

revision_evidence
  revision_id FK, evidence_id FK,
  relationship: defines | supports | contradicts,
  created_at,
  PRIMARY KEY(revision_id, evidence_id, relationship)
```

Every durable revision has evidence. Revisions are immutable; changes append a
revision and update `current_revision_id` transactionally.

### Candidates and review

```text
candidate_updates
  id PK, repository_id FK, run_id nullable FK,
  target_statement_id nullable FK, operation, proposal_json, rationale,
  state, created_at, resolved_at nullable, resolved_by_json nullable,
  resolution_note nullable
```

Candidate state is `pending | accepted | edited | rejected | deferred`.

Acceptance behavior:

- `create`: create statement, revision, and evidence links;
- `revise`: append a revision and move the current pointer;
- `confirm`: append supporting evidence without changing the body;
- `contradict`: append a contradicted belief revision;
- `satisfy`: append a satisfied intent revision;
- `retire`: append a retired commitment revision;
- `supersede`: close the target and optionally create its replacement in one
  transaction.

### Retrieval and evaluation

```text
statement_search_documents
  statement_id PK, revision_id, searchable_text, updated_at

statement_fts
  FTS5 virtual table over current searchable documents

retrieval_provider_state
  repository_id, provider, remote_index_id nullable, model nullable,
  model_version nullable, status, last_synced_at nullable

retrieval_jobs
  id PK, repository_id, provider, operation, statement_id,
  revision_id nullable, state, attempts, next_attempt_at,
  last_error nullable

retrievals
  id PK, repository_id, run_id nullable, git_view_id, query,
  paths_json, provider_status_json, rendered_token_count, created_at

retrieval_items
  retrieval_id FK, statement_id FK, revision_id FK, rank,
  lexical_rank nullable, semantic_rank nullable, final_score,
  applicability_reason, freshness,
  PRIMARY KEY(retrieval_id, statement_id)
```

Retrieval job operation is `upsert | delete`; state is
`pending | running | completed | failed`. Context effects link to retrieval
items and remain agent-reported until confirmed during review.

## Processes

### Initialization

`bb init`:

1. Resolve Git root, common directory, worktree, `HEAD`, tree SHA, and dirty
   state.
2. Create or read `.bb/repo.json`.
3. Run migrations and register the local location/worktree.
4. Ask: what are you building, what must remain true, and what must agents not
   decide without asking?
5. Create an active intent and explicitly accepted commitments from the
   answers, each backed by user-statement evidence.
6. Populate FTS5.
7. Detect Codex and Claude Code and print integration commands.
8. Leave QKV disabled unless explicitly enabled.

The bundled `bootstrap` skill asks the host agent to inspect README,
AGENTS.md, CLAUDE.md, ADRs, and architecture documents. Extracted statements
enter the candidate queue; repository documents never become authority
automatically.

### Run start and retrieval

On `UserPromptSubmit`:

1. Translate native input to `start_run`.
2. Reconcile repository, worktree, and Git state.
3. Create or resume the agent session.
4. Create one run for the new request.
5. Filter applicable current statements.
6. Run local FTS5 retrieval.
7. If QKV is enabled, run semantic retrieval with a 1.2-second deadline.
8. Fuse and log candidates, rendering at most 1,200 tokens.
9. Return developer context containing the run ID, cited statements,
   conflicts, and the requirement to call `bb_finish_run`.

Applicability:

- accepted intents and commitments follow repository/path scope across
  branches;
- code-derived beliefs require an evidence commit that is an ancestor of the
  current `HEAD`;
- changed supporting blobs keep a belief visible but stale;
- dirty beliefs apply only to the exact worktree/fingerprint;
- divergent-branch beliefs are excluded unless the request concerns that branch
  or a merge;
- contradicted, superseded, abandoned, satisfied, and retired statements are
  excluded from normal retrieval.

Retrieval settings:

- FTS5 top 40;
- QKV top 40 from `candidate_k=100`;
- reciprocal-rank fusion with `k=60`;
- multipliers: commitment 1.35, intent 1.20, belief 1.00, exact path 1.25,
  parent path 1.10, stale belief 0.60;
- maximum 12 statements and 1,200 rendered tokens;
- conflicts and commitments receive priority;
- every result cites `bb:<statement-id>@<revision-id>` and explains why it
  applies.

### Tool observation

On `PreToolUse`:

- ignore bb-code’s MCP namespace;
- extract candidate paths and reconcile Git state;
- match accepted path-scoped commitments locally;
- add a concise warning for exact matches;
- never hard-block in the MVP;
- never make a remote retrieval request.

On `PostToolUse`:

- ignore bb-code’s MCP tools;
- record sanitized tool metadata;
- reconcile changed paths from Git rather than trusting tool input;
- create compact evidence for file changes, tests, builds, lint, and failures;
- use external tool-use IDs for deduplication;
- never create statements automatically.

### Structured completion

The injected context instructs the agent to call `bb_finish_run` once.

`bb_finish_run` validates the run and repository, records outcome,
verification, context effects, and commitment reconciliations, converts proposals to candidates,
resolves evidence paths against run events and Git, and marks the run as
finish-tool-complete. Injected guidance tells the agent to report material
effects by retrieved statement ID and to treat implementation facts as beliefs
unless explicit future authority makes them commitments. Before create, the
agent checks retrieved context and prefers revision or lifecycle transitions;
the store rejects exact same-kind duplicates. Every commitment retrieved into
the run requires one reconciliation disposition. Revised, superseded, and
retired dispositions require a matching lifecycle proposal; preserved cannot
coexist with an unresolved transition. A pending commitment transition remains
visible with a warning but is removed from hard path enforcement until human
review. In yolo mode the same transition is accepted atomically.

At `Stop`:

- finalize immediately if `bb_finish_run` was called;
- finalize without proposals when no consequential events occurred;
- if consequential events occurred and the tool was omitted, continue the
  agent once with a short reminder;
- if it is omitted again, finalize as partial and do not loop;
- `SessionEnd` marks any remaining run abandoned.

### Policy resolution and human review

Every candidate is resolved by repository knowledge mode. `strict` leaves all
candidates pending, default `standard` automatically accepts intent/belief-only
changes, and `yolo` automatically accepts all candidates. Automatic acceptance
uses the same transaction as manual acceptance and records mode provenance.

`bb review` shows the proposed operation, old/new revision, scope, Git view,
supporting evidence, rationale, confidence, and contradictions. The user can
accept, edit and accept, reject, defer, or explain.

Acceptance is one SQLite transaction, updates FTS immediately, and enqueues a
QKV synchronization job. Remote failure never rolls back local acceptance.

### QKV

`bb qkv configure` stores the QKV endpoint and API key in an owner-only user
configuration shared by CLI, hook, and MCP processes. Environment variables
remain the highest-precedence override. `bb qkv enable` creates one
`text_retention=none` index per repository, persists the service-selected model
and immutable version, and enqueues current active statements. It displays an
explicit disclosure that policy-activated statements and retrieval queries will be
processed by the service. `bb qkv status` reports provider state, runtime
credential readiness, and queue health without exposing the API key.

Index only current statements activated by repository policy. The indexed text contains type,
statement, rationale or success conditions, scope, and a short
evidence summary. Use stable `doc_id = bb:<statement-id>`. Metadata contains
statement ID, revision ID, kind, and status, but no code.

The QKV client uses the server's `documents` array contract and treats partial
ingestion failures returned with HTTP 200 as failed jobs. `bb sync` drains
retryable jobs with exponential backoff and returns an unsuccessful exit when
an attempted job fails. `bb sync --force`
clears failed-job backoff and attempt exhaustion for the current repository,
then attempts each eligible job once; interrupted pending jobs are already
eligible. Hooks never wait for indexing. Search errors, authentication
failures, limits, and timeouts fall back to FTS5 and are logged.

### Git lifecycle

At every run boundary resolve commit, tree, branch label, and dirty
fingerprint. Branch labels are display metadata only. Never depend on Git hooks.

Dirty evidence remains preserved when committed. Compare base-to-dirty and
commit patch identity before proposing a new anchor.

Store commit SHA, tree SHA, parent SHAs, supporting path blob SHAs, and stable
patch ID where available. If a commit becomes unreachable after rebase or
squash, inspect the latest 200 reachable commits for an unambiguous patch-ID
match and create a re-anchor candidate. Never remap silently.

After a merge, newly reachable beliefs become eligible, changed supporting
blobs reduce freshness, contradictory beliefs create a pending contradiction
candidate, and deleting a branch deletes no history.

## Codex and Claude integration

Map these host events:

```text
SessionStart      -> session_start
UserPromptSubmit  -> start_run
PreToolUse        -> before_tool
PostToolUse       -> after_tool
Stop              -> finish_run
SessionEnd        -> session_end
```

Claude-specific failure/batch events normalize into `after_tool` with the
appropriate outcome. Adapter outputs use each host’s documented response
schema for context injection and the one-time stop continuation.

`bb integrate codex` adds the public marketplace and directs the user to
install and trust the plugin through Codex `/plugins`, then start a new
session. `bb integrate claude` adds the marketplace and runs the supported
user-scope plugin installation. Both finish by running `bb doctor` to verify
the CLI, marketplace, plugin, MCP startup, repository identity, and hooks.

## Delivery order

1. Public repository, license, build, migrations, IDs, domain invariants,
   statements, evidence, candidates, and CLI CRUD.
2. Git views, applicability, FTS5, rendering, retrieval logs, and guided init.
3. MCP tools, sessions, runs, tool evidence, structured completion, and review.
4. Codex plugin, hooks, MCP config, bootstrap skill, marketplace, and fixtures.
5. Claude plugin mapped to the same protocol; no host-specific core changes.
6. Optional QKV client, jobs, fusion, deadlines, and fallback.
7. Cross-agent evaluation, documentation, privacy disclosure, npm publishing,
   marketplace distribution, and `0.1.0` release.

## Verification and acceptance

Automated coverage must include:

- all domain transitions and invalid candidate operations;
- transactional review and migration behavior;
- simultaneous Codex/Claude WAL access;
- clean/dirty Git, worktrees, detached HEAD, divergence, merge, reset, rebase,
  squash, deletion, and changed blobs;
- scope, ancestry, freshness, fusion, token budget, conflicts, timeout, and FTS
  fallback;
- golden native hook fixtures for both hosts;
- MCP schemas, invalid run IDs, mismatched candidate types, and exactly one stop
  reminder;
- proof that QKV never receives code, transcripts, or tool output;
- QKV integration against a dedicated tenant;
- macOS, Linux, and Windows CI.

Release acceptance scenarios:

1. Initialize and create an accepted commitment without QKV.
2. Verify automatic Codex run-start injection.
3. Complete through `bb_finish_run` and confirm proposals remain pending.
4. Accept a belief through `bb review`.
5. Verify that Claude Code retrieves the accepted belief.
6. Hide a feature-branch belief from main until merge.
7. Mark the belief stale after a supporting file changes.
8. Enable QKV, use semantic retrieval, remove network access, and fall back to
   FTS immediately.
9. Prove no agent can silently accept a commitment.
10. Keep injected context below 1,200 tokens.
11. Record a real `changed_plan`, `caused_clarification`, or
    `avoided_violation` outcome.
12. Reverse a retrieved commitment and verify standard mode quarantines the
    pending transition while yolo mode atomically advances its lifecycle.

Performance targets:

- local run-start retrieval p95 below 200 ms for 10,000 statements;
- pre-tool hook p95 below 50 ms;
- QKV deadline at 1.2 seconds with local fallback;
- no hook failure prevents the coding agent from continuing;
- SQLite remains consistent under concurrent sessions.

## Fixed MVP assumptions

- Codex and Claude Code are the two supported hosts.
- OpenCode is the next adapter, not part of `0.1.0`.
- State is local and single-developer; only `.bb/repo.json` is committed.
- QKV is optional and disabled by default.
- No separate extraction model or model API key is required.
- Only current statements activated by repository policy are indexed remotely.
- Queries are sent to QKV only after explicit enablement.
- CLI review is the only management UI.
- Pre-tool checks warn but never block.
- Runtime and adapters are Apache-2.0; QKV remains proprietary.
- Team sync, Git export, hosted accounts, orchestration, and a web dashboard are
  post-MVP.
