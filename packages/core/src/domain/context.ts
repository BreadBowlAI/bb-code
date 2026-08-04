import type { CurrentStatement } from "./knowledge.js";

export type ContextItem = CurrentStatement & {
  rank: number;
  finalScore: number;
  lexicalRank?: number;
  semanticRank?: number;
  freshness: "fresh" | "stale" | "unknown";
  applicabilityReason: string;
  conflict?: boolean;
};

export type StatementApplicability = {
  applies: boolean;
  freshness: "fresh" | "stale" | "unknown";
  reason: string;
};

export type ContextResult = {
  retrievalId: string;
  runId?: string;
  items: ContextItem[];
  rendered: string;
  conflicts: string[];
  providerStatus: Record<string, unknown>;
};
