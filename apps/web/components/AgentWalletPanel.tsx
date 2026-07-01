"use client";
import { useWallet } from "./WalletProvider";
import { WalletPanel } from "./WalletPanel";

/** The full wallet panel (balances + Fund) at the top of the agent page — only when signed in. */
export function AgentWalletPanel() {
  const { signedIn } = useWallet();
  return signedIn ? <WalletPanel /> : null;
}
