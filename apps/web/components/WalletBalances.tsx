"use client";
import { formatUsd } from "./format";
import { useWalletBalances } from "@/lib/use-wallet-balances";

/** Compact read-only Wallet + Gateway balances for the agent rail. */
export function WalletBalances() {
  const { walletMicroUsd, gatewayMicroUsd } = useWalletBalances();
  return (
    <div className="walletbalances">
      <div className="walletbalances__row"><span>Wallet</span><strong>{walletMicroUsd != null ? formatUsd(walletMicroUsd) : "—"}</strong></div>
      <div className="walletbalances__row"><span>Gateway</span>{gatewayMicroUsd != null ? <strong>{formatUsd(gatewayMicroUsd)}</strong> : <span className="skeleton" role="status"><span className="sr-only">syncing…</span></span>}</div>
    </div>
  );
}
