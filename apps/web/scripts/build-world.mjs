// Derive public/world.geojson from public/world-110m.json (TopoJSON), cleaned so MapLibre's
// fill tessellation renders countries without stray triangles or antimeridian bands:
//   1. unwrap antimeridian-crossing rings (Russia/Fiji/Antarctica) so no edge jumps >180°,
//   2. normalize every outer ring to the majority winding (the one MapLibre fills as land).
// Run from apps/web:  node scripts/build-world.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";

const topo = JSON.parse(readFileSync("public/world-110m.json", "utf8"));
const fc = feature(topo, topo.objects.countries);

const ringSign = (r) => { let a = 0; for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) a += (r[j][0] * r[i][1]) - (r[i][0] * r[j][1]); return Math.sign(a); };
const reverse = (poly) => poly.map((ring) => ring.slice().reverse());
const unwrap = (ring) => { const out = [ring[0].slice()]; for (let i = 1; i < ring.length; i++) { let lng = ring[i][0]; const prev = out[i - 1][0]; while (lng - prev > 180) lng -= 360; while (lng - prev < -180) lng += 360; out.push([lng, ring[i][1]]); } return out; };
const eachPoly = (f, fn) => { if (f.geometry.type === "Polygon") f.geometry.coordinates = fn(f.geometry.coordinates); else f.geometry.coordinates = f.geometry.coordinates.map(fn); };

// 1) unwrap antimeridian crossings (changes coords, may change winding)
let unwrapped = 0;
for (const f of fc.features) eachPoly(f, (poly) => poly.map((ring) => { let j = 0; for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) j++; if (j) { unwrapped++; return unwrap(ring); } return ring; }));

// 2) majority outer-ring winding on the FINAL coords = the one MapLibre renders as land
const counts = {};
for (const f of fc.features) eachPoly(f, (poly) => { const s = ringSign(poly[0]); counts[s] = (counts[s] || 0) + 1; return poly; });
const majority = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);

// 3) flip whole polygons whose outer ring disagrees (holes stay opposite to their exterior)
let flipped = 0;
for (const f of fc.features) eachPoly(f, (poly) => ringSign(poly[0]) !== majority ? (flipped++, reverse(poly)) : poly);

// validate (degenerate zero-area rings can't be signed; they render nothing, so ignore them)
let badSign = 0, badJump = 0;
for (const f of fc.features) eachPoly(f, (poly) => { const s = ringSign(poly[0]); if (s !== 0 && s !== majority) badSign++; for (const ring of poly) for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) badJump++; return poly; });
console.log(`majority ${majority}; unwrapped ${unwrapped} rings; flipped ${flipped} polys`);
console.log(`VALIDATION → wrong-sign outer rings: ${badSign} (want 0); antimeridian jumps: ${badJump} (want 0)`);
if (badSign || badJump) process.exit(1);

const out = { type: "FeatureCollection", features: fc.features.map((f) => ({ type: "Feature", properties: {}, geometry: f.geometry })) };
writeFileSync("public/world.geojson", JSON.stringify(out));
console.log("wrote public/world.geojson", (readFileSync("public/world.geojson").length / 1024).toFixed(0) + "KB");
