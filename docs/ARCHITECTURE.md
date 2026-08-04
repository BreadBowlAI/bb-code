# Architecture

bb-code has one core rule: host integrations depend on the runtime, while the runtime never depends on a host.

```mermaid
flowchart LR
  Codex["Codex hooks + MCP"] --> CLI["CLI composition root"]
  Claude["Claude Code hooks + MCP"] --> CLI
  Human["Human CLI"] --> CLI

  CLI --> Application["Application use cases"]
  Application --> Domain["Domain rules and schemas"]
  Application --> Ports["Ports"]
  Application --> Infrastructure["Infrastructure adapters"]
  Infrastructure --> SQLite["Local SQLite + FTS5"]
  Infrastructure --> Git["Git executable"]
  CLI --> QKV["Optional QKV client"]
  QKV -. implements .-> Ports
```

The arrows point inward toward policy. Domain code has no knowledge of SQLite, Git, MCP, Codex, Claude Code, or QKV.

## Layers

### Domain

Location: `packages/core/src/domain`

Owns stable product language and validation:

- `knowledge.ts` — intents, beliefs, commitments, scopes, candidates, and revisions.
- `runtime.ts` — sessions, normalized lifecycle events, verification, and completion.
- `context.ts` — retrieved context items and results.
- `ids.ts` and `errors.ts` — shared domain primitives.

Domain modules are deterministic. They do not read files, execute Git, open databases, or call a network.

### Application

Location: `packages/core/src/application`

Owns workflows by use case:

- `workspace` initializes and opens a repository.
- `context` retrieves, ranks, and renders applicable statements.
- `runs` records proposals and structured completion.
- `runtime` processes normalized host lifecycle events.

Application modules coordinate domain rules through stable ports and the persistence facade. Ranking and rendering are pure functions so they can be tested without SQLite.

### Ports

Location: `packages/core/src/ports`

Ports describe replaceable capabilities. `SemanticRetrievalProvider` is the first port: local retrieval does not know or care whether semantic candidates come from QKV or a future provider.

Adding a provider means implementing the port in a separate package. It must not introduce provider types into the domain.

### Infrastructure

Location: `packages/core/src/infrastructure`

Owns external details:

- `git/git-client.ts` shells out to Git without using a shell command string.
- `filesystem/data-paths.ts` resolves operating-system data locations.
- `sqlite/connection.ts` owns connection settings and transactions.
- `sqlite/migrations.ts` owns forward-only schema creation.
- focused SQLite stores own repository identity, runs, knowledge, and search.
- `sqlite/bb-database.ts` is a small persistence facade for application code.

SQL does not appear in application or domain modules.

### Composition and delivery

Location: `apps/cli/src`

The executable package connects the layers:

- `commands` contains human-facing command groups.
- `adapters` translates Codex and Claude payloads into `RuntimeEvent`.
- `mcp` exposes exactly four tools.
- `composition` selects optional implementations such as QKV.
- `cli.ts` only assembles commands; `launcher.ts` handles process startup.

Host-native payloads stop at `normalize-hook-event.ts`. The normalized payload intentionally excludes source code, tool bodies, transcripts, and secrets.

## Runtime flow

```mermaid
sequenceDiagram
  participant Host as Codex or Claude Code
  participant Adapter as Host adapter
  participant App as Application layer
  participant DB as SQLite
  participant QKV as Optional QKV

  Host->>Adapter: UserPromptSubmit
  Adapter->>App: RuntimeEvent(start_task)
  App->>DB: create session + run
  App->>DB: FTS5 candidates
  opt QKV enabled
    App->>QKV: statement-only semantic search
    QKV-->>App: statement IDs + scores
  end
  App->>DB: log fused retrieval
  App-->>Host: cited context + run ID
  Host->>App: bb_finish_run
  App->>DB: outcome + pending candidates
  Note over DB: Durable statements are unchanged
  Host-->>DB: Human runs bb review
  Note over DB: Accepted candidate appends a revision
```

## Persistence boundaries

SQLite is the source of truth. The `BbDatabase` facade keeps table layout out of workflows while focused stores keep SQL grouped by aggregate:

| Store | Responsibility |
|---|---|
| `RepositoryStore` | repositories, locations, worktrees, Git views |
| `RunStore` | sessions, runs, events, Stop policy, completion |
| `KnowledgeStore` | statements, revisions, evidence, candidate review |
| `SearchStore` | FTS, retrieval logs, provider state, sync jobs |

Transactions live in `SqliteConnection`. Candidate acceptance and revision changes use the same connection and can nest safely inside one transaction.

## Dependency rules

1. `domain` imports only domain modules and third-party validation primitives.
2. `application` may import domain, ports, and infrastructure facades.
3. `infrastructure` may implement domain persistence but cannot import delivery code.
4. `apps/cli` may compose every public package; core never imports from `apps`.
5. Plugins contain declarations and skills only. Product behavior stays in the runtime.
6. QKV remains optional. Every workflow must work with the semantic port absent or failing.

## Extension paths

- New coding host: add one normalizer and hook/plugin declarations. Do not change core domain types unless the shared protocol truly needs a new concept.
- New semantic provider: implement `SemanticRetrievalProvider` outside core.
- New database version: add a forward-only migration; preserve immutable statement revisions.
- New UI: call application use cases and the review facade. Never update knowledge tables directly.
- OpenCode: add a delivery adapter, not a fork of the runtime or agent.
