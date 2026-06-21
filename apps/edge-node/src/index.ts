import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { SessionRegistry } from "./sessions";
import { handleConnect } from "./proxy";
import { handleSettle } from "./settle-endpoint";
import { handleEgress } from "./egress-endpoint";
import { microUsdForRequest, fetchSettlementTxHash } from "@nanovpn/core";
import { streamUsage } from "./usage-sse";
import { startSettlementLoop } from "./settlement-loop";
import { fetchPublic } from "./fetch-public";

const PORT = Number(process.env.EDGE_NODE_PORT ?? 8080);
const SELLER_ADDRESS = process.env.SELLER_ADDRESS!;
const SELF = process.env.EDGE_NODE_PUBLIC_URL ?? `http://localhost:${PORT}`;

const EGRESS_PRICE_MICRO_USD = microUsdForRequest(Number(process.env.EDGE_NODE_PRICE_PER_REQUEST_USD ?? 0.001));

// The node's own outbound IP = the geo proof returned to agents. Resolve once at
// startup (env override → public echo → "unknown"); never blocks request handling.
let EGRESS_IP = process.env.EDGE_NODE_EGRESS_IP ?? "unknown";
async function resolveEgressIp() {
  if (EGRESS_IP !== "unknown") return;
  try { EGRESS_IP = ((await (await fetch("https://api.ipify.org?format=json")).json()) as { ip?: string }).ip ?? "unknown"; }
  catch { /* leave "unknown" — non-fatal */ }
}

// Real per-request egress: fetch the target server-side (the node IS the egress) and count body bytes.
// fetchPublic re-validates the URL at each redirect hop (SSRF) and enforces a body-size cap (DoS).
async function fetchTarget(url: URL): Promise<{ status: number; bytes: number }> {
  return fetchPublic(url.href);
}

const registry = new SessionRegistry();
const facilitator = new BatchFacilitatorClient();
const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function onSettled(sessionId: string, amountMicroUsd: number, settlementUuid: string, payer: string) {
  await db.from("settlements").insert({
    session_id: sessionId, settlement_uuid: settlementUuid, amount_micro_usd: amountMicroUsd,
    payer, payee: SELLER_ADDRESS, network: "eip155:5042002", status: "received",
  });
  // Best-effort: upgrade the row with the on-chain tx hash once the batch is known.
  const txHash = await fetchSettlementTxHash(settlementUuid);
  if (txHash) await db.from("settlements").update({ tx_hash: txHash }).eq("settlement_uuid", settlementUuid);
  const e = registry.getById(sessionId);
  if (e) await db.from("sessions").update({ settled_micro_usd: e.meter.settledMicroUsd, spent_micro_usd: e.meter.spentMicroUsd }).eq("id", sessionId);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "", SELF);
    if (url.pathname === "/health") { res.writeHead(200).end("ok"); return; }
    if (url.pathname === "/register" && req.method === "POST") {
      const body = await readJson(req);
      registry.register(body); // { id, token, nodeId, pricePerGbUsd, budgetMicroUsd }
      res.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname.startsWith("/usage/")) { streamUsage(res, registry, url.pathname.split("/")[2]); return; }
    if (url.pathname === "/settle") { await handleSettle(req, res, { registry, facilitator, sellerAddress: SELLER_ADDRESS, onSettled }); return; }
    if (url.pathname === "/egress" && req.method === "POST") {
      await handleEgress(req, res, { facilitator, sellerAddress: SELLER_ADDRESS, priceMicroUsd: EGRESS_PRICE_MICRO_USD, egressIp: EGRESS_IP, fetchTarget });
      return;
    }
    res.writeHead(404).end("not found");
  } catch (err) {
    const code = err instanceof SyntaxError ? 400 : 500;
    if (!res.headersSent) res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(err) }));
  }
});

server.on("connect", (req, socket, head) => handleConnect(req, socket as any, head, registry));

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { reject(new SyntaxError("bad json")); } }); req.on("error", reject); });
}

startSettlementLoop(registry, buyer, `${SELF}/settle`);
server.on("error", (e) => console.error("[edge-node] server error:", e));
// Bind 0.0.0.0 explicitly (Node would otherwise bind IPv6-only, which Fly's proxy can't
// reach) and log on stderr so the line appears immediately in `fly logs` (stdout is
// block-buffered in the container, which made a healthy boot look like a hang).
server.listen(PORT, "0.0.0.0", () => { console.error(`[edge-node] http+proxy on ${PORT}`); void resolveEgressIp(); });
