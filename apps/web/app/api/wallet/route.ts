import { NextRequest, NextResponse } from "next/server";
import { ensureProvisionedAndFunded } from "@/lib/user-wallet";
import { supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();
  try {
    const wallet = await ensureProvisionedAndFunded(userId);
    const { data } = await supabaseService()
      .from("settlements").select("amount_micro_usd").eq("payer", wallet.eoaAddress);
    const spentMicroUsd = (data ?? []).reduce((s: number, r: any) => s + Number(r.amount_micro_usd), 0);
    return NextResponse.json({ ...wallet, spentMicroUsd });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
