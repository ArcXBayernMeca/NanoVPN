import type { GeoProjection } from "d3-geo";
import type { NodeListing } from "@nanovpn/core";

export interface View { k: number; x: number; y: number } // scale + translate (screen px)
export const MIN_K = 1, MAX_K = 8;

export interface Pin { id: string; x: number; y: number }
/** Project each node to screen coords via the given d3-geo projection, dropping any that don't project. */
export function pinPositions(nodes: NodeListing[], projection: GeoProjection): Pin[] {
  const out: Pin[] = [];
  for (const n of nodes) {
    const p = projection([n.geo.lng, n.geo.lat]);
    if (p) out.push({ id: n.id, x: p[0], y: p[1] });
  }
  return out;
}
export const clampK = (k: number) => Math.max(MIN_K, Math.min(MAX_K, k));

/** New view that centers [px,py] (current projected screen point of a node) in a w×h box at zoom k. */
export function viewCenteredOn(px: number, py: number, w: number, h: number, k: number): View {
  const kk = clampK(k);
  return { k: kk, x: w / 2 - px * kk, y: h / 2 - py * kk };
}
