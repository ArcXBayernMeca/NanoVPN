import { NextRequest, NextResponse } from "next/server";
import { ProxyAgent, request as undiciRequest } from "undici";
import { supabaseService } from "@/lib/supabase-server";

// Server-side allow-list: the ONLY fetchable targets (prevents SSRF / open proxy).
// Sized in the low MBs so each click visibly moves the live counter, and reliable
// over a CONNECT tunnel (Cloudflare's __down endpoint returns N bytes on demand).
const DEMO_URLS = [
  "https://speed.cloudflare.com/__down?bytes=2000000",
  "https://speed.cloudflare.com/__down?bytes=1500000",
  "https://speed.cloudflare.com/__down?bytes=2500000",
];

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
  const auth = `${s.session_token}:`;
  const agent = new ProxyAgent({ uri: n!.proxy_url, token: `Basic ${Buffer.from(auth).toString("base64")}` });
  const target = DEMO_URLS[Math.floor(Math.random() * DEMO_URLS.length)];

  // A flaky upstream must not 500 the demo — report the failure softly so the
  // user can just click Browse again; the metered bytes still accrue per request.
  try {
    const r = await undiciRequest(target, { dispatcher: agent });
    const body = await r.body.arrayBuffer();
    return NextResponse.json({ ok: true, status: r.statusCode, bytes: body.byteLength, target });
  } catch (e) {
    return NextResponse.json({ ok: false, bytes: 0, target, error: (e as Error).message });
  }
}
