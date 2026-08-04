export type SemanticHit = { statementId: string; revisionId?: string; score: number };

export interface SemanticRetrievalProvider {
  search(input: {
    query: string;
    topK: number;
    candidateK: number;
    signal?: AbortSignal;
  }): Promise<SemanticHit[]>;
}
