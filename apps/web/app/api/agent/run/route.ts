import { NextResponse, after } from "next/server";
import { prepareRun } from "@nanovpn/agent/runner";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const goal = String(body?.goal ?? "").trim();
  const nodeId = String(body?.nodeId ?? "").trim();
  const budgetUsd = Number(body?.budgetUsd);
  const mock = Boolean(body?.mock);
  if (!goal || !nodeId || !(budgetUsd > 0)) {
    return NextResponse.json({ error: "goal, nodeId, and budgetUsd>0 are required" }, { status: 400 });
  }
  try {
    const { runId, run } = await prepareRun({ goal, budgetUsd, nodeId, mock });
    after(async () => { try { await run(); } catch (e) { console.error("[agent-run]", (e as Error).message); } });
    return NextResponse.json({ runId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
