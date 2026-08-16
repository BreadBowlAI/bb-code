# bb-code MVP implementation plan

This document is the implementation contract for `0.1.0`. The checked-in code is authoritative when behavior and prose differ.

## Product position

bb-code is not another coding agent and does not orchestrate one. Codex, Claude Code, and Cursor remain responsible for planning, tool use, edits, and verification. bb-code is a standalone continuity runtime beside them. Lifecycle hooks tell it when work begins and ends; MCP lets the active agent retrieve and submit structured information.

The open-source runtime owns durable data, Git applicability, local retrieval, review, and integrations. QKV is an optional proprietary candidate generator. This gives users a useful local product with a clean upgrade path and avoids a fork of any agent host.

## Repository layout

```text
apps/cli/src/commands/               human CLI command groups
apps/cli/src/adapters/               Codex/Claude/Cursor hook translation
apps/cli/src/mcp/                    four-tool MCP delivery surface
packages/core/src/domain/            stable concepts and validation
packages/core/src/application/       use-case workflows
packages/core/src/ports/             replaceable capability contracts
packages/core/src/infrastructure/    Git, filesystem, and focused SQLite stores
packages/core/tests/                 unit, integration, and support fixtures
packages/qkv-client/                 optional remote semantic provider
plugins/bb-code/          Codex plugin
plugins/claude/bb-code/   Claude Code plugin
plugins/cursor/bb-code/   Cursor plugin
.agents/plugins/          Codex local marketplace
.claude-plugin/           Claude Code marketplace
docs/                     architecture, schema, privacy, plan
```

## Public CLI

```text
bb init
bb integrate codex
bb integrate claude
bb integrate cursor
bb doctor

bb add intent
bb add belief
bb add commitment
bb mode [strict|standard|yolo]
bb status
bb audit [--json]
bb reclassify <statement-id> <intent|belief|commitment>
bb context "<request>" [--path <path>] [--json]
bb explain <statement-id> [--json]
bb review [candidate-id]
bb review --accept|--edit|--reject|--defer|--explain <candidate-id>

bb qkv configure|enable|disable|status
bb sync [--force]

bb mcp serve
bb adapter codex <event>
bb adapter claude <event>
bb adapter cursor <event>
```

