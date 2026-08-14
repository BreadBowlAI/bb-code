import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { beliefDraft } from "../../support/statements.js";

describe("QKV job status summary", () => {
  it("distinguishes pending, waiting, and exhausted work without hiding the latest error", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.createStatement(fixture.repositoryId, beliefDraft());
      const job = fixture.database.pendingRetrievalJobs(fixture.repositoryId)[0]!;
      for (let attempt = 0; attempt < 8; attempt += 1) fixture.database.completeRetrievalJob(job.id, "QKV unavailable");

      expect(fixture.database.retrievalJobSummary(fixture.repositoryId, "qkv")).toMatchObject({ pending: 0, failed: 1, completed: 0, ready: 0, waiting: 0, exhausted: 1, lastError: "QKV unavailable" });
    } finally { fixture.dispose(); }
  });
});
