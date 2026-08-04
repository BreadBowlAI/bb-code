# Privacy and trust

bb-code is local-first. Its SQLite database may contain project prompts, durable statements, Git identities, tool names, paths, outcomes, and short sanitized excerpts. It never reads host transcript JSONL files.

Agent output is untrusted input. Agents can retrieve and explain context, propose changes, and finish their own runs. They cannot accept, edit, or delete durable project context through MCP. Human review is the authority boundary.

QKV is opt-in and is not a system of record. Remote documents contain only reviewed current statement text, stable IDs, kind/status, scope, reviewed rationale or success conditions, and a short reviewed evidence summary. After enablement, search receives a bounded deterministic term/path projection with code blocks, obvious secret assignments, authorization values, and high-entropy tokens removed; the stored raw prompt is not sent. Source files, diffs, raw tool calls, tool output, environment variables, credentials, and transcript content must never be sent.

Hook adapters write protocol output only to stdout and diagnostics only to stderr. Hook errors fail open so bb-code cannot block normal coding work because of an internal failure.
