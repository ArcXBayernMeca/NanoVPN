"use client";
import { useEffect } from "react";

export type Intensity = "light" | "medium" | "heavy";

/** Pull interval (ms) for the auto-traffic loop. Heavier intensity = shorter interval. */
export function intervalForIntensity(i: Intensity): number {
  switch (i) {
    case "light": return 3000;
    case "medium": return 1200;
    case "heavy": return 400;
  }
}

/** While enabled, repeatedly drive real bytes through the node via /api/browse so the
 *  metered counter + settlements stream live. Soft-fails per call; cleans up on disable. */
export function useTrafficStream(sessionId: string | null, intensity: Intensity, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !sessionId) return;
    const ctrl = new AbortController();
    let inFlight = false;
    const fire = async () => {
      if (inFlight || ctrl.signal.aborted) return; // never overlap → stop is immediate
      inFlight = true;
      try { await fetch(`/api/browse?session=${sessionId}`, { signal: ctrl.signal }); }
      catch { /* aborted or soft-fail */ }
      finally { inFlight = false; }
    };
    void fire(); // immediate first pull
    const id = setInterval(() => void fire(), intervalForIntensity(intensity));
    return () => { ctrl.abort(); clearInterval(id); };
  }, [sessionId, intensity, enabled]);
}
