"use client";
import { useEffect, useState } from "react";

/** Best-effort browser location for the globe's connection arc origin.
 *  Returns null until/unless the user grants geolocation; callers use a fallback origin. */
export function useUserLocation(): { lat: number; lng: number } | null {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setLoc(null),
      { timeout: 5000, maximumAge: 600_000 },
    );
  }, []);
  return loc;
}
