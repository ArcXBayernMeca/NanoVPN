import { NextRequest, NextResponse } from "next/server";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { ARC } from "@nanovpn/core";
import { ensureProvisionedAndFunded, loadSigningKey } from "@/lib/user-wallet";
import { getOrCreateEgressSession } from "@/lib/egress-session";
import { supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";

const STREAM_CHUNK_BYTES = Number(process.env.STREAM_CHUNK_BYTES) || 262144;

export async function POST(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const nodeId = String(body?.nodeId ?? "");
  const stream = Boolean(body?.stream);
  const url = stream
    ? `https://speed.cloudflare.com/__down?bytes=${STREAM_CHUNK_BYTES}`
    : String(body?.url ?? "").trim();
  if (!nodeId || !url) return NextResponse.json({ error: "nodeId and (url or stream) are required" }, { status: 400 });

  const db = supabaseService();
  const { data: node } = await db.from("nodes").select("id,proxy_url,country,city,lat,lng,operator_address").eq("id", nodeId).single();
  if (!node) return NextResponse.json({ error: "unknown node" }, { status: 404 });

  const sellerAddress = process.env.SELLER_ADDRESS;
  if (!sellerAddress) return NextResponse.json({ error: "seller not configured" }, { status: 500 });

  try {
    // payer EOA comes from the same user_wallets row as the signing key (loadSigningKey) — they always match.
    const prov = await ensureProvisionedAndFunded(userId);
    if (prov.status !== "funded") {
      return NextResponse.json({ error: "demo grant capacity reached — self-funding coming soon" }, { status: 503 });
    }
    const eoa = prov.eoaAddress;
    const key = await loadSigningKey(userId);
    const sessionId = await getOrCreateEgressSession(userId, nodeId, body?.sessionId);

    const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: key });
    const nodeEgressUrl = stream
      ? `${node.proxy_url}/egress?url=${encodeURIComponent(url)}&meterBytes=${STREAM_CHUNK_BYTES}`
      : `${node.proxy_url}/egress?url=${encodeURIComponent(url)}`;
    const res = await buyer.pay<{ status: number; bytes: number; egressIp: string }>(nodeEgressUrl, { method: "POST" });

    await db.from("settlements").insert({
      session_id: sessionId, settlement_uuid: res.transaction, amount_micro_usd: Number(res.amount),
      payer: eoa, payee: sellerAddress, network: ARC.network, status: "received",
    });

    return NextResponse.json({
      sessionId, status: res.data.status, bytes: res.data.bytes, egressIp: res.data.egressIp,
      geo: { country: node.country, city: node.city, lat: node.lat, lng: node.lng },
      transaction: res.transaction, amountMicroUsd: Number(res.amount),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
