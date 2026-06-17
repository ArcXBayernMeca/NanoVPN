import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";

export async function GET() {
  const db = supabaseService();
  const { data, error } = await db.from("nodes").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const nodes = (data ?? []).map((n) => ({
    id: n.id, operatorAddress: n.operator_address,
    geo: { country: n.country, city: n.city, lat: n.lat, lng: n.lng },
    proxyUrl: n.proxy_url, settleUrl: n.settle_url,
    pricePerGbUsd: n.price_per_gb_usd, pricePerRequestUsd: n.price_per_request_usd,
  }));
  return NextResponse.json(nodes);
}
