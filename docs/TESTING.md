# Testing

Tests are outside production source and organized by boundary:

```text
packages/core/tests/
  unit/
    domain/          schema and invariant tests
    application/     pure ranking and rendering tests
  integration/
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
pnpm typecheck
pnpm check:architecture
```

`pnpm typecheck` checks production and test TypeScript. The default test command finds tests only under explicit `tests` directories, preventing production files from becoming accidental test containers.

`pnpm check:architecture` enforces the core dependency direction and rejects tests placed under production source.
