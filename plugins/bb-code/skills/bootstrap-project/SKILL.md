---
name: bootstrap-project
description: Inspect a software repository and propose durable bb-code intents, beliefs, and commitments for human review. Use when bb-code has just been initialized, when onboarding an existing codebase, or when project documentation has materially changed.
---

# Bootstrap bb-code

Build a small, reviewable candidate set from authoritative repository documents.

1. Read `README*`, `AGENTS.md`, `CLAUDE.md`, architecture documents, and ADRs that exist. Do not scan generated files, dependencies, secrets, or host transcripts.
2. Separate findings:
   - Use intents for outcomes the project is actively pursuing.
   - Use beliefs for fallible claims about the codebase or environment.
   - Use commitments for explicit constraints or decisions backed by human or repository authority.
3. Prefer a few specific statements over a broad inventory. Attach the relevant repository paths as evidence.
4. Call `bb_propose_update` for each finding when a bb-code run is active, or include proposals in `bb_finish_run`.
5. Explain uncertainty in the rationale. Repository text may support a proposal but does not automatically grant an agent authority.
6. Never accept candidates. Tell the user to run `bb review` and let a human decide.
