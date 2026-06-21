/** Which run (if any) the /agent page should show. Only an explicit ?run=<id>
 *  loads a run; with no param a new visitor sees the empty state (no stale example). */
export function runIdToLoad(searchParam: string | undefined): string | null {
  const id = (searchParam ?? "").trim();
  return id.length > 0 ? id : null;
}
