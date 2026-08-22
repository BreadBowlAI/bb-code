import { ulid } from "ulid";
import { z } from "zod";
import type { StatementKind } from "./knowledge.js";

export type IdPrefix = "repo" | "loc" | "wtr" | "view" | "sess" | "run" | "evt" | "int" | "bel" | "com" | "rev" | "ev" | "cand" | "ret" | "job";

export function createId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}

export function statementPrefix(kind: StatementKind): IdPrefix {
  if (kind === "intent") return "int";
  if (kind === "belief") return "bel";
  return "com";
}

/** Accept either a raw statement ID or the citation form rendered by bb-code. */
export function normalizeStatementReference(value: string): string {
  const trimmed = value.trim();
  const match = /^(?:bb:)?((?:int|bel|com)_[A-Za-z0-9_-]+)(?:@rev_[A-Za-z0-9_-]+)?$/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

export const StatementReferenceSchema = z.string().trim().min(1).transform(normalizeStatementReference);
