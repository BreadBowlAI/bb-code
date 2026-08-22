# Testing

Tests are outside production source and organized by boundary:

```text
packages/core/tests/
  unit/
    domain/          schema and invariant tests
    application/     pure ranking and rendering tests
  integration/
    context/         provider failure and fallback tests
    git/             real temporary Git lifecycle tests
    sqlite/          real SQLite state-transition tests
  support/           reusable fixtures; never test cases

packages/qkv-client/tests/unit/
apps/cli/tests/unit/adapters/        native Codex, Claude, and Cursor translation
```

Each `*.test.ts` file owns one behavior and normally one test case. A file name should explain the failure without opening it—for example, `candidate-review.test.ts` or `run-stop-policy.test.ts`.

Unit tests must not open SQLite, execute Git, or use the network. Integration tests may use a temporary real database and must dispose it in `finally`. Transport tests use injected `fetch`; hook-normalization tests call the pure normalizer rather than starting a process. Cursor installation tests use a temporary project directory and verify existing JSON configuration is merged rather than replaced.
Native self-tool regression coverage includes Cursor's `MCP:bb_context` form,
ensuring a request containing relevant paths cannot be mistaken for an ordinary
path-touching tool and blocked by `preToolUse`.

Commands:

```sh
pnpm test
pnpm test:watch
pnpm test:acceptance
pnpm typecheck
pnpm check:architecture
pnpm build
pnpm smoke:package
pnpm test:concurrency
pnpm test:performance
```

`pnpm typecheck` checks production and test TypeScript. The default test command finds tests only under explicit `tests` directories, preventing production files from becoming accidental test containers.

The acceptance command exercises the default-standard Codex → auto-accepted belief → Claude retrieval flow and composes the branch visibility, changed-blob freshness, semantic fallback, token-budget, and four-tool contract scenarios into one release gate. Focused policy tests separately prove strict review, standard commitment protection, yolo acceptance, and automatic-resolution provenance.

Focused learning-loop tests cover completed request intents, read-only diagnostic decisions, quiet-run Stop nudges, Cursor's deferred single retrieval, hidden one-time completion reminder, silent missing-finish finalization, non-looping path guidance, review-time kind correction, and atomic statement reclassification. Retrieval hard negatives must include real dogfood failures: generic word overlap must abstain, and a flat semantic score distribution must not inject arbitrary context.

Commitment reconciliation tests cover the stale-constraint failure directly:
all retrieved commitments require one disposition, yolo transitions are atomic,
standard-mode transitions remain pending and are removed from hard path
enforcement, decorated citations normalize to raw IDs, and focused Cursor
lookups bind explicitly to the active run.

CI runs functional checks on macOS and Linux with Node 24. The normal test suite already includes the acceptance flow, so CI does not run that subset twice. Performance thresholds remain a local release check because shared-runner timing is not stable enough for a deterministic gate. Live QKV is a separate manually dispatched workflow protected by dedicated tenant credentials; it upserts a synthetic document, searches, and deletes it. Normal tests inject transport fakes, verify the server's documents-array and partial-failure contract, and assert that private run data never reaches remote documents. The final consequential-recall release proof is a real dogfood observation and cannot be replaced by the deterministic acceptance fixture.

`pnpm check:architecture` enforces the core dependency direction and rejects tests placed under production source.
