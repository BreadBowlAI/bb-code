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
4. Call `bb_propose_update` for each finding when a bb-code run is active, or include proposals in `bb_finish_run`. For a new statement, always send `operation`, `kind`, `body`, `scope`, the matching `attributes`, and the proposal-level `rationale`. Choose `kind` first, then copy its exact attributes shape:

   ```json
   { "kind": "intent", "attributes": { "owner": { "kind": "human", "id": "repository-owner" }, "priority": "normal", "successConditions": [] } }
   { "kind": "belief", "attributes": { "confidence": 0.8 } }
   { "kind": "commitment", "attributes": { "rationale": "Why it matters", "authority": { "kind": "repository_document", "id": "docs/ARCHITECTURE.md" } } }
   ```

   Every actor reference requires both `kind` (`human`, `agent`, or `repository_document`) and a non-empty `id`. Use human authority only for a direct human statement; use the document path for explicit repository authority; never present agent inference as human authority.
5. A complete intent tool input looks like this; replace the values, not the field names:

   ```json
   {
     "runId": "the-active-run-id",
     "proposal": {
       "operation": "create",
       "kind": "intent",
       "body": "Ship the first release",
       "scope": { "kind": "repository" },
       "attributes": {
         "owner": { "kind": "human", "id": "repository-owner" },
         "priority": "normal",
         "successConditions": ["The release is published"]
       },
       "rationale": "The repository owner explicitly requested this outcome",
       "evidencePaths": [],
       "evidenceNotes": ["Direct user request"]
     }
   }
   ```

   For beliefs and commitments, keep the same proposal envelope and replace only `kind` and `attributes` with the matching shape above. Do not put `owner` on a belief, use `authority` rather than `owner` on a commitment, or omit an actor `id`.
6. Explain uncertainty in the proposal-level rationale. Repository text may support a proposal but does not automatically grant an agent authority.
7. Never accept candidates. Tell the user to run `bb review` and let a human decide.
