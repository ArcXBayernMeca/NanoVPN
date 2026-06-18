import type { IncomingMessage, ServerResponse } from "node:http";
import { ARC } from "@nanovpn/core";
import type { SessionRegistry } from "./sessions";

export interface Requirements {
  scheme: "exact"; network: string; asset: string; amount: string;
  payTo: string; maxTimeoutSeconds: number;
  extra: { name: string; version: string; verifyingContract: string };
}

export function buildRequirements(amountMicroUsd: number, sellerAddress: string): Requirements {
  return {
    scheme: "exact",
    network: ARC.network,
    asset: ARC.usdc,
    amount: amountMicroUsd.toString(), // atomic USDC == µUSD
    payTo: sellerAddress,
    // 30 days. Buyer signs validBefore = now + maxTimeoutSeconds. The reference repo /
    // SDK default of 345600 (4 days) is REJECTED by the live Arc-testnet facilitator as
    // `authorization_validity_too_short` (verified 2026-06-18: 4d fails, 30d settles).
    maxTimeoutSeconds: 2592000,
    extra: { name: ARC.eip712.name, version: ARC.eip712.version, verifyingContract: ARC.gatewayWallet },
  };
}

interface Facilitator {
  verify(payload: unknown, req: Requirements): Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
  settle(payload: unknown, req: Requirements): Promise<{ success: boolean; errorReason?: string; payer?: string; transaction?: string }>;
}

export interface SettleDeps {
  registry: SessionRegistry;
  facilitator: Facilitator;
  sellerAddress: string;
  onSettled: (sessionId: string, amountMicroUsd: number, settlementUuid: string, payer: string) => void | Promise<void>;
}

export async function handleSettle(req: IncomingMessage, res: ServerResponse, deps: SettleDeps) {
  const sessionId = new URL(req.url ?? "", "http://x").searchParams.get("session") ?? "";
  const entry = deps.registry.getById(sessionId);
  if (!entry) { res.writeHead(404).end("unknown session"); return; }

  const amount = entry.meter.unsettledMicroUsd();
  if (amount <= 0) { res.writeHead(200, { "Content-Type": "application/json" }).end("{}"); return; }

  const requirements = buildRequirements(amount, deps.sellerAddress);
  const sig = req.headers["payment-signature"] as string | undefined;

  if (!sig) {
    const challenge = {
      x402Version: 2,
      resource: { url: `/settle?session=${sessionId}`, description: `NanoVPN metered egress`, mimeType: "application/json" },
      accepts: [requirements],
    };
    res.writeHead(402, {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString("base64"),
    }).end("{}");
    return;
  }

  const payload = JSON.parse(Buffer.from(sig, "base64").toString("utf8"));
  const verified = await deps.facilitator.verify(payload, requirements);
  if (!verified.isValid) { res.writeHead(402).end(JSON.stringify({ error: verified.invalidReason })); return; }

  const settled = await deps.facilitator.settle(payload, requirements);
  if (!settled.success || !settled.transaction) {
    res.writeHead(402).end(JSON.stringify({ error: settled.errorReason ?? "settle failed" }));
    return;
  }

  entry.meter.markSettled(amount);
  await deps.onSettled(sessionId, amount, settled.transaction, settled.payer ?? verified.payer ?? "");

  res.writeHead(200, {
    "Content-Type": "application/json",
    "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
      success: true, transaction: settled.transaction, network: requirements.network, payer: settled.payer,
    })).toString("base64"),
  }).end(JSON.stringify({ settled: amount, transaction: settled.transaction }));
}
