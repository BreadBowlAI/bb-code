import { describe, expect, it } from "vitest";
import { createSqliteFixture } from "../../support/sqlite-fixture.js";
import { beliefDraft } from "../../support/statements.js";

describe("forced QKV job retry", () => {
  it("makes an exhausted failed job immediately retryable with a fresh attempt budget", () => {
    const fixture = createSqliteFixture();
    try {
      fixture.database.createStatement(fixture.repositoryId, beliefDraft());
      const job = fixture.database.pendingRetrievalJobs(fixture.repositoryId)[0]!;
      for (let attempt = 0; attempt < 8; attempt += 1) fixture.database.completeRetrievalJob(job.id, "temporary network error");

      expect(fixture.database.pendingRetrievalJobs(fixture.repositoryId)).toEqual([]);
      expect(fixture.database.resetFailedRetrievalJobsForRetry(fixture.repositoryId, "qkv")).toBe(1);
      expect(fixture.database.pendingRetrievalJobs(fixture.repositoryId)).toEqual([
        expect.objectContaining({ id: job.id, state: "failed", attempts: 0, next_attempt_at: null, last_error: "temporary network error" })
      ]);
    } finally { fixture.dispose(); }
  });
});
