import { NextRequest, NextResponse } from "next/server";
import { formatUnits } from "viem";
import { gatewayAvailableMicroUsd } from "@/lib/gateway-balance";

export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) return NextResponse.json({ error: "missing address" }, { status: 400 });
  const micro = await gatewayAvailableMicroUsd(address);
  if (micro == null) return NextResponse.json({ error: "gateway error" }, { status: 502 });
  return NextResponse.json({ usdc: formatUnits(BigInt(micro), 6) });
}
