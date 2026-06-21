export interface View { k: number; x: number; y: number } // scale + translate (screen px)
export const MIN_K = 1, MAX_K = 8;
export const clampK = (k: number) => Math.max(MIN_K, Math.min(MAX_K, k));

/** New view that centers [px,py] (current projected screen point of a node) in a w×h box at zoom k. */
export function viewCenteredOn(px: number, py: number, w: number, h: number, k: number): View {
  const kk = clampK(k);
  return { k: kk, x: w / 2 - px * kk, y: h / 2 - py * kk };
}
