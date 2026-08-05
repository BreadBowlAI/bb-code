import { BbDatabase } from "../packages/core/dist/index.js";

const [databasePath, repositoryId, worktreeId, gitViewId, host] = process.argv.slice(2);
const database = new BbDatabase(databasePath);
try {
  for (let index = 0; index < 100; index += 1) {
    const sessionId = database.startSession({ repositoryId, worktreeId, host, externalSessionId: `${host}-${index}` });
    const runId = database.startRun({ sessionId, externalTurnId: `turn-${index}`, prompt: "Concurrent request", gitViewId });
    database.addRunEvent(runId, { kind: "after_tool", externalEventId: `tool-${index}`, toolName: "Read", consequential: false });
    database.finishRun({ runId, outcome: "completed", summary: "Concurrent completion", verification: [], effects: [], endGitViewId: gitViewId });
  }
} finally {
  database.close();
}
