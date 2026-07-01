"use client";
import { useWallet } from "./WalletProvider";
import { AgentWalletCard } from "./AgentWalletCard";

/** The light wallet card (balances + Fund) at the top of the agent page — only when signed in. */
export function AgentWalletPanel() {
  const { signedIn } = useWallet();
  return signedIn ? <AgentWalletCard /> : null;
}
