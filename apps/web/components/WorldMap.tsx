"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { NodeListing } from "@nanovpn/core";
import type { Intensity } from "@/lib/traffic";
import { pinPositions } from "@/lib/map-view";

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

  return (
    <div ref={wrapRef} className="wmap">
      {projection && path && (
        <svg className="wmap__svg" width={w} height={h}>
          <g>
            {land.map((f, i) => (
              <path key={i} d={path(f) ?? ""} className="wmap__land" />
            ))}
            {pins.map(({ id, x, y }) => {
              const n = nodeById.get(id); if (!n) return null;
              const on = id === selectedId;
              return (
                <g key={id} transform={`translate(${x},${y})`}
                   className={`wmap__pin ${on ? "is-on" : ""}`} onClick={() => onSelect(id)}>
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
