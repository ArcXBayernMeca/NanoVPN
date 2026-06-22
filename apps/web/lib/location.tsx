"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type LocationStatus = "idle" | "prompting" | "granted" | "denied" | "unavailable";
export interface Coords { lat: number; lng: number }
export interface LocationResult { status: LocationStatus; coords: Coords | null }

interface LocationCtx {
  status: LocationStatus;
  coords: Coords | null;
  request(): Promise<LocationResult>;
}

const Ctx = createContext<LocationCtx | null>(null);

export function useLocation(): LocationCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLocation must be used within LocationProvider");
  return c;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const inflight = useRef<Promise<LocationResult> | null>(null);

  const request = useCallback((): Promise<LocationResult> => {
    if (coords) return Promise.resolve({ status: "granted", coords });
    if (inflight.current) return inflight.current;
    setStatus("prompting");
    const p = new Promise<LocationResult>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setStatus("unavailable");
        resolve({ status: "unavailable", coords: null });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(c);
          setStatus("granted");
          resolve({ status: "granted", coords: c });
        },
        (err) => {
          const s: LocationStatus = err && err.code === 1 ? "denied" : "unavailable";
          setStatus(s);
          resolve({ status: s, coords: null });
        },
        { timeout: 12_000, maximumAge: 600_000 },
      );
    }).finally(() => { inflight.current = null; });
    inflight.current = p;
    return p;
  }, [coords]);

  return <Ctx.Provider value={{ status, coords, request }}>{children}</Ctx.Provider>;
}
