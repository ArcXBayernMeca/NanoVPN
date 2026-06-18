import { NextRequest, NextResponse } from "next/server";
import { formatUnits } from "viem";
import { ARC } from "@nanovpn/core";

export async function GET(req: NextRequest) {
  const depositor = new URL(req.url).searchParams.get("address");
  if (!depositor) return NextResponse.json({ error: "missing address" }, { status: 400 });
  const r = await fetch(`${ARC.facilitator}/v1/balances`, {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ token: "USDC", sources: [{ domain: ARC.domain, depositor }] }),
  });
  const data = await r.json();
  const raw = data?.balances?.[0]?.balance ?? "0";
  const usdc = String(raw).includes(".") ? String(raw) : formatUnits(BigInt(raw), 6);
  return NextResponse.json({ usdc });
}
