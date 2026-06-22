"use client";
import { useState } from "react";
import { formatUsd } from "./format";

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

/** "✓ verified" toggle for a Gateway settlement (no per-payment on-chain tx exists).
 *  Reveals from→to / amount / Arc / status; lazily upgrades status from the facilitator. */
export function SettlementProof({ uuid, amountMicroUsd, payer, payee, network }: {
  uuid: string; amountMicroUsd: number; payer?: string | null; payee?: string | null; network?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rec, setRec] = useState<{ from?: string | null; to?: string | null; status?: string | null; network?: string | null } | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !rec) {
      try {
        const r = await fetch(`/api/settlement/${uuid}`);
        if (r.ok) setRec(await r.json());
      } catch { /* keep the caller-provided fallback values */ }
    }
  };

  const from = rec?.from ?? payer ?? null;
  const to = rec?.to ?? payee ?? null;
  const net = rec?.network ?? network ?? "eip155:5042002";
  const status = rec?.status ?? "received";

  return (
    <div className="sproof">
      <button className="sproof__toggle" aria-expanded={open} onClick={toggle}>✓ verified {open ? "▴" : "▾"}</button>
      {open && (
        <dl className="sproof__detail">
          <div><dt>amount</dt><dd>{formatUsd(amountMicroUsd)}</dd></div>
          <div><dt>from → to</dt><dd>{short(from)} → {short(to)}</dd></div>
          <div><dt>network</dt><dd>Arc ({net})</dd></div>
          <div><dt>status</dt><dd>{status}</dd></div>
        </dl>
      )}
    </div>
  );
}
