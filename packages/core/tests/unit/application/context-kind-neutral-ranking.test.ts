import { describe, expect, it } from "vitest";
import { rankContext } from "../../../src/application/context/rank-context.js";
import type { CurrentStatement } from "../../../src/domain/knowledge.js";

const belief: CurrentStatement = { id: "bel_1", revisionId: "rev_1", kind: "belief", body: "The account API supports password recovery", status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.95 }, revisionNumber: 1, createdAt: "2026-01-01T00:00:00Z" };
const commitment: CurrentStatement = { id: "com_1", revisionId: "rev_2", kind: "commitment", body: "Authentication must use access tokens", status: "accepted", scope: { kind: "repository" }, attributes: { rationale: "Security boundary", authority: { kind: "human", id: "owner" } }, revisionNumber: 1, createdAt: "2026-01-01T00:00:00Z" };

describe("statement-kind ranking", () => {
  it("keeps a more relevant belief ahead of a lower-ranked commitment", () => {
    const items = rankContext({ lexical: [{ statement: belief, rank: 1 }, { statement: commitment, rank: 2 }], semantic: [], resolveStatement: () => undefined, paths: [], maxItems: 12 });
    expect(items.map((item) => item.id)).toEqual([belief.id, commitment.id]);
  });
});
