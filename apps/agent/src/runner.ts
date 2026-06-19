import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { microUsdForRequest } from "@nanovpn/core";
import { Guardrails } from "./guardrails";
import { makeExecutors, TOOL_DEFS } from "./tools";
import { startRun } from "./events";
import { runAgent, systemPrompt } from "./run";
import { MockBrain, makeAnthropicBrain, type Brain } from "./brain";

export interface RunParams { goal: string; budgetUsd: number; nodeId: string; mock?: boolean; }

/** Build everything a run needs, insert the agent_runs row now (so the panel can find it),
 *  and return the runId plus a thunk that executes the agent loop. */
export async function prepareRun(params: RunParams): Promise<{ runId: string; run: () => Promise<{ status: string; result: string }> }> {
  const { goal, budgetUsd, nodeId } = params;
  const mock = params.mock || !process.env.ANTHROPIC_API_KEY;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: node } = await db.from("nodes").select("*").eq("id", nodeId).single();
  if (!node) throw new Error(`unknown node ${nodeId}`);

  const egressBaseUrl = `${node.proxy_url}/egress`;
  const priceMicroUsd = microUsdForRequest(node.price_per_request_usd);
  const budgetMicroUsd = microUsdForRequest(budgetUsd);

  const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });
  const executors = makeExecutors({
    nodesReader: async () => (await db.from("nodes").select("id,city,country,price_per_request_usd")).data ?? [],
    buyer: buyer as any,
    egressBaseUrl,
  });
  const guardrails = new Guardrails(budgetMicroUsd, priceMicroUsd);
  const runId = randomUUID();
  const events = await startRun(db as any, { runId, goal, budgetMicroUsd, nodeId });

  const brain: Brain = mock
    ? new MockBrain([
        { content: [{ type: "text", text: `(mock) I'll route through ${nodeId} and fetch the target once.` }, { type: "tool_use", id: "t1", name: "payRequest", input: { url: "https://speed.cloudflare.com/__down?bytes=1000000" } }], stopReason: "tool_use" },
        { content: [{ type: "text", text: "(mock) Egress complete; goal satisfied." }], stopReason: "end_turn" },
      ])
    : makeAnthropicBrain({ apiKey: process.env.ANTHROPIC_API_KEY!, system: systemPrompt(goal, budgetUsd), tools: TOOL_DEFS, effort: process.env.AGENT_EFFORT ?? "medium" });

  return { runId, run: () => runAgent({ brain, executors, guardrails, events, goal }) };
}
