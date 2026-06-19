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
    let stopped = false;
    const fire = () => { if (!stopped) void fetch(`/api/browse?session=${sessionId}`).catch(() => {}); };
    fire(); // immediate first pull so payments start without waiting a full interval
    const id = setInterval(fire, intervalForIntensity(intensity));
    return () => { stopped = true; clearInterval(id); };
  }, [sessionId, intensity, enabled]);
}
