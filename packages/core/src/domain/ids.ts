import { ulid } from "ulid";
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
