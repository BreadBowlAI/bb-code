#!/usr/bin/env node

const emitWarning = process.emitWarning;
process.emitWarning = ((warning: string | Error, ...arguments_: unknown[]) => {
  const message = warning instanceof Error ? warning.message : warning;
  if (message.includes("SQLite is an experimental feature")) return;
  return Reflect.apply(emitWarning, process, [warning, ...arguments_]);
}) as typeof process.emitWarning;

await import("./cli.js");
