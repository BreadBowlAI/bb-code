import { createHash } from "node:crypto";
import { invariant } from "../../domain/errors.js";
import { createId } from "../../domain/ids.js";
import type { RequestIntentDecision } from "../../domain/runtime.js";
import type { SqliteConnection } from "./connection.js";
import { now, toJson } from "./values.js";

export type RunEventInput = {
  kind: string;
  externalEventId?: string;
  gitViewId?: string;
  toolName?: string;
  outcome?: string;
  paths?: string[];
  pathBlobs?: Record<string, string>;
  inputSummary?: string;
  outputExcerpt?: string;
  payload?: unknown;
  occurredAt?: string;
  consequential?: boolean;
  evidenceKind?: string;
  evidenceSummary?: string;
};

export type FinishRunRecord = {
  runId: string;
  outcome: string;
  summary: string;
  verification: unknown[];
  effects: Array<{ statementId: string; effect: string; note?: string }>;
  requestIntent: RequestIntentDecision;
  endGitViewId?: string;
  noDurableLearningReason?: string;
};

export type LearningMetrics = {
  runs: number;
  requestIntents: { durable: number; ephemeral: number; missing: number };
  retrievals: number;
  retrievedItems: number;
  contextEffects: { material: number; noEffect: number };
};

export class RunStore {
  constructor(private readonly connection: SqliteConnection) {}

  startSession(input: { repositoryId: string; worktreeId: string; host: string; externalSessionId: string; metadata?: unknown }): string {
    const database = this.connection.database;
    return this.connection.transaction(() => {
      const existing = database.prepare("SELECT id FROM agent_sessions WHERE host=? AND external_session_id=? AND worktree_id=?").get(input.host, input.externalSessionId, input.worktreeId) as { id: string } | undefined;
      if (existing) return existing.id;
      const id = createId("sess");
      database.prepare("INSERT INTO agent_sessions VALUES(?, ?, ?, ?, ?, ?, NULL, ?)").run(id, input.repositoryId, input.worktreeId, input.host, input.externalSessionId, now(), toJson(input.metadata ?? {}));
      return id;
    });
  }

  endSession(host: string, externalSessionId: string): void {
    const database = this.connection.database;
    const timestamp = now();
    database.prepare("UPDATE runs SET status='abandoned',summary=COALESCE(summary,'Session ended without bb_finish_run'),completion_reason='session_ended',finished_at=? WHERE status='running' AND agent_session_id IN (SELECT id FROM agent_sessions WHERE host=? AND external_session_id=?)").run(timestamp, host, externalSessionId);
    database.prepare("UPDATE agent_sessions SET ended_at=? WHERE host=? AND external_session_id=? AND ended_at IS NULL").run(timestamp, host, externalSessionId);
  }

  startRun(input: { sessionId: string; externalTurnId?: string; prompt: string; gitViewId: string }): string {
    const database = this.connection.database;
    return this.connection.transaction(() => {
      if (input.externalTurnId) {
        const existing = database.prepare("SELECT id FROM runs WHERE agent_session_id=? AND external_turn_id=?").get(input.sessionId, input.externalTurnId) as { id: string } | undefined;
        if (existing) return existing.id;
        database.prepare("UPDATE runs SET status='partial',summary=COALESCE(summary,'New request started without bb_finish_run'),completion_reason='missing_finish',finished_at=? WHERE agent_session_id=? AND status='running'").run(now(), input.sessionId);
      }
      const id = createId("run");
      database.prepare("INSERT INTO runs(id,agent_session_id,external_turn_id,prompt,status,start_git_view_id,started_at) VALUES(?,?,?,?,?,?,?)").run(id, input.sessionId, input.externalTurnId ?? null, input.prompt, "running", input.gitViewId, now());
      return id;
    });
  }

  latestRunningRun(host: string, externalSessionId: string): string | undefined {
    const row = this.connection.database.prepare("SELECT r.id FROM runs r JOIN agent_sessions s ON s.id=r.agent_session_id WHERE s.host=? AND s.external_session_id=? AND r.status='running' ORDER BY r.started_at DESC LIMIT 1").get(host, externalSessionId) as { id: string } | undefined;
    return row?.id;
  }

