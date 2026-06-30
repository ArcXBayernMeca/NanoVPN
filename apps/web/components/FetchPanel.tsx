"use client";
import { useEffect, useState } from "react";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { parseUnits, erc20Abi } from "viem";
import type { NodeListing } from "@nanovpn/core";
import { ARC } from "@nanovpn/core";
import { formatUsd } from "./format";
import { SettlementLog } from "./SettlementLog";

const PRESETS = [
  "https://api.ipify.org?format=json",
  "https://ipinfo.io/json",
  "https://httpbin.org/headers",
];

type Result = { status: number; bytes: number; egressIp: string; geo: { country: string; city: string }; amountMicroUsd: number };

export function FetchPanel({ node }: { node: NodeListing }) {
  const [balance, setBalance] = useState<{ eoaAddress: string; fundedMicroUsd: number; spentMicroUsd: number; fundingStatus: string } | null>(null);
  const [url, setUrl] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("1");
  const [funding, setFunding] = useState(false);
  const [fundErr, setFundErr] = useState<string | null>(null);

  async function refreshWallet() {
    const d = await fetch("/api/wallet").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) setBalance(d);
  }

  useEffect(() => {
    refreshWallet();
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

  async function selfFund() {
    if (!(Number(amount) > 0)) { setFundErr("Enter an amount greater than 0"); return; }
    if (!balance || !publicClient) return;
    setFunding(true); setFundErr(null);
    try {
      const hash = await writeContractAsync({
        address: ARC.usdc, abi: erc20Abi, functionName: "transfer",
        args: [balance.eoaAddress as `0x${string}`, parseUnits(amount, ARC.usdcDecimals)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const r = await fetch("/api/self-fund", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setFundErr(d.error ?? "self-fund failed"); return; }
      await refreshWallet();
    } catch (e) { setFundErr((e as Error).message); } finally { setFunding(false); }
  }

  const remaining = balance ? balance.fundedMicroUsd - balance.spentMicroUsd : 0;
  return (
    <div className="fetchpanel">
      {balance && (
        <p className="fetchpanel__bal">Balance {formatUsd(remaining)} <span className="hint">of {formatUsd(balance.fundedMicroUsd)} granted</span></p>
      )}
      <div className="fetchpanel__fund">
        <span className="hint">Fund from your wallet (USDC):</span>
        <input className="fetchpanel__amt" type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" disabled={funding || !isConnected || !balance} onClick={selfFund}>
          {funding ? "Funding…" : "Fund from your wallet"}
        </button>
      </div>
      {fundErr && <p className="hint" style={{ color: "var(--amber)" }}>{fundErr}</p>}
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
