import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CandidateProposalSchema, ContextEffectSchema, VerificationSchema, finishRun, getContext, openWorkspace, proposeUpdate } from "@breadbowl/bb-core";
import { configuredSemantic } from "../composition/semantic-provider.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "bb-code", version: "0.1.0" });
  server.registerTool("bb_context", {
    title: "Retrieve bb-code context",
    description: "Retrieve applicable project intents, beliefs, and commitments for a coding task.",
    inputSchema: { task: z.string().min(1), paths: z.array(z.string()).optional(), maxItems: z.number().int().min(1).max(12).optional() }
  }, async ({ task, paths, maxItems }) => {
    const semantic = await configuredSemantic(process.cwd());
    return result((await getContext({ cwd: process.cwd(), task, ...(paths ? { paths } : {}), ...(maxItems ? { maxItems } : {}), ...(semantic ? { semantic } : {}) })).rendered);
  });
  server.registerTool("bb_explain", {
    title: "Explain a statement",
    description: "Show the current revision, scope, status, and evidence-bearing identity of one statement.",
    inputSchema: { statementId: z.string().min(1) }
  }, async ({ statementId }) => result((await openWorkspace(process.cwd())).database.explainStatement(statementId)));
  server.registerTool("bb_propose_update", {
    title: "Propose a durable update",
    description: "Put a statement update into the human review queue. This never changes durable context directly.",
    inputSchema: { runId: z.string().min(1), proposal: CandidateProposalSchema }
  }, async ({ runId, proposal }) => result({ candidateId: await proposeUpdate(process.cwd(), runId, proposal) }));
  server.registerTool("bb_finish_run", {
    title: "Finish a bb-code run",
    description: "Record the task outcome, verification, context effects, and pending proposals at the learning boundary.",
    inputSchema: { runId: z.string().min(1), outcome: z.enum(["completed", "partial", "blocked", "failed"]), summary: z.string().min(1), verification: z.array(VerificationSchema).default([]), contextEffects: z.array(ContextEffectSchema).default([]), proposals: z.array(CandidateProposalSchema).default([]) }
  }, async (input) => result(await finishRun(process.cwd(), input)));
  return server;
}

export async function serveMcp(): Promise<void> {
  await createMcpServer().connect(new StdioServerTransport());
}
