"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { ARC } from "@nanovpn/core";
import { formatUsd } from "./format";

interface Row { id: string; settlement_uuid: string; amount_micro_usd: number; status: string; tx_hash: string | null; }

export function SettlementLog({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb.channel(`settlements-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "settlements", filter: `session_id=eq.${sessionId}` },
        (p) => setRows((prev) => prev.some((r) => r.id === (p.new as Row).id) ? prev : [p.new as Row, ...prev]))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data } = await sb.from("settlements").select("*").eq("session_id", sessionId).order("created_at", { ascending: false });
          setRows((data as Row[]) ?? []);
        }
      });
    return () => { sb.removeChannel(channel); };
  }, [sessionId]);

  return (
    <div style={{ border: "1px solid #234", borderRadius: 8, padding: 12 }}>
      <strong>On-chain settlements</strong>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((r) => (
          <li key={r.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{formatUsd(r.amount_micro_usd)} · {r.status}</span>
            <a href={r.tx_hash ? `${ARC.explorer}/tx/${r.tx_hash}` : `${ARC.facilitator}/v1/x402/transfers/${r.settlement_uuid}`} target="_blank" rel="noreferrer">view</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
