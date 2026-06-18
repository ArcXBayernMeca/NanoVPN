"use client";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { injected } from "wagmi/connectors";
import { useState, useEffect } from "react";
import { buildSiweMessage } from "@/lib/siwe";

export function ConnectBar({ onSignedIn }: { onSignedIn: (address: string) => void }) {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState(false);
  // Wallet state only exists client-side; render a stable placeholder until mounted
  // so the server and first client render match (avoids the hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function signIn() {
    setBusy(true);
    try {
      const { nonce } = (await fetch("/api/auth/nonce").then((r) => r.json())) as { nonce: string };
      const message = buildSiweMessage({ address: address!, nonce, domain: window.location.host, uri: window.location.origin });
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }),
      });
      const data = (await res.json()) as { address?: string };
      if (data.address) { setSigned(true); onSignedIn(data.address); }
    } finally { setBusy(false); }
  }

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  if (!mounted) return <button className="btn btn--ghost" disabled>Connect wallet</button>;
  if (!isConnected) return <button className="btn btn--primary" onClick={() => connect({ connector: injected() })}>Connect wallet</button>;
  if (signed) return <div className="wallet-chip"><span className="live" /> Signed in · <b>{short}</b></div>;
  return <button className="btn btn--primary" disabled={busy} onClick={signIn}>{busy ? "Signing…" : `Sign in as ${short}`}</button>;
}
