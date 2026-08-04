# bb-code contributor guidance

- Start with `docs/README.md`. Use its document-precedence rules instead of
  inferring the product from the current scaffold.
- Preserve the accepted decisions in `docs/PRODUCT_DECISIONS.md` and the full
  product thesis in `docs/BB_CODE_MVP.md`.
- Preserve the dependency direction documented in `docs/ARCHITECTURE.md`: domain → application → ports/infrastructure → delivery composition.
- Keep `packages/core` independent of Codex, Claude Code, MCP, CLI prompts, and QKV transports.
- Keep SQL inside `packages/core/src/infrastructure/sqlite`.
- Put tests under a package's `tests/unit` or `tests/integration` directory, with one behavior per test file.
- Translate native hook payloads at adapter boundaries.
- Never accept agent-proposed durable knowledge without human review.
- Never parse host transcript files or send code and tool output to QKV.
- Keep QKV behind the public provider boundary described in
  `docs/QKV_COMPETITIVE_EDGE.md`; do not move authority or source-of-truth data
  into the proprietary service.
- Run `pnpm check:architecture`, `pnpm check:docs`, `pnpm typecheck`,
  `pnpm test`, and `pnpm build` before handing off changes.
