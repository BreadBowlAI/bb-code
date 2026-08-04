import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("candidate single resolution", () => {
  it("rejects a second decision after human acceptance", () => {
    const fixture = createSqliteFixture();
    try {
      const proposal = { operation: "create" as const, kind: "belief" as const, body: "One reviewed result", scope: { kind: "repository" as const }, attributes: { confidence: 0.8 }, rationale: "Reviewed once", evidencePaths: [], evidenceNotes: [] };
      const id = fixture.database.propose(fixture.repositoryId, undefined, proposal, fixture.gitViewId);
      fixture.database.resolveCandidate(id, "accept", owner);

      expect(() => fixture.database.resolveCandidate(id, "accept", owner)).toThrow(/already resolved/);
      expect(fixture.database.listStatements(fixture.repositoryId)).toHaveLength(1);
    } finally {
      fixture.dispose();
    }
  });
});
