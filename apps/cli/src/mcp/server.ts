import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CandidateProposalSchema, ContextEffectSchema, VerificationSchema, finishRun, getContext, openWorkspace, proposeUpdate } from "@breadbowl/bb-core";
import { configuredSemantic } from "../composition/semantic-provider.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

export const MCP_TOOL_NAMES = ["bb_context", "bb_explain", "bb_propose_update", "bb_finish_run"] as const;

const PROPOSAL_GUIDANCE = `Choose the proposal kind before constructing attributes. Exact create shapes:
- intent: attributes { owner: { kind: "human"|"agent"|"repository_document", id: string, label?: string }, priority: "low"|"normal"|"high", successConditions: string[] }
- belief: attributes { confidence: number from 0 to 1 }
- commitment: attributes { rationale: string, authority: { kind: "human"|"agent"|"repository_document", id: string, label?: string }, revisitCondition?: string }
For a direct user statement, use an explicit human actor such as { kind: "human", id: "repository-owner" }; never invent human authority for an agent-derived decision. Use repository_document with the supporting path for explicit repository authority. For non-create operations, provide targetStatementId and call bb_explain first if the current kind or attributes are uncertain.`;

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "bb-code", version: "0.1.0" });
  server.registerTool(MCP_TOOL_NAMES[0], {
    title: "Retrieve bb-code context",
    description: "Retrieve applicable project intents, beliefs, and commitments for a coding request.",
    inputSchema: { request: z.string().min(1), paths: z.array(z.string()).optional(), maxItems: z.number().int().min(1).max(12).optional() }
  }, async ({ request, paths, maxItems }) => {
    const semantic = await configuredSemantic(process.cwd());
    return result((await getContext({ cwd: process.cwd(), request, ...(paths ? { paths } : {}), ...(maxItems ? { maxItems } : {}), ...(semantic ? { semantic } : {}) })).rendered);
  });
  server.registerTool(MCP_TOOL_NAMES[1], {
    title: "Explain a statement",
    description: "Show the current revision, scope, status, and evidence-bearing identity of one statement.",
    inputSchema: { statementId: z.string().min(1) }
  }, async ({ statementId }) => {
    const workspace = await openWorkspace(process.cwd());
    try { return result(workspace.database.explainStatement(statementId)); }
    finally { workspace.database.close(); }
  });
  server.registerTool(MCP_TOOL_NAMES[2], {
    title: "Propose a durable update",
    description: `Put a statement update into the human review queue. This never changes durable context directly. ${PROPOSAL_GUIDANCE}`,
    inputSchema: { runId: z.string().min(1), proposal: CandidateProposalSchema }
  }, async ({ runId, proposal }) => result({ candidateId: await proposeUpdate(process.cwd(), runId, proposal) }));
  server.registerTool(MCP_TOOL_NAMES[3], {
    title: "Finish a bb-code run",
    description: `Record the run outcome, verification, context effects, and pending proposals at the learning boundary. A consequential run with no proposals must explain why it produced no durable learning. ${PROPOSAL_GUIDANCE}`,
    inputSchema: { runId: z.string().min(1), outcome: z.enum(["completed", "partial", "blocked", "failed"]), summary: z.string().min(1), verification: z.array(VerificationSchema).default([]), contextEffects: z.array(ContextEffectSchema).default([]), proposals: z.array(CandidateProposalSchema).default([]), noDurableLearningReason: z.string().trim().min(1).optional() }
  }, async (input) => result(await finishRun(process.cwd(), input)));
  return server;
}

export async function serveMcp(): Promise<void> {
  await createMcpServer().connect(new StdioServerTransport());
}
