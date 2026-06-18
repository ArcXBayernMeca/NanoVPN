"use client";
import { useEffect, useState } from "react";
import type { UsageTick } from "@nanovpn/core";
import { formatUsd, formatMb } from "./format";

export function Counter({ sessionId }: { sessionId: string }) {
  const [tick, setTick] = useState<UsageTick | null>(null);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_EDGE_NODE_URL ?? "http://localhost:8080";
    const es = new EventSource(`${base}/usage/${sessionId}`);
    es.onmessage = (e) => setTick(JSON.parse(e.data));
    return () => es.close();
  }, [sessionId]);
  return (
    <div style={{ border: "1px solid #2ecc71", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 28, color: "#2ecc71" }}>{formatUsd(tick?.spentMicroUsd ?? 0)}</div>
      <div>{formatMb(tick?.totalBytes ?? 0)} used · {formatUsd(tick?.unsettledMicroUsd ?? 0)} unsettled</div>
    </div>
  );
}
