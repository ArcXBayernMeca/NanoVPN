import type { NodeListing } from "@nanovpn/core";

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function pickNodeDeterministic(loc: { lat: number; lng: number } | null, nodes: NodeListing[]): { nodeId: string; reason: string } {
  if (nodes.length === 0) throw new Error("no nodes");
  if (!loc) {
    const cheapest = [...nodes].sort((a, b) => a.pricePerGbUsd - b.pricePerGbUsd)[0];
    return { nodeId: cheapest.id, reason: `Cheapest available at $${cheapest.pricePerGbUsd}/GB.` };
  }
  const nearest = [...nodes].sort((a, b) => haversine(loc, a.geo) - haversine(loc, b.geo))[0];
  return { nodeId: nearest.id, reason: `Closest to you (${nearest.geo.city}) for low latency.` };
}
