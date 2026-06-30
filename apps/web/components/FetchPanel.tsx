"use client";
import { useEffect, useState } from "react";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { parseUnits, erc20Abi } from "viem";
import type { NodeListing } from "@nanovpn/core";
import { ARC } from "@nanovpn/core";
import { formatUsd } from "./format";
import { SettlementLog } from "./SettlementLog";
import { intervalForIntensity, type Intensity } from "@/lib/traffic";

export function FetchPanel({ node, streaming, intensity, onToggleStream, onIntensity }: {
  node: NodeListing; streaming: boolean; intensity: Intensity;
  onToggleStream(): void; onIntensity(i: Intensity): void;
}) {
  const [balance, setBalance] = useState<{ eoaAddress: string; fundedMicroUsd: number; spentMicroUsd: number; fundingStatus: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bytesUsed, setBytesUsed] = useState(0);
  const [streamSpent, setStreamSpent] = useState(0);
  const [egress, setEgress] = useState<{ ip: string; geo: { city: string; country: string } } | null>(null);
  const [streamErr, setStreamErr] = useState<string | null>(null);

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
  useEffect(() => { refreshWallet(); }, []);

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
        setEgress({ ip: d.egressIp, geo: d.geo });
        setBalance((b) => (b ? { ...b, spentMicroUsd: b.spentMicroUsd + d.amountMicroUsd } : b));
      } catch { /* aborted / soft-fail */ } finally { inFlight = false; }
    };
    void tick();
    const id = setInterval(() => void tick(), intervalForIntensity(intensity));
    return () => { ctrl.abort(); clearInterval(id); };
  }, [streaming, intensity, sessionId, node.id]);

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
  const RATES: Intensity[] = ["light", "medium", "heavy"];
  return (
    <div className="streampanel">
      <div className="streampanel__counter">
        <div className="streampanel__spend">{formatUsd(streamSpent)}</div>
        <div className="streampanel__label">STREAMING SPEND</div>
        <div className="streampanel__data">{(bytesUsed / 1_000_000).toFixed(2)} MB used</div>
      </div>
      {egress && <p className="streampanel__egress">egress <strong>{egress.ip}</strong> — {egress.geo.city}, {egress.geo.country}</p>}

      <button className="btn btn--primary streampanel__toggle" onClick={onToggleStream}>
        {streaming ? "Stop streaming" : "Start streaming"}
      </button>
      <div className="streampanel__rates">
        {RATES.map((i) => (
          <button key={i} className={`btn btn--ghost ${intensity === i ? "is-active" : ""}`} onClick={() => onIntensity(i)}>{i}</button>
        ))}
      </div>
      {streamErr && <p className="streampanel__warn">⚠ {streamErr}</p>}

      {balance && (
        <p className="streampanel__bal">Balance <strong>{formatUsd(remaining)}</strong> <span className="streampanel__sub">of {formatUsd(balance.fundedMicroUsd)} funded</span></p>
      )}
      <div className="streampanel__fund">
        <label className="streampanel__sub">Fund from your wallet (USDC)</label>
        <div className="streampanel__fundrow">
          <input className="streampanel__amt" type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn btn--secondary" disabled={funding || !isConnected || !balance} onClick={selfFund}>
            {funding ? "Funding…" : "Fund from your wallet"}
          </button>
        </div>
        {fundErr && <p className="streampanel__warn">{fundErr}</p>}
      </div>

      {sessionId && <SettlementLog sessionId={sessionId} />}
    </div>
  );
}
