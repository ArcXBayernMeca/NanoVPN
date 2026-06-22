"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { NodeListing } from "@nanovpn/core";
import { pinPositions } from "@/lib/map-view";

/** Non-interactive world map for the landing hero. Self-fetches topology + nodes. */
export function MapBackdrop() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [land, setLand] = useState<any[]>([]);
  const [nodes, setNodes] = useState<NodeListing[]>([]);

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
  useEffect(() => {
    fetch("/api/nodes").then((r) => r.json()).then((d: NodeListing[]) => setNodes(d)).catch(() => {});
  }, []);

  const { w, h } = dims;
  const projection = useMemo(
    () => (w && h ? geoNaturalEarth1().fitExtent([[8, 8], [w - 8, h - 8]], { type: "Sphere" } as any) : null),
    [w, h],
  );
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const pins = useMemo(() => (projection ? pinPositions(nodes, projection) : []), [nodes, projection]);

  return (
    <div ref={wrapRef} className="mbk" aria-hidden>
      {projection && path && (
        <svg className="mbk__svg" width={w} height={h}>
          {land.map((f, i) => (
            <path key={i} d={path(f) ?? ""} className="mbk__land" vectorEffect="non-scaling-stroke" />
          ))}
          {pins.map(({ id, x, y }, i) => (
            <g key={id} transform={`translate(${x},${y})`} className="mbk__pin" style={{ animationDelay: `${(i % 6) * 0.3}s` }}>
              <circle className="mbk__halo" r={7} vectorEffect="non-scaling-stroke" />
              <circle className="mbk__dot" r={2.6} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
