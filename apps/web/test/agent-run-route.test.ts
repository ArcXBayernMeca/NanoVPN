import { describe, it, expect, vi } from "vitest";

const prepareRun = vi.fn();
vi.mock("@nanovpn/agent/runner", () => ({ prepareRun: (...a: any[]) => prepareRun(...a) }));
vi.mock("next/server", async (orig) => {
  const mod = await (orig() as any);
  return { ...mod, after: (fn: any) => { /* don't execute the deferred run in tests */ void fn; } };
});

import { POST } from "@/app/api/agent/run/route";

function req(body: any) { return new Request("http://x/api/agent/run", { method: "POST", body: JSON.stringify(body) }) as any; }

describe("POST /api/agent/run", () => {
  it("400 on missing goal", async () => {
    const res = await POST(req({ budgetUsd: 0.02 }));
    expect(res.status).toBe(400);
  });
  it("400 on budget <= 0", async () => {
    const res = await POST(req({ goal: "g", budgetUsd: 0 }));
    expect(res.status).toBe(400);
  });
  it("400 when budget exceeds the server-side ceiling (anti-drain)", async () => {
    const res = await POST(req({ goal: "g", budgetUsd: 9999 }));
    expect(res.status).toBe(400);
    expect(prepareRun).not.toHaveBeenCalled();
  });
  it("returns the runId from prepareRun", async () => {
    prepareRun.mockResolvedValueOnce({ runId: "run-123", run: async () => ({ status: "succeeded", result: "ok" }) });
    const res = await POST(req({ goal: "fetch a file", budgetUsd: 0.02, mock: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runId: "run-123" });
    expect(prepareRun).toHaveBeenCalledWith({ goal: "fetch a file", budgetUsd: 0.02, mock: true });
  });
});
