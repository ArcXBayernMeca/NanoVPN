"use client";
import { useEffect, useState } from "react";
import { GlobeMap } from "@/components/GlobeMap";
import { MapRail } from "@/components/MapRail";
import { useTrafficStream, type Intensity } from "@/lib/traffic";
import { useWallet } from "@/components/WalletProvider";
import type { NodeListing } from "@nanovpn/core";

export default function Page() {
  const [nodes, setNodes] = useState<NodeListing[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const { signedIn } = useWallet();
  const [session, setSession] = useState<{ sessionId: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [copilotMsg, setCopilotMsg] = useState<string | null>(null);

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

  async function copilotPick() {
    setCopilotMsg("Asking the AI to choose…");
    const loc = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 4000 });
    });
    const res = await fetch("/api/copilot/pick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loc ?? {}) }).then((r) => r.json()).catch(() => null);
    if (res?.nodeId) { setSelected(res.nodeId); setCopilotMsg(res.reason ?? null); }
    else setCopilotMsg("Couldn't pick automatically — choose a node on the globe.");
  }

  return (
    <div className="map-stage">
      <div className="map-globe">
        <GlobeMap nodes={nodes} selectedId={selected} connected={!!session}
          streaming={streaming ? intensity : null} onSelect={(id) => { if (!session) setSelected(id); }} />
      </div>
      <MapRail node={node} signedIn={signedIn} session={session} connecting={connecting}
        streaming={streaming} intensity={intensity} copilotMsg={copilotMsg}
        onConnect={connect} onDisconnect={disconnect} onToggleStream={() => setStreaming((s) => !s)}
        onIntensity={setIntensity} onCopilot={copilotPick} />
    </div>
  );
}
