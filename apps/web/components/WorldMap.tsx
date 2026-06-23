"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { NodeListing } from "@nanovpn/core";
import type { Intensity } from "@/lib/traffic";
import { clampK, viewCenteredOn, viewForLocation, type View, pinPositions } from "@/lib/map-view";

// useLayoutEffect on the client (so the canvas redraw + transform reset happen before
// paint, no flash), useEffect on the server to avoid the SSR warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function WorldMap({ nodes, selectedId, connected, streaming, onSelect, userLocation }: {
  nodes: NodeListing[]; selectedId: string | null; connected: boolean;
  streaming: Intensity | null; onSelect: (id: string) => void;
  userLocation?: { lat: number; lng: number } | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [land, setLand] = useState<any[]>([]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure(); const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fetch("/world-110m.json").then((r) => r.json())
      .then((topo) => setLand((feature(topo, topo.objects.countries) as any).features))
      .catch(() => {});
  }, []);

  const { w, h } = dims;
  const projection = useMemo(() => {
    if (!w || !h) return null;
    return geoNaturalEarth1().fitExtent([[8, 8], [w - 8, h - 8]], { type: "Sphere" } as any);
  }, [w, h]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const pins = useMemo(() => (projection ? pinPositions(nodes, projection) : []), [nodes, projection]);

  // Pan/zoom state. `view` is the COMMITTED transform that drives both the canvas land and
  // the SVG overlay. Live dragging does NOT touch this (see onPointerMove) — it pans via a
  // compositor-only CSS transform on the stage and only commits here on release.
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  // Draw the landmass to a <canvas>, NOT an SVG path, and only when the committed `view`
  // changes (release / zoom / fly-to) — never per drag frame. An SVG <g transform> or a
  // canvas redraw fired on every pointermove re-rasterizes the (very complex) country
  // geometry each frame, which saturates and crashes Chromium's GPU process under sustained
  // drag ("This page couldn't load"). Live panning is a pure compositor transform instead.
  useIsoLayoutEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !projection || !w || !h) return;
    const ctx = cv.getContext("2d");
    // The committed view now drives the map; drop any leftover live-drag transform so the
    // stage isn't double-offset. Done in the same (pre-paint) tick as the redraw → no flash.
    const s = stageRef.current; if (s && s.style.transform) s.style.transform = "";
    if (!ctx) return; // jsdom / canvas unsupported — interactive marks still render
    const dpr = Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, 2);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels, crisp on HiDPI
    ctx.clearRect(0, 0, w, h);
    if (!land.length) return;
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);
    ctx.beginPath();
    geoPath(projection, ctx)({ type: "FeatureCollection", features: land } as any);
    ctx.fillStyle = "#1c2a23";
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "#33473b";
    ctx.stroke();
    ctx.restore();
  }, [land, projection, view, w, h]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    d.dx = e.clientX - d.x; d.dy = e.clientY - d.y;
    // Compositor-only live pan: translate the already-rendered canvas+svg layers. No
    // setState, no canvas redraw, no SVG repaint during the gesture → the GPU process is
    // never asked to repaint the heavy geometry per frame. Committed on release.
    const s = stageRef.current; if (s) s.style.transform = `translate(${d.dx}px,${d.dy}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current; drag.current = null;
    if (!d || (!d.dx && !d.dy)) return; // a click (or no movement) — nothing to commit
    setView((v) => ({ ...v, x: v.x + d.dx, y: v.y + d.dy })); // redraw effect clears the transform
  };
  const zoomBy = (factor: number) => setView((v) => {
    const k = clampK(v.k * factor);
    const cx = w / 2, cy = h / 2; // zoom toward center
    return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
  });

  // Zoom on Ctrl/⌘ + wheel (and trackpad pinch, which sets ctrlKey) only — a plain
  // scroll is left to the page. Native non-passive listener so preventDefault can stop
  // the browser's own page-zoom. (React's onWheel is passive and can't preventDefault.)
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain scroll → don't hijack it
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((v) => {
        const k = clampK(v.k * factor);
        const cx = w / 2, cy = h / 2;
        return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
      });
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [w, h]);

  // Center on the user's location once, when it first becomes available.
  const didCenterOnUser = useRef(false);
  useEffect(() => {
    if (didCenterOnUser.current || !projection || !userLocation || !w || !h) return;
    const v = viewForLocation(userLocation, projection, w, h, 3);
    if (v) { setView(v); didCenterOnUser.current = true; }
  }, [projection, userLocation, w, h]);

  // Fly-to-selection: recenter when selectedId changes
  const sel = nodes.find((n) => n.id === selectedId) ?? null;
  useEffect(() => {
    if (!projection || !sel) return;
    const p = projection([sel.geo.lng, sel.geo.lat]) as [number, number] | null;
    if (p) setView((v) => viewCenteredOn(p[0], p[1], w, h, Math.max(v.k, 2.6)));
  }, [selectedId, projection, w, h]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapRef} className="wmap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div ref={stageRef} className="wmap__stage">
        <canvas ref={canvasRef} className="wmap__canvas" />
        {projection && (
          <svg className="wmap__svg" width={w} height={h}>
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {connected && sel && (() => {
                const a = projection(userLocation ? [userLocation.lng, userLocation.lat] : [0, 20]) as [number, number] | null;
                const b = projection([sel.geo.lng, sel.geo.lat]) as [number, number] | null;
                return a && b ? <line className={`wmap__link${streaming ? " is-live" : ""}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} vectorEffect="non-scaling-stroke" /> : null;
              })()}
              {userLocation && (() => {
                const p = projection([userLocation.lng, userLocation.lat]) as [number, number] | null;
                return p ? (
                  <g transform={`translate(${p[0]},${p[1]})`} className="wmap__me">
                    <circle className="wmap__me-halo" r={10} vectorEffect="non-scaling-stroke" />
                    <circle className="wmap__me-dot" r={4} vectorEffect="non-scaling-stroke" />
                    <title>You are here</title>
                  </g>
                ) : null;
              })()}
              {pins.map(({ id, x, y }) => {
                const n = nodeById.get(id); if (!n) return null;
                const on = id === selectedId;
                return (
                  <g key={id} transform={`translate(${x},${y})`}
                     className={`wmap__pin ${on ? "is-on" : ""}`} onClick={() => onSelect(id)}>
                    <circle className="wmap__halo" r={on ? 12 : 8} vectorEffect="non-scaling-stroke" />
                    <circle className="wmap__dot" r={on ? 5 : 3.5} vectorEffect="non-scaling-stroke" />
                    <title>{n.geo.city} · ${n.pricePerGbUsd}/GB</title>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
      <div className="wmap__zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button aria-label="zoom in" onClick={() => zoomBy(1.4)}>+</button>
        <button aria-label="zoom out" onClick={() => zoomBy(1 / 1.4)}>−</button>
      </div>
    </div>
  );
}
