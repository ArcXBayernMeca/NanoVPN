import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { SessionRegistry } from "./sessions";
import { handleConnect } from "./proxy";
import { handleSettle } from "./settle-endpoint";
import { streamUsage } from "./usage-sse";
import { startSettlementLoop } from "./settlement-loop";

const PORT = Number(process.env.EDGE_NODE_PORT ?? 8080);
const SELLER_ADDRESS = process.env.SELLER_ADDRESS!;
const SELF = process.env.EDGE_NODE_PUBLIC_URL ?? `http://localhost:${PORT}`;

const registry = new SessionRegistry();
const facilitator = new BatchFacilitatorClient();
const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function onSettled(sessionId: string, amountMicroUsd: number, settlementUuid: string, payer: string) {
  await db.from("settlements").insert({
    session_id: sessionId, settlement_uuid: settlementUuid, amount_micro_usd: amountMicroUsd,
    payer, payee: SELLER_ADDRESS, network: "eip155:5042002", status: "received",
  });
  const e = registry.getById(sessionId);
  if (e) await db.from("sessions").update({ settled_micro_usd: e.meter.settledMicroUsd, spent_micro_usd: e.meter.spentMicroUsd }).eq("id", sessionId);
}

const server = http.createServer(async (req, res) => {
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
  res.writeHead(404).end("not found");
});

server.on("connect", (req, socket, head) => handleConnect(req, socket as any, head, registry));

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(JSON.parse(b || "{}"))); });
}

startSettlementLoop(registry, buyer, `${SELF}/settle`);
server.listen(PORT, () => console.log(`[edge-node] http+proxy on ${PORT}`));
