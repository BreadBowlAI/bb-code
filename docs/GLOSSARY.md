# Glossary

These definitions are part of the product contract. Prefer them over generic
terms such as “memory”.

## Knowledge

### Intent

An outcome that an authorized person or process wants to become true. An intent
has an owner, scope, priority, success conditions, status, and provenance.

### Belief

A fallible claim about the project or its environment. A belief carries
confidence and evidence and may later be contradicted or superseded.

### Commitment

An accepted decision, invariant, or constraint that future work must respect.
An agent may propose one, but acceptance requires human or policy authority.

### Evidence

An observed fact or artifact linked to a source and, where relevant, a Git view.
Evidence can support, contradict, or explain a statement. Evidence is not
automatically durable knowledge.

### Statement

The shared container for an intent, belief, or commitment. A statement points
to its current immutable revision.

### Statement revision

One immutable version of a statement's body, status, scope, attributes, and
evidence links. Updating a statement appends a revision and advances the current
revision pointer in one transaction.

### Candidate update

A proposal to create, revise, confirm, contradict, satisfy, supersede, or
retire a statement. Every proposal enters the candidate ledger before the
repository knowledge mode either accepts it automatically or leaves it pending
for human review.

### Knowledge mode

The repository policy that resolves candidate updates. `strict` leaves every
proposal pending, `standard` automatically accepts changes involving only
intents and beliefs, and `yolo` automatically accepts all proposals. The
default is `standard`. Automatic resolutions preserve candidate, actor, run,
mode, evidence, and revision provenance.

## Agent execution

### Intern

The product-facing metaphor for a coding agent assigned scoped work. An intern
can inspect, act, gather evidence, and propose learning, but cannot grant itself
authority. The persisted implementation uses the terms agent session and run.

### Agent session

A correlation record for one host's session in one repository worktree. It
connects Codex, Claude Code, or Cursor's external session ID to bb-code's stable local
identity. It can contain multiple runs.

### Request

One user-submitted prompt asking the coding agent to explain, investigate, or
act. A request is input to a run; it is not a persisted project-management
entity.

### Run

One prompt-to-stop execution: a request is received, context is retrieved,
tools are observed, an outcome is recorded, and candidate updates may be
proposed. A run belongs to an agent session and has start and end Git views.

### Change

A possible future outcome-level concept that may group zero or more runs around
one desired project transition. Change is reserved terminology and is not a
persisted MVP entity. Do not use `task` as a bb-code domain synonym for a run or
a future Change; hosts may still use that word in their native interfaces.

### Run event

A normalized lifecycle observation such as run start, before tool, after tool,
finish run, or session end. Host-specific JSON is translated at the adapter
boundary before a run event reaches the core.

### Verification

Structured evidence about whether the run outcome was checked, such as a test,
build, lint run, or manual verification and its result.

### Context effect

The coding agent's structured report of how one retrieved statement affected
the run. The MVP values are `changed_plan`, `caused_clarification`,
`avoided_violation`, `changed_verification`, and `no_effect`.

The coding agent generates this report because only it has direct access to its
reasoning and actions. bb-code validates and stores the report for evaluation;
retrieval alone is not proof that context was useful.

## Integration

### Host

The coding tool running the agent, currently Codex, Claude Code, or Cursor. Host-specific
types are delivery concerns and do not enter the core domain.

### Adapter

A deterministic translator from supported host lifecycle events to bb-code's
normalized runtime protocol.

### Hook

A host-controlled lifecycle callback. bb-code uses hooks for reliable timing:
run start, before and after tools, completion, compaction recovery, and session
end where supported.

### MCP server

The bb-code process that exposes model-callable tools through the Model Context
Protocol. The four bb-code MCP tools are not the hooks: MCP provides explicit
agent operations, while hooks decide when integration code runs.

### `bb_context`

Retrieves the small set of currently applicable statements for a request and
optional paths.

### `bb_explain`

Returns a statement with its current revision, history, scope, and evidence so
the agent or user can understand why it applies.

### `bb_propose_update`

Records one candidate update. The configured knowledge mode may resolve it
automatically; the agent has no acceptance tool.

### `bb_finish_run`

The structured end-of-run boundary. It records outcome, summary, verification,
context effects, a request-intent disposition, and zero or more proposals. The
repository policy, rather than the MCP caller, resolves those proposals.

### Request-intent disposition

The explicit decision made for every finished request. `durable` carries an
intent create or lifecycle proposal for policy resolution. `ephemeral` records why
the request is conversational, operational, or already represented by reviewed
context. A completed one-run outcome can be proposed as an intent whose initial
status is `satisfied`, preserving history without making it active context.

### Reclassification

A policy-resolved repair for a statement with the wrong kind. Acceptance
supersedes the old typed identity and creates a new intent, belief, or
commitment; it never rewrites the old statement's history.

## Git

### Repository

The stable logical project identified by `.bb/repo.json`. It is not identified
by a branch name or filesystem path.

### Repository location

A local clone associated with the stable repository identity.

### Worktree

A Git checkout in which an agent can work. One repository location can have
multiple worktrees.

### Git view

A snapshot of applicability context at an observation boundary: repository,
worktree, commit SHA, tree SHA, dirty fingerprint, and optional branch label.

### Dirty fingerprint

A deterministic digest derived from the identities of staged, unstaged, and
untracked paths. It distinguishes uncommitted views without persisting source
content.

## Persistence

### FK

Foreign key. A database field whose value must reference an existing row in
another table. For example, `runs.agent_session_id` is an FK to an agent session.
SQLite foreign-key enforcement prevents records from pointing at missing
parents.

### FTS5

SQLite's full-text search extension. It is the local, account-free lexical
retrieval baseline.

### QKV

The optional proprietary semantic retrieval provider. It produces candidate
statement references and relevance scores; it is not the source of truth and
does not decide whether a statement is applicable.

### Hydration

Loading the authoritative current statement revision from local SQLite after a
retriever returns an identifier. The remote QKV result is a reference, not the
final context object.
