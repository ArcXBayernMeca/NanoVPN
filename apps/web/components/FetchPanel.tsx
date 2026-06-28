"use client";
import { useEffect, useState } from "react";
import type { NodeListing } from "@nanovpn/core";
import { formatUsd } from "./format";
import { SettlementLog } from "./SettlementLog";

const PRESETS = [
  "https://api.ipify.org?format=json",
  "https://ipinfo.io/json",
  "https://httpbin.org/headers",
];

type Result = { status: number; bytes: number; egressIp: string; geo: { country: string; city: string }; amountMicroUsd: number };

export function FetchPanel({ node }: { node: NodeListing }) {
  const [balance, setBalance] = useState<{ fundedMicroUsd: number; spentMicroUsd: number } | null>(null);
  const [url, setUrl] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wallet").then((r) => (r.ok ? r.json() : null)).then((d) => d && setBalance(d)).catch(() => {});
  }, []);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/egress", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: node.id, url, sessionId }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "fetch failed"); return; }
      setSessionId(d.sessionId);
      setResult(d);
      setBalance((b) => (b ? { ...b, spentMicroUsd: b.spentMicroUsd + d.amountMicroUsd } : b));
    } finally { setBusy(false); }
  }

  const remaining = balance ? balance.fundedMicroUsd - balance.spentMicroUsd : 0;
  return (
    <div className="fetchpanel">
      {balance && (
        <p className="fetchpanel__bal">Balance {formatUsd(remaining)} <span className="hint">of {formatUsd(balance.fundedMicroUsd)} granted</span></p>
      )}
      <div className="fetchpanel__row">
        <select className="fetchpanel__url" value={url} onChange={(e) => setUrl(e.target.value)}>
          {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn btn--primary" disabled={busy} onClick={go}>
          {busy ? "Fetching…" : `Fetch through ${node.geo.city}`}
        </button>
      </div>
      {err && <p className="hint" style={{ color: "var(--amber)" }}>{err}</p>}
      {result && (
        <div className="fetchpanel__result">
          <p>HTTP {result.status} · {result.bytes} B · {formatUsd(result.amountMicroUsd)}</p>
          <p>egress <strong>{result.egressIp}</strong> — {result.geo.city}, {result.geo.country}</p>
        </div>
      )}
      {sessionId && <SettlementLog sessionId={sessionId} />}
    </div>
  );
}
