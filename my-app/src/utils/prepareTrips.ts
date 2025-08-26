// src/utils/prepareTrips.ts
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

type FC = GeoJSON.FeatureCollection<GeoJSON.LineString, RouteProps>

// ---- performance helper: thin dense polylines ----
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
function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function toTripsData(fc: FC, maxPointsPerPath = 400): TripDatum[] {
  if (!fc?.features?.length) return []
  return fc.features.map((f, index) => {
    const raw = f.geometry.coordinates as [number, number][]
    const coords = thinPath(raw, maxPointsPerPath)
    const p = f.properties

    const duration = Math.max(6, Math.min(Number(p.duration_s) || 60, 90))

    // --- timestamps by cumulative distance ---
    const dists: number[] = [0]
    for (let i = 1; i < coords.length; i++) {
      dists[i] = dists[i - 1] + haversine(coords[i - 1], coords[i])
    }
    const total = dists[dists.length - 1] || 1
    const timestamps = dists.map((d) => (d / total) * duration)

    return {
      path: coords,
      timestamps,
      color: SUBTLE_BLUE, // Single color for all trips
      team: p.team,
      month: p.month,
      from: p.from,
      to: p.to,
    }
  })
}
