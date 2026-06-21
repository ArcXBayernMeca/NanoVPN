"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { NodeListing } from "@nanovpn/core";
import type { Intensity } from "@/lib/traffic";

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

  const project = (lat: number, lng: number): [number, number] | null =>
    projection ? (projection([lng, lat]) as [number, number] | null) : null;

  const sel = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div ref={wrapRef} className="wmap">
      {projection && path && (
        <svg className="wmap__svg" width={w} height={h}>
          <g>
            {land.map((f, i) => (
              <path key={i} d={path(f) ?? ""} className="wmap__land" />
            ))}
            {nodes.map((n) => {
              const p = project(n.geo.lat, n.geo.lng); if (!p) return null;
              const on = n.id === selectedId;
              return (
                <g key={n.id} transform={`translate(${p[0]},${p[1]})`}
                   className={`wmap__pin ${on ? "is-on" : ""}`} onClick={() => onSelect(n.id)}>
                  <circle className="wmap__halo" r={on ? 12 : 8} />
                  <circle className="wmap__dot" r={on ? 5 : 3.5} />
                  <title>{n.geo.city} · ${n.pricePerGbUsd}/GB</title>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
