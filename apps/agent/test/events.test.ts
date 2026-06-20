import { describe, it, expect, vi } from "vitest";

vi.mock("@nanovpn/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nanovpn/core")>();
  return { ...actual, fetchSettlementTxHash: vi.fn().mockResolvedValue(null) };
});

import { startRun } from "../src/events";

function fakeDb() {
  const inserts: { table: string; row: any }[] = [];
  const updates: { table: string; row: any; eq: [string, any] }[] = [];
  return {
    inserts, updates,
    from(table: string) {
      return {
        insert(row: any) { inserts.push({ table, row }); return this; },
        update(row: any) { return { eq: (c: string, v: any) => { updates.push({ table, row, eq: [c, v] }); return Promise.resolve({}); } }; },
        select() { return this; },
        single() { return Promise.resolve({}); },
      };
    },
  };
}

describe("event writer", () => {
  it("creates the run row then writes ordered events", async () => {
    const db = fakeDb();
    const run = await startRun(db as any, { runId: "r1", goal: "check JP price", budgetMicroUsd: 500000, nodeId: "tokyo-1" });
    await run.reasoning("I'll use tokyo-1");
    await run.toolCall("payRequest", { url: "https://x" });
    await run.payment({ amountMicroUsd: 1000, transaction: "tx1", status: 200, bytes: 2048, egressIp: "203.0.113.7", nodeId: "tokyo-1" });
    await run.finish("succeeded", "done");

    const runRow = db.inserts.find((i) => i.table === "agent_runs")!.row;
    expect(runRow).toMatchObject({ id: "r1", goal: "check JP price", budget_micro_usd: 500000, node_id: "tokyo-1", status: "running" });

    const events = db.inserts.filter((i) => i.table === "agent_events").map((i) => i.row);
    expect(events.map((e) => e.kind)).toEqual(["reasoning", "tool_call", "payment", "result"]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]); // monotonic
    expect(events[2].content).toMatchObject({ amountMicroUsd: 1000, transaction: "tx1" });

    // run.spent bumped on payment; status/ended_at set on finish
    const spentUpdate = db.updates.find((u) => u.table === "agent_runs" && "spent_micro_usd" in u.row);
    expect(spentUpdate?.row.spent_micro_usd).toBe(1000);
    const finishUpdate = db.updates.find((u) => u.table === "agent_runs" && u.row.status === "succeeded");
    expect(finishUpdate).toBeTruthy();
  });
});
