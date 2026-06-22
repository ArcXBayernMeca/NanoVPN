"use client";
import { useEffect, useState } from "react";

/** TEMP debug aid: surface any uncaught JS error / promise rejection on-screen so it's
 *  readable even when the browser shows its own crash page. Remove once the map crash is
 *  diagnosed. If this stays EMPTY during a crash, the crash is native (OOM/GPU), not a JS throw. */
export function ErrorOverlay() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const onErr = (e: ErrorEvent) =>
      setMsg(`error: ${e.message}\nat ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ""}`);
    const onRej = (e: PromiseRejectionEvent) =>
      setMsg(`unhandledrejection: ${String(e.reason)}\n${(e.reason as { stack?: string } | undefined)?.stack ?? ""}`);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);
  if (!msg) return null;
  return (
    <div
      role="alert"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 99999,
        maxHeight: "45vh", overflow: "auto", background: "#7f1d1d", color: "#fff",
        font: "12px/1.45 ui-monospace, monospace", padding: "10px 14px", whiteSpace: "pre-wrap",
      }}
    >
      <strong>⚠ JS error captured (debug overlay):</strong>
      {"\n"}{msg}
      <button onClick={() => setMsg(null)} style={{ marginLeft: 12, color: "#fff", background: "transparent", border: "1px solid #fff", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>dismiss</button>
    </div>
  );
}
