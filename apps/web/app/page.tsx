"use client";
import { useEffect, useState } from "react";
import { GlobeMap } from "@/components/GlobeMap";
import { ConnectBar } from "@/components/ConnectBar";
import { Counter } from "@/components/Counter";
import { SettlementLog } from "@/components/SettlementLog";
import { useTrafficStream, type Intensity } from "@/lib/traffic";
import type { NodeListing } from "@nanovpn/core";

export default function Page() {
  const [nodes, setNodes] = useState<NodeListing[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [session, setSession] = useState<{ sessionId: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>("medium");

  useEffect(() => {
    fetch("/api/nodes").then((r) => r.json()).then((d: NodeListing[]) => setNodes(d)).catch(() => {});
  }, []);

  const node = nodes.find((n) => n.id === selected) ?? null;
  useTrafficStream(session?.sessionId ?? null, intensity, streaming);

  async function connect() {
    if (!selected || !signedIn) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: selected, budgetUsd: 1 }),
      });
      const data = (await res.json()) as { sessionId?: string };
      if (data.sessionId) setSession({ sessionId: data.sessionId });
    } finally { setConnecting(false); }
  }

  async function disconnect() {
    if (!session) return;
    setStreaming(false);
    await fetch(`/api/session?id=${session.sessionId}`, { method: "DELETE" }).catch(() => {});
    setSession(null);
  }

  return (
    <div className="app">
      <div className="stage">
        <div className="globe-wrap">
          <GlobeMap
            nodes={nodes}
            selectedId={selected}
            connected={!!session}
            streaming={streaming ? intensity : null}
            onSelect={(id) => { if (!session) setSelected(id); }}
          />
        </div>

        <aside className="panel">
          <section className="panel__sec">
            <span className="eyebrow">Wallet</span>
            <div style={{ marginTop: 10 }}><ConnectBar onSignedIn={(addr) => setSignedIn(addr)} /></div>
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
              <p className="hint">Spin the globe and pick a node to route your traffic through it.</p>
            )}
            {!session && (
              <div style={{ marginTop: 12 }}>
                <button className="btn btn--primary" disabled={!selected || !signedIn || connecting} onClick={connect}>
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
                <div className="stream-controls">
                  <button
                    className={`btn ${streaming ? "btn--ghost" : "btn--primary"}`}
                    onClick={() => setStreaming((s) => !s)}
                  >
                    {streaming ? "Stop traffic" : "Start traffic"}
                  </button>
                  <div className="seg" role="group" aria-label="intensity">
                    {(["light", "medium", "heavy"] as Intensity[]).map((i) => (
                      <button key={i} className="seg__btn" data-on={intensity === i} onClick={() => setIntensity(i)}>{i}</button>
                    ))}
                  </div>
                </div>
                <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={disconnect}>Disconnect</button>
                <div className="statusline">
                  <span className="live" /> Connected to <b>{node.geo.city}</b> · {streaming ? `streaming (${intensity})` : "idle"} · paying per byte
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
