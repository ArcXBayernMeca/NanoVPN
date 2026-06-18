"use client";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import type { NodeListing } from "@nanovpn/core";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export function WorldMap({ nodes, selectedId, onSelect }: {
  nodes: NodeListing[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <ComposableMap projectionConfig={{ scale: 156 }} style={{ width: "100%", height: "auto" }}>
      <Geographies geography={GEO_URL}>
        {({ geographies }: { geographies: any[] }) => geographies.map((geo: any) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill="#16241d"
            stroke="#0b1410"
            strokeWidth={0.4}
            style={{ default: { outline: "none" }, hover: { fill: "#1d3027", outline: "none" }, pressed: { outline: "none" } }}
          />
        ))}
      </Geographies>
      {nodes.map((n) => {
        const active = selectedId === n.id;
        return (
          <Marker key={n.id} coordinates={[n.geo.lng, n.geo.lat]} onClick={() => onSelect(n.id)}>
            {active && <circle r={15} fill="#0fa968" opacity={0.16} />}
            <circle
              r={active ? 8 : 6}
              fill={active ? "#0fa968" : "#37b985"}
              stroke="#ffffff"
              strokeWidth={2}
              style={{ cursor: "pointer", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}
            />
            <text className="map-label" textAnchor="middle" y={-15}>
              {n.geo.city} · ${n.pricePerGbUsd}/GB
            </text>
          </Marker>
        );
      })}
    </ComposableMap>
  );
}
