# bb-code MVP implementation plan

This document is the implementation contract for `0.1.0`. The checked-in code is authoritative when behavior and prose differ.

## Product position

bb-code is not another coding agent and does not orchestrate one. Codex and Claude Code remain responsible for planning, tool use, edits, and verification. bb-code is a standalone continuity runtime beside them. Lifecycle hooks tell it when work begins and ends; MCP lets the active agent retrieve and submit structured information.

The open-source runtime owns durable data, Git applicability, local retrieval, review, and integrations. QKV is an optional proprietary candidate generator. This gives users a useful local product with a clean upgrade path and avoids a fork of any agent host.

## Repository layout

```text
apps/cli/src/commands/               human CLI command groups
apps/cli/src/adapters/               Codex/Claude hook translation
apps/cli/src/mcp/                    four-tool MCP delivery surface
packages/core/src/domain/            stable concepts and validation
packages/core/src/application/       use-case workflows
packages/core/src/ports/             replaceable capability contracts
packages/core/src/infrastructure/    Git, filesystem, and focused SQLite stores
packages/core/tests/                 unit, integration, and support fixtures
packages/qkv-client/                 optional remote semantic provider
plugins/bb-code/          Codex plugin
plugins/claude/bb-code/   Claude Code plugin
.agents/plugins/          Codex local marketplace
.claude-plugin/           Claude Code marketplace
docs/                     architecture, schema, privacy, plan
```

## Public CLI

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
bb review --accept|--edit|--reject|--defer|--explain <candidate-id>

bb qkv enable|disable|status
bb sync

bb mcp serve
bb adapter codex <event>
bb adapter claude <event>
```

Direct commitment creation requires explicit confirmation. Agent-facing interfaces can only propose a commitment.

## MCP contract

Expose exactly four tools:

```ts
bb_context({ request: string, paths?: string[], maxItems?: number })
bb_explain({ statementId: string })
bb_propose_update({ runId: string, proposal: CandidateProposal })
bb_finish_run({
  runId: string,
  outcome: "completed" | "partial" | "blocked" | "failed",
  summary: string,
  verification: Verification[],
  contextEffects: ContextEffect[],
  proposals: CandidateProposal[],
  noDurableLearningReason?: string
})
```

`bb_finish_run` is the end-of-run learning boundary. The coding agent submits structured learning using reasoning it already performed. A consequential run must have at least one proposal submitted during the run or provide a non-empty `noDurableLearningReason`. bb-code does not invoke a second extraction model.

## Domain

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
```

Intents are `active | satisfied | abandoned | superseded`. Beliefs are `active | contradicted | superseded`. Commitments are `accepted | superseded | retired`. Proposed is not a status; proposals live in the candidate queue.

Candidate operations are `create | revise | confirm | contradict | satisfy | supersede | retire`. Create requires a kind, body, scope, and matching attributes. Other operations require a target. Only beliefs may be contradicted, only intents satisfied, and only commitments retired. No proposal becomes durable without review.

## Runtime protocol

Adapters emit one host-independent envelope:

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

The core never imports native event types. Adapters ignore bb-code's own MCP namespace to prevent feedback loops. They emit protocol JSON on stdout, diagnostics on stderr, and fail open.

## Persistent schema

SQLite enables WAL, foreign keys, normal synchronous mode, and a five-second busy timeout.

```text
repositories
repository_locations(repository_id, canonical_root, git_common_dir)
worktrees(repository_location_id, canonical_root, git_dir)
git_views(repository_id, worktree_id, commit, tree, parents, patch_id, dirty_fingerprint, changed_paths, branch)

agent_sessions(repository_id, worktree_id, host, external_session_id)
runs(session, prompt, status, start_view, end_view, verification, finish_called, no_durable_learning_reason)
run_events(run, sequence, kind, external_event_id, git_view, consequential, tool, outcome, paths, sanitized_payload)

statements(repository_id, kind, current_revision_id, created_by)
statement_revisions(statement_id, number, body, status, scope, attributes)
evidence(repository_id, run_id, git_view_id, kind, summary, content_hash)
evidence_paths(evidence_id, path, blob_sha)
revision_evidence(revision_id, evidence_id, relationship)

candidate_updates(repository_id, run_id, target, operation, original_proposal, accepted_edit, created_git_view, state)
candidate_evidence(candidate_id, evidence_id)

statement_search_documents(statement_id, revision_id, searchable_text)
statement_fts
retrieval_provider_state
retrieval_jobs
retrievals
retrieval_items
context_effects(retrieval_id, run_id, statement_id, effect)
```