  latestRunningRunForRequest(repositoryId: string, worktreeId: string, prompt: string): string | undefined {
    const row = this.connection.database.prepare(`SELECT r.id FROM runs r
      JOIN agent_sessions s ON s.id=r.agent_session_id
      WHERE s.repository_id=? AND s.worktree_id=? AND r.prompt=? AND r.status='running'
      ORDER BY r.started_at DESC LIMIT 1`).get(repositoryId, worktreeId, prompt) as { id: string } | undefined;
    return row?.id;
  }

  belongsToRepository(runId: string, repositoryId: string): boolean {
    return Boolean(this.connection.database.prepare("SELECT 1 FROM runs r JOIN agent_sessions s ON s.id=r.agent_session_id WHERE r.id=? AND s.repository_id=?").get(runId, repositoryId));
  }

  isRunning(runId: string): boolean {
    return Boolean(this.connection.database.prepare("SELECT 1 FROM runs WHERE id=? AND status='running'").get(runId));
  }

  hasConsequentialEvents(runId: string): boolean {
    return Boolean(this.connection.database.prepare("SELECT 1 FROM run_events WHERE run_id=? AND consequential=1 LIMIT 1").get(runId));
  }

  hasToolEvents(runId: string): boolean {
    return Boolean(this.connection.database.prepare("SELECT 1 FROM run_events WHERE run_id=? AND kind='after_tool' LIMIT 1").get(runId));
  }

  hostRunCounts(repositoryId: string): Record<string, number> {
    const rows = this.connection.database.prepare(`SELECT s.host, COUNT(*) AS count
      FROM runs r JOIN agent_sessions s ON s.id=r.agent_session_id
      WHERE s.repository_id=? GROUP BY s.host`).all(repositoryId) as Array<{ host: string; count: number }>;
    return Object.fromEntries(rows.map((row) => [row.host, Number(row.count)]));
  }

  learningMetrics(repositoryId: string): LearningMetrics {
    const database = this.connection.database;
    const runs = Number((database.prepare("SELECT COUNT(*) AS n FROM runs r JOIN agent_sessions s ON s.id=r.agent_session_id WHERE s.repository_id=?").get(repositoryId) as { n: number }).n);
    const decisions = database.prepare(`SELECT COALESCE(json_extract(r.request_intent_json,'$.disposition'),'missing') AS disposition,COUNT(*) AS n
      FROM runs r JOIN agent_sessions s ON s.id=r.agent_session_id WHERE s.repository_id=? GROUP BY disposition`).all(repositoryId) as Array<{ disposition: string; n: number }>;
    const decisionCount = (disposition: string) => Number(decisions.find((row) => row.disposition === disposition)?.n ?? 0);
    const retrievals = Number((database.prepare("SELECT COUNT(*) AS n FROM retrievals WHERE repository_id=?").get(repositoryId) as { n: number }).n);
    const retrievedItems = Number((database.prepare("SELECT COUNT(*) AS n FROM retrieval_items i JOIN retrievals r ON r.id=i.retrieval_id WHERE r.repository_id=?").get(repositoryId) as { n: number }).n);
    const effects = database.prepare(`SELECT CASE WHEN c.effect='no_effect' THEN 'no_effect' ELSE 'material' END AS outcome,COUNT(*) AS n
      FROM context_effects c JOIN runs r ON r.id=c.run_id JOIN agent_sessions s ON s.id=r.agent_session_id
      WHERE s.repository_id=? GROUP BY outcome`).all(repositoryId) as Array<{ outcome: string; n: number }>;
    return {
      runs,
      requestIntents: { durable: decisionCount("durable"), ephemeral: decisionCount("ephemeral"), missing: decisionCount("missing") },
      retrievals,
      retrievedItems,
      contextEffects: {
        material: Number(effects.find((row) => row.outcome === "material")?.n ?? 0),
        noEffect: Number(effects.find((row) => row.outcome === "no_effect")?.n ?? 0)
      }
    };
  }

  startGitViewId(runId: string): string | undefined {
    const row = this.connection.database.prepare("SELECT start_git_view_id FROM runs WHERE id=?").get(runId) as { start_git_view_id: string } | undefined;
    return row?.start_git_view_id;
  }

