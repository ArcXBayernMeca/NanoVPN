"use client";
import { formatUsd } from "./format";
import { useWalletBalances } from "@/lib/use-wallet-balances";

/** Compact read-only Wallet + Spending balances for the agent rail. */
export function WalletBalances() {
  const { walletMicroUsd, gatewayMicroUsd } = useWalletBalances();
  return (
    <div className="walletbalances">
      <div className="walletbalances__row"><span>Wallet</span><strong>{walletMicroUsd != null ? formatUsd(walletMicroUsd) : "—"}</strong></div>
      <div className="walletbalances__row"><span>Spending</span><strong>{gatewayMicroUsd != null ? formatUsd(gatewayMicroUsd) : "syncing…"}</strong></div>
    </div>
  );
}
