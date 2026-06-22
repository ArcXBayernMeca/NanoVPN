"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { explorerAddr } from "@nanovpn/core";
import { formatUsd } from "./format";
import { SettlementProof } from "./SettlementProof";

interface Row { id: string; settlement_uuid: string; amount_micro_usd: number; status: string; tx_hash: string | null; payer: string; payee: string; network: string; }

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

  const payer = rows[0]?.payer;
  return (
    <div className="tape">
      {rows.length === 0 ? (
        <p className="tape__empty">Settlements post here as your balance streams out — roughly every $0.01 or 10 seconds.</p>
      ) : (
        <>
          <ul className="tape__list">
            {rows.map((r) => (
              <li className="tape__row" key={r.id}>
                <span className="tape__amt">{formatUsd(r.amount_micro_usd)}</span>
                <SettlementProof uuid={r.settlement_uuid} amountMicroUsd={r.amount_micro_usd} payer={r.payer} payee={r.payee} network={r.network} />
              </li>
            ))}
          </ul>
          {payer && (
            <a className="tape__anchor" href={explorerAddr(payer)} target="_blank" rel="noreferrer">Payer wallet on Arc ↗</a>
          )}
        </>
      )}
    </div>
  );
}