Direct commitment creation requires explicit confirmation. Agent-facing interfaces can only propose knowledge; repository mode resolves the resulting candidate.

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
  requestIntent:
    | { disposition: "ephemeral", reason: string }
    | { disposition: "durable", proposal: IntentCandidateProposal },
  proposals: CandidateProposal[],
  noDurableLearningReason?: string
})
```

`bb_finish_run` is the end-of-run learning boundary. The coding agent submits structured learning using reasoning it already performed. Every completion separately classifies the request: an outcome that should survive the run produces an intent proposal, while a conversational or operational request records a specific ephemeral reason. Intent creates may start `active`, `satisfied`, or `abandoned`, allowing a one-run outcome to retain an honest lifecycle without becoming retrievable after completion. Always-on hook context and MCP descriptions use one classification rubric: intents are outcomes, beliefs are fallible claims about current implementation or behavior, and commitments are explicit future rules, constraints, or chosen decisions. Implementing, verifying, or approving code does not by itself turn a current fact into a commitment. Read-only investigations may produce beliefs when a non-obvious finding would prevent repeated inspection. Before creating a statement, agents compare retrieved context and prefer the existing statement lifecycle over duplicates. Exact same-kind duplicates are rejected deterministically. Agents report a context effect by statement ID when retrieved context changed the plan, caused clarification, avoided a violation, or changed verification. Agents propose only knowledge likely to affect future work, omitting trivial-to-rediscover facts and temporary details. A tool-assisted run must have at least one non-request proposal submitted during the run or provide a non-empty, specific `noDurableLearningReason`. bb-code does not invoke a second extraction model.

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

Candidate operations are `create | revise | confirm | contradict | satisfy | abandon | supersede | retire | reclassify`. Create requires a kind, body, scope, and matching attributes. Other operations require a target. Only beliefs may be contradicted, only intents satisfied or abandoned, and only commitments retired. Reclassification is atomic: the old typed statement is superseded and a correctly typed replacement receives a new identity. Repository knowledge mode is `strict | standard | yolo` and defaults to `standard`. Strict leaves every candidate pending; standard automatically accepts only operations whose source and result kinds exclude commitments; yolo automatically accepts every valid candidate. Automatic and manual resolution share one candidate/revision transaction and retain resolver, mode, run, evidence, and timestamp provenance.

## Runtime protocol

Adapters emit one host-independent envelope:

```ts
type RuntimeEvent = {
  schemaVersion: 1
  host: "codex" | "claude" | "cursor"
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
repositories(knowledge_mode, knowledge_mode_updated_at, knowledge_mode_updated_by)
repository_locations(repository_id, canonical_root, git_common_dir)
worktrees(repository_location_id, canonical_root, git_dir)
git_views(repository_id, worktree_id, commit, tree, parents, patch_id, dirty_fingerprint, changed_paths, branch)

agent_sessions(repository_id, worktree_id, host, external_session_id)
runs(session, prompt, status, start_view, end_view, verification, finish_called, request_intent, no_durable_learning_reason)
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
retrieval_items(lexical_score, semantic_score)
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

1. Normalize `UserPromptSubmit` (Codex/Claude) or `beforeSubmitPrompt` (Cursor) into `start_run`.
2. Reconcile repository and Git state.
3. Create or resume the session and create a run.
4. Retrieve local FTS candidates and, when enabled, QKV candidates with a 1.2-second timeout.
5. Filter lexical candidates by meaningful term coverage, select the statistically distinct head of the semantic score distribution, fuse provider ranks and scores with reciprocal rank fusion (`k = 60`), then apply status, scope, ancestry, dirty-worktree, branch, path, freshness, conflict, and near-duplicate policy.
6. Abstain when lexical coverage is insufficient or semantic scores are flat, and render at most 12 items, 1,200 deterministic tokens, and 4,800 characters.
7. Log the rendered items and inject the run ID plus the requirement to call `bb_finish_run`. Codex and Claude receive this directly from their prompt hook. Cursor's project rule calls `bb_context` with the exact user prompt; that retrieval binds to the prompt-hook run and returns the same run ID because Cursor's documented pre-prompt response cannot inject context.

### Run finish

The agent records outcome, verification, effects, its request-intent disposition, and its explicit learning decision in one transaction. Context effects must reference an item logged for that run. Tool-assisted runs cannot finish with an unexplained empty non-request proposal set; proposals previously submitted through `bb_propose_update` count toward the decision. A Stop hook nudges once whenever `bb_finish_run` was omitted, including read-only or conversational runs, so every request receives an intent disposition. Every proposal enters the candidate ledger, then repository knowledge mode either resolves it in the same transaction or leaves it for human review. Human edits preserve the original proposal separately.

## Git behavior

Repository identity does not depend on a branch name. Git views contain commit/tree/parent SHAs, stable patch ID when collected, changed paths, and a dirty fingerprint derived from staged, unstaged, and untracked path identities. Beliefs use ancestry and supporting blob SHAs for freshness; dirty beliefs require the same worktree/fingerprint; divergent beliefs require an active merge or an explicitly named branch. Rebase/squash recovery creates a policy-resolved re-anchor candidate after one unambiguous patch-ID match; the candidate ledger remains the audit trail and no statement identity is remapped.

## QKV boundary

QKV operations are create index, batch-contract upsert/delete document, and search. `bb qkv configure` stores the endpoint and API key in an owner-only user file shared by CLI, hooks, and MCP; process environment values remain the highest-precedence override. Interactive `bb qkv enable` and `bb sync` offer to configure missing credentials. Non-interactive invocations never prompt and instead provide an actionable error; automation can use `bb qkv configure --from-env`. Enablement requires an explicit disclosure, `text_retention: "none"`, and an immutable service-selected model version. `bb qkv status` distinguishes persisted provider enablement, runtime credential readiness, and pending/failed/exhausted jobs without exposing the key. Stable documents use `bb:<statement-id>` and contain only policy-activated current statement text plus minimal retrieval metadata. The client sends the QKV `documents` array even for one stable document and treats an HTTP 200 partial-ingestion entry as failure. Semantic search uses a bounded deterministic term/path projection that removes code blocks, obvious secret assignments, authorization values, and high-entropy tokens rather than sending the stored raw prompt. Jobs coalesce per statement and retry with exponential backoff. `bb sync --force` immediately retries every failed job for the current repository with a fresh attempt budget while interrupted pending jobs remain naturally retryable. Each invocation still attempts each eligible job at most once and exits unsuccessfully when any attempted job fails. SQLite remains the system of record and local FTS falls back after a 1.2-second semantic deadline. Retrieval ranking is relevance-first: statement kind determines how the agent treats an item, not a relevance multiplier.

Never send raw code, diffs, stored/raw prompts, tool input/output, secrets, environment values, or host transcripts.

## MVP acceptance

- A repository initializes with only `.bb/repo.json` committed.
- Intent, belief, and explicitly confirmed commitment creation works.
- Local context retrieval is useful with QKV disabled.
- Codex, Claude, and Cursor hooks create runs; Codex and Claude inject prompt context directly, while Cursor retrieves it through the always-applied project rule and exact-request run binding.
- One before/after pair is retained for each host tool-use ID while duplicate delivery of either phase remains idempotent.
- MCP exposes exactly the four named tools.
- `bb_finish_run` records a request-intent disposition and proposals or an explicit no-learning reason for tool-assisted work; configured policy, not the agent tool, resolves proposals.
- `bb audit` exposes knowledge mode, lifecycle balance, and consequential-recall metrics, and policy-resolved reclassification repairs a wrong kind without rewriting history.
- Completion, automatic acceptance, and review transitions are transactional and tested.
- QKV is optional and degrades to local retrieval.
- Type checking, behavior tests, the release acceptance harness, build, plugin validation, packaged installation, concurrent-host WAL, and 10,000-statement performance gates pass on Node 24.

## After 0.1.0

OpenCode, team synchronization, a web UI, hosted accounts, orchestration, hard enforcement, and any separate extraction LLM remain outside the MVP. Preserve the four-tool contract until evidence justifies changing it.
