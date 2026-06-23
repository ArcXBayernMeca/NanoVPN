"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { feature } from "topojson-client";
import type { NodeListing } from "@nanovpn/core";
import type { Intensity } from "@/lib/traffic";

// A real WebGL map engine (MapLibre GL). WebGL is a single GPU-native context built for
// continuous pan/zoom, so the per-frame repaint flood that crashed the old SVG/canvas map
// can't happen. We feed it our own bundled world geometry (no tiles, no API key) and style
// it dark to match the design; node pins are HTML markers layered on top.

type LngLat = [number, number];
// A style with an explicit dark background LAYER (not just a CSS bg): an empty style leaves
// the WebGL canvas opaque/white, which painted over the page as a blank area. The bg layer
// is the ocean; land + pins draw on top once loaded.
const BASE_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "ocean", type: "background", paint: { "background-color": "#0a1410" } }],
} as unknown as maplibregl.StyleSpecification;
const EMPTY_FC = () => ({ type: "FeatureCollection", features: [] }) as GeoJSON.FeatureCollection;
const WORLD_BOUNDS: [LngLat, LngLat] = [[-170, -56], [185, 79]];

export function WorldMap({ nodes, selectedId, connected, streaming, onSelect, userLocation, interactive = true }: {
  nodes: NodeListing[]; selectedId: string | null; connected: boolean;
  streaming: Intensity | null; onSelect: (id: string) => void;
  userLocation?: { lat: number; lng: number } | null; interactive?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const meMarkerRef = useRef<maplibregl.Marker | null>(null);
  const didCenterUser = useRef(false);
  const [ready, setReady] = useState(false);
  const [world, setWorld] = useState<GeoJSON.FeatureCollection | null>(null);

  // latest props for use inside long-lived map/marker callbacks (avoid stale closures)
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;

  // ---- create the map once ----
  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: wrapRef.current,
      style: BASE_STYLE,
      center: [10, 25],
      zoom: 1,
      minZoom: 0,
      maxZoom: 6,
      interactive,
      attributionControl: false,
      renderWorldCopies: false,
      cooperativeGestures: interactive, // plain scroll scrolls the page; ⌘/Ctrl+scroll zooms
    });
    mapRef.current = map;
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on("load", () => {
      map.addSource("world", { type: "geojson", data: EMPTY_FC() });
      map.addLayer({ id: "land", type: "fill", source: "world", paint: { "fill-color": "#1c2a23" } });
      map.addLayer({ id: "land-line", type: "line", source: "world", paint: { "line-color": "#33473b", "line-width": 0.6 } });
      map.addSource("link", { type: "geojson", data: EMPTY_FC() });
      map.addLayer({
        id: "link", type: "line", source: "link",
        layout: { "line-cap": "round" },
        paint: { "line-color": "#15d687", "line-width": 1.4, "line-dasharray": [2, 2], "line-opacity": 0 },
      });
      if (interactive) map.fitBounds(WORLD_BOUNDS, { padding: 24, animate: false });
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      meMarkerRef.current = null;
      didCenterUser.current = false;
    };
  }, [interactive]);

  // ---- keep the map sized to its container (rail/stage can resize without the window) ----
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- load the bundled world geometry once ----
  useEffect(() => {
    fetch("/world-110m.json").then((r) => r.json())
      .then((topo) => setWorld({ type: "FeatureCollection", features: (feature(topo, topo.objects.countries) as any).features }))
      .catch(() => {});
  }, []);

  // ---- push world geometry into the source when both map + data are ready ----
  useEffect(() => {
    if (!ready || !world) return;
    (mapRef.current?.getSource("world") as maplibregl.GeoJSONSource | undefined)?.setData(world);
  }, [ready, world]);

  // ---- node pins as HTML markers (rebuild when the node list changes) ----
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    for (const m of markersRef.current.values()) m.remove();
    markersRef.current.clear();
    for (const n of nodes) {
      const el = document.createElement("div");
      el.className = "wmap-pin" + (n.id === selectedId ? " is-on" : "");
      el.innerHTML = '<span class="wmap-pin__halo"></span><span class="wmap-pin__dot"></span>';
      el.title = `${n.geo.city} · $${n.pricePerGbUsd}/GB`;
      if (interactive) {
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => { e.stopPropagation(); onSelectRef.current(n.id); });
      }
      const marker = new maplibregl.Marker({ element: el }).setLngLat([n.geo.lng, n.geo.lat]).addTo(map);
      markersRef.current.set(n.id, marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, nodes, interactive]);

  // ---- selection: highlight the chosen pin + fly to it ----
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    for (const [id, marker] of markersRef.current) marker.getElement().classList.toggle("is-on", id === selectedId);
    const sel = nodes.find((n) => n.id === selectedId);
    if (sel) map.flyTo({ center: [sel.geo.lng, sel.geo.lat], zoom: Math.max(map.getZoom(), 3.2), speed: 0.8 });
  }, [ready, selectedId, nodes]);

  // ---- connection line (user/origin → selected node) ----
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const src = map.getSource("link") as maplibregl.GeoJSONSource | undefined; if (!src) return;
    const sel = nodes.find((n) => n.id === selectedId);
    if (connected && sel) {
      const from: LngLat = userLocation ? [userLocation.lng, userLocation.lat] : [0, 20];
      src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [from, [sel.geo.lng, sel.geo.lat]] } } as any);
      map.setPaintProperty("link", "line-opacity", streaming ? 1 : 0.85);
      map.setPaintProperty("link", "line-width", streaming ? 1.8 : 1.4);
    } else {
      src.setData(EMPTY_FC());
      map.setPaintProperty("link", "line-opacity", 0);
    }
  }, [ready, connected, selectedId, nodes, userLocation, streaming]);

  // ---- "you are here" marker + center on the user once ----
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !userLocation) return;
    if (!meMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "wmap-me";
      el.innerHTML = '<span class="wmap-me__halo"></span><span class="wmap-me__dot"></span>';
      el.title = "You are here";
      meMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([userLocation.lng, userLocation.lat]).addTo(map);
    } else {
      meMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
    if (interactive && !didCenterUser.current) {
      map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 3, speed: 0.8 });
      didCenterUser.current = true;
    }
  }, [ready, userLocation, interactive]);

  return (
    <div ref={wrapRef} className="wmap">
      {interactive && (
        <div className="wmap__zoom">
          <button aria-label="zoom in" onClick={() => mapRef.current?.zoomIn()}>+</button>
          <button aria-label="zoom out" onClick={() => mapRef.current?.zoomOut()}>−</button>
        </div>
      )}
    </div>
  );
}
