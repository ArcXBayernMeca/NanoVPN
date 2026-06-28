// apps/agent/test/runner-per-user-key.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const ctorArgs: any[] = [];
vi.mock("@circle-fin/x402-batching/client", () => ({
  GatewayClient: vi.fn().mockImplementation((cfg: any) => { ctorArgs.push(cfg); return {}; }),
}));

// Minimal Supabase mock: one node so prepareRun proceeds, plus a no-op events insert.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: [{ id: "tokyo-1", city: "Tokyo", country: "Japan", proxy_url: "http://x", price_per_request_usd: 0.001 }] }),
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://x";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
process.env.BUYER_PRIVATE_KEY = "0xenvkey0000000000000000000000000000000000000000000000000000000000";

import { prepareRun } from "../src/runner";

beforeEach(() => { ctorArgs.length = 0; });

describe("prepareRun buyerPrivateKey", () => {
  it("uses the per-user key when provided", async () => {
    await prepareRun({ goal: "g", budgetUsd: 0.02, mock: true, buyerPrivateKey: "0xUSERKEY" });
    expect(ctorArgs[0]).toMatchObject({ chain: "arcTestnet", privateKey: "0xUSERKEY" });
  });

  it("falls back to the env key when no per-user key is given", async () => {
    await prepareRun({ goal: "g", budgetUsd: 0.02, mock: true });
    expect(ctorArgs[0].privateKey).toBe(process.env.BUYER_PRIVATE_KEY);
  });
});
