import { describe, expect, it, vi } from "vitest";
import { QkvClient } from "../../src/index.js";

describe("QKV document upsert request", () => {
  it("sends the server's documents-array contract", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ upserted_documents: 1, failed: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    await new QkvClient({ baseUrl: "https://qkv.test", apiKey: "secret", fetch }).upsertDocument("index-1", { id: "bb:bel_1", text: "A reviewed belief", metadata: { statement_id: "bel_1" } });

    const [, request] = fetch.mock.calls[0]!;
    expect(JSON.parse(String(request?.body))).toEqual({ documents: [{ doc_id: "bb:bel_1", text: "A reviewed belief", metadata: { statement_id: "bel_1" } }] });
  });
});
