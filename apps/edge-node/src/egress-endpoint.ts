import type { IncomingMessage, ServerResponse } from "node:http";
import { buildRequirements, type Requirements } from "./settle-endpoint";
import { assertPublicUrl, type LookupFn } from "./ssrf";
import { microUsdForBytes } from "@nanovpn/core";

/** Per-byte price when the request carries meterBytes=N (streaming chunk); else the flat per-request price. */
export function egressPrice(rawUrl: string, flatMicroUsd: number, pricePerGbUsd: number): number {
  const n = Number(new URL(rawUrl, "http://x").searchParams.get("meterBytes") ?? 0);
  return n > 0 ? microUsdForBytes(n, pricePerGbUsd) : flatMicroUsd;
}

interface Facilitator {
  verify(payload: unknown, req: Requirements): Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
  settle(payload: unknown, req: Requirements): Promise<{ success: boolean; errorReason?: string; payer?: string; transaction?: string }>;
}

export interface EgressDeps {
  facilitator: Facilitator;
  sellerAddress: string;
  priceMicroUsd: number;
  pricePerGbUsd: number;
  egressIp: string;
  fetchTarget: (url: URL) => Promise<{ status: number; bytes: number }>;
  lookup?: LookupFn;
}

export async function handleEgress(req: IncomingMessage, res: ServerResponse, deps: EgressDeps) {
  const target = new URL(req.url ?? "", "http://x").searchParams.get("url") ?? "";

  let url: URL;
  try { url = await assertPublicUrl(target, deps.lookup); }
  catch (e) { res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: (e as Error).message })); return; }

  const priceMicroUsd = egressPrice(req.url ?? "", deps.priceMicroUsd, deps.pricePerGbUsd);
  const requirements = buildRequirements(priceMicroUsd, deps.sellerAddress);
  const sig = req.headers["payment-signature"] as string | undefined;

  if (!sig) {
    const challenge = {
      x402Version: 2,
      resource: { url: `/egress?url=${encodeURIComponent(target)}`, description: "NanoVPN per-request geo egress", mimeType: "application/json" },
      accepts: [requirements],
    };
    res.writeHead(402, { "Content-Type": "application/json", "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString("base64") }).end("{}");
    return;
  }

  // 1. verify (off-chain — no money moves yet)
  const payload = JSON.parse(Buffer.from(sig, "base64").toString("utf8"));
  const verified = await deps.facilitator.verify(payload, requirements);
  if (!verified.isValid) { res.writeHead(402, { "Content-Type": "application/json" }).end(JSON.stringify({ error: verified.invalidReason })); return; }

  // 2. deliver egress. A connection failure here = NOT charged (no settle).
  let result: { status: number; bytes: number };
  try { result = await deps.fetchTarget(url); }
  catch (e) { res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: `egress failed: ${(e as Error).message}` })); return; }

  // 3. settle (the on-chain charge) — only because egress was delivered.
  const settled = await deps.facilitator.settle(payload, requirements);
  if (!settled.success || !settled.transaction) {
    // 502: settlement failed AFTER egress was delivered — transient seller-side condition; distinct
    // from the 402 verify-rejection above (where no money moved). The agent should treat this as
    // retryable; the buyer may already be debited.
    res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: settled.errorReason ?? "settle failed" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/json",
    "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({ success: true, transaction: settled.transaction, network: requirements.network, payer: settled.payer })).toString("base64"),
  }).end(JSON.stringify({ status: result.status, bytes: result.bytes, egressIp: deps.egressIp, transaction: settled.transaction }));
}
