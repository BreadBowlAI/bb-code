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
apps/cli/tests/unit/adapters/
```

Each `*.test.ts` file owns one behavior and normally one test case. A file name should explain the failure without opening it—for example, `candidate-review.test.ts` or `run-stop-policy.test.ts`.

Unit tests must not open SQLite, execute Git, or use the network. Integration tests may use a temporary real database and must dispose it in `finally`. Transport tests use injected `fetch`; hook-normalization tests call the pure normalizer rather than starting a process.

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

The acceptance command exercises the cross-agent Codex → pending proposal → human review → Claude retrieval flow and composes the branch visibility, changed-blob freshness, semantic fallback, token-budget, and four-tool contract scenarios into one release gate.

CI runs functional checks on macOS and Linux with Node 24. The normal test suite already includes the acceptance flow, so CI does not run that subset twice. Performance thresholds remain a local release check because shared-runner timing is not stable enough for a deterministic gate. Live QKV is a separate manually dispatched workflow protected by dedicated tenant credentials; it upserts a synthetic document, searches, and deletes it. Normal tests inject transport fakes, verify the server's documents-array and partial-failure contract, and assert that private run data never reaches remote documents. The final consequential-recall release proof is a real dogfood observation and cannot be replaced by the deterministic acceptance fixture.

`pnpm check:architecture` enforces the core dependency direction and rejects tests placed under production source.
