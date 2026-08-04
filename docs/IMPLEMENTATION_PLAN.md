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
bb context "<task>" [--path <path>] [--json]
bb explain <statement-id> [--json]
bb review [candidate-id]
bb review --accept|--reject|--defer <candidate-id>

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
bb_context({ task: string, paths?: string[], maxItems?: number })
bb_explain({ statementId: string })
bb_propose_update({ runId: string, proposal: CandidateProposal })
bb_finish_run({
  runId: string,
  outcome: "completed" | "partial" | "blocked" | "failed",
  summary: string,
  verification: Verification[],
  contextEffects: ContextEffect[],
  proposals: CandidateProposal[]
})
```

`bb_finish_run` is the end-of-task learning boundary. The coding agent submits structured learning using reasoning it already performed. bb-code does not invoke a second extraction model.

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
    | "start_task"
    | "before_tool"
    | "after_tool"
    | "finish_task"
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
git_views(repository_id, worktree_id, commit, tree, dirty_fingerprint, branch)

agent_sessions(repository_id, worktree_id, host, external_session_id)
runs(session, prompt, status, start_view, end_view, verification, finish_called)
run_events(run, sequence, kind, tool, outcome, paths, sanitized_payload)

statements(repository_id, kind, current_revision_id, created_by)
statement_revisions(statement_id, number, body, status, scope, attributes)
evidence(repository_id, run_id, git_view_id, kind, summary, content_hash)
evidence_paths(evidence_id, path, blob_sha)
revision_evidence(revision_id, evidence_id, relationship)

candidate_updates(repository_id, run_id, target, operation, proposal, state)

statement_search_documents(statement_id, revision_id, searchable_text)
statement_fts
retrieval_provider_state
retrieval_jobs
retrievals
retrieval_items
context_effects
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

### Task start

1. Normalize `UserPromptSubmit` into `start_task`.
2. Reconcile repository and Git state.
3. Create or resume the session and create a run.
4. Retrieve local FTS candidates and, when enabled, QKV candidates with a 1.2-second timeout.
5. Fuse with reciprocal rank fusion (`k = 60`), filter status/scope, and render at most 12 items or roughly 1,200 tokens.
6. Log the retrieval and inject the run ID plus the requirement to call `bb_finish_run`.

### Task finish

The agent records outcome, verification, effects, and proposals. A Stop hook nudges once if the finish tool was missed. Candidate acceptance is a separate human CLI action.

## Git behavior

Repository identity does not depend on a branch name. A Git view contains commit SHA, tree SHA, and a dirty fingerprint derived from staged, unstaged, and untracked path identities. Branch labels are display metadata. This supports worktrees, rebases, detached HEAD, and renamed branches while leaving room for ancestry and evidence-blob freshness scoring.

## QKV boundary

QKV operations are create index, upsert/delete document, and search. Index creation requests `text_retention: "none"`. Remote documents contain only statement text, statement/revision IDs, and kind. SQLite remains the system of record and local FTS remains available through outages.

Never send raw code, diffs, prompts, tool input/output, secrets, environment values, or host transcripts.

## MVP acceptance

- A repository initializes with only `.bb/repo.json` committed.
- Intent, belief, and explicitly confirmed commitment creation works.
- Local context retrieval is useful with QKV disabled.
- Codex and Claude hooks create runs and inject context.
- MCP exposes exactly the four named tools.
- `bb_finish_run` queues proposals; it cannot accept them.
- Review transitions are transactional and tested.
- QKV is optional and degrades to local retrieval.
- Type checking, tests, build, plugin validation, and smoke tests pass on Node 24.

## After 0.1.0

Add evidence-blob freshness and Git ancestry weighting, richer run sanitization, candidate editing, a review UI, background QKV jobs, metrics for context effects, and an OpenCode adapter. Preserve the four-tool contract until evidence justifies changing it.
