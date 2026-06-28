"use client";
import { useEffect, useState } from "react";
import { WorldMap } from "@/components/WorldMap";
import { MapRail } from "@/components/MapRail";
import type { Intensity } from "@/lib/traffic";
import { useWallet } from "@/components/WalletProvider";
import { useLocation } from "@/lib/location";
import type { NodeListing } from "@nanovpn/core";

export default function MapPage() {
  const [nodes, setNodes] = useState<NodeListing[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const { signedIn } = useWallet();
  const { coords, status, request } = useLocation();
  const [session, setSession] = useState<{ sessionId: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [copilotMsg, setCopilotMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/nodes").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setNodes(d); }).catch(() => {});
  }, []);

  // Deep-link straight to /map without visiting the landing: acquire location now.
  useEffect(() => {
    if (status === "idle") void request();
  }, [status, request]);

  const node = nodes.find((n) => n.id === selected) ?? null;

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

  async function copilotPick() {
    setCopilotMsg("Asking the AI to choose…");
    const loc = (await request()).coords;
    const res = await fetch("/api/copilot/pick", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loc ?? {}),
    }).then((r) => r.json()).catch(() => null);
    if (res?.nodeId) { setSelected(res.nodeId); setCopilotMsg(res.reason ?? null); }
    else setCopilotMsg("Couldn't pick automatically — choose a node on the map.");
  }

  return (
    <div className="map-stage">
      <div className="map-globe">
        <WorldMap nodes={nodes} selectedId={selected} connected={!!session}
          userLocation={coords}
          streaming={streaming ? intensity : null} onSelect={(id) => { if (!session) setSelected(id); }} />
      </div>
      <MapRail node={node} signedIn={signedIn} session={session} connecting={connecting}
        streaming={streaming} intensity={intensity} copilotMsg={copilotMsg}
        locationDenied={status === "denied" || status === "unavailable"}
        locating={status === "prompting"}
        onRetryLocation={() => void request()}
        onConnect={connect} onDisconnect={disconnect} onToggleStream={() => setStreaming((s) => !s)}
        onIntensity={setIntensity} onCopilot={copilotPick} />
    </div>
  );
}
