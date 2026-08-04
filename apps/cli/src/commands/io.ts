import type { ActorRef } from "@breadbowl/bb-core";

export const humanActor: ActorRef = { kind: "human", id: process.env.USER ?? "local-user" };

export function print(value: unknown, asJson = false): void {
  process.stdout.write(`${asJson ? JSON.stringify(value, null, 2) : String(value)}\n`);
}
