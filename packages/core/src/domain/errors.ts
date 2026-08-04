export class BbError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "BbError";
  }
}

export function invariant(condition: unknown, message: string, code = "invariant_violation"): asserts condition {
  if (!condition) throw new BbError(message, code);
}
