import { describe, expect, it } from "vitest";
import { BbDatabase } from "../../../src/infrastructure/sqlite/bb-database.js";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";

describe("migration v3 idempotency", () => {
  it("reopens an upgraded database without rewriting applied migrations", () => {
    const fixture = createSqliteFixture();
    const filename = fixture.database.filename;
    fixture.database.close();
    try {
      const reopened = new BbDatabase(filename);
      try { expect(reopened.health()).toMatchObject({ schemaVersion: 3, journalMode: "wal", foreignKeys: true }); }
      finally { reopened.close(); }
    } finally { fixture.dispose(); }
  });
});
