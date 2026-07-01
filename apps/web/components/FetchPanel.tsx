"use client";
import { useEffect, useState } from "react";
import type { NodeListing } from "@nanovpn/core";
import { FLY_REGION_CITY } from "@nanovpn/core";
import { formatUsd } from "./format";
import { SettlementLog } from "./SettlementLog";
import { intervalForIntensity, type Intensity } from "@/lib/traffic";

export function FetchPanel({ node, streaming, intensity, onToggleStream, onIntensity }: {
  node: NodeListing; streaming: boolean; intensity: Intensity;
  onToggleStream(): void; onIntensity(i: Intensity): void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bytesUsed, setBytesUsed] = useState(0);
  const [streamSpent, setStreamSpent] = useState(0);
  const [egress, setEgress] = useState<{ ip: string; geo: { city: string; country: string }; verified: boolean; region: string | null } | null>(null);
  const [streamErr, setStreamErr] = useState<string | null>(null);

  // Streaming loop: while `streaming`, drive a metered chunk per tick (mirrors lib/traffic.ts).
  useEffect(() => {
    if (!streaming) return;
    const ctrl = new AbortController();
    let inFlight = false;
    const tick = async () => {
      if (inFlight || ctrl.signal.aborted) return;
      inFlight = true;
      try {
        const r = await fetch("/api/egress", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId: node.id, sessionId, stream: true }), signal: ctrl.signal,
        });
        const d = await r.json();
        if (!r.ok) { setStreamErr(d.error ?? "stream paused"); return; }
        setStreamErr(null);
        setSessionId(d.sessionId);
        setBytesUsed((b) => b + d.bytes);
        setStreamSpent((s) => s + d.amountMicroUsd);
        setEgress({ ip: d.egressIp, geo: d.geo, verified: !!d.regionVerified, region: d.region ?? null });
      } catch { /* aborted / soft-fail */ } finally { inFlight = false; }
    };
    void tick();
    const id = setInterval(() => void tick(), intervalForIntensity(intensity));
    return () => { ctrl.abort(); clearInterval(id); };
  }, [streaming, intensity, sessionId, node.id]);

  const RATES: Intensity[] = ["light", "medium", "heavy"];
  return (
    <div className="streampanel">
      <div className="streampanel__counter">
        <div className="streampanel__spend">{formatUsd(streamSpent)}</div>
        <div className="streampanel__label">STREAMING SPEND</div>
        <div className="streampanel__data">{(bytesUsed / 1_000_000).toFixed(2)} MB used</div>
      </div>
      {egress && (
        <p className="streampanel__egress">
          egress <strong>{egress.ip}</strong> —{" "}
          {egress.verified ? (
            <>{egress.geo.city}, {egress.geo.country} <span className="streampanel__verified">✓ verified</span></>
          ) : (
            <>{egress.region ? (FLY_REGION_CITY[egress.region] ?? egress.region) : `${egress.geo.city}, ${egress.geo.country}`}</>
          )}
        </p>
      )}

      <button className="btn btn--primary streampanel__toggle" onClick={onToggleStream}>
        {streaming ? "Stop streaming" : "Start streaming"}
      </button>
      <div className="streampanel__rates">
        {RATES.map((i) => (
          <button key={i} className={`btn btn--ghost ${intensity === i ? "is-active" : ""}`} onClick={() => onIntensity(i)}>{i}</button>
        ))}
      </div>
      {streamErr && <p className="streampanel__warn">⚠ {streamErr}</p>}

      {sessionId && <SettlementLog sessionId={sessionId} />}
    </div>
  );
}
