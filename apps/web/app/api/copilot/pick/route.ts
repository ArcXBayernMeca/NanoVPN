import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseService } from "@/lib/supabase-server";
import { pickNodeDeterministic } from "@/lib/copilot";
import type { NodeListing } from "@nanovpn/core";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { lat, lng } = await req.json().catch(() => ({}));
  const loc = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  const db = supabaseService();
  const { data } = await db.from("nodes").select("id,city,country,lat,lng,price_per_gb_usd,price_per_request_usd");
  const nodes: NodeListing[] = (data ?? []).map((n: any) => ({ id: n.id, operatorAddress: "", geo: { city: n.city, country: n.country, lat: n.lat, lng: n.lng }, proxyUrl: "", settleUrl: "", pricePerGbUsd: n.price_per_gb_usd, pricePerRequestUsd: n.price_per_request_usd }));
  if (nodes.length === 0) return NextResponse.json({ error: "no nodes" }, { status: 503 });

  const fallback = () => NextResponse.json(pickNodeDeterministic(loc, nodes));
  if (!process.env.ANTHROPIC_API_KEY) return fallback();

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const list = nodes.map((n) => `${n.id}: ${n.geo.city} ($${n.pricePerGbUsd}/GB)`).join("; ");
    const res = await client.messages.create({
      model: "claude-opus-4-8", max_tokens: 200,
      system: "Pick the single best NanoVPN exit node for a human's browsing. Prefer geographic closeness to the user, then lower $/GB. Reply ONLY with strict JSON: {\"nodeId\":\"<id>\",\"reason\":\"<one short sentence>\"}.",
      messages: [{ role: "user", content: `User location: ${loc ? `${loc.lat},${loc.lng}` : "unknown"}. Nodes: ${list}.` }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!nodes.some((n) => n.id === parsed.nodeId)) return fallback();
    return NextResponse.json({ nodeId: parsed.nodeId, reason: String(parsed.reason ?? "Best fit for you.") });
  } catch {
    return fallback();
  }
}
