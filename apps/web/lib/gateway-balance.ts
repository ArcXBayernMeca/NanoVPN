import { ARC } from "@nanovpn/core";

/**
 * Live Circle Gateway *available* USDC balance for an address, in integer µUSD.
 * Returns null for a malformed address or any API error — never throws, never fabricates.
 * `balance` from /v1/balances is the available balance (excludes still-finalizing deposits,
 * which the response reports separately as `pendingBatch`).
 */
export async function gatewayAvailableMicroUsd(address: string): Promise<number | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  try {
    const r = await fetch(`${ARC.facilitator}/v1/balances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ token: "USDC", sources: [{ domain: ARC.domain, depositor: address }] }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const balance = data?.balances?.[0]?.balance;
    if (balance == null) return null;
    const micro = Math.round(Number(balance) * 1e6);
    return Number.isFinite(micro) ? micro : null;
  } catch {
    return null;
  }
}
