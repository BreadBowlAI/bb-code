# bb-code: Product Definition and MVP

Updated: 2026-08-05

> **Document role:** Product definition, rationale, and architectural context.
> Implement the MVP from
> [`BB_CODE_IMPLEMENTATION_PLAN.md`](BB_CODE_IMPLEMENTATION_PLAN.md). If these
> documents conflict on implementation details, the implementation plan wins.

## Product thesis

> **bb-code gives every coding agent the same current understanding of what a project wants, what is believed to be true, and what decisions must be respected.**

Coding agents are becoming interchangeable. A developer may send one request to Codex, another to Claude Code, work with Cursor in the editor, and use an automated agent in CI. Each agent can inspect the repository, but each begins without the accumulated understanding behind the repository.

That is the opening for bb-code.

bb-code should not compete primarily on code editing, terminal execution, model routing, or chat UI. Existing agents already do those things well. It should own the continuity around agent work:

```text
incoming request
  → relevant intents, beliefs and commitments
  → agent work
  → evidence from code, tests and feedback
  → proposed updates to intents, beliefs and commitments
```

The short product promise is:

> **Your agents stop starting from zero.**

The more precise category is:

> **The continuity layer for software engineering agents.**

“Agent memory” is too broad and already crowded. bb-code should be about decision quality: less re-explanation, fewer repeated mistakes, fewer violations of earlier decisions, and better handoffs between agents and people.

## Software engineering from first principles

Software engineering is not the production of code. It is a repeated process of changing a system under intent and constraints, then using reality to learn whether the change was correct.

```text
Request
  → understand the desired outcome
  → understand the current system
  → choose an approach
  → change the system
  → verify the outcome
  → retain what was learned
```

Code represents the current implementation. It usually does not preserve:

- why the outcome matters;
- which alternatives were rejected;
- which constraints must survive future changes;
- which assumptions remain uncertain;
- which recent observations invalidated older documentation;
- what a user corrected in a previous agent run.

Humans carry some of this implicitly. Organizations distribute it across conversations, tickets, reviews, documents, and individual memory. Coding agents usually lose it when a run ends.

bb-code should preserve only the parts of that understanding that can change future work.

## The domain model

The MVP should have three durable statement types and one supporting evidence type.

### Intent

An intent describes an outcome that someone wants to become true.

Examples:

- “The product should work without an account.”
- “Search should remain below 300 ms at p95.”
- “Fix this bug without changing the public API.”

Important fields:

```text
statement
owner
scope
priority
success conditions
status: active | satisfied | abandoned | superseded
provenance
```

An agent may interpret or propose an intent, but the user or another authorized owner is authoritative about it.

### Belief

A belief is a fallible claim about the project or its environment.

Examples:

- “SQLite is the authoritative local store.”
- “The timeout is caused by connection-pool exhaustion.”
- “This service runs as a single replica.”

Important fields:

```text
statement
scope
confidence
evidence
observed at commit
status: active | contradicted | superseded
provenance
```

Beliefs may be inferred automatically, but they must remain visibly fallible. Code, tests, production behavior, documentation, and people can contradict one another.

### Commitment

A commitment is an accepted decision, invariant, or constraint that future work must respect.

Examples:

- “Raw customer text is not persisted.”
- “Accounts remain optional.”
- “Tenant authorization is enforced at the gateway.”

Important fields:

```text
statement
rationale
authority
scope
revisit condition
valid from
status: accepted | superseded | retired
provenance
```

An agent never invokes commitment acceptance directly. It proposes one through
a candidate update, and `proposed` is not a commitment status. Acceptance
requires explicit user approval, an approved design decision, a merged change
with clear authority, or an explicitly configured repository policy such as
`yolo` mode.

### Evidence

Evidence records what was observed and where it came from.

Examples:

- a user statement;
- a section of an ADR;
- a source file at a commit;
- a test result;
- a diff;
- a production incident;
- a code-review comment.

Evidence is not automatically true. It supports, contradicts, or explains a statement.

### Supporting runtime entities

The implementation also needs:

- `Run`: one prompt-to-stop agent execution in one repository and worktree;
- `RunEvent`: a normalized prompt, tool call, file change, test result, or outcome;
- `CandidateUpdate`: a proposed creation, revision, contradiction, satisfaction, or supersession of a durable statement;
- `StatementRevision`: immutable history for every change to an intent, belief, or commitment.

There should be no generic durable `memory` record. If something cannot be classified, it can remain evidence until its future consequence is understood.

## Rules that protect trust

These are product invariants, not optional implementation details:

1. Every durable statement has provenance.
2. Every durable statement has scope.
3. Accepted statements are revised or superseded, not silently overwritten.
4. Agents may automatically propose beliefs.
5. Agents propose knowledge; configured repository policy, not the agent tool,
   decides whether a candidate is accepted automatically or awaits review.
