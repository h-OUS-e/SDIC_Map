import { data } from "@maptiler/sdk/dist/src"
import type * as GeoJSON from "geojson"

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


function getSpeedBySegment(path: [number, number][], target_mps: number, duration: number | null): number[] {
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

export function toTripsData(fc: FC, meters_per_second : number | null = 45, maxPointsPerPath = 400): TripDatum[] {
  if (!fc?.features?.length) return []
  return fc.features.map((f, index) => {
    const raw = f.geometry.coordinates as [number, number][]
    const path = thinPath(raw, maxPointsPerPath)
    let timestamps: number[] = []
    const p = f.properties


    if (meters_per_second){
     timestamps = getConstantSpeed(path, meters_per_second);
    }
    else {
      timestamps = getSpeedBySegment(path, meters_per_second || 45, null);
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
