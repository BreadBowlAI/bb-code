import type { ActorRef, StatementDraft } from "../../src/domain/knowledge.js";

export const owner: ActorRef = { kind: "human", id: "owner" };

export function beliefDraft(body = "SQLite FTS5 is available"): StatementDraft {
  return { kind: "belief", body, status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, actor: owner, evidence: { kind: "user_statement", summary: "Owner statement" } };
}

export function commitmentDraft(body = "Never send source code to remote retrieval providers"): StatementDraft {
  return { kind: "commitment", body, status: "accepted", scope: { kind: "repository" }, attributes: { rationale: "Privacy boundary", authority: owner }, actor: owner, evidence: { kind: "user_statement", summary: "Owner decision" } };
}
