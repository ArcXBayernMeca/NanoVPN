"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { NodeListing } from "@nanovpn/core";
import { useUserLocation } from "@/lib/use-user-location";
import type { Intensity } from "@/lib/traffic";

// react-globe.gl is WebGL/three.js — client-only, no SSR.
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

export function GlobeMap({ nodes, selectedId, connected, streaming, onSelect }: {
  nodes: NodeListing[];
  selectedId: string | null;
  connected: boolean;
  streaming: Intensity | null;
  onSelect: (id: string) => void;
}) {
  const globeRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const userLoc = useUserLocation();

  // Size the globe to its container (react-globe.gl defaults to the full window otherwise).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Called once by react-globe.gl after the WebGL globe initialises and
  // globeRef.current is valid. Sets up auto-rotate and the initial fly-to.
  const handleReady = useCallback(() => {
    const g = globeRef.current;
    if (!g || !g.controls) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.6;
    const stop = () => { c.autoRotate = false; };
    c.addEventListener?.("start", stop);
    // If a node is already selected at mount time, fly to it immediately.
    if (selectedId) {
      const n = nodes.find((x) => x.id === selectedId);
      if (n) g.pointOfView({ lat: n.geo.lat, lng: n.geo.lng, altitude: 1.6 }, 0);
    }
  }, [selectedId, nodes]);

  // Fly the camera to the selected node.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !selectedId) return;
    const n = nodes.find((x) => x.id === selectedId);
    if (n) g.pointOfView({ lat: n.geo.lat, lng: n.geo.lng, altitude: 1.6 }, 1000);
  }, [selectedId, nodes]);

  const points = useMemo(
    () => nodes.map((n) => ({
      id: n.id, lat: n.geo.lat, lng: n.geo.lng,
      city: n.geo.city, rate: n.pricePerGbUsd, selected: n.id === selectedId,
    })),
    [nodes, selectedId],
  );

  const sel = nodes.find((n) => n.id === selectedId) ?? null;
  const origin = userLoc ?? { lat: 20, lng: 0 }; // neutral fallback so the arc still draws
  const rings = connected && sel ? [{ lat: sel.geo.lat, lng: sel.geo.lng }] : [];
  const arcs = connected && sel
    ? [{ startLat: origin.lat, startLng: origin.lng, endLat: sel.geo.lat, endLng: sel.geo.lng }]
    : [];
  const ringPeriod = streaming === "heavy" ? 600 : streaming === "medium" ? 1100 : 1800;

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%" }}>
      {dims.w > 0 && (
        <Globe
          ref={globeRef}
          width={dims.w}
          height={dims.h}
          onGlobeReady={handleReady}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
          backgroundColor="rgba(0,0,0,0)"
          atmosphereColor="#15d687"
          atmosphereAltitude={0.22}
          pointsData={points}
          pointLat="lat"
          pointLng="lng"
          pointColor={(d: any) => (d.selected ? "#15d687" : "#2fe39a")}
          pointAltitude={(d: any) => (d.selected ? 0.14 : 0.06)}
          pointRadius={(d: any) => (d.selected ? 0.85 : 0.6)}
          pointLabel={(d: any) => `${d.city} · $${d.rate}/GB`}
          onPointClick={(d: any) => onSelect(d.id)}
          ringsData={rings}
          ringLat="lat"
          ringLng="lng"
          ringColor={() => (t: number) => `rgba(21,214,135,${1 - t})`}
          ringMaxRadius={6}
          ringPropagationSpeed={3}
          ringRepeatPeriod={ringPeriod}
          arcsData={arcs}
          arcColor={() => "#15d687"}
          arcDashLength={0.5}
          arcDashGap={0.2}
          arcDashAnimateTime={1500}
        />
      )}
    </div>
  );
}
