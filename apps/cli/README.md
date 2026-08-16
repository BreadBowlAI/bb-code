# @breadbowl/bb-code

The `bb` CLI, MCP server, and Codex/Claude Code/Cursor adapters for [bb-code](../../README.md).

```sh
pnpm add --global @breadbowl/bb-code
bb init
bb integrate codex
```

Requires Node.js 24 or newer. The runtime is local-first; optional QKV retrieval must be explicitly enabled.

For repository development, run `pnpm build`, then run `npm link` from this directory.

Use `bb audit` to inspect statement balance and consequential-recall metrics. Use `bb reclassify <statement-id> <kind>` followed by `bb review` to repair a mistaken kind without overwriting its history.