6. Code and tests can change a belief; they cannot decide what the user wants.
7. A newer request does not automatically replace a longer-lived intent.
8. Accepted commitments do not decay merely because they are old.
9. Retrieval returns the currently applicable revision and can explain why it was selected.
10. When the evidence is weak or conflicting, bb-code exposes uncertainty instead of manufacturing certainty.

Trust is the product. Retrieval quality matters only if the retrieved information is applicable and credible.

## Where bb-code belongs

bb-code should sit beside and around the agent runtime.

```text
Developer
    |
    v
Coding interface
    |
    v
Runtime adapter -----------------------+
    |                                  |
    v                                  v
Coding agent <---------------------> bb-core
    |                            typed statements
    v                            evidence and runs
Tools and repository             retrieval and review
    |                                  ^
    +---------- observations ----------+
```

It must interact with four points in an agent run:

1. **Before the agent processes a request**
   - record the immediately requested outcome;
   - retrieve applicable intents, beliefs, and commitments;
   - inject a small, cited context block.

2. **Before a consequential action**
   - inspect the proposed tool action and affected paths;
   - surface an applicable commitment or unresolved conflict;
   - later, block only explicit, machine-enforceable violations.

3. **After tools produce evidence**
   - record changed paths, test outcomes, errors, and commit state;
   - do not store all terminal chatter as durable knowledge.

4. **When the run finishes**
   - decide whether the requested outcome was actually verified;
   - propose updates to beliefs, intents, or commitments;
   - ask the user to approve consequential updates.

This is deeper than an MCP server but much smaller than a new agent runtime.

## Two integration contracts

### 1. The runtime adapter

The primary integration is a small deterministic adapter for each agent runtime.

Every adapter translates native lifecycle events into the same bb-code events:

```text
session_start
start_run
before_tool
after_tool
finish_run
session_end
```

The normalized contract should look roughly like:

```text
start_run
- adapter
- agent session id
- repository/worktree
- user prompt

before_tool
- run id
- tool name
- structured input
- candidate paths

after_tool
- run id
- tool name
- result status
- changed paths
- compact evidence

finish_run
- run id
- final response
- verification summary
- Git view
```

The core must know nothing about OpenCode message objects, Codex hook JSON, or Claude Code transcripts. Those formats terminate at the adapter.

### 2. MCP

MCP should be the portable capability surface, not the only integration.

Expose a small set of tools:

```text
bb_context
bb_explain
bb_propose_update
bb_finish_run
```

- `bb_context` returns relevant current statements for a request or path.
- `bb_explain` hydrates a statement, its revisions, and its evidence.
- `bb_propose_update` creates a candidate; repository knowledge mode resolves it, and the agent has no direct acceptance control.
- `bb_finish_run` records the run outcome, verification, context effects, and
  zero or more final candidate updates. Its candidates follow the same repository knowledge mode.

`bb_finish_run` is the reliable end-of-run learning boundary. The active
coding agent uses its existing reasoning to submit structured learning; bb-code
does not require a hidden second extraction model or another model API key.

MCP is valuable because many agents support it, but MCP tools are generally model-controlled. The model can forget or choose not to call them. The runtime adapter provides deterministic run-start retrieval and run-end integration.

Agents without lifecycle hooks receive a degraded but still useful integration:

```text
MCP + a small persistent instruction telling the agent when to call bb-code
```

## What Codex and Claude Code expose

Both products now expose enough supported surface area for bb-code to integrate
without scraping a terminal or taking over the model connection. The important
distinction is between augmenting the user's existing coding agent and owning a
new coding-agent experience.

### When the user stays inside Codex or Claude Code

Use native lifecycle hooks plus a bb-code MCP server.

| bb-code moment | Codex hook | Claude Code hook |
|---|---|---|
| Start or resume a session | `SessionStart` | `SessionStart` |
| Receive a new request | `UserPromptSubmit` | `UserPromptSubmit` |
| Inspect an intended action | `PreToolUse` | `PreToolUse` |
| Observe evidence from an action | `PostToolUse` | `PostToolUse`, `PostToolUseFailure`, `PostToolBatch` |
| Recover context around compaction | `PreCompact`, `PostCompact`, compact-sourced `SessionStart` | `PreCompact`, compact-sourced `SessionStart` |
| Decide what the run learned | `Stop`, `SubagentStop` | `Stop`, `StopFailure`, `SubagentStop` |
| Clean up final run state | `SessionEnd` | `SessionEnd` |

These events carry structured identifiers and inputs such as session ID,
working directory, permission mode, tool name, tool input, tool result, and
event-specific metadata.

