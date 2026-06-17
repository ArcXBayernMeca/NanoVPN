import { NextRequest, NextResponse } from "next/server";
import { ProxyAgent, request as undiciRequest } from "undici";
import { supabaseService } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const sessionId = sp.get("session")!;
  const target = sp.get("url") ?? "https://example.com";
  const db = supabaseService();
  const { data: s } = await db.from("sessions").select("session_token,node_id,status").eq("id", sessionId).single();
  if (!s || s.status !== "active") return NextResponse.json({ error: "no active session" }, { status: 400 });
  const { data: n } = await db.from("nodes").select("proxy_url").eq("id", s.node_id).single();

  const auth = `${s.session_token}:`;
  const agent = new ProxyAgent({ uri: n!.proxy_url, token: `Basic ${Buffer.from(auth).toString("base64")}` });
  const r = await undiciRequest(target, { dispatcher: agent });
  const body = await r.body.arrayBuffer();
  return NextResponse.json({ status: r.statusCode, bytes: body.byteLength });
}
