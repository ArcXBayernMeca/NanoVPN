"use client";
import { useState } from "react";
import type { NodeListing } from "@nanovpn/core";
import { Counter } from "./Counter";
import { SettlementLog } from "./SettlementLog";
import { formatUsd } from "./format";
const STUCK_UNSETTLED_MICRO_USD = 50_000; // $0.05 = 5× the $0.01 settle threshold ⇒ settlement is stuck
import type { Intensity } from "@/lib/traffic";

export function MapRail(props: {
  node: NodeListing | null; signedIn: string | null; session: { sessionId: string } | null;
  connecting: boolean; streaming: boolean; intensity: Intensity; copilotMsg: string | null;
  locationDenied?: boolean; locating?: boolean; onRetryLocation?: () => void;
  onConnect(): void; onDisconnect(): void; onToggleStream(): void; onIntensity(i: Intensity): void; onCopilot(): void;
}) {
  const { node, signedIn, session } = props;
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [unsettled, setUnsettled] = useState(0);
  const showBanner = !!props.locationDenied && !session && !bannerDismissed;
  return (
    <aside className="maprail">
      <section className="maprail__sec">
        <span className="eyebrow">Exit node</span>
        {node ? (
          <div className="node-card"><span className="node-card__pin" />
            <div><div className="node-card__name">{node.geo.city}, {node.geo.country}</div><div className="node-card__meta">{node.id}</div></div>
            <span className="node-card__rate">${node.pricePerGbUsd}/GB</span>
          </div>
        ) : <p className="hint">Spin the globe and pick a node — or let the AI choose.</p>}
        {showBanner && (
          <div className="maprail__banner">
            <p className="hint">Location off — pick a node on the map, or enable location &amp; retry.</p>
            <div className="btn--row">
              <button className="btn btn--ghost" onClick={() => props.onRetryLocation?.()}>Retry</button>
              <button className="btn btn--ghost" onClick={() => setBannerDismissed(true)}>Browse</button>
            </div>
          </div>
        )}
        {props.locating && !session && !node && !showBanner && (
          <p className="hint">✦ Locating you…</p>
        )}
        {props.copilotMsg && <p className="hint copilot-msg">✦ {props.copilotMsg}</p>}
        {!session && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <button className="btn btn--primary" disabled={!node || !signedIn || props.connecting} onClick={props.onConnect}>
              {props.connecting ? "Connecting…" : node ? `Connect to ${node.geo.city}` : "Connect"}
            </button>
            <button className="btn btn--ghost copilot-btn" disabled={!signedIn} onClick={props.onCopilot}>✦ Let AI pick for me</button>
            {!signedIn && <p className="hint">Sign in with your wallet (top right) to connect.</p>}
          </div>
        )}
      </section>
      {session && node && (
        <>
          <section className="maprail__sec">
            <Counter sessionId={session.sessionId} rate={node.pricePerGbUsd} onUnsettled={setUnsettled} />
            <div className="stream-controls">
              <button className={`btn ${props.streaming ? "btn--ghost" : "btn--primary"}`} onClick={props.onToggleStream}>{props.streaming ? "Stop traffic" : "Start traffic"}</button>
              <div className="seg" role="group" aria-label="intensity">
                {(["light", "medium", "heavy"] as Intensity[]).map((i) => (
                  <button key={i} className="seg__btn" data-on={props.intensity === i} onClick={() => props.onIntensity(i)}>{i}</button>
                ))}
              </div>
            </div>
            <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={props.onDisconnect}>Disconnect</button>
          </section>
          <section className="maprail__sec">
            <span className="eyebrow">On-chain settlements</span>
            {unsettled >= STUCK_UNSETTLED_MICRO_USD && (
              <p className="maprail__banner">⚠ Settlement paused — buyer balance low (unsettled {formatUsd(unsettled)} not posting).</p>
            )}
            <SettlementLog sessionId={session.sessionId} />
          </section>
        </>
      )}
    </aside>
  );
}
