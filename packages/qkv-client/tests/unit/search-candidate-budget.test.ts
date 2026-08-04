import { describe, expect, it, vi } from "vitest";
import { QkvClient } from "../../src/index.js";

describe("QKV search candidate budget", () => {
  it("sends the larger candidate pool separately from the returned top-k", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    await new QkvClient({ baseUrl: "https://qkv.test", apiKey: "secret", fetch }).search("index-1", "authentication", 40, 100);
    const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ top_k: 40, candidate_k: 100 });
  });
});
