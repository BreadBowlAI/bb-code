export const now = (): string => new Date().toISOString();
export const toJson = (value: unknown): string => JSON.stringify(value);
export const fromJson = <T>(value: unknown): T => JSON.parse(String(value)) as T;
