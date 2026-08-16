import { describe, expect, it } from "vitest";
import { rankContext } from "../../../src/application/context/rank-context.js";
import type { CurrentStatement } from "../../../src/domain/knowledge.js";

const statement = (id: string): CurrentStatement => ({ id, revisionId: `rev_${id}`, kind: "belief", body: `Behavior ${id}`, status: "active", scope: { kind: "repository" }, attributes: { confidence: 0.8 }, revisionNumber: 1, createdAt: "2026-01-01T00:00:00Z" });

describe("semantic score ranking", () => {
  it("orders semantic candidates by provider score instead of transport order", () => {
    const low = statement("bel_low");
    const high = statement("bel_high");
    const statements = new Map([[low.id, low], [high.id, high]]);
    const items = rankContext({ lexical: [], semantic: [{ statementId: low.id, score: 0.2 }, { statementId: high.id, score: 0.9 }], resolveStatement: (id) => statements.get(id), paths: [], maxItems: 12 });
    expect(items.map((item) => item.id)).toEqual([high.id, low.id]);
  });
});
