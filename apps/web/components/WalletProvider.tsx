"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { injected } from "wagmi/connectors";
import { buildSiweMessage } from "@/lib/siwe";

export function walletLabel(address?: string, signedIn?: string | null): string {
  if (!address) return "Connect wallet";
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return signedIn ? short : `Sign in as ${short}`;
}

interface WalletCtx { address?: string; signedIn: string | null; busy: boolean; connect(): void; signIn(): Promise<void>; disconnect(): void; }
const Ctx = createContext<WalletCtx | null>(null);
export const useWallet = () => { const c = useContext(Ctx); if (!c) throw new Error("useWallet outside WalletProvider"); return c; };

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // reset SIWE state if the wallet disconnects/changes
  useEffect(() => { if (!isConnected) setSignedIn(null); }, [isConnected]);

  async function signIn() {
    if (!address) return;
    setBusy(true);
    try {
      const { nonce } = (await fetch("/api/auth/nonce").then((r) => r.json())) as { nonce: string };
      const message = buildSiweMessage({ address, nonce, domain: window.location.host, uri: window.location.origin });
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) });
      const data = (await res.json()) as { address?: string };
      if (data.address) setSignedIn(data.address);
    } finally { setBusy(false); }
  }

  return (
    <Ctx.Provider value={{ address, signedIn, busy, connect: () => connect({ connector: injected() }), signIn, disconnect: () => setSignedIn(null) }}>
      {children}
    </Ctx.Provider>
  );
}
