import { data } from "@maptiler/sdk/dist/src";
import type * as GeoJSON from "geojson";
import { COLOR_MODES, MONTH_PALETTE, TEAM_PALETTE } from '../components/RouteLayer';


export type TripDatum = {
  path: [number, number][]
  timestamps: number[]
  color?: [number, number, number]
  team?: string
  month?: string
  from?: string
  to?: string
}

export interface RouteProps {
  distance_m: number
  duration_s: number
  from: string
  to: string
  profile: "driving" | "cycling" | "walking"
  team?: string
  month?: string
}

export type FC = GeoJSON.FeatureCollection<GeoJSON.LineString, RouteProps>

// performance helper: thin dense polylines ----
function thinPath(coords: [number, number][], maxPoints = 400) {
  if (coords.length <= maxPoints) return coords
  const step = Math.ceil(coords.length / maxPoints)
  const thinned: [number, number][] = []
  for (let i = 0; i < coords.length; i += step) thinned.push(coords[i])
  if (thinned[thinned.length - 1] !== coords[coords.length - 1]) {
    thinned.push(coords[coords.length - 1]) // ensure last point
  }
  return thinned
}

const SUBTLE_BLUE: [number, number, number] = [59, 130, 246] // #3b82f6 - single color for subtle animation

// great-circle distance in meters (fast enough for our sizes)
export function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const [lon1, lat1] = a
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const la1 = toRad(lat1)
  const la2 = toRad(lat2);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function getConstantSpeed(path: [number, number][], mps: number): number[] {
  const ts: number[] = new Array(path.length).fill(0);
  let cum = 0;
  for (let i = 1; i < path.length; i++) {
    cum += haversineMeters(path[i-1], path[i]);
    ts[i] = cum / Math.max(1e-6, mps);
  }
  return ts;
}


function getSpeedBySegment(path: [number, number][], duration: number | null = null): number[] {
  const duration_computed = Math.max(6, Math.min(duration || 60, 90))

  // timestamps by cumulative distance
  const dists: number[] = [0]
  for (let i = 1; i < path.length; i++) {
    dists[i] = dists[i - 1] + haversineMeters(path[i - 1], path[i])
  }
  const total = dists[dists.length - 1] || 1
  const ts = dists.map((d) => (d / total) * duration_computed)

  return ts
}


