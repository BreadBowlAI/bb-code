# bb-code

bb-code is the continuity layer for software engineering agents. It gives Codex and Claude Code the same durable project context without replacing either agent, parsing private transcripts, or letting an agent silently rewrite the project's memory.

The MVP stores three deliberately ordinary concepts:

- **Intents** — outcomes the project is actively pursuing.
- **Beliefs** — useful but fallible claims about the codebase or environment.
- **Commitments** — constraints and decisions that require explicit authority.

Statements are immutable revisions backed by evidence. Agent-authored changes enter a candidate queue; only `bb review` makes them durable.

## Why this layer

Coding agents are already good at editing code. What disappears between requests and sessions is the reasoning that should constrain the next run: why an API must stay compatible, which assumption is uncertain, or what success means. bb-code sits beside the coding agent as a standalone local runtime:

```text
Codex / Claude Code
  lifecycle hooks ──> host adapter ──> bb-code core ──> SQLite + FTS5
  MCP tools <──────────────────────────────┘              │
                                                          └─> optional QKV
```

Hooks provide reliable run timing. MCP gives the agent four explicit operations. The core imports no host-specific or QKV code, so OpenCode and other adapters can be added without changing the domain.

## Quick start

Requires Node.js 24 or newer and pnpm 11.

```sh
pnpm install
pnpm build
cd apps/cli
npm link

cd your-project
bb init
bb integrate codex
bb status
bb context "add OAuth login"
```

Install `plugins/bb-code` through the included Codex marketplace, or add `.claude-plugin/marketplace.json` to Claude Code and install its plugin. Both expect the `bb` executable on `PATH`.

## The four agent tools

- `bb_context` retrieves applicable context for a request and returns the active run ID when hooks started the run.
- `bb_explain` returns one statement's typed current revision.
- `bb_propose_update` queues one proposed learning for human review.
- `bb_finish_run` records the outcome, verification, context effects, and proposals. After consequential work with no proposals anywhere in the run, it requires an explicit `noDurableLearningReason` instead of silently treating an empty list as a learning decision.

There is intentionally no `accept` MCP tool.

`bb doctor` distinguishes static plugin/configuration checks from evidence that host lifecycle hooks have actually recorded a run in the current repository.

## CLI

```text
bb init
bb integrate codex|claude
bb doctor
bb add intent|belief|commitment
bb status
bb context "<request>" [--path <path>] [--json]
bb explain <statement-id> [--json]
bb review [candidate-id] [--accept|--edit|--reject|--defer|--explain]
bb qkv configure|enable|disable|status
bb sync [--force]
bb mcp serve
```

`bb add commitment` always asks for explicit confirmation unless `--yes` is supplied by the human running the command.

## Local and proprietary boundaries

The runtime, adapters, plugins, schemas, local ranking, and review flow are Apache-2.0. SQLite is the source of truth. QKV is an optional semantic candidate generator behind the `SemanticRetrievalProvider` interface; local FTS5 continues working when QKV is absent or unavailable.

QKV receives only reviewed current statement text, stable statement/revision IDs, kind, status, scope, reviewed rationale/success conditions, a short reviewed evidence summary, and a bounded secret-filtered retrieval-query projection. bb-code does not send source code, stored/raw prompts, tool input/output, diffs, environment values, secrets, or transcripts. Run `bb qkv configure` to save credentials in an owner-only user configuration shared by CLI, hooks, and MCP, then run `bb qkv enable --yes` and `bb sync` to opt in. When credentials are missing, interactive `enable` and `sync` commands offer secure setup; non-interactive commands fail with instructions instead of blocking for input. Use `bb qkv configure --from-env` in automation. Environment variables remain the highest-precedence override. `bb qkv status` reports runtime readiness and queue failures without exposing the API key. Use `bb sync --force` to immediately retry all failed jobs for the current repository, including exhausted jobs; interrupted pending jobs are retried by an ordinary sync. `BB_QKV_URL` remains a temporary deprecated alias.

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
