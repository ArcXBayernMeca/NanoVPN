import { ARC, explorerTx, explorerAddr } from "./chain";

/** Always resolves to an ArcScan URL: tx page when we have an on-chain hash,
 *  else the seller/payer address page, else the explorer root. */
export function settlementUrl(opts: { txHash?: string | null; address?: string | null }): string {
  if (opts.txHash) return explorerTx(opts.txHash);
  if (opts.address) return explorerAddr(opts.address);
  return ARC.explorer;
}
