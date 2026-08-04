# Privacy and trust

bb-code is local-first. Its SQLite database may contain project prompts, durable statements, Git identities, tool names, paths, outcomes, and short sanitized excerpts. It never reads host transcript JSONL files.

Agent output is untrusted input. Agents can retrieve and explain context, propose changes, and finish their own runs. They cannot accept, edit, or delete durable project context through MCP. Human review is the authority boundary.

QKV is opt-in and is not a system of record. Remote documents contain only statement text and the minimum IDs and kind needed to map search hits back to SQLite. Source files, diffs, prompts, raw tool calls, tool output, environment variables, credentials, and transcript content must never be sent.

Hook adapters write protocol output only to stdout and diagnostics only to stderr. Hook errors fail open so bb-code cannot block normal coding work because of an internal failure.
