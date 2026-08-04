import type { CurrentStatement } from "./knowledge.js";

export type ContextItem = CurrentStatement & {
  rank: number;
  finalScore: number;
  lexicalRank?: number;
  semanticRank?: number;
  freshness: "fresh" | "stale" | "unknown";
  applicabilityReason: string;
};

export type ContextResult = {
  retrievalId: string;
  runId?: string;
  items: ContextItem[];
  rendered: string;
  providerStatus: Record<string, unknown>;
};