Only `.bb/repo.json` is committed:

```json
{
  "repository_id": "repo_01...",
  "schema_version": 1
}
```

The OS data directory holds `bb.db`. Revisions are immutable; an accepted change appends a revision and advances `current_revision_id` transactionally. Every durable revision has linked evidence.

## Core processes

### Initialization

1. Resolve the Git root, common directory, worktree, HEAD, tree, and dirty state.
2. Create or read `.bb/repo.json`.
3. Migrate SQLite and register the location/worktree/view.
4. Ask what is being built and which constraints require human authority.
5. Create the initial intent and explicitly accepted commitments.
6. Populate FTS5 and leave QKV disabled.

The bootstrap skill may inspect repository documents and propose context, but documents never confer agent authority automatically.

### Run start

1. Normalize `UserPromptSubmit` into `start_run`.
2. Reconcile repository and Git state.
3. Create or resume the session and create a run.
4. Retrieve local FTS candidates and, when enabled, QKV candidates with a 1.2-second timeout.
5. Fuse FTS top 40 and semantic top 40 from `candidate_k=100` with reciprocal rank fusion (`k = 60`), then apply status, scope, ancestry, dirty-worktree, branch, path, freshness, and conflict policy.
6. Abstain when neither provider finds a relevant statement and render at most 12 items, 1,200 deterministic tokens, and 4,800 characters.
7. Log the rendered items and inject the run ID plus the requirement to call `bb_finish_run`.

### Run finish

The agent records outcome, verification, effects, and its explicit learning decision in one transaction. Context effects must reference an item logged for that run. Consequential runs cannot finish with an unexplained empty proposal set; proposals previously submitted through `bb_propose_update` count toward the decision. A Stop hook nudges once only after consequential writes, verification, or failures. Candidate acceptance, including edit-and-accept, is a separate human CLI action that preserves the original proposal.

## Git behavior

Repository identity does not depend on a branch name. Git views contain commit/tree/parent SHAs, stable patch ID when collected, changed paths, and a dirty fingerprint derived from staged, unstaged, and untracked path identities. Beliefs use ancestry and supporting blob SHAs for freshness; dirty beliefs require the same worktree/fingerprint; divergent beliefs require an active merge or an explicitly named branch. Rebase/squash recovery creates a human-reviewed re-anchor candidate after one unambiguous patch-ID match and never remaps silently.

## QKV boundary

QKV operations are create index, upsert/delete document, and search. Enablement requires an explicit disclosure, `BB_QKV_API_URL`, `BB_QKV_API_KEY`, `text_retention: "none"`, and an immutable service-selected model version. Stable documents use `bb:<statement-id>` and contain only reviewed current statement text plus minimal reviewed retrieval metadata. Semantic search uses a bounded deterministic term/path projection that removes code blocks, obvious secret assignments, authorization values, and high-entropy tokens rather than sending the stored raw prompt. Jobs coalesce per statement and retry with exponential backoff. SQLite remains the system of record and local FTS falls back after a 1.2-second semantic deadline.

Never send raw code, diffs, stored/raw prompts, tool input/output, secrets, environment values, or host transcripts.

## MVP acceptance

- A repository initializes with only `.bb/repo.json` committed.
- Intent, belief, and explicitly confirmed commitment creation works.
- Local context retrieval is useful with QKV disabled.
- Codex and Claude hooks create runs and inject context.
- One before/after pair is retained for each host tool-use ID while duplicate delivery of either phase remains idempotent.
- MCP exposes exactly the four named tools.
- `bb_finish_run` queues proposals or records an explicit no-learning reason for consequential work; it cannot accept proposals.
- Completion and review transitions are transactional and tested.
- QKV is optional and degrades to local retrieval.
- Type checking, behavior tests, the release acceptance harness, build, plugin validation, packaged installation, concurrent-host WAL, and 10,000-statement performance gates pass on Node 24.

## After 0.1.0

OpenCode, team synchronization, a web UI, hosted accounts, orchestration, hard enforcement, and any separate extraction LLM remain outside the MVP. Preserve the four-tool contract until evidence justifies changing it.
