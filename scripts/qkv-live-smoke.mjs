import { QkvClient } from "../packages/qkv-client/dist/index.js";

const baseUrl = process.env.BB_QKV_API_URL;
const apiKey = process.env.BB_QKV_API_KEY;
const indexId = process.env.BB_QKV_TEST_INDEX_ID;
const timeoutMs = Number(process.env.BB_QKV_TEST_TIMEOUT_MS ?? "10000");
if (!baseUrl || !apiKey || !indexId) throw new Error("BB_QKV_API_URL, BB_QKV_API_KEY, and BB_QKV_TEST_INDEX_ID are required");
if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("BB_QKV_TEST_TIMEOUT_MS must be a positive integer");
const client = new QkvClient({ baseUrl, apiKey });
const documentId = `bb-live-smoke-${Date.now()}`;
try {
  await client.upsertDocument(indexId, { id: documentId, text: "bb-code live integration smoke document", metadata: { purpose: "live-smoke" } });
  const hits = await client.search(indexId, "bb-code live integration smoke", 1, 10, AbortSignal.timeout(timeoutMs));
  if (!Array.isArray(hits)) throw new Error("QKV did not return a result array");
  process.stdout.write(`QKV live upsert and search succeeded with ${hits.length} hit(s).\n`);
} finally {
  await client.deleteDocument(indexId, documentId).catch(() => undefined);
}
