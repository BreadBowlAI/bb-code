import { invariant } from "../../domain/errors.js";
import { createId } from "../../domain/ids.js";
import type { SqliteConnection } from "./connection.js";
import { now, toJson } from "./values.js";

export type RunEventInput = { kind: string; toolName?: string; outcome?: string; paths?: string[]; inputSummary?: string; outputExcerpt?: string; payload?: unknown; occurredAt?: string };
export type FinishRunRecord = { runId: string; outcome: string; summary: string; verification: unknown[]; effects: Array<{ statementId: string; effect: string; note?: string }>; endGitViewId?: string };

export class RunStore {
  constructor(private readonly connection: SqliteConnection) {}

  startSession(input: { repositoryId: string; worktreeId: string; host: string; externalSessionId: string; metadata?: unknown }): string {
    const database = this.connection.database;
    const existing = database.prepare("SELECT id FROM agent_sessions WHERE host=? AND external_session_id=? AND worktree_id=?").get(input.host, input.externalSessionId, input.worktreeId) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = createId("sess");
    database.prepare("INSERT INTO agent_sessions VALUES(?, ?, ?, ?, ?, ?, NULL, ?)").run(id, input.repositoryId, input.worktreeId, input.host, input.externalSessionId, now(), toJson(input.metadata ?? {}));
    return id;
  }

  endSession(host: string, externalSessionId: string): void {
    const database = this.connection.database;
    const timestamp = now();
    database.prepare("UPDATE runs SET status='abandoned',summary=COALESCE(summary,'Session ended without bb_finish_run'),finished_at=? WHERE status='running' AND agent_session_id IN (SELECT id FROM agent_sessions WHERE host=? AND external_session_id=?)").run(timestamp, host, externalSessionId);
    database.prepare("UPDATE agent_sessions SET ended_at=? WHERE host=? AND external_session_id=? AND ended_at IS NULL").run(timestamp, host, externalSessionId);
  }

  startRun(input: { sessionId: string; externalTurnId?: string; prompt: string; gitViewId: string }): string {
    const database = this.connection.database;
    if (input.externalTurnId) {
      const existing = database.prepare("SELECT id FROM runs WHERE agent_session_id=? AND external_turn_id=? AND status='running'").get(input.sessionId, input.externalTurnId) as { id: string } | undefined;
      if (existing) return existing.id;
    }
    const id = createId("run");
    database.prepare("INSERT INTO runs(id,agent_session_id,external_turn_id,prompt,status,start_git_view_id,started_at) VALUES(?,?,?,?,?,?,?)").run(id, input.sessionId, input.externalTurnId ?? null, input.prompt, "running", input.gitViewId, now());
    return id;
  }

  latestRunningRun(host: string, externalSessionId: string): string | undefined {
    const row = this.connection.database.prepare("SELECT r.id FROM runs r JOIN agent_sessions s ON s.id=r.agent_session_id WHERE s.host=? AND s.external_session_id=? AND r.status='running' ORDER BY r.started_at DESC LIMIT 1").get(host, externalSessionId) as { id: string } | undefined;
    return row?.id;
  }

  belongsToRepository(runId: string, repositoryId: string): boolean {
    return Boolean(this.connection.database.prepare("SELECT 1 FROM runs r JOIN agent_sessions s ON s.id=r.agent_session_id WHERE r.id=? AND s.repository_id=?").get(runId, repositoryId));
  }

  addEvent(runId: string, event: RunEventInput): void {
    const database = this.connection.database;
    const sequence = Number((database.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM run_events WHERE run_id=?").get(runId) as { n: number }).n);
    database.prepare("INSERT INTO run_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(createId("evt"), runId, sequence, event.kind, null, event.toolName ?? null, event.outcome ?? null, toJson(event.paths ?? []), event.inputSummary ?? null, event.outputExcerpt?.slice(0, 4096) ?? null, toJson(event.payload ?? {}), event.occurredAt ?? now());
  }

  finish(input: FinishRunRecord): void {
    const database = this.connection.database;
    invariant(database.prepare("SELECT 1 FROM runs WHERE id=? AND status='running'").get(input.runId), `Running run ${input.runId} was not found`, "invalid_run");
    this.connection.transaction(() => {
      database.prepare("UPDATE runs SET status=?,summary=?,verification_json=?,finish_tool_called=1,end_git_view_id=COALESCE(?,end_git_view_id),finished_at=? WHERE id=?").run(input.outcome, input.summary, toJson(input.verification), input.endGitViewId ?? null, now(), input.runId);
      for (const effect of input.effects) database.prepare("INSERT INTO context_effects VALUES(?,?,?,?,?,?)").run(`ce_${createId("evt").slice(4)}`, input.runId, effect.statementId, effect.effect, effect.note ?? null, now());
    });
  }

  handleStop(runId: string): "none" | "nudge" | "finalized" {
    const database = this.connection.database;
    const row = database.prepare("SELECT stop_nudge_count,finish_tool_called,status FROM runs WHERE id=?").get(runId) as { stop_nudge_count: number; finish_tool_called: number; status: string } | undefined;
    if (!row || row.finish_tool_called || row.status !== "running") return "none";
    const eventCount = Number((database.prepare("SELECT COUNT(*) AS n FROM run_events WHERE run_id=?").get(runId) as { n: number }).n);
    if (eventCount === 0) {
      database.prepare("UPDATE runs SET status='completed',summary='Finished without consequential tool events',finished_at=? WHERE id=?").run(now(), runId);
      return "finalized";
    }
    if (row.stop_nudge_count > 0) {
      database.prepare("UPDATE runs SET status='partial',summary='Agent ended without bb_finish_run',finished_at=? WHERE id=?").run(now(), runId);
      return "finalized";
    }
    database.prepare("UPDATE runs SET stop_nudge_count=stop_nudge_count+1 WHERE id=?").run(runId);
    return "nudge";
  }
}
