import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { newSessionToken, registerOnNode } from "@/lib/session";

export async function POST(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { nodeId, budgetUsd } = (await req.json()) as { nodeId: string; budgetUsd: number };
  const db = supabaseService();

  const { data: n, error: ne } = await db.from("nodes").select("*").eq("id", nodeId).single();
  if (ne || !n) return NextResponse.json({ error: "unknown node" }, { status: 404 });

  const token = newSessionToken();
  const budgetMicroUsd = Math.round(Number(budgetUsd) * 1_000_000);
  const { data: s, error: se } = await db.from("sessions").insert({
    user_address: address, node_id: nodeId, session_token: token,
    status: "active", budget_micro_usd: budgetMicroUsd,
  }).select("id").single();
  if (se || !s) return NextResponse.json({ error: se?.message }, { status: 500 });

  try {
    await registerOnNode(
      { id: n.id, operatorAddress: n.operator_address, geo: { country: n.country, city: n.city, lat: n.lat, lng: n.lng },
        proxyUrl: n.proxy_url, settleUrl: n.settle_url, pricePerGbUsd: n.price_per_gb_usd, pricePerRequestUsd: n.price_per_request_usd },
      { id: s.id, token, nodeId, pricePerGbUsd: n.price_per_gb_usd, budgetMicroUsd },
    );
  } catch {
    await db.from("sessions").update({ status: "stopped" }).eq("id", s.id);
    return NextResponse.json({ error: "node registration failed" }, { status: 502 });
  }

  return NextResponse.json({ sessionId: s.id, sessionToken: token, proxyUrl: n.proxy_url });
}

export async function DELETE(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const db = supabaseService();
  const { data } = await db.from("sessions").update({ status: "stopped" })
    .eq("id", id).eq("user_address", address).select("id");
  if (!data || data.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
