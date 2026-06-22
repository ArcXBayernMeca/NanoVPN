"use client";
import { useEffect, useState } from "react";
import type { UsageTick } from "@nanovpn/core";
import { formatUsd, formatMb } from "./format";

export function Counter({ sessionId, rate, onUnsettled }: { sessionId: string; rate?: number; onUnsettled?: (microUsd: number) => void }) {
  const [tick, setTick] = useState<UsageTick | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_EDGE_NODE_URL ?? "http://localhost:8080";
    const es = new EventSource(`${base}/usage/${sessionId}`);
    es.onmessage = (e) => { const t = JSON.parse(e.data); setTick(t); setLive(true); onUnsettled?.(t.unsettledMicroUsd ?? 0); };
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [sessionId, onUnsettled]);

  return (
    <div className="meter" data-live={live ? "true" : "false"}>
      <div className="meter__top">
        <span className="eyebrow">Streaming spend</span>
        {rate != null && <span className="node-card__rate">${rate}/GB</span>}
      </div>
      <div className="meter__value">{formatUsd(tick?.spentMicroUsd ?? 0)}</div>
      <div className="meter__flow"><i /></div>
      <div className="meter__stats">
        <div className="stat"><b>{formatMb(tick?.totalBytes ?? 0)}</b><span>data used</span></div>
        <div className="stat"><b>{formatUsd(tick?.unsettledMicroUsd ?? 0)}</b><span>unsettled</span></div>
      </div>
    </div>
  );
}
