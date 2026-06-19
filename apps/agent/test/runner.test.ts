import { describe, it, expect, vi, beforeEach } from "vitest";

const inserted: any[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: { id: "tokyo-1", proxy_url: "http://localhost:8080", price_per_request_usd: 0.001, city: "Tokyo", country: "Japan" } }) }),
      }),
      insert: (row: any) => { if (t === "agent_runs") inserted.push(row); return Promise.resolve({}); },
      update: () => ({ eq: () => Promise.resolve({}) }),
    }),
  }),
}));
vi.mock("@circle-fin/x402-batching/client", () => ({ GatewayClient: class { pay() {} getBalances() {} } }));

import { prepareRun } from "../src/runner";

beforeEach(() => { inserted.length = 0; delete process.env.ANTHROPIC_API_KEY; });

describe("prepareRun", () => {
  it("inserts the run row and returns a runId + run thunk", async () => {
    const { runId, run } = await prepareRun({ goal: "g", budgetUsd: 0.02, nodeId: "tokyo-1", mock: true });
    expect(runId).toMatch(/[0-9a-f-]{36}/);
    expect(typeof run).toBe("function");
    expect(inserted[0]).toMatchObject({ id: runId, goal: "g", node_id: "tokyo-1", status: "running" });
  });
});
