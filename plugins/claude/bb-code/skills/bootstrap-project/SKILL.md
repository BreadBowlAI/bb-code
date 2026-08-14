---
name: bootstrap-project
description: Inspect a software repository and propose durable bb-code intents, beliefs, and commitments for human review. Use when bb-code has just been initialized, when onboarding an existing codebase, or when project documentation has materially changed.
---

# Bootstrap bb-code

Build a small, reviewable candidate set from authoritative repository documents.

1. Read `README*`, `AGENTS.md`, `CLAUDE.md`, architecture documents, and ADRs that exist. Do not scan generated files, dependencies, secrets, or host transcripts.
2. Separate findings:
   - Use intents for active outcomes someone is pursuing.
   - Use beliefs for fallible claims about the current codebase, behavior, environment, or implementation that could affect future work.
   - Use commitments for explicit rules, constraints, or chosen decisions future work should preserve, backed by human or repository authority.
   - Treat a current implementation fact as a belief unless it was explicitly chosen as a future constraint: “the repository currently uses PostgreSQL” is a belief; “production persistence must use PostgreSQL” is a commitment. Implementing, verifying, or approving code alone does not make its description a commitment.
3. Prefer a few specific statements over a broad inventory. Propose only knowledge likely to change how a future agent works; omit trivial-to-rediscover facts and temporary implementation details. Attach the relevant repository paths as evidence.
4. Before creating a statement, query `bb_context` with the proposed claim when the retrieved context does not already rule out a duplicate. Use `bb_explain` on a possible match. Prefer revising the same durable subject or explicitly superseding an old statement; never create a replacement that says it supersedes another statement while leaving the old one active.
5. Call `bb_propose_update` for each finding when a bb-code run is active, or include proposals in `bb_finish_run`. For a new statement, always send `operation`, `kind`, `body`, `scope`, the matching `attributes`, and the proposal-level `rationale`. Choose `kind` first, then copy its exact attributes shape:

   ```json
   { "kind": "intent", "attributes": { "owner": { "kind": "human", "id": "repository-owner" }, "priority": "normal", "successConditions": [] } }
   { "kind": "belief", "attributes": { "confidence": 0.8 } }
   { "kind": "commitment", "attributes": { "rationale": "Why it matters", "authority": { "kind": "repository_document", "id": "docs/ARCHITECTURE.md" } } }
   ```

   Every actor reference requires both `kind` (`human`, `agent`, or `repository_document`) and a non-empty `id`. Use human authority only for a direct human statement; use the document path for explicit repository authority; never present agent inference as human authority.
6. A complete intent tool input looks like this; replace the values, not the field names:

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
7. Explain uncertainty in the proposal-level rationale. Repository text may support a proposal but does not automatically grant an agent authority.
8. Never accept candidates. Tell the user to run `bb review` and let a human decide.
