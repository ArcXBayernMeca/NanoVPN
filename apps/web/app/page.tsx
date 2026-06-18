"use client";
import { useEffect, useState } from "react";
import { WorldMap } from "@/components/WorldMap";
import { ConnectBar } from "@/components/ConnectBar";
import { Counter } from "@/components/Counter";
import { SettlementLog } from "@/components/SettlementLog";
import type { NodeListing } from "@nanovpn/core";

export default function Page() {
  const [nodes, setNodes] = useState<NodeListing[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [session, setSession] = useState<{ sessionId: string } | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetch("/api/nodes").then((r) => r.json()).then((d: NodeListing[]) => setNodes(d)).catch(() => {});
  }, []);

  const node = nodes.find((n) => n.id === selected) ?? null;

  async function connect() {
    if (!selected || !signedIn) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: selected, budgetUsd: 1 }),
      });
      const data = (await res.json()) as { sessionId?: string };
      if (data.sessionId) setSession({ sessionId: data.sessionId });
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">Nano<b>VPN</b></span>
          <span className="brand__tag">metered egress, paid by the megabyte</span>
        </div>
        <span className="netpill"><span className="dot" /> Arc testnet</span>
      </header>

      <div className="stage">
        <div className="map-wrap">
          <WorldMap
            nodes={nodes}
            selectedId={selected}
            onSelect={(id) => { if (!session) setSelected(id); }}
          />
        </div>

        <aside className="panel">
          <section className="panel__sec">
            <span className="eyebrow">Wallet</span>
            <div style={{ marginTop: 10 }}>
              <ConnectBar onSignedIn={(addr) => setSignedIn(addr)} />
            </div>
          </section>

          <section className="panel__sec">
            <span className="eyebrow">Exit node</span>
            {node ? (
              <div className="node-card">
                <span className="node-card__pin" />
                <div>
                  <div className="node-card__name">{node.geo.city}, {node.geo.country}</div>
                  <div className="node-card__meta">{node.id}</div>
                </div>
                <span className="node-card__rate">${node.pricePerGbUsd}/GB</span>
              </div>
            ) : (
              <p className="hint">Pick a node on the map to route your traffic through it.</p>
            )}
            {!session && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn btn--primary"
                  disabled={!selected || !signedIn || connecting}
                  onClick={connect}
                >
                  {connecting ? "Connecting…" : node ? `Connect to ${node.geo.city}` : "Connect"}
                </button>
                {selected && !signedIn && <p className="hint">Sign in with your wallet to connect.</p>}
              </div>
            )}
          </section>

          {session && node && (
            <>
              <section className="panel__sec">
                <Counter sessionId={session.sessionId} rate={node.pricePerGbUsd} />
                <button
                  className="btn btn--primary"
                  style={{ marginTop: 16 }}
                  onClick={() => { void fetch(`/api/browse?session=${session.sessionId}`); }}
                >
                  Send traffic
                </button>
                <div className="statusline">
                  <span className="live" /> Connected to <b>{node.geo.city}</b> · paying per byte
                </div>
              </section>

              <section className="panel__sec">
                <span className="eyebrow">On-chain settlements</span>
                <SettlementLog sessionId={session.sessionId} />
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
