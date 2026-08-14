// Domain: pure concepts and validation.
export * from "./domain/context.js";
export * from "./domain/errors.js";
export * from "./domain/ids.js";
export * from "./domain/knowledge.js";
export * from "./domain/runtime.js";

// Application: use cases exposed to CLI, MCP, and host adapters.
export * from "./application/context/get-context.js";
export * from "./application/context/rank-context.js";
export * from "./application/context/render-context.js";
export * from "./application/context/retrieve-context.js";
export * from "./application/context/evaluate-applicability.js";
export * from "./application/context/build-query.js";
export * from "./application/runs/durable-learning-guidance.js";
export * from "./application/runs/run-learning.js";
export * from "./application/runtime/process-runtime-event.js";
export * from "./application/workspace/add-statement.js";
export * from "./application/workspace/open-workspace.js";

// Ports and infrastructure adapters required by composition roots.
export * from "./ports/semantic-retrieval.js";
export * from "./infrastructure/filesystem/data-paths.js";
export * from "./infrastructure/git/git-client.js";
export * from "./infrastructure/sqlite/bb-database.js";
