import { describe, expect, it, vi } from "vitest";
import { QkvClient } from "../../src/index.js";

describe("QKV search response", () => {
  it("normalizes the wrapped result payload", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{ doc_id: "bel_1", score: 0.92, metadata: { revision_id: "rev_1" } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const hits = await new QkvClient({ baseUrl: "https://qkv.test", apiKey: "secret", fetch }).search("index-1", "authentication");
    expect(hits).toEqual([{ doc_id: "bel_1", score: 0.92, metadata: { revision_id: "rev_1" } }]);
  });
});
