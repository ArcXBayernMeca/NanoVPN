import { NextRequest, NextResponse, after } from "next/server";
import { prepareRun } from "@nanovpn/agent/runner";
import { ensureProvisionedAndFunded, loadSigningKey } from "@/lib/user-wallet";

export const runtime = "nodejs";

const MAX_AGENT_BUDGET_USD = Number(process.env.MAX_AGENT_BUDGET_USD) || 0.05;

export async function POST(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const goal = String(body?.goal ?? "").trim();
  const budgetUsd = Number(body?.budgetUsd);
  const mock = Boolean(body?.mock);
  if (!goal || !(budgetUsd > 0)) {
    return NextResponse.json({ error: "goal and budgetUsd>0 are required" }, { status: 400 });
  }
  if (budgetUsd > MAX_AGENT_BUDGET_USD) {
    return NextResponse.json({ error: `budgetUsd exceeds the max of ${MAX_AGENT_BUDGET_USD} USDC` }, { status: 400 });
  }

  try {
    await ensureProvisionedAndFunded(userId);
    const buyerPrivateKey = await loadSigningKey(userId);
    const { runId, run } = await prepareRun({ goal, budgetUsd, mock, buyerPrivateKey });
    after(async () => { try { await run(); } catch (e) { console.error("[agent-run]", (e as Error).message); } });
    return NextResponse.json({ runId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
