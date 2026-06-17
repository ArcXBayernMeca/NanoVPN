"use client";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import type { NodeListing } from "@nanovpn/core";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export function WorldMap({ nodes, selectedId, onSelect }: {
  nodes: NodeListing[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <ComposableMap projectionConfig={{ scale: 150 }} style={{ width: "100%", height: "auto" }}>
      <Geographies geography={GEO_URL}>
        {({ geographies }: { geographies: any[] }) => geographies.map((geo: any) => (
          <Geography key={geo.rsmKey} geography={geo} fill="#1b2a2a" stroke="#0e1a1a" />
        ))}
      </Geographies>
      {nodes.map((n) => (
        <Marker key={n.id} coordinates={[n.geo.lng, n.geo.lat]} onClick={() => onSelect(n.id)}>
          <circle r={7} fill={selectedId === n.id ? "#2ecc71" : "#7bed9f"} stroke="#0b3" style={{ cursor: "pointer" }} />
          <text textAnchor="middle" y={-12} fontSize={10} fill="#dff">{n.geo.city} · ${n.pricePerGbUsd}/GB</text>
        </Marker>
      ))}
    </ComposableMap>
  );
}