function getTimeDrivenSpeedTimestamps(
  path: [number, number][],
  speeds: number[],              // [s1, s2, ... sn] in m/s, n>=2
  opts?: { dt?: number; dts?: number[] } // either uniform dt, or per-transition dts (length n-1)
): number[] {
  const n = path.length;
  const ts = new Array<number>(n).fill(0);
  if (n <= 1 || !Array.isArray(speeds) || speeds.length < 2) return ts;

  // Cumulative distances along the polyline
  const dists: number[] = [0];
  for (let i = 1; i < n; i++) {
    dists[i] = dists[i - 1] + haversineMeters(path[i - 1], path[i]);
  }
  const L = dists[n - 1] || 0;
  if (L <= 1e-6) return ts;

  // Speeds (clamped)
  const s = speeds.map(v => Math.max(1e-6, v));
  const m = s.length - 1; // number of accelerating segments

  // Segment durations (time-driven schedule)
  let dts: number[];
  if (opts?.dts && opts.dts.length === m) {
    dts = opts.dts.map(x => Math.max(1e-6, x));
  } else {
    const dt = Math.max(1e-6, opts?.dt ?? 10); // default: 10s per transition
    dts = new Array(m).fill(dt);
  }

  // Build cumulative time (T) and distance (D) at segment boundaries.
  // For segment i: v0=s[i], v1=s[i+1], tau=dts[i], a=(v1-v0)/tau
  // Distance covered over full segment: ΔS = v0*tau + 0.5*a*tau^2 = 0.5*(v0+v1)*tau
  const T: number[] = new Array(m + 1).fill(0); // times at boundaries (length m+1)
  const D: number[] = new Array(m + 1).fill(0); // distances at boundaries
  for (let i = 0; i < m; i++) {
    const v0 = s[i], v1 = s[i + 1], tau = dts[i];
    const segDist = 0.5 * (v0 + v1) * tau;
    T[i + 1] = T[i] + tau;
    D[i + 1] = D[i] + segDist;
  }

  // If the path is longer than the schedule’s distance, append a constant-speed tail at s_n
  const vLast = s[s.length - 1];
  if (L > D[m]) {
    const tailDist = L - D[m];
    const tailTime = tailDist / Math.max(1e-6, vLast);
    // Extend T/D with one extra "segment" (constant speed)
    T.push(T[m] + tailTime);
    D.push(L); // by construction
  }

  // Binary search helper: find segment index j s.t. D[j] <= x <= D[j+1]
  function findSegByDist(x: number): number {
    let lo = 0, hi = D.length - 2; // last usable index is len-2
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (x > D[mid + 1]) lo = mid + 1;
      else if (x < D[mid]) hi = mid - 1;
      else return mid;
    }
    return Math.max(0, Math.min(D.length - 2, lo));
  }

  // Invert distance->time within a segment:
  // For accelerating segment: s_local = v0*u + 0.5*a*u^2  => u = (-v0 + sqrt(v0^2 + 2 a s_local))/a
  // For constant-speed tail:  u = s_local / vLast
  function timeAtDistance(x: number): number {
    const j = findSegByDist(x);
    const s0 = D[j];
    const t0 = T[j];
    const sLocal = Math.max(0, x - s0);

    // Is this the tail segment?
    const tail = (j >= m); // because we may have appended one extra boundary

    if (tail) {
      const u = sLocal / Math.max(1e-6, vLast);
      // const v = vLast;
      // console.log(`[tail] dist=${x.toFixed(1)}m speed=${v.toFixed(2)} m/s`);
      return t0 + u;
    }

    const v0 = s[j];
    const v1 = s[j + 1];
    const tau = dts[j];
    const a = (v1 - v0) / Math.max(1e-6, tau);

    let u: number;
    if (Math.abs(a) < 1e-9) {
      u = sLocal / Math.max(1e-6, v0);
    } 
    else {
      const disc = v0 * v0 + 2 * a * sLocal;
      const root = Math.sqrt(Math.max(0, disc));
      u = (root - v0) / a;
    }
    const vNow = v0 + a * u;
      // console.log(`[seg ${j}] dist=${x.toFixed(1)}m t=${(t0+u).toFixed(2)}s speed=${vNow.toFixed(2)} m/s`);
      return t0 + u;
    }

  // Assign timestamps to each vertex by inverting the schedule
  for (let i = 1; i < n; i++) {
    ts[i] = timeAtDistance(dists[i]);
  }
  return ts;
}


export function toTripsData(fc: FC, timeSpeedProfile: { speeds: number[]; dt?: number; dts?: number[] } | null = null, maxPointsPerPath = 400): TripDatum[] {
  if (!fc?.features?.length) return []
  return fc.features.map((f, index) => {
    const raw = f.geometry.coordinates as [number, number][]
    const path = thinPath(raw, maxPointsPerPath)
    let timestamps: number[] = []
    const p = f.properties
    console.log("TEST", JSON.stringify(f))

    if (timeSpeedProfile) {
      // Accelerating profile from start->end speed
      timestamps = getTimeDrivenSpeedTimestamps(path, timeSpeedProfile.speeds, {  dt: timeSpeedProfile.dt, dts: timeSpeedProfile.dts});
    }
    else {
      timestamps = getSpeedBySegment(path);
    }

    return {
      path: path,
      timestamps,
      color: SUBTLE_BLUE, // Single color for all trips
      team: p.team,
      month: p.month,
      from: p.from,
      to: p.to,
    }
  })
}
