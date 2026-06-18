"use client";
import { useEffect, useState } from "react";
import { Providers } from "./providers";
import { WorldMap } from "@/components/WorldMap";
import { ConnectBar } from "@/components/ConnectBar";
import { Counter } from "@/components/Counter";
import { SettlementLog } from "@/components/SettlementLog";
import type { NodeListing } from "@nanovpn/core";

function App() {
  const [nodes, setNodes] = useState<NodeListing[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [session, setSession] = useState<{ sessionId: string } | null>(null);

  useEffect(() => {
    fetch("/api/nodes").then((r) => r.json()).then((data: NodeListing[]) => setNodes(data));
  }, []);

  async function connect() {
    if (!selected) return;
    const res = await fetch("/api/session", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodeId: selected, budgetUsd: 1 }),
    });
    const data = (await res.json()) as { sessionId: string };
    setSession(data);
  }

  return (
    <main style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, padding: 16 }}>
      <section><WorldMap nodes={nodes} selectedId={selected} onSelect={setSelected} /></section>
      <aside style={{ display: "grid", gap: 12 }}>
        <h1 style={{ color: "#2ecc71" }}>NanoVPN</h1>
        <ConnectBar onSignedIn={() => {}} />
        <button disabled={!selected} onClick={connect}>Connect to {selected ?? "a node"}</button>
        {session && (
          <button onClick={() => { void fetch(`/api/browse?session=${session.sessionId}`); }}>
            Browse (drive traffic)
          </button>
        )}
        {session && <Counter sessionId={session.sessionId} />}
        {session && <SettlementLog sessionId={session.sessionId} />}
      </aside>
    </main>
  );
}

export default function Page() { return (<Providers><App /></Providers>); }
