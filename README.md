# bb-code

bb-code is the continuity layer for software engineering agents. It gives Codex, Claude Code, and Cursor the same durable project context without replacing any agent, parsing private transcripts, or letting an agent silently rewrite the project's memory.

The MVP stores three deliberately ordinary concepts:

- **Intents** — outcomes the project is actively pursuing.
- **Beliefs** — useful but fallible claims about the codebase or environment.
- **Commitments** — constraints and decisions that require explicit authority.

Statements are immutable revisions backed by evidence. Agent-authored changes enter a candidate queue; only `bb review` makes them durable.

## Why this layer

Coding agents are already good at editing code. What disappears between requests and sessions is the reasoning that should constrain the next run: why an API must stay compatible, which assumption is uncertain, or what success means. bb-code sits beside the coding agent as a standalone local runtime:

```text
Codex / Claude Code / Cursor
  lifecycle hooks ──> host adapter ──> bb-code core ──> SQLite + FTS5
  MCP tools <──────────────────────────────┘              │
                                                          └─> optional QKV
```

Hooks provide reliable run timing. MCP gives the agent four explicit operations. Cursor's project rule asks the agent to retrieve bb-code context exactly once because Cursor's pre-prompt hook can start a run but cannot inject context. After the first consequential tool action, Cursor's documented post-tool context channel adds one short, hidden completion reminder. Stop never creates a synthetic user turn: an omitted `bb_finish_run` is recorded as a partial run instead. The core exposes host-neutral effects; delivery adapters map them through declared host capabilities, so OpenCode and other adapters can be added without changing the domain.

## Quick start

Requires Node.js 24 or newer and pnpm 11.

```sh
pnpm install
pnpm build
cd apps/cli
npm link

cd your-project
bb init
bb integrate cursor
bb status
bb context "add OAuth login"
```

Install `plugins/bb-code` through the included Codex marketplace, add `.claude-plugin/marketplace.json` to Claude Code and install its plugin, or run `bb integrate cursor` to merge project-scoped Cursor hooks, MCP configuration, and an always-applied rule. All integrations expect the `bb` executable on `PATH`.

## The four agent tools

- `bb_context` retrieves applicable context for a request and returns the active run ID when hooks started the run.
- `bb_explain` returns one statement's typed current revision.
- `bb_propose_update` records one proposed learning; the repository knowledge mode determines whether it activates immediately or waits for review.
- `bb_finish_run` records the outcome, verification, context effects, reconciliation for every retrieved commitment, an explicit request-intent decision, and proposals. A durable request becomes an intent proposal; conversational or operational work records why it is ephemeral. After any tool-assisted work with no learning proposals, it requires an explicit `noDurableLearningReason`. Standard-mode commitment transitions wait for human review and quarantine the disputed constraint from hard enforcement; yolo applies the same audited transition immediately.

There is intentionally no `accept` MCP tool.

`bb doctor` distinguishes static plugin/configuration checks from evidence that host lifecycle hooks have actually recorded a run in the current repository.

## CLI

```text
bb init
bb integrate codex|claude|cursor
bb doctor
bb add intent|belief|commitment
bb mode [strict|standard|yolo] [--yes]
bb status
bb audit [--json]
bb reclassify <statement-id> <intent|belief|commitment>
bb context "<request>" [--path <path>] [--json]
bb explain <statement-id> [--json]
bb review [candidate-id] [--accept|--edit|--reject|--defer|--explain]
bb qkv configure|enable|disable|status
bb sync [--force]
bb mcp serve
```

Knowledge mode defaults to `standard`: intent- and belief-only proposals activate automatically, while anything touching a commitment waits for review. `strict` reviews everything; `yolo` activates everything and requires explicit confirmation when selected interactively. Every proposal still enters the candidate ledger, and automatic resolutions are marked `auto_accepted` with mode provenance. Mode changes are prospective, so already-pending candidates remain available for explicit review. `bb add commitment` asks for explicit confirmation unless `--yes` is supplied by the human running the command. `bb review --edit` can correct a pending kind, scope, and kind-specific attributes before acceptance. `bb reclassify` uses the same policy-aware atomic repair path without rewriting history. `bb audit` reports the active mode, statement balance, lifecycle use, request-intent decisions, retrieval volume, and consequential context effects.

## Local and proprietary boundaries

The runtime, adapters, plugins, schemas, local ranking, and review flow are Apache-2.0. SQLite is the source of truth. QKV is an optional semantic candidate generator behind the `SemanticRetrievalProvider` interface; local FTS5 continues working when QKV is absent or unavailable.

QKV receives only current statements activated by repository policy, stable statement/revision IDs, kind, status, scope, rationale/success conditions, a short evidence summary, and a bounded secret-filtered retrieval-query projection. bb-code does not send source code, stored/raw prompts, tool input/output, diffs, environment values, secrets, or transcripts. Run `bb qkv configure` to save credentials in an owner-only user configuration shared by CLI, hooks, and MCP, then run `bb qkv enable --yes` and `bb sync` to opt in. When credentials are missing, interactive `enable` and `sync` commands offer secure setup; non-interactive commands fail with instructions instead of blocking for input. Use `bb qkv configure --from-env` in automation. Environment variables remain the highest-precedence override. `bb qkv status` reports runtime readiness and queue failures without exposing the API key. Use `bb sync --force` to immediately retry all failed jobs for the current repository, including exhausted jobs; interrupted pending jobs are retried by an ordinary sync. `BB_QKV_URL` remains a temporary deprecated alias.

## Development

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check:docs
pnpm validate:plugins
pnpm smoke:package
pnpm test:concurrency
pnpm test:performance
```

Start with the [documentation index](docs/README.md). It links the complete
product vision, original MVP specification, current implementation contract,
architecture, data model, glossary, privacy rules, testing guidance, and QKV's
public competitive and integration boundary.

## License

Apache-2.0. See [LICENSE](LICENSE).
