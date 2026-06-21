"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { NodeListing } from "@nanovpn/core";
import type { Intensity } from "@/lib/traffic";
import { clampK, viewCenteredOn, type View, pinPositions } from "@/lib/map-view";

export function WorldMap({ nodes, selectedId, connected, streaming, onSelect }: {
  nodes: NodeListing[]; selectedId: string | null; connected: boolean;
  streaming: Intensity | null; onSelect: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
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
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const pins = useMemo(() => (projection ? pinPositions(nodes, projection) : []), [nodes, projection]);

  // Pan/zoom state. Default k=1 shows the whole world centered (fitExtent fills the
  // viewport at scale 1, so every node pin is visible); the user zooms in from there.
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x), y: drag.current!.vy + (e.clientY - drag.current!.y) }));
  };
  const onPointerUp = () => { drag.current = null; };
  const zoomBy = (factor: number) => setView((v) => {
    const k = clampK(v.k * factor);
    const cx = w / 2, cy = h / 2; // zoom toward center
    return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
  });
  const onWheel = (e: React.WheelEvent) => { zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); };

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
      onWheel={onWheel}
    >
      {projection && path && (
        <svg className="wmap__svg" width={w} height={h}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {land.map((f, i) => (
              <path key={i} d={path(f) ?? ""} className="wmap__land" vectorEffect="non-scaling-stroke" />
            ))}
            {connected && sel && (() => {
              const a = projection([0, 20]) as [number, number] | null;
              const b = projection([sel.geo.lng, sel.geo.lat]) as [number, number] | null;
              return a && b ? <line className={`wmap__link${streaming ? " is-live" : ""}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} vectorEffect="non-scaling-stroke" /> : null;
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
      <div className="wmap__zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button aria-label="zoom in" onClick={() => zoomBy(1.4)}>+</button>
        <button aria-label="zoom out" onClick={() => zoomBy(1 / 1.4)}>−</button>
      </div>
    </div>
  );
}
