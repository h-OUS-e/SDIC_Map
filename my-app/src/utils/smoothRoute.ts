"use client";

import along from "@turf/along";
import bezierSpline from "@turf/bezier-spline";
import cleanCoords from "@turf/clean-coords";
import { featureCollection, lineString } from "@turf/helpers";
import length from "@turf/length";
import simplify from "@turf/simplify";
import type { Feature, FeatureCollection, GeoJSON, GeoJsonProperties, LineString, MultiLineString, Position } from "geojson";




// ---------- tiny math helpers ----------
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const lerp = (a: Position, b: Position, t: number): Position => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];


function metersToDegreesAtLat(meters: number, latDeg: number) {
    const metersPerDeg = 111_320 * Math.cos(rad(latDeg || 0));
    return metersPerDeg <= 0 ? 0 : meters / metersPerDeg;
}

// Replace sharp corner p1 with two points a little away from the corner.
// Later we spline over these for a fillet-like turn.
function filletSharp(ls: Feature<LineString>, deflectionThresholdDeg = 25, filletFraction = 0.2) {
  const c = ls.geometry.coordinates;
  if (c.length < 3) return ls;

  const out: Position[] = [c[0]];
  for (let i = 1; i < c.length - 1; i++) {
    const p0 = c[i - 1], p1 = c[i], p2 = c[i + 1];

    const v1: [number, number] = [p1[0] - p0[0], p1[1] - p0[1]];
    const v2: [number, number] = [p2[0] - p1[0], p2[1] - p1[1]];
    const n1 = Math.hypot(v1[0], v1[1]);
    const n2 = Math.hypot(v2[0], v2[1]);
    if (n1 === 0 || n2 === 0) { out.push(p1); continue; }

    const dot = clamp((v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2), -1, 1);
    const theta = Math.acos(dot);              // 0..π, angle between segments
    const deflectionDeg = (Math.PI - theta) * 180 / Math.PI; // 0 straight .. 180 U-turn

    if (deflectionDeg >= deflectionThresholdDeg) {
      const t = clamp(filletFraction, 0.05, 0.45);
      const q = lerp(p1, p0, t);
      const r = lerp(p1, p2, t);
      out.push(q, r);
    } else {
      out.push(p1);
    }
  }
  out.push(c[c.length - 1]);
  return lineString(out);
}



// helper: resample a LineString to uniform spacing by arc-length
function resampleUniform(
  ls: Feature<LineString>,
  spacingMeters: number
): Feature<LineString> {
  const total = length(ls, { units: "meters" });
  if (total <= 0 || !isFinite(total)) return ls;

  // Ensure we include both endpoints with near-uniform spacing
  const steps = Math.max(1, Math.round(total / spacingMeters));
  const coords: Position[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = (total * i) / steps;
    const pt = along(ls, d, { units: "meters" });
    coords.push(pt.geometry.coordinates as Position);
  }
  return lineString(coords, ls.properties);
}




/** Fast local meters/deg scales (equirectangular) at latitude φ */
function metersPerDegLon(latDeg: number) {
  return 111_320 * Math.cos(rad(latDeg || 0));
}
function metersPerDegLat() {
  return 110_574; // ~constant
}

/**
 * O(N + M) uniform resampler using a local meter grid.
 * Very fast; good accuracy for typical route lengths.
 */
export function resampleUniformFast(
  ls: Feature<LineString>,
  spacingMeters: number,
  avgLatOverride?: number // pass avgLat you already computed to save work
): Feature<LineString> {
  const c = ls.geometry.coordinates as Position[];
  if (!c || c.length < 2 || !isFinite(spacingMeters) || spacingMeters <= 0) return ls;

  // 1) Precompute local meter scales and project to XY meters
  const avgLat =
    avgLatOverride ??
    c.reduce((s, p) => s + (p[1] || 0), 0) / Math.max(1, c.length);
  const mx = metersPerDegLon(avgLat);
  const my = metersPerDegLat();

  const n = c.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = c[i][0] * mx;        // lon → meters
    y[i] = c[i][1] * my;        // lat → meters
  }

  // 2) Cumulative distances
  const cum = new Float64Array(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    const dx = x[i] - x[i - 1];
    const dy = y[i] - y[i - 1];
    cum[i] = cum[i - 1] + Math.hypot(dx, dy);
  }
  const total = cum[n - 1];
  if (total <= 0 || !isFinite(total)) return ls;

  // 3) Decide how many output samples (include both endpoints)
  const steps = Math.max(1, Math.round(total / spacingMeters));
  const out: Position[] = new Array(steps + 1);

  // 4) Walk targets with a two-pointer scan (no binary search needed)
  let seg = 0;
  for (let i = 0; i <= steps; i++) {
    const d = (total * i) / steps;

    // Advance seg while next cum < target
    while (seg < n - 2 && cum[seg + 1] < d) seg++;

    // Interpolate within [seg, seg+1]
    const segLen = cum[seg + 1] - cum[seg];
    let t = segLen > 0 ? (d - cum[seg]) / segLen : 0;
    // Snap to endpoints if extremely close (reduces float noise)
    if (t < 1e-9) t = 0;
    else if (t > 1 - 1e-9) t = 1;

    const xm = x[seg] + (x[seg + 1] - x[seg]) * t;
    const ym = y[seg] + (y[seg + 1] - y[seg]) * t;

    out[i] = [xm / mx, ym / my]; // back to lon/lat
  }

  // Ensure exact last coordinate matches original last vertex
  out[out.length - 1] = c[n - 1];

  // Return as GeoJSON Feature without extra Turf allocations
  return {
    type: "Feature",
    properties: ls.properties ?? {},
    geometry: { type: "LineString", coordinates: out },
  };
}




