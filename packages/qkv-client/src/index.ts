import { z } from "zod";

const IndexSchema = z.object({ id: z.string(), model: z.string().optional(), model_version: z.string().optional() }).passthrough();
const SearchHitSchema = z.object({ doc_id: z.string(), chunk_id: z.string().optional(), score: z.number(), metadata: z.record(z.string(), z.unknown()).optional() });
const SearchResponseSchema = z.union([z.array(SearchHitSchema), z.object({ results: z.array(SearchHitSchema) })]);
const UpsertResponseSchema = z.object({
  upserted_documents: z.number().int().nonnegative(),
  failed: z.array(z.object({ doc_id: z.string(), error: z.string().optional() }).passthrough()).default([])
}).passthrough();

export type QkvDocument = { id: string; text: string; metadata: Record<string, unknown> };
export type QkvSearchHit = z.infer<typeof SearchHitSchema>;

export class QkvClient {
  constructor(readonly options: { baseUrl: string; apiKey: string; fetch?: typeof globalThis.fetch; requestTimeoutMs?: number }) {}

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const response = await (this.options.fetch ?? globalThis.fetch)(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(this.options.requestTimeoutMs ?? 10_000),
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json", ...init.headers }
    });
    if (!response.ok) throw new Error(`QKV ${response.status}: ${(await response.text()).slice(0, 500)}`);
    if (response.status === 204) return undefined;
    return response.json();
  }

  async createIndex(name: string): Promise<{ id: string; model?: string; model_version?: string }> {
    const parsed = IndexSchema.parse(await this.request("/v1/indexes", { method: "POST", body: JSON.stringify({ name, text_retention: "none" }) }));
    return { id: parsed.id, ...(parsed.model ? { model: parsed.model } : {}), ...(parsed.model_version ? { model_version: parsed.model_version } : {}) };
  }

  async upsertDocument(indexId: string, document: QkvDocument): Promise<void> {
    const parsed = UpsertResponseSchema.parse(await this.request(`/v1/indexes/${encodeURIComponent(indexId)}/documents`, {
      method: "POST",
      body: JSON.stringify({ documents: [{ doc_id: document.id, text: document.text, metadata: document.metadata }] })
    }));
    const failure = parsed.failed.find((item) => item.doc_id === document.id);
    if (failure) throw new Error(`QKV document ${document.id} failed: ${failure.error ?? "unknown ingestion error"}`);
    if (parsed.upserted_documents !== 1) throw new Error(`QKV did not confirm document ${document.id} was upserted`);
  }

  async deleteDocument(indexId: string, documentId: string): Promise<void> {
    await this.request(`/v1/indexes/${encodeURIComponent(indexId)}/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
  }

  async search(indexId: string, query: string, topK = 40, candidateK = 100, signal?: AbortSignal): Promise<QkvSearchHit[]> {
    const parsed = SearchResponseSchema.parse(await this.request(`/v1/indexes/${encodeURIComponent(indexId)}/search`, { method: "POST", body: JSON.stringify({ query, top_k: topK, candidate_k: candidateK }), ...(signal ? { signal } : {}) }));
    return Array.isArray(parsed) ? parsed : parsed.results;
  }
}

export function semanticProvider(client: QkvClient, indexId: string) {
  return {
    async search(input: { query: string; topK: number; candidateK: number; signal?: AbortSignal }) {
      const hits = await client.search(indexId, input.query, input.topK, input.candidateK, input.signal);
      return hits.map((hit) => ({ statementId: String(hit.metadata?.statement_id ?? hit.doc_id).replace(/^bb:/, ""), ...(hit.metadata?.revision_id ? { revisionId: String(hit.metadata.revision_id) } : {}), score: hit.score }));
    }
  };
}
