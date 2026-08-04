import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { beliefDraft } from "../../support/statements.js";

describe("QKV job retry backoff", () => {
  it("hides a failed job until its exponential retry time", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.createStatement(fixture.repositoryId, beliefDraft());
      const job = fixture.database.pendingRetrievalJobs(fixture.repositoryId)[0]!;
      fixture.database.completeRetrievalJob(job.id, "temporary network error");
      expect(fixture.database.pendingRetrievalJobs(fixture.repositoryId)).toEqual([]);
    } finally { fixture.dispose(); }
  });
});