export type SmoothOpts = {
  simplifyToleranceMeters?: number; // 1–5m is typical
  deflectionThresholdDeg?: number;  // round turns sharper than this
  filletFraction?: number;          // 0..0.45, how rounded the fillet is
  densifySegments?: number;         // add intermediate points before spline
  spline?: boolean;                  // whether to bezier-spline the result
  resampleSpacingMeters?: number;   // e.g. 3-10m depending on your map scale
};



export function smoothLineString<P extends GeoJsonProperties = GeoJsonProperties>(
  coords: Position[],
  props: P = {} as P,
  opts: SmoothOpts = {}
): Feature<LineString, GeoJsonProperties> {
  const {
    simplifyToleranceMeters = 2,
    deflectionThresholdDeg = 25,
    filletFraction = 0.2,
    densifySegments = 3,
    spline = true,
    resampleSpacingMeters,
  } = opts;

  const avgLat =
    coords.reduce((s, p) => s + (p[1] ?? 0), 0) / Math.max(1, coords.length);

  // Convert tolerance from meters to degrees at this latitude
  const tol = metersToDegreesAtLat(simplifyToleranceMeters, avgLat);

  // Start as a typed Feature<LineString, P>
  let ls = lineString(coords, props) as (Feature<LineString, P> | Feature<LineString, GeoJsonProperties>);

  // Drop invalid or duplicate points
  ls = cleanCoords(ls) as Feature<LineString, P>;

  // Early resample to clean clumping
  ls = resampleUniformFast(ls, 20);

  // High-quality simplify in degrees
  ls = simplify(ls, {
    tolerance: tol,
    highQuality: true,
  }) as Feature<LineString, P>;

  // Light pass to uniformize after simplify
  ls = resampleUniformFast(ls, 25);

  // Fillet sharp corners twice to open room for smoothing
  ls = filletSharp(ls, deflectionThresholdDeg, filletFraction);
  ls= filletSharp(ls, deflectionThresholdDeg, filletFraction);

  // Optional light densify (helps spline); keep small if we’ll resample later
  const targetDensify = resampleSpacingMeters
    ? Math.max(1, Math.min(2, densifySegments))
    : densifySegments;

  if (targetDensify > 1) {
    const dense: Position[] = [];
    const c = ls.geometry.coordinates;
    for (let i = 0; i < c.length - 1; i++) {
      const a = c[i],
        b = c[i + 1];
      dense.push(a);
      for (let s = 1; s < targetDensify; s++) {
        dense.push(lerp(a, b, s / targetDensify));
      }
    }
    dense.push(c[c.length - 1]);

    ls = lineString(dense, props);
  }

  // Optional arc-length resample for uniform spacing
  if (resampleSpacingMeters && resampleSpacingMeters > 0) {
    ls = resampleUniformFast(ls, resampleSpacingMeters);
  }

  let out: Feature<LineString, GeoJsonProperties> = ls;

  // Bézier spline smoothing
  if (spline) {
    // bezierSpline loses the generic P (returns GeoJsonProperties). Reapply P.
    const curvedBase = bezierSpline(ls as unknown as Feature<LineString>, {
      resolution: 100000,
      sharpness: 0.85,
    }) as Feature<LineString, GeoJsonProperties>;

    // Reattach the original props with the desired type P
    curvedBase.properties = props as P;

    out = curvedBase as Feature<LineString, P>;
  }

  return out;
}


// Accept Feature or FeatureCollection; returns FeatureCollection with smoothed lines.
// MultiLineString features are preserved (we smooth each part).
export function smoothGeoJSON(input: GeoJSON, opts?: SmoothOpts): FeatureCollection<LineString | MultiLineString> {
  const fc: FeatureCollection = (input).type === "FeatureCollection"
    ? (input as FeatureCollection)
    : featureCollection([(input as unknown) as Feature]);

  const outFeatures: Feature<LineString | MultiLineString>[] = [];

  for (const f of fc.features) {
    if (!f?.geometry) continue;
    const props = { ...(f.properties || {}) };

    if (f.geometry.type === "LineString") {
      outFeatures.push(smoothLineString(f.geometry.coordinates, props, opts));
    } else if (f.geometry.type === "MultiLineString") {
      const smoothedParts = f.geometry.coordinates.map(part =>
        smoothLineString(part, props, opts).geometry.coordinates
      );
      outFeatures.push({
        type: "Feature",
        properties: props,
        geometry: { type: "MultiLineString", coordinates: smoothedParts },
      });
    } else {
      // pass-through for non-lines (e.g., Points)
      outFeatures.push(f as Feature<LineString | MultiLineString>);
    }
  }

  return featureCollection(outFeatures);
}
