import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { BbDatabase } from "../../../src/infrastructure/sqlite/bb-database.js";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { owner } from "../../support/statements.js";

describe("migration v4 evidence cleanup", () => {
  it("removes an accidental supports link when the evidence defines the same revision", () => {
    const fixture = createSqliteFixture();
    let reopened: BbDatabase | undefined;
    try {
      const candidateId = fixture.database.propose(fixture.repositoryId, undefined, {
        operation: "create",
        kind: "belief",
        body: "SQLite is available",
        scope: { kind: "repository" },
        attributes: { confidence: 0.9 },
        rationale: "Verified during setup",
        evidencePaths: [],
        evidenceNotes: []
      });
      const statement = fixture.database.resolveCandidate(candidateId, "accept", owner)!;
      const evidence = fixture.database.explainStatement(statement.id).history[0]!.evidence as Array<Record<string, unknown>>;
      const evidenceId = String(evidence[0]!.id);
      fixture.database.close();

      const raw = new DatabaseSync(fixture.database.filename);
      try {
        raw.prepare("INSERT INTO revision_evidence VALUES(?,?,?,datetime('now'))").run(statement.revisionId, evidenceId, "supports");
        raw.prepare("DELETE FROM schema_migrations WHERE version=4").run();
      } finally { raw.close(); }

      reopened = new BbDatabase(fixture.database.filename);
      const migratedEvidence = reopened.explainStatement(statement.id).history[0]!.evidence as Array<Record<string, unknown>>;
      expect(migratedEvidence).toHaveLength(1);
      expect(migratedEvidence[0]).toMatchObject({ id: evidenceId, relationship: "defines" });
    } finally {
      reopened?.close();
      fixture.dispose();
    }
  });
});