  addEvent(runId: string, event: RunEventInput): boolean {
    const database = this.connection.database;
    invariant(database.prepare("SELECT 1 FROM runs WHERE id=?").get(runId), `Run ${runId} was not found`, "invalid_run");
    const consequential = event.consequential ?? (event.kind === "after_tool" && ((event.paths?.length ?? 0) > 0 || Boolean(event.outcome)));
    let inserted = false;
    this.connection.transaction(() => {
      const sequence = Number((database.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM run_events WHERE run_id=?").get(runId) as { n: number }).n);
      const result = database.prepare(`INSERT INTO run_events(id,run_id,sequence,kind,external_event_id,tool_name,outcome,paths_json,input_summary,output_excerpt,sanitized_payload_json,occurred_at,git_view_id,consequential)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(run_id,kind,external_event_id) WHERE external_event_id IS NOT NULL DO NOTHING`).run(createId("evt"), runId, sequence, event.kind, event.externalEventId ?? null, event.toolName ?? null, event.outcome ?? null, toJson(event.paths ?? []), event.inputSummary ?? null, event.outputExcerpt?.slice(0, 4096) ?? null, toJson(event.payload ?? {}), event.occurredAt ?? now(), event.gitViewId ?? null, consequential ? 1 : 0);
      inserted = Number(result.changes) === 1;
      if (!inserted) return;
      if (event.evidenceKind && event.evidenceSummary) {
        const run = database.prepare("SELECT s.repository_id FROM runs r JOIN agent_sessions s ON s.id=r.agent_session_id WHERE r.id=?").get(runId) as { repository_id: string };
        const evidenceId = createId("ev");
        const timestamp = now();
        database.prepare("INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?,?)").run(evidenceId, run.repository_id, runId, event.gitViewId ?? null, event.evidenceKind, event.evidenceSummary, event.outputExcerpt?.slice(0, 4096) ?? null, "{}", createHash("sha256").update(`${event.evidenceKind}:${event.evidenceSummary}:${event.externalEventId ?? sequence}`).digest("hex"), timestamp);
        for (const path of event.paths ?? []) database.prepare("INSERT INTO evidence_paths VALUES(?,?,?)").run(evidenceId, path, event.pathBlobs?.[path] ?? null);
      }
    });
    return inserted;
  }

  finish(input: FinishRunRecord): void {
    const database = this.connection.database;
    invariant(this.isRunning(input.runId), `Running run ${input.runId} was not found`, "invalid_run");
    this.connection.transaction(() => {
      const effectRows = input.effects.map((effect) => {
        const retrieval = database.prepare(`SELECT ri.retrieval_id FROM retrieval_items ri JOIN retrievals r ON r.id=ri.retrieval_id
          WHERE r.run_id=? AND ri.statement_id=? ORDER BY r.created_at DESC LIMIT 1`).get(input.runId, effect.statementId) as { retrieval_id: string } | undefined;
        invariant(retrieval, `Statement ${effect.statementId} was not retrieved for run ${input.runId}`, "invalid_context_effect");
        return { effect, retrievalId: retrieval.retrieval_id };
      });
      database.prepare("UPDATE runs SET status=?,summary=?,verification_json=?,finish_tool_called=1,end_git_view_id=COALESCE(?,end_git_view_id),no_durable_learning_reason=?,request_intent_json=?,completion_reason='reported',finished_at=? WHERE id=?").run(input.outcome, input.summary, toJson(input.verification), input.endGitViewId ?? null, input.noDurableLearningReason ?? null, toJson(input.requestIntent), now(), input.runId);
      for (const item of effectRows) database.prepare("INSERT INTO context_effects(id,run_id,statement_id,effect,note,created_at,retrieval_id) VALUES(?,?,?,?,?,?,?)").run(`ce_${createId("evt").slice(4)}`, input.runId, item.effect.statementId, item.effect.effect, item.effect.note ?? null, now(), item.retrievalId);
    });
  }

  handleStop(runId: string, policy: "nudge_once" | "finalize_partial" = "nudge_once"): "none" | "nudge" | "finalized" {
    const database = this.connection.database;
    const row = database.prepare("SELECT stop_nudge_count,finish_tool_called,status FROM runs WHERE id=?").get(runId) as { stop_nudge_count: number; finish_tool_called: number; status: string } | undefined;
    if (!row || row.finish_tool_called || row.status !== "running") return "none";
    if (policy === "finalize_partial" || row.stop_nudge_count > 0) {
      database.prepare("UPDATE runs SET status='partial',summary='Agent ended without bb_finish_run',completion_reason='missing_finish',finished_at=? WHERE id=?").run(now(), runId);
      return "finalized";
    }
    database.prepare("UPDATE runs SET stop_nudge_count=stop_nudge_count+1 WHERE id=?").run(runId);
    return "nudge";
  }
}
