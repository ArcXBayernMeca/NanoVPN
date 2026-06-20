"use client";
import { useEffect, useState } from "react";
import { useWallet, walletLabel } from "./WalletProvider";

export function WalletButton() {
  const { address, signedIn, busy, connect, signIn } = useWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // avoid SSR/client wallet-state hydration mismatch
  if (!mounted) return <button className="btn btn--ghost" disabled>Connect wallet</button>;
  if (!address) return <button className="btn btn--primary" onClick={connect}>Connect wallet</button>;
  if (signedIn) return <span className="wallet-chip"><span className="live" /> {walletLabel(address, signedIn)}</span>;
  return <button className="btn btn--primary" disabled={busy} onClick={signIn}>{busy ? "Signing…" : walletLabel(address, null)}</button>;
}
