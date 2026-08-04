import { describe, expect, it, vi } from "vitest";
import { QkvClient } from "../../src/index.js";

describe("QKV create-index request", () => {
  it("uses bearer authentication and disables text retention", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "index-1" }), { status: 200, headers: { "content-type": "application/json" } }));
    await new QkvClient({ baseUrl: "https://qkv.test", apiKey: "secret", fetch }).createIndex("project");
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("https://qkv.test/v1/indexes");
    expect((request?.headers as Record<string, string>).authorization).toBe("Bearer secret");
    expect(JSON.parse(String(request?.body))).toMatchObject({ text_retention: "none" });
  });
});
