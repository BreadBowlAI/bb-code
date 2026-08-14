import { describe, expect, it, vi } from "vitest";
import { QkvClient } from "../../src/index.js";

describe("QKV document upsert response", () => {
  it("treats an HTTP 200 partial failure as a failed job", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ upserted_documents: 0, failed: [{ doc_id: "bb:bel_1", error: "worker unavailable" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new QkvClient({ baseUrl: "https://qkv.test", apiKey: "secret", fetch });

    await expect(client.upsertDocument("index-1", { id: "bb:bel_1", text: "A reviewed belief", metadata: {} })).rejects.toThrow("worker unavailable");
  });
});