Both hosts let hooks add context. Both expose a pre-tool decision point that can
allow, deny, request approval, or modify supported tool inputs. Both expose a
post-tool point for observing results. Claude Code currently has broader and
more granular hook coverage; Codex has the lifecycle required for the bb-code
MVP.

Hooks are not a complete security boundary. Codex explicitly notes that hosted
tools and some specialized paths can bypass the normal local tool-hook path.
bb-code should initially treat `PreToolUse` as a place for applicable warnings,
not as proof that every possible side effect was intercepted.

The bb-code MCP server provides the model-controlled capability surface:

```text
bb_context
bb_explain
bb_propose_update
bb_finish_run
```

Hooks and MCP do different jobs:

```text
hooks = deterministic timing
MCP   = explicit, model-driven depth
```

The Codex plugin format can bundle lifecycle hooks, skills, and MCP server
configuration. Claude Code plugins can likewise bundle hooks, skills, agents,
and MCP servers. bb-code should distribute one host-native package for each
agent while keeping the same binary and domain core underneath.

### When bb-code owns the coding-agent experience

Use the supported embeddable runtime, not hook shims.

Codex exposes two relevant layers:

1. The Codex SDK for TypeScript and Python can start, continue, and resume local
   Codex threads. It is the simpler interface for CI, internal tools, and
   headless jobs.
2. `codex app-server` is the deeper integration protocol used by rich Codex
   clients. It exposes bidirectional JSON-RPC over standard input/output, an
   experimental WebSocket transport, generated version-matched schemas,
   threads, turns, streamed items, approvals, history, authentication state,
   and agent lifecycle notifications.

Claude exposes:

1. The Claude Agent SDK for TypeScript and Python. It runs the same agent loop,
   tools, context management, permissions, hooks, MCP integrations, subagents,
   and resumable sessions in the embedding process.
2. Headless CLI mode through `claude -p`, including `json` and newline-delimited
   `stream-json` output. This is useful for scripts and prototypes but is a
   thinner long-term product boundary than the Agent SDK.
3. Managed Agents as a separate hosted REST product for asynchronous agents
   where Anthropic owns the sandbox and session infrastructure.

The practical comparison is:

| Need | Codex | Claude |
|---|---|---|
| Add bb-code to the existing interactive product | hooks + bb-code MCP | hooks + bb-code MCP |
| Run coding work inside a bb-code service | Codex SDK | Claude Agent SDK |
| Build a deeply customized local client | App Server | Agent SDK |
| Quick subprocess automation | non-interactive CLI | `claude -p` with JSON/stream JSON |
| Let another orchestrator invoke the coding agent | `codex mcp-server` exposes session and reply tools | `claude mcp serve` exposes Claude Code's file and shell tools; it is not the full agent loop |

The Claude Agent SDK is more cohesive as a library for embedding an agent. The
Codex App Server is more transparent and lower-level when building an
alternative rich client because it exposes the client/server protocol,
streamed items, and approval requests directly.

### The integration boundary for bb-code

The architecture should preserve two replaceable adapter families:

```text
Host-native mode

Codex or Claude Code
  ├── lifecycle hooks ──> bb runtime adapter ──> bb-core
  └── model <──────────> bb MCP server <──────> bb-core

Owned-runtime mode, later

bb-code client
  ├── Codex App Server / Codex SDK
  └── Claude Agent SDK
               │
               v
            bb-core
```

The MVP should implement only host-native mode.

The normalized adapter API remains:

```text
session_start
start_run
before_tool
after_tool
finish_run
session_end
```

Native session and turn IDs should be stored as external correlation IDs, never
as bb-code's durable identity. Native event JSON should be translated and
discarded at the adapter boundary. bb-code's store should retain only the
normalized event and selected evidence needed for future decisions.

Do not parse Codex's transcript JSONL. Its official hook documentation says the
transcript format is not a stable interface. Do not make either product's
private conversation files, UI state, or undocumented internal messages part of
the bb-code domain model. Use hooks, SDK event streams, documented session IDs,
and generated App Server schemas.

Official integration references:

