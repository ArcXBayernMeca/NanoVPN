import { describe, it, expect, vi } from "vitest";
import { runAgent } from "../src/run";
import { MockBrain } from "../src/brain";
import { Guardrails } from "../src/guardrails";

function recordingEvents() {
  const calls: string[] = [];
  return {
    calls,
    runId: "r1",
    reasoning: async (t: string) => { calls.push(`reasoning:${t}`); },
    toolCall: async (n: string) => { calls.push(`tool:${n}`); },
    payment: async (p: any) => { calls.push(`pay:${p.amountMicroUsd}`); },
    error: async (m: string) => { calls.push(`error:${m}`); },
    finish: async (s: string) => { calls.push(`finish:${s}`); },
  };
}

describe("runAgent", () => {
  it("runs reasoning → payRequest → end_turn and records events", async () => {
    const brain = new MockBrain([
      { content: [{ type: "text", text: "using tokyo-1" }, { type: "tool_use", id: "t1", name: "payRequest", input: { url: "https://x" } }], stopReason: "tool_use" },
      { content: [{ type: "text", text: "got it" }], stopReason: "end_turn" },
    ]);
    const executors = {
      listNodes: vi.fn(), getBalance: vi.fn(),
      payRequest: vi.fn().mockResolvedValue({ status: 200, bytes: 2048, egressIp: "203.0.113.7", amountMicroUsd: 1000, transaction: "tx1" }),
    };
    const guardrails = new Guardrails(500000, 1000);
    const events = recordingEvents();
    const out = await runAgent({ brain, executors: executors as any, guardrails, events: events as any, goal: "g" });
    expect(out.status).toBe("succeeded");
    expect(events.calls).toContain("reasoning:using tokyo-1");
    expect(events.calls).toContain("tool:payRequest");
    expect(events.calls).toContain("pay:1000");
    expect(events.calls).toContain("finish:succeeded");
    expect(guardrails.spentMicroUsd).toBe(1000);
  });

  it("stops with budget_exhausted when a payRequest would exceed budget", async () => {
    const brain = new MockBrain([
      { content: [{ type: "tool_use", id: "t1", name: "payRequest", input: { url: "https://x" } }], stopReason: "tool_use" },
    ]);
    const executors = { listNodes: vi.fn(), getBalance: vi.fn(), payRequest: vi.fn() };
    const guardrails = new Guardrails(500, 1000); // price 1000 > budget 500 → cannot spend
    const events = recordingEvents();
    const out = await runAgent({ brain, executors: executors as any, guardrails, events: events as any, goal: "g" });
    expect(out.status).toBe("budget_exhausted");
    expect(executors.payRequest).not.toHaveBeenCalled(); // never paid
    expect(events.calls).toContain("finish:budget_exhausted");
  });
});
