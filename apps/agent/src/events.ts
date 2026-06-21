import { fetchSettlementTxHash } from "@nanovpn/core";

type DbLike = {
  from(table: string): {
    insert(row: unknown): unknown;
    update(row: unknown): { eq(col: string, val: unknown): Promise<unknown> };
  };
};

export interface RunWriter {
  runId: string;
  reasoning(text: string): Promise<void>;
  toolCall(name: string, input: unknown): Promise<void>;
  payment(p: { amountMicroUsd: number; transaction: string; status: number; bytes: number; egressIp: string; nodeId: string }): Promise<void>;
  error(message: string): Promise<void>;
  finish(status: "succeeded" | "failed" | "budget_exhausted", result: string): Promise<void>;
  setNode(nodeId: string): Promise<void>;
}

export async function startRun(
  db: DbLike,
  opts: { runId: string; goal: string; budgetMicroUsd: number; nodeId: string | null },
): Promise<RunWriter> {
  await db.from("agent_runs").insert({
    id: opts.runId, goal: opts.goal, budget_micro_usd: opts.budgetMicroUsd, node_id: opts.nodeId, status: "running",
  });
  let seq = 0;
  let spent = 0;
  let nodeSet = false;

  const event = async (kind: string, content: unknown) => {
    seq += 1;
    await db.from("agent_events").insert({ run_id: opts.runId, seq, kind, content });
  };

  return {
    runId: opts.runId,
    reasoning: (text) => event("reasoning", { text }),
    toolCall: (name, input) => event("tool_call", { name, input }),
    async payment(p) {
      const txHash = await fetchSettlementTxHash(p.transaction);
      await event("payment", { ...p, txHash });
      spent += p.amountMicroUsd;
      await db.from("agent_runs").update({ spent_micro_usd: spent }).eq("id", opts.runId);
    },
    error: (message) => event("error", { message }),
    async finish(status, result) {
      await event("result", { result });
      await db.from("agent_runs").update({ status, result, ended_at: new Date().toISOString() }).eq("id", opts.runId);
    },
    async setNode(nodeId) {
      if (nodeSet) return;
      nodeSet = true;
      await db.from("agent_runs").update({ node_id: nodeId }).eq("id", opts.runId);
    },
  };
}
