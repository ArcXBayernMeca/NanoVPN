import type { Brain, Block, Msg } from "./brain";
import type { Executors } from "./tools";
import type { Guardrails } from "./guardrails";
import type { RunWriter } from "./events";

export function systemPrompt(goal: string, budgetUsd: number): string {
  return [
    "You are an autonomous egress-buyer agent for NanoVPN, a pay-per-use VPN.",
    "You complete the user's goal by paying USDC (x402) per request for geo-located egress through a node YOU choose.",
    `Your goal: ${goal}`,
    `Your hard budget: $${budgetUsd} USDC. A deterministic guardrail also enforces this — if you try to over-spend, payRequest is refused and the run ends.`,
    "Workflow: call listNodes first. Compare the nodes by how well their location fits the goal AND their per-request price, then pick ONE — state which node and why (cheapest? best region match?). Optionally getBalance. Then call payRequest({ nodeId, url }) with your chosen node for each fetch.",
    "Each payRequest is one payment and returns the upstream status, bytes, and the node's egress IP (your geo proof).",
    "When the goal is met or you are out of budget, stop and give a one-paragraph result.",
  ].join("\n");
}

const MAX_ITERATIONS = 30;

export async function runAgent(deps: {
  brain: Brain; executors: Executors; guardrails: Guardrails; events: RunWriter; goal: string;
}): Promise<{ status: "succeeded" | "budget_exhausted" | "failed"; result: string }> {
  const messages: Msg[] = [{ role: "user", content: `Goal: ${deps.goal}` }];
  let lastText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const turn = await deps.brain.next(messages);
    messages.push({ role: "assistant", content: turn.content });

    for (const b of turn.content) {
      if (b.type === "text" && b.text.trim()) { lastText = b.text; await deps.events.reasoning(b.text); }
    }

    if (turn.stopReason === "end_turn") {
      await deps.events.finish("succeeded", lastText);
      return { status: "succeeded", result: lastText };
    }

    const toolUses = turn.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (toolUses.length === 0) {
      await deps.events.finish("succeeded", lastText);
      return { status: "succeeded", result: lastText };
    }

    const results: Block[] = [];
    for (const tu of toolUses) {
      await deps.events.toolCall(tu.name, tu.input);
      try {
        if (tu.name === "payRequest") {
          if (!deps.guardrails.canSpend()) {
            const msg = "budget guardrail: payment refused (would exceed budget or request cap)";
            await deps.events.error(msg);
            await deps.events.finish("budget_exhausted", msg);
            return { status: "budget_exhausted", result: msg };
          }
          const r = await deps.executors.payRequest(tu.input as { nodeId: string; url: string });
          deps.guardrails.record(r.amountMicroUsd);
          await deps.events.payment(r);
          await deps.events.setNode(r.nodeId);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(r) });
        } else if (tu.name === "listNodes") {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(await deps.executors.listNodes()) });
        } else if (tu.name === "getBalance") {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(await deps.executors.getBalance()) });
        } else {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: `unknown tool: ${tu.name}`, is_error: true });
        }
      } catch (e) {
        const msg = (e as Error).message;
        await deps.events.error(msg);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: msg, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  const msg = "max iterations reached";
  await deps.events.finish("failed", msg);
  return { status: "failed", result: msg };
}
