import { describe, expect, it } from "vitest";
import type { CandidateProposal } from "../../../src/domain/knowledge.js";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

const intent: CandidateProposal = { operation: "create", kind: "intent", body: "Ship account deletion", scope: { kind: "repository" }, attributes: { owner, priority: "normal", successConditions: [] }, initialStatus: "active", rationale: "Requested outcome", evidencePaths: [], evidenceNotes: [] };
const belief: CandidateProposal = { operation: "create", kind: "belief", body: "SQLite stores account state", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, rationale: "Observed implementation", evidencePaths: [], evidenceNotes: [] };
const commitment: CandidateProposal = { operation: "create", kind: "commitment", body: "Account state must remain local", scope: { kind: "repository" }, attributes: { rationale: "Privacy boundary", authority: owner }, rationale: "Chosen constraint", evidencePaths: [], evidenceNotes: [] };

describe("knowledge mode automatic acceptance", () => {
  it("defaults to standard and automatically accepts intents and beliefs with provenance", () => {
    const fixture = createSqliteFixture();
    try {
      expect(fixture.database.knowledgePolicy(fixture.repositoryId).mode).toBe("standard");
      fixture.database.propose(fixture.repositoryId, undefined, intent, fixture.gitViewId);
      fixture.database.propose(fixture.repositoryId, undefined, belief, fixture.gitViewId);
      fixture.database.propose(fixture.repositoryId, undefined, commitment, fixture.gitViewId);

      expect(fixture.database.listStatements(fixture.repositoryId).map((item) => item.kind)).toEqual(["intent", "belief"]);
      expect(fixture.database.listCandidates(fixture.repositoryId)).toHaveLength(1);
      const automatic = fixture.database.listCandidates(fixture.repositoryId, "auto_accepted");
      expect(automatic).toHaveLength(2);
      expect(automatic[0]).toMatchObject({ resolvedBy: { kind: "agent", id: "bb-code-auto-accept" }, resolutionNote: "Automatically accepted by repository knowledge mode: standard" });
    } finally { fixture.dispose(); }
  });

  it("keeps everything pending in strict mode", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.setKnowledgeMode(fixture.repositoryId, "strict", owner);
      fixture.database.propose(fixture.repositoryId, undefined, intent, fixture.gitViewId);
      fixture.database.propose(fixture.repositoryId, undefined, belief, fixture.gitViewId);
      fixture.database.propose(fixture.repositoryId, undefined, commitment, fixture.gitViewId);
      expect(fixture.database.listStatements(fixture.repositoryId)).toEqual([]);
      expect(fixture.database.listCandidates(fixture.repositoryId)).toHaveLength(3);
    } finally { fixture.dispose(); }
  });

  it("automatically accepts commitments in yolo mode", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.setKnowledgeMode(fixture.repositoryId, "yolo", owner);
      fixture.database.propose(fixture.repositoryId, undefined, commitment, fixture.gitViewId);
      expect(fixture.database.listStatements(fixture.repositoryId)[0]).toMatchObject({ kind: "commitment", status: "accepted" });
      expect(fixture.database.listCandidates(fixture.repositoryId, "auto_accepted")).toHaveLength(1);
      expect(fixture.database.listCandidates(fixture.repositoryId)).toEqual([]);
    } finally { fixture.dispose(); }
  });
});
