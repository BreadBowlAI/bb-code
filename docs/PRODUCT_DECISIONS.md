# Product decisions

Status: accepted direction for the MVP  
Updated: 2026-08-04

This document is the compact decision record for bb-code. The rationale and
alternatives are developed fully in [`BB_CODE_MVP.md`](BB_CODE_MVP.md).

## Positioning

bb-code is the continuity layer for software engineering agents. Its promise is
that agents stop starting from zero: the relevant intent, beliefs, and accepted
commitments survive across tasks and across coding tools.

bb-code does not compete first on chat, code editing, terminal execution, model
routing, or orchestration. Codex, Claude Code, OpenCode, and future hosts keep
owning the coding loop. bb-code owns the durable understanding around that
loop.

## Product language

The durable concepts are:

- **Intent** — an outcome someone wants to become true.
- **Belief** — a useful but fallible claim about the project or environment.
- **Commitment** — an accepted decision, invariant, or constraint that future
  work must respect.
- **Evidence** — an observation that supports, contradicts, or explains a
  statement.

An agent can be described informally as an **intern**: it receives a scoped
task, gathers evidence, and proposes what the project may have learned. Like an
intern, it does not acquire authority merely by doing the work. In the code and
database, the precise terms remain `agent_session` and `run`.

Do not use “Project Mind”, “Compass”, or “Map”. Those metaphors were considered
and rejected in favor of ordinary, inspectable concepts.

## Runtime boundary

bb-code is a standalone runtime beside the coding agent, not a master agent.

```text
Codex / Claude Code / future host
  lifecycle hooks ──> host adapter ──> bb-code core
  MCP tools <──────────────────────────────┘
```

The two integration mechanisms have separate jobs:

- Hooks provide deterministic timing at task start, tool boundaries, task
  completion, and session end.
- MCP gives the active model explicit depth: retrieve context, explain a
  statement, propose an update, and finish a run.

Host-native payloads end at the adapter. The core receives a normalized runtime
event and never depends on a host transcript or undocumented internal state.

## Four-tool contract

The MCP server exposes exactly:

1. `bb_context`
2. `bb_explain`
3. `bb_propose_update`
4. `bb_finish_run`

There is no agent-facing acceptance tool. `bb_finish_run` records structured
learning and creates pending candidates; a human review action decides whether
those candidates become durable statements.

The coding agent reports context effects because it knows whether retrieved
context changed its plan, caused clarification, avoided a violation, or changed
verification. bb-code validates and stores that report; it does not fabricate
the effect from retrieval alone.

## Trust rules

1. Every durable statement has provenance and scope.
2. Revisions are immutable; changes append history.
3. Agents may propose knowledge but may not silently accept commitments.
4. Code and tests may contradict a belief; they cannot decide user intent.
5. Retrieval exposes uncertainty and can explain why a statement was selected.
6. Accepted commitments remain active until explicitly superseded or retired.

Trust is more important than maximizing the amount of remembered text.

## Host and distribution decisions

- Dogfood Codex first because it is the current development environment.
- Add Claude Code second to prove the core is host-independent.
- Add OpenCode as an adapter/plugin, not a fork, after the two-host MVP.
- Do not make bb-code the master of Codex or Claude for the MVP.
- Preserve an owned-runtime option for later through supported SDK or app-server
  interfaces if users demand orchestration.

This sequence minimizes adoption friction while protecting the differentiated
product layer.

## Git decisions

- Repository identity is stable and independent of branch names.
- Worktrees are physical execution locations, not separate projects.
- A Git view captures commit, tree, dirty fingerprint, and optional branch
  label at an observation boundary.
- Branch names are display metadata because they can be renamed, deleted,
  rebased, or shared by multiple worktrees over time.
- Commits and diffs are evidence. They do not directly become intents, beliefs,
  or commitments.

This lets bb-code preserve continuity across branches without pretending that
all knowledge applies everywhere.

## Open-source and QKV decisions

The trusted runtime is open source and useful without an account. SQLite is the
source of truth and local FTS5 is the baseline retriever.

QKV is the optional proprietary quality backend. It returns semantic candidate
references and scores; bb-code still applies status, scope, Git applicability,
authority, hydration, and final ranking. An outage or disabled account falls
back to local retrieval.

Only current statement text and minimal identifiers may be indexed remotely.
Raw code, prompts, diffs, transcripts, tool inputs/outputs, environment values,
and secrets never belong in the QKV request path.

## MVP proof

The MVP is proven when a reviewed statement created during work in one coding
agent is automatically retrieved during a later relevant task in another agent,
and the developer can identify a repeated explanation or consequential mistake
that the context prevented.

The strongest shareable artifact is not a generic memory count. It is an
inspectable explanation of a moment where prior project understanding changed
an agent's behavior.
