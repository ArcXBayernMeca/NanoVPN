"use client";
import type { NodeListing } from "@nanovpn/core";
import { Counter } from "./Counter";
import { SettlementLog } from "./SettlementLog";
import type { Intensity } from "@/lib/traffic";

export function MapRail(props: {
  node: NodeListing | null; signedIn: string | null; session: { sessionId: string } | null;
  connecting: boolean; streaming: boolean; intensity: Intensity; copilotMsg: string | null;
  onConnect(): void; onDisconnect(): void; onToggleStream(): void; onIntensity(i: Intensity): void; onCopilot(): void;
}) {
  const { node, signedIn, session } = props;
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
            <Counter sessionId={session.sessionId} rate={node.pricePerGbUsd} />
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
            <SettlementLog sessionId={session.sessionId} />
          </section>
        </>
      )}
    </aside>
  );
}
