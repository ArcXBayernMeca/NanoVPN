"use client";
import { useEffect, useMemo, useRef } from "react";
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
  const userLoc = useUserLocation();

  // Auto-rotate until the user first interacts with the globe.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !g.controls) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.6;
    const stop = () => { c.autoRotate = false; };
    c.addEventListener?.("start", stop);
    return () => c.removeEventListener?.("start", stop);
  }, []);

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
    <Globe
      ref={globeRef}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
      backgroundColor="rgba(0,0,0,0)"
      atmosphereColor="#15d687"
      atmosphereAltitude={0.18}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointColor={(d: any) => (d.selected ? "#15d687" : "#37b985")}
      pointAltitude={(d: any) => (d.selected ? 0.09 : 0.03)}
      pointRadius={(d: any) => (d.selected ? 0.6 : 0.42)}
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
  );
}
