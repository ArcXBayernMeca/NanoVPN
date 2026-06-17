"use client";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { injected } from "wagmi/connectors";
import { useState } from "react";
import { buildSiweMessage } from "@/lib/siwe";

export function ConnectBar({ onSignedIn }: { onSignedIn: (address: string) => void }) {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);

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
      if (data.address) onSignedIn(data.address);
    } finally { setBusy(false); }
  }

  if (!isConnected) return <button onClick={() => connect({ connector: injected() })}>Connect wallet</button>;
  return <button disabled={busy} onClick={signIn}>{busy ? "Signing…" : `Sign in (${address?.slice(0, 6)}…)`}</button>;
}
