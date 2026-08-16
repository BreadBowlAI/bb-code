import { describe, expect, it } from "vitest";
import { shouldAutoAcceptProposal, type CandidateProposal } from "../../../src/domain/knowledge.js";

const belief: CandidateProposal = { operation: "create", kind: "belief", body: "SQLite is the local store", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, rationale: "Observed", evidencePaths: [], evidenceNotes: [] };
const commitment: CandidateProposal = { operation: "create", kind: "commitment", body: "SQLite must remain authoritative", scope: { kind: "repository" }, attributes: { rationale: "Local-first", authority: { kind: "agent", id: "codex" } }, rationale: "Chosen constraint", evidencePaths: [], evidenceNotes: [] };

describe("knowledge mode policy", () => {
  it("keeps every proposal pending in strict mode", () => {
    expect(shouldAutoAcceptProposal("strict", belief)).toBe(false);
    expect(shouldAutoAcceptProposal("strict", commitment)).toBe(false);
  });

  it("accepts intents and beliefs but not commitment-affecting changes in standard mode", () => {
    expect(shouldAutoAcceptProposal("standard", belief)).toBe(true);
    expect(shouldAutoAcceptProposal("standard", commitment)).toBe(false);
    expect(shouldAutoAcceptProposal("standard", { ...belief, operation: "reclassify", targetStatementId: "com_old" }, "commitment")).toBe(false);
  });

  it("accepts every proposal in yolo mode", () => {
    expect(shouldAutoAcceptProposal("yolo", commitment)).toBe(true);
  });
});