- [Codex lifecycle hooks](https://learn.chatgpt.com/docs/hooks)
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex as an MCP server](https://learn.chatgpt.com/docs/mcp-server)
- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)
- [Claude Code headless mode](https://code.claude.com/docs/en/headless)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)

### Concrete Codex MVP

Ship a Codex plugin containing:

```text
hooks/hooks.json
  SessionStart     -> bb adapter codex SessionStart     -> session_start
  UserPromptSubmit -> bb adapter codex UserPromptSubmit -> start_run
  PreToolUse       -> bb adapter codex PreToolUse        -> before_tool
  PostToolUse      -> bb adapter codex PostToolUse       -> after_tool
  Stop             -> bb adapter codex Stop              -> finish_run
  SessionEnd       -> bb adapter codex SessionEnd        -> session_end

.mcp.json
  bb_context
  bb_explain
  bb_propose_update
  bb_finish_run

skills/
  a small optional workflow for explicit review and explanation
```

At run start, `bb adapter codex UserPromptSubmit` should retrieve and return a compact
developer-context block containing the run ID and an instruction to call
`bb_finish_run` before stopping. After tool use, the adapter should record
selected evidence without running expensive extraction synchronously.

`bb_finish_run` accepts:

```text
run ID
outcome: completed | partial | blocked | failed
summary
verification results
which retrieved statements affected the work
zero or more candidate updates
```

At stop, the adapter finalizes a run that called `bb_finish_run`. If a run made
consequential changes without calling it, the stop hook gives the agent one
short continuation prompt to finish the structured report. A second omission
finalizes the run as partial instead of creating a loop. Acceptance remains a
user action through `bb review`.

The same binary should then be mapped to Claude Code's equivalent hook events.
If that works without changing the domain core, portability has been proven.

## Open-source boundary and distribution strategy

bb-code should be a standalone runtime, but it should not initially be the
master coding agent.

Those are different choices:

```text
Standalone runtime
  bb-code owns statements, evidence, retrieval, review and durable identity.

Master coding agent
  bb-code also owns prompts, model sessions, tool execution, approvals,
  sandboxes, provider authentication and the primary coding interface.
```

The first is necessary. The second would expand the product into a much more
competitive category before the continuity thesis has been proven.

### Open-source the trusted core

The public repository should include:

- the intent, belief, commitment and evidence domain model;
- SQLite persistence and migrations;
- immutable revision and provenance rules;
- Git and worktree resolution;
- the normalized runtime adapter protocol;
- Codex, Claude Code and OpenCode adapters;
- the MCP server;
- the CLI and review flow;
- an understandable local retrieval implementation;
- a public retrieval-provider interface;
- evaluation fixtures and adapter contract tests.

An open-source installation must remain genuinely useful without an account or
the proprietary service. A deliberately crippled local edition would undermine
the trust and developer advocacy bb-code needs.

### Keep QKV as the quality backend

The proprietary QKV retrieval system should implement a public provider
contract:

```text
index(chunks, scope, version)
remove(references)
retrieve(query, scope, limit) -> ranked references
health()
```

The open-source runtime remains responsible for source text, authority, scope,
statement validity, revisions, evidence, hydration and final ranking policy.
The QKV service returns candidate references and scores. It must not become the
only place where bb-code's durable truth exists.

Provide two providers:

```text
local
  SQLite FTS / lexical retrieval
  private, understandable and good enough

qkv-cloud
  proprietary retrieval quality
  optional account and hosted service
```

This creates a clean open-core boundary: the community can inspect and trust
the behavior that governs project knowledge, while the commercial advantage is
better retrieval at scale.

### Architecture decision

| Option | Initial adoption | Product focus | Maintenance burden | Strategic result |
|---|---|---|---|---|
| Standalone bb-core with hooks and MCP | One-command addition to existing agents | Preserves the continuity thesis | Moderate | Best MVP and best distribution |
| bb-code controls Codex or Claude through their SDKs | Requires users to adopt a new primary interface | Mixes continuity with orchestration | High | Valuable later as an optional experience |
| Fork OpenCode | Requires switching coding clients | Makes bb-code responsible for an entire agent product | Very high | Short-term novelty, weak long-term differentiation |
| Native OpenCode plugin | Installs inside a large open-source agent community | Keeps bb-code focused | Low to moderate | Strong launch and community channel |

The decision is:

> Build a standalone open-source bb-code runtime that integrates into existing
> agents through hooks and MCP. Do not make bb-code the master and do not fork
> OpenCode for the MVP.

OpenCode already exposes a TypeScript plugin API with session, message, file,
permission and before/after tool events, custom tools, and an SDK for controlling
its server. It is also MIT licensed. That makes an OpenCode plugin a much
cleaner distribution vehicle than a fork.

### Launch sequence

1. Dogfood the Codex adapter because it is the current development environment.
2. Add Claude Code to prove the domain core is host-independent.
3. Ship an OpenCode plugin before the public launch to reach an
   open-source-native audience.
4. Launch the repository with one portable promise:

   > Your project's beliefs and commitments follow you across coding agents.

5. Add an optional owned experience only when users ask for orchestration,
   cross-agent delegation or a single interface.

The viral unit is not another chat interface. It is a small, inspectable
repository artifact or review that shows an agent avoided a consequential
mistake because it recovered a prior belief or commitment. Make those moments
easy to share without exposing private code.

## Why the other boundaries are wrong

### Not an OpenCode fork

A fork would give maximum control but make bb-code responsible for a fast-moving UI, tool runtime, provider layer, and merge burden before the product thesis is proven.

Use OpenCode through an adapter. A branded bb-code coding experience can later embed or distribute an existing runtime once the continuity loop is valuable.

### Not MCP alone

MCP is an excellent protocol for tools and external context. It does not guarantee invocation at the moments bb-code needs to operate.

### Not `AGENTS.md`, `CLAUDE.md`, or rules files alone

Those are good for small, static, always-applicable instructions. They are poor stores for numerous scoped beliefs, temporal validity, contradictory evidence, or request-specific retrieval.

bb-code should import and cite them as evidence. It should not replace them when a simple checked-in instruction is sufficient.

### Not Git hooks

Git hooks see commits and pushes. They do not reliably see the incoming user intent, model context, tool decisions, test observations, or an abandoned run. By commit time, a bad architectural choice may already have shaped the implementation.

### Not a model proxy

A model proxy sees prompts and responses but usually lacks trustworthy structured access to local tool calls, changed paths, permissions, worktrees, and verification results. It also creates a provider and privacy bottleneck.

### Not a vector database

Retrieval infrastructure is necessary, but storing and returning similar text is not the product. The product depends on lifecycle, authority, scope, temporal validity, evidence, review, and integration into action.

## The user experience

### Initialization

The first experience should take minutes:

```text
bb init
```

bb-code:

1. creates a stable repository ID;
2. detects the current Git and worktree state;
3. imports likely sources such as `README`, `AGENTS.md`, `CLAUDE.md`, ADRs, architecture notes, and repository rules;
4. proposes a small number of intents, beliefs, and commitments;
5. asks the user to approve, edit, or reject them.

For an empty or new project, it asks one useful question:

> What are you building, and what must remain true while we build it?

The answer seeds initial intents and proposed commitments.

### At the start of a request

The developer uses their normal coding agent:

> Add cross-device synchronization.

bb-code injects:

```text
Relevant project context

Intent
- The application must remain useful without an account.

Commitments
- Local data remains authoritative.
- Accounts are optional.

Beliefs
- SQLite currently contains all domain state.
- The project has no server-side identity model.

Potential conflict
- Cross-device synchronization may require identity. Do not choose an
  account architecture without clarifying how the existing intent should apply.

Sources
- bb:commitment_018
- bb:intent_004
- bb:belief_031
```

The important moment is not that an old note was found. It is that the agent avoids making a plausible but incompatible decision.

### During the run

Most runs should remain quiet. bb-code should not narrate every retrieval or tool call.

The agent can explicitly call `bb_explain` when it needs the rationale or full evidence behind a statement.

The MVP should warn, not block, for semantic conflicts. Hard blocking should arrive only for accepted, machine-checkable rules after false-positive behavior is understood.

### At the end of a run

bb-code presents only consequential proposed updates:

```text
Proposed updates from this run

1. Confirm belief
   SQLite remains the authoritative local store.
   Evidence: implementation diff and passing persistence tests.

2. Add belief
   Device identity is represented by a local key pair.
   Evidence: src/identity/device.ts at the current Git view.

3. Propose commitment
   Synchronization must work without making accounts mandatory.
   Requires your approval.
```

The user can approve, edit, reject, or defer.

This review is the learning loop. Silent automatic memory creation would destroy trust.

## The MVP

### Target user

Start with developers who:

- use a coding agent daily;
- work in a repository for more than a few days;
- repeatedly explain constraints or decisions to agents;
- switch between sessions or between coding agents;
- can immediately recognize when old context prevented a bad change.

This includes serious indie developers and small engineering teams. The product does not require years of company history to be useful.

### The single proof

The MVP must prove:

> **A coding agent makes a materially better decision because bb-code supplied applicable prior understanding at the right moment.**

It does not need to prove organizational knowledge management, autonomous governance, or a universal engineering graph.

### MVP scope

Build:

- one local repository at a time;
- a local CLI and core library;
- SQLite as the local operational store;
- immutable statement revisions;
- intents, beliefs, commitments, evidence, runs, and candidate updates;
- repository, path, and worktree scope;
- manual creation and review;
- import from a small set of repository documents;
- hybrid lexical and QKV retrieval;
- compact, cited run-start context;
- evidence capture from changed paths and test results;
- run-end candidate updates;
- one deterministic runtime adapter;
- an MCP server as the portability fallback.

Do not build yet:

- a web dashboard;
- organization accounts;
- team synchronization;
- ACLs;
- GitHub, Linear, Slack, or Notion connectors;
- multi-repository reasoning;
- generalized knowledge graphs;
- autonomous acceptance of extracted knowledge;
- semantic hard-blocking;
- an OpenCode fork;
- a custom coding-agent UI;
- model training before a useful evaluation dataset exists.

### First runtime

Build the first adapter for **Codex**, then prove portability with **Claude
Code**.

Codex is the fastest place to dogfood the full loop in this repository. Its current lifecycle hooks cover `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, and `SessionEnd`; prompt hooks can add developer context, and tool hooks can observe or deny supported local actions. Codex plugins can bundle hooks, skills, and MCP configuration into one installable unit.

Claude Code should be the second adapter. Its hook lifecycle is the closest
independent match to the normalized contract, its Agent SDK gives bb-code a
credible future route to an owned experience, and supporting it proves that
bb-core is not coupled to Codex.

OpenCode should follow after that. It exposes strong request and tool plugin
hooks, custom tools, session events, and a typed SDK. Keep the adapter isolated
and pin tested versions, but integrate through the public plugin surface rather
than maintaining a fork.

Cursor and Windsurf can initially use MCP plus checked-in instructions until they expose a sufficiently deterministic lifecycle integration.

## Proposed implementation shape

Use TypeScript for the MVP core and adapters. It fits the existing service code and the plugin ecosystems being targeted.

```text
packages/
  bb-domain/             types, rules and state transitions
  bb-store-sqlite/       local persistence and migrations
  bb-git/                repository and worktree view resolution
  bb-retrieval/          lexical + QKV retrieval and context packing
  bb-runtime-protocol/   normalized lifecycle events
  bb-adapter-codex/      hook commands and plugin packaging
  bb-mcp/                portable tools

apps/
  bb-cli/                init, add, context, review and status
```

The existing managed QKV service remains a retrieval backend. It accepts text transiently, stores QKV retrieval artifacts, and returns chunk references. bb-code remains responsible for local source text, statement identity, evidence, hydration, scope, authority, and review.

The core should be callable as a library and through a small command protocol:

```text
bb adapter codex <native-event>
bb adapter claude <native-event>
```

Each command reads normalized JSON on standard input and returns structured JSON. Codex and Claude hooks can call the binary directly. The OpenCode adapter can call the same core library or protocol. This avoids requiring a daemon in the first version.

SQLite should use WAL mode so concurrent agent sessions can safely append events. Expensive extraction and indexing work should happen outside latency-sensitive prompt and tool hooks.

## Storage and Git semantics

Commit only a small repository identity file:

```text
.bb/repo.json
```

It contains:

```text
repository_id
schema_version
```

Store the mutable SQLite database in the operating system’s user-data directory, keyed by the stable repository ID. Do not place an operational database inside `.git`.

Treat a worktree as a temporary view:

```text
repository view
  = repository ID
  + HEAD commit
  + dirty-state fingerprint
  + worktree identity
```

Resolve it with Git commands rather than assuming `.git` is a directory. Linked worktrees may use a `.git` text file, and `HEAD` is worktree-specific.

Git is a coordinate system and evidence source for bb-code. It is not the
knowledge database.

### Repository, branch, commit and worktree

Use each Git concept for one purpose:

```text
repository ID
  durable identity shared by every clone and worktree

branch name
  movable human-readable label for the current line of work

commit SHA
  immutable coordinate for an observed repository state

worktree view
  commit SHA plus the current uncommitted diff
```

Never use a branch name as the durable owner of a belief or commitment.
Branches can be renamed, deleted, reset, rebased and pointed at a different
commit. Store the branch name only as useful provenance for display.

### Git view record

At the beginning and end of every run, and whenever a hook reports a
consequential tool action, resolve:

```text
GitView
  repository_id
  worktree_id
  head_commit_sha
  head_tree_sha
  dirty_fingerprint
  branch_label: optional
  observed_at
```

The dirty fingerprint should be derived from staged and unstaged changes,
untracked paths, and relevant file identities without storing sensitive diff
content in the identifier itself.

bb-code must reconcile Git state on demand. Do not depend on Git hooks: a user,
IDE, another agent or background process may commit, checkout, reset or rebase
outside bb-code's lifecycle.

### Applicability rules

Git applicability is different from semantic scope. A statement may apply to
the whole repository or only a path, while its supporting evidence may be true
only on one line of development.

Use these defaults:

1. An explicitly accepted repository intent or commitment applies across
   branches according to its declared semantic scope. Human authority, not Git
   ancestry, determines what the project wants or has committed to.
2. A belief inferred from code applies when its evidence commit is an ancestor
   of the current `HEAD` and its supporting paths have not materially changed.
3. A belief inferred from uncommitted changes applies only to the exact
   worktree and dirty fingerprint that produced it. It is provisional.
4. A candidate update created during a run stays attached to that run's
   worktree view until a user reviews it.
5. Knowledge supported only by a divergent branch is excluded by default. It
   can appear as explicitly labelled parallel-branch context when the request asks
   about that branch or a merge.

The core ancestry query is:

```text
evidence commit is ancestor of current HEAD
  -> potentially applicable

evidence commit is on a divergent line
  -> hidden by default

evidence is tied to the current dirty fingerprint
  -> applicable only in that exact worktree view
```

Path changes can make a belief stale even when its evidence commit remains an
ancestor. Ancestry is necessary, not sufficient.

### Commits

Commits do not automatically create beliefs or accept commitments. They create
stronger evidence coordinates.

When a run begins with dirty changes and those changes are later committed:

1. retain the original worktree evidence;
2. detect the new `HEAD` during reconciliation;
3. compare the old base-to-dirty patch identity with the new commit range;
4. re-anchor matching evidence to the new commit;
5. leave the statement's authority and review state unchanged.

A successful commit therefore promotes evidence from provisional to durable;
it does not promote a proposal to an accepted project decision.

Store enough information to survive common history rewrites:

```text
commit_sha
tree_sha
parent_shas
patch_id: when available
paths
recorded_at
branch_label: display only
```

After a rebase or squash, use tree and patch identity to suggest a replacement
anchor. Never silently remap ambiguous evidence. If the original commit is no
longer reachable and no unambiguous equivalent exists, preserve the provenance
but mark the evidence origin as unreachable.

### Merges

Merging changes reachability, not truth or authority.

After a merge:

- beliefs supported by commits now in the target branch's ancestry become
  eligible for retrieval;
- accepted intents and commitments continue to follow their declared scope;
- contradictory beliefs from the merged histories create a review candidate;
- a Git conflict resolution does not silently decide which belief is true;
- deleting the source branch deletes no bb-code history.

For example:

```text
main:    A---B-------M
             \     /
feature:      C---D

Before M on main:
  beliefs supported only by C or D are hidden by default.

After M:
  C and D are ancestors of M, so their beliefs become eligible, subject to
  path freshness and contradiction checks.
```

### MVP boundary

The MVP is local and single-developer:

- accepted repository statements live in the local SQLite store;
- `.bb/repo.json` is the only required committed bb-code file;
- commit ancestry filtering is included because it prevents incorrect recall
  across divergent branches;
- rebase recognition may begin with commit and tree identity, with patch-based
  remapping added incrementally;
- no statement is deleted merely because a branch or commit becomes
  unreachable;
- runs and raw tool evidence remain local.

Team synchronization should later support an explicit Git-backed export or a
sync service. If Git export is added, use human-readable, one-statement-per-file
artifacts for accepted project knowledge; do not commit the operational SQLite
database or raw agent transcripts.

## Retrieval

Retrieval should answer:

> Which current statements could change this agent’s plan, implementation, verification, or need for clarification?

The MVP pipeline:

```text
resolve repository/worktree view
  → filter by status, validity and access
  → narrow by repository and path scope
  → lexical and exact-identifier retrieval
  → QKV candidate retrieval and reranking
  → adjust for authority and statement type
  → diversify by statement
  → pack a small cited context block
```

QKV should supply the semantic retrieval advantage. It should not override an inapplicable scope, a superseded revision, or a weak source.

Default ranking behavior:

- an applicable accepted commitment outranks a semantically closer old conversation;
- an active parent intent outranks an earlier completed run;
- a belief with recent code or test evidence outranks an unsupported inference;
- exact symbols, paths, errors, and ticket IDs receive lexical weight;
- no result is better than irrelevant context.

Keep the injected block below roughly 1,200 tokens. Hydrate deeper evidence only when the agent or user asks.

## Initial CLI

```text
bb init
bb add intent "The product must work without an account."
bb add belief "SQLite is the authoritative local store."
bb add commitment "Raw customer text is not persisted."
bb context "Add cross-device synchronization."
bb review
bb status
bb explain commitment_018
```

`bb review` is the central interface in the MVP. A dashboard is unnecessary until the review queue becomes too complex for the terminal.

## Evaluation

Do not optimize for how much bb-code remembers.

The north-star metric should be:

> **Consequential recalls per active developer per week.**

A consequential recall is a retrieved statement that causes an agent or developer to:

- change the plan;
- ask a necessary clarification;
- avoid violating a commitment;
- choose a more appropriate verification step;
- avoid repeating a failed approach.

Supporting metrics:

- percentage of injected statements used or cited;
- stale or incorrect context rate;
- context-injection latency;
- candidate acceptance, edit, and rejection rates;
- repeated user corrections;
- requests requiring re-explanation;
- agent outcome with and without bb-code context;
- correct abstention when nothing relevant exists.

Build a small evaluation set from real requests in this repository:

1. record an intent, belief, or commitment;
2. create a later request where that statement matters indirectly;
3. compare the agent’s plan and result with and without bb-code;
4. label whether the context changed the outcome;
5. retain hard negatives where similar statements should not be injected.

This outcome dataset can later improve retrieval and become a defensible advantage.

## Delivery sequence

### Milestone 1: manual vertical slice

- domain types and SQLite migrations;
- stable repository/worktree resolution;
- `bb init`, `bb add`, `bb context`, `bb review`;
- lexical retrieval;
- hand-written records for this repository.

Success: a real request receives a relevant, cited intent, belief, or commitment.

### Milestone 2: Codex integration

- plugin packaging;
- `UserPromptSubmit` run-start injection;
- `PostToolUse` evidence capture;
- `Stop` candidate generation;
- visible, non-blocking conflict warnings.

Success: bb-code improves a normal Codex run without the user manually invoking it.

### Milestone 3: QKV retrieval

- index typed statements through the existing managed service;
- combine QKV with exact and lexical retrieval;
- add scope, authority, validity, and diversity reranking;
- create retrieval traces and abstention tests.

Success: QKV materially beats lexical and conventional dense baselines on bb-code’s own request-to-statement benchmark.

### Milestone 4: learning loop

- extract a small number of candidate updates at run end;
- attach evidence and affected scope;
- approve, edit, reject, defer, and supersede;
- measure false-positive and acceptance rates.

Success: approved knowledge from one run improves a later run.

### Milestone 5: portability proof

- implement the OpenCode adapter against the normalized runtime protocol;
- keep all OpenCode-specific types outside bb-core;
- verify equivalent context and evidence behavior.

Success: Codex and OpenCode share the same durable project understanding.

### Milestone 6: design-partner MVP

- installer and upgrade path;
- privacy controls;
- failure-safe behavior when retrieval is unavailable;
- instrumentation for consequential recalls;
- ten real repositories and a small number of daily users.

Success: multiple users can name concrete mistakes or repeated explanations that bb-code prevented.

## Product strategy

### Initial wedge

Lead with:

> **Every coding agent starts with the decisions that matter.**

The visible value is:

- stop re-explaining the project;
- switch agents without losing continuity;
- catch conflicts before implementation;
- keep decisions tied to evidence;
- let every completed run improve the next request.

Do not lead with embeddings, QKV slots, knowledge graphs, or “AI memory.” Those explain implementation, not value.

### Distribution

The natural distribution channels are:

- a local CLI;
- a Codex plugin;
- an OpenCode plugin;
- a Claude Code plugin;
- MCP for broad compatibility;
- later, team installation through repository and organization policy.

The adapters should be open source. Broad compatibility increases the value of the shared state and avoids forcing users to choose bb-code instead of their preferred agent.

### Business model

A plausible path:

- free local product for individuals and open-source projects;
- paid shared state, synchronization, review, and cross-repository context for teams;
- enterprise access control, audit, retention, deployment, and policy enforcement.

The paid product should synchronize and govern the same intents, beliefs, commitments, and evidence used locally. It should not become a separate enterprise knowledge product.

### Long-term ambition

If the MVP works, bb-code can become the durable system of record for how software work evolves:

- product intent connected to implementation;
- decisions connected to their rationale;
- beliefs connected to evidence;
- changes connected to verification;
- agents and humans operating from the same current understanding;
- outcome data showing which prior knowledge changes engineering decisions.

At that point, bb-code can support multiple repositories, teams, issues, incidents, reviews, and automated agents. It can provide stronger decision checks and train retrieval directly on downstream engineering outcomes.

The architecture remains simple:

```text
typed project understanding
  + evidence
  + runtime adapters
  + Git-aware retrieval
  + reviewed learning
```

That is ambitious enough to become infrastructure and small enough to prove with one developer, one repository, and one agent.

## Current ecosystem evidence

The integration strategy follows the extension boundaries that current tools actually expose:

- [Codex hooks](https://learn.chatgpt.com/docs/hooks) can inject context at prompt and session start, observe or control supported tool calls, and run at Codex's native task or session completion.
- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins) can bundle skills, MCP configuration, and lifecycle hooks.
- [OpenCode V2 plugins](https://opencode.ai/v2/docs/build/plugins) expose a request hook immediately before model dispatch and before/after tool hooks, but the V2 plugin API is beta.
- [Claude Code hooks](https://code.claude.com/docs/en/hooks) expose Claude's native task, tool, compaction, and completion lifecycle events with model-visible additional context.
- [MCP server primitives](https://modelcontextprotocol.io/specification/2026-07-28/server/index) distinguish model-controlled tools from application-controlled resources, which is why MCP alone is not the deterministic lifecycle boundary.
- [Cursor Memories](https://docs.cursor.com/en/context/memories) already extract project-scoped rules from conversations, illustrating why generic “memory” is not sufficient differentiation.
- [Git worktree documentation](https://git-scm.com/docs/git-worktree) confirms that linked worktrees share much repository state while keeping `HEAD` and other state per worktree.
