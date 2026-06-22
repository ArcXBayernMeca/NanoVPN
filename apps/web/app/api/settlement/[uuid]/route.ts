import { NextResponse } from "next/server";
import { ARC } from "@nanovpn/core";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  try {
    const r = await fetch(`${ARC.facilitator}/v1/x402/transfers/${uuid}`, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: "facilitator error", status: r.status }, { status: 502 });
    const j = await r.json();
    return NextResponse.json({
      from: j.fromAddress ?? null,
      to: j.toAddress ?? null,
      amount: j.amount ?? null,
      status: j.status ?? null,
      network: j.sendingNetwork ?? null,
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
