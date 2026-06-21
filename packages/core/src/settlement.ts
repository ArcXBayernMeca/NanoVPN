import { ARC, explorerTx, explorerAddr } from "./chain";

/** Always resolves to an ArcScan URL: tx page when we have an on-chain hash,
 *  else the seller/payer address page, else the explorer root. */
export function settlementUrl(opts: { txHash?: string | null; address?: string | null }): string {
  if (opts.txHash) return explorerTx(opts.txHash);
  if (opts.address) return explorerAddr(opts.address);
  return ARC.explorer;
}

const HASH_RE = /0x[0-9a-f]{64}/i;

/** Best-effort: ask the facilitator for the transfer record and scrape an on-chain tx
 *  hash from it. Shape-tolerant (scans the serialized JSON). Never throws. */
export async function fetchSettlementTxHash(uuid: string, opts?: { timeoutMs?: number }): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 2500);
  try {
    const res = await fetch(`${ARC.facilitator}/v1/x402/transfers/${uuid}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const m = HASH_RE.exec(JSON.stringify(json));
    return m ? m[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
