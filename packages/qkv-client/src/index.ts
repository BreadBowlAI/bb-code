import { z } from "zod";

const IndexSchema = z.object({ id: z.string() }).passthrough();
const SearchHitSchema = z.object({ doc_id: z.string(), chunk_id: z.string().optional(), score: z.number(), metadata: z.record(z.string(), z.unknown()).optional() });
const SearchResponseSchema = z.union([z.array(SearchHitSchema), z.object({ results: z.array(SearchHitSchema) })]);

export type QkvDocument = { id: string; text: string; metadata: Record<string, unknown> };
export type QkvSearchHit = z.infer<typeof SearchHitSchema>;

export class QkvClient {
  constructor(readonly options: { baseUrl: string; apiKey: string; fetch?: typeof globalThis.fetch }) {}

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const response = await (this.options.fetch ?? globalThis.fetch)(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json", ...init.headers }
    });
    if (!response.ok) throw new Error(`QKV ${response.status}: ${(await response.text()).slice(0, 500)}`);
    if (response.status === 204) return undefined;
    return response.json();
  }

  async createIndex(name: string): Promise<{ id: string }> {
    return IndexSchema.parse(await this.request("/v1/indexes", { method: "POST", body: JSON.stringify({ name, text_retention: "none" }) }));
  }

  async upsertDocument(indexId: string, document: QkvDocument): Promise<void> {
    await this.request(`/v1/indexes/${encodeURIComponent(indexId)}/documents`, { method: "POST", body: JSON.stringify({ doc_id: document.id, text: document.text, metadata: document.metadata }) });
  }

  async deleteDocument(indexId: string, documentId: string): Promise<void> {
    await this.request(`/v1/indexes/${encodeURIComponent(indexId)}/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
  }

  async search(indexId: string, query: string, topK = 40, signal?: AbortSignal): Promise<QkvSearchHit[]> {
    const parsed = SearchResponseSchema.parse(await this.request(`/v1/indexes/${encodeURIComponent(indexId)}/search`, { method: "POST", body: JSON.stringify({ query, top_k: topK }), ...(signal ? { signal } : {}) }));
    return Array.isArray(parsed) ? parsed : parsed.results;
  }
}

export function semanticProvider(client: QkvClient, indexId: string) {
  return {
    async search(input: { query: string; topK: number; candidateK: number; signal?: AbortSignal }) {
      const hits = await client.search(indexId, input.query, input.topK, input.signal);
      return hits.map((hit) => ({ statementId: String(hit.metadata?.statement_id ?? hit.doc_id), ...(hit.metadata?.revision_id ? { revisionId: String(hit.metadata.revision_id) } : {}), score: hit.score }));
    }
  };
}
