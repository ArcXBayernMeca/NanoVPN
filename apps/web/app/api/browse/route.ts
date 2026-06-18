import { NextRequest, NextResponse } from "next/server";
import { ProxyAgent, request as undiciRequest } from "undici";
import { supabaseService } from "@/lib/supabase-server";

// Server-side allow-list: these are the only fetchable targets (prevents SSRF / open proxy).
const DEMO_URLS = ["https://example.com", "https://www.wikipedia.org", "https://httpbin.org/bytes/30000"];

export async function GET(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const sessionId = new URL(req.url).searchParams.get("session");
  if (!sessionId) return NextResponse.json({ error: "missing session" }, { status: 400 });

  const db = supabaseService();
  const { data: s } = await db.from("sessions")
    .select("session_token,node_id,status,user_address").eq("id", sessionId).single();
  if (!s || s.status !== "active") return NextResponse.json({ error: "no active session" }, { status: 400 });
  if (s.user_address !== address) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: n } = await db.from("nodes").select("proxy_url").eq("id", s.node_id).single();

  const target = DEMO_URLS[Math.floor(Math.random() * DEMO_URLS.length)];
  const auth = `${s.session_token}:`;
  const agent = new ProxyAgent({ uri: n!.proxy_url, token: `Basic ${Buffer.from(auth).toString("base64")}` });
  const r = await undiciRequest(target, { dispatcher: agent });
  const body = await r.body.arrayBuffer();
  return NextResponse.json({ status: r.statusCode, bytes: body.byteLength, target });
}
