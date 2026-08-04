import { QkvClient } from "../packages/qkv-client/dist/index.js";

const baseUrl = process.env.BB_QKV_API_URL;
const apiKey = process.env.BB_QKV_API_KEY;
const indexId = process.env.BB_QKV_TEST_INDEX_ID;
if (!baseUrl || !apiKey || !indexId) throw new Error("BB_QKV_API_URL, BB_QKV_API_KEY, and BB_QKV_TEST_INDEX_ID are required");
const hits = await new QkvClient({ baseUrl, apiKey }).search(indexId, "bb-code live integration smoke", 1, 10, AbortSignal.timeout(1_200));
if (!Array.isArray(hits)) throw new Error("QKV did not return a result array");
process.stdout.write(`QKV live search succeeded with ${hits.length} hit(s).\n`);
