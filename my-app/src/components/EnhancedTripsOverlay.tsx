"use client"

import type { Layer, Position } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers"; // Correct import location
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GL } from "@luma.gl/constants";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, LineString } from "geojson";
import maplibregl from "maplibre-gl"; // Regular import, not type import
import { useEffect, useMemo, useRef, useState, } from "react";


// Define RGB color as a tuple
// type RGBColor = [number, number, number]
type RGBAColor = [number, number, number, number]

type Props = {
  map: maplibregl.Map | null
  data: TripDatum[]
  speed?: number
  trail?: number
  lineWidth?: number
  fps?: number
  opacity?: number
  showStaticRoutes?: boolean
  onData?: (data: unknown) => void
  fitOnLoad?: boolean
  url?: string
}

// Color palette matching your original design  
const LIGHT_BLUE: RGBAColor = [96, 165, 250, 255]    // #60a5fa
const MEDIUM_BLUE: RGBAColor = [59, 130, 246, 255]   // #3b82f6  
const DARK_BLUE: RGBAColor = [30, 64, 175, 255]      // #1e40af
const ACCENT_BLUE: RGBAColor = [30, 55, 159, 255]    // #1e379f

type RouteData = {
  path: Position[]
  color: RGBAColor
  frequency: number // Add frequency count
}

type RoutePoint = {
  position: Position
  type: 'start' | 'end'
  color: RGBAColor
}

// Helper function to create a path key for comparison
function createPathKey(path: Position[]): string {
  return path.map(coord => `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`).join('|')
}

export default function EnhancedTripsOverlay({
  map,
  data,
  speed = 4.8,
  trail = 500,
  lineWidth = 3.1,
  fps = 60,
  opacity = 0.1,
  showStaticRoutes = true,
  onData,
  fitOnLoad = false,
  url
}: Props) {
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const rafRef = useRef<number | null>(null)
  const t0 = useRef<number>(0)
  const lastFrame = useRef<number>(0)
  const [routeData, setRouteData] = useState<TripDatum[]>([])

  // Load data from URL if provided
  useEffect(() => {
    let cancelled = false
    if (!url) return
    
    ;(async () => {
      try {
        const res = await fetch(url)
        const geojson = await res.json()
        if (!cancelled) {
          // Convert GeoJSON to trip data
          const tripData = convertGeojsonToTrips(geojson)
          setRouteData(tripData)
          onData?.(geojson)
        }
      } catch (e) {
        console.error("Failed to load route from URL", e)
      }
    })()
    
    return () => { cancelled = true }
  }, [url, onData])

  // Use provided data or loaded data
  const activeData = useMemo(() => data?.length > 0 ? data : routeData, [data, routeData])

  // Calculate path frequencies and create route data with frequency info
  const { staticRoutes, tripFrequencies } = useMemo(() => {
    // Count frequency of each unique path
    const pathFrequency = new Map<string, number>()
    const pathToTrip = new Map<string, TripDatum>()
    
    activeData.forEach(trip => {
      const pathKey = createPathKey(trip.path)
      pathFrequency.set(pathKey, (pathFrequency.get(pathKey) || 0) + 1)
      if (!pathToTrip.has(pathKey)) {
        pathToTrip.set(pathKey, trip)
      }
    })

    // Create unique routes with frequency data
    const routes: RouteData[] = []
    const frequencies = new Map<string, number>()
    
    pathToTrip.forEach((trip, pathKey) => {
      const freq = pathFrequency.get(pathKey) || 1
      routes.push({
        path: trip.path,
        color: trip.color ? [...trip.color, 255] as RGBAColor : MEDIUM_BLUE,
        frequency: freq
      })
      
      // Store frequency for each original trip
      activeData.forEach(originalTrip => {
        if (createPathKey(originalTrip.path) === pathKey) {
          frequencies.set(JSON.stringify(originalTrip.path), freq)
        }
      })
    })

    return { staticRoutes: routes, tripFrequencies: frequencies }
  }, [activeData])

  const routePoints = useMemo((): RoutePoint[] => {
    const points: RoutePoint[] = []
    
    staticRoutes.forEach(route => {
      if (route.path.length > 0) {
        // Start point (light blue)
        points.push({
          position: route.path[0],
          type: 'start',
          color: LIGHT_BLUE
        })
        // End point (dark blue)
        points.push({
          position: route.path[route.path.length - 1],
          type: 'end', 
          color: ACCENT_BLUE
        })
      }
    })
    
    return points
  }, [staticRoutes])

  // Max trip duration for smooth looping
  const maxDuration = useMemo(() => {
    let maxT = 0
    for (const d of activeData || []) {
      const last = d.timestamps?.[d.timestamps.length - 1] ?? 0
      if (last > maxT) maxT = last
    }
    return Math.max(maxT, 1)
  }, [activeData])

  // Fit bounds when data loads
  useEffect(() => {
    if (!map || !fitOnLoad || !activeData.length) return

    try {
      const bounds = new maplibregl.LngLatBounds()
      activeData.forEach(trip => {
        trip.path.forEach(coord => bounds.extend([coord[0], coord[1]]))
      })
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, duration: 900 })
      }
    } catch (e) {
      console.warn("Failed to fit bounds:", e)
    }
  }, [map, activeData, fitOnLoad])

  useEffect(() => {
    if (!map || !activeData?.length) return

    const px = Math.max(1, Math.round(lineWidth))
    const layers: Layer[] = []

    // Static route background (if enabled)
    if (showStaticRoutes) {
      layers.push(
        // Route outlines for depth - width based on frequency
        new PathLayer({
          id: "route-outlines",
          data: staticRoutes,
          getPath: (d: RouteData) => d.path,
          getColor: DARK_BLUE,
          getWidth: (d: RouteData) => {
            // Scale width based on frequency: base width + frequency multiplier
            const frequencyMultiplier = Math.min(d.frequency * 0.8, 4) // Cap at 4x multiplier
            return (px + 2) * (1 + frequencyMultiplier * 0.5)
          },
          widthUnits: "pixels",
          widthMinPixels: px + 2,
          jointRounded: true,
          capRounded: true,
          opacity: opacity * 0.4,
          parameters: {
            depthTest: false,
            blend: true,
            blendFunc: [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],
            blendEquation: GL.FUNC_ADD,
          }
        }),
        
        // Main route paths - width based on frequency
        new PathLayer({
          id: "route-paths",
          data: staticRoutes,
          getPath: (d: RouteData) => d.path,
          getColor: (d: RouteData) => {
            // Make more frequent routes slightly more opaque
            const alpha = Math.min(255, 255 * (1 + d.frequency * 0.1))
            return [d.color[0], d.color[1], d.color[2], alpha] as RGBAColor
          },
          getWidth: (d: RouteData) => {
            // Scale width based on frequency
            const frequencyMultiplier = Math.min(d.frequency * 0.8, 4) // Cap at 4x multiplier
            return px * (1 + frequencyMultiplier * 0.9)
          },
          widthUnits: "pixels",
          widthMinPixels: px,
          jointRounded: true,
          capRounded: true,
          opacity: opacity * 1.5,
          parameters: {
            depthTest: false,
            blend: true,
            blendFunc: [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],
            blendEquation: GL.FUNC_ADD,
          }
        })
      )
    }

    // Animated trips layer - width based on frequency
    layers.push(
      new TripsLayer({
        id: "animated-trips",
        data: activeData,
        getPath: (d: TripDatum) => d.path,
        getTimestamps: (d: TripDatum) => d.timestamps,
        getColor: (d: TripDatum) => d.color || LIGHT_BLUE,
        getWidth: (d: TripDatum) => {
          // Get frequency for this trip path
          const pathKey = JSON.stringify(d.path)
          const frequency = tripFrequencies.get(pathKey) || 1
          const frequencyMultiplier = Math.min(frequency * 0.8, 4) // Cap at 4x multiplier
          return (px + 1) * (1 + frequencyMultiplier * 0.5)
        },
        widthUnits: "pixels",
        widthMinPixels: px + 1,
        jointRounded: true,
        capRounded: true,
        fadeTrail: true,
        trailLength: trail,
        currentTime: 0,
        opacity: Math.min(0.8, opacity * 4), // Make animation more visible
        parameters: {
          depthTest: false,
          blend: true,
          blendFunc: [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],
          blendEquation: GL.FUNC_ADD,
        }
      })
    )

    // Route endpoint markers - size based on frequency
    if (routePoints.length > 0) {
      layers.push(
        // Outer glow
        new ScatterplotLayer({
          id: "route-points-glow",
          data: routePoints,
          getPosition: (d: RoutePoint) => d.position,
          getRadius: 12,
          getFillColor: (d: RoutePoint) => [...d.color.slice(0, 3), 40] as RGBAColor, // Low alpha for glow
          radiusUnits: "pixels",
          radiusMinPixels: 8,
          radiusMaxPixels: 20,
          parameters: {
            depthTest: false,
            blend: true,
            blendFunc: [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],
            blendEquation: GL.FUNC_ADD,
          }
        }),
        
        // Core dots  
        new ScatterplotLayer({
          id: "route-points-core",
          data: routePoints,
          getPosition: (d: RoutePoint) => d.position,
          getRadius: (d: RoutePoint) => d.type === 'start' ? 4 : 3,
          getFillColor: (d: RoutePoint) => d.color,
          radiusUnits: "pixels",
          radiusMinPixels: 2,
          radiusMaxPixels: 8,
          parameters: {
            depthTest: false,
            blend: true,
            blendFunc: [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],
            blendEquation: GL.FUNC_ADD,
          }
        })
      )
    }

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers
    })
    
    map.addControl(overlay)
    overlayRef.current = overlay

    t0.current = performance.now()
    lastFrame.current = 0

    const useThrottle = fps && fps > 0 && fps < 60
    const frameInterval = useThrottle ? 1000 / fps : 0

    const loop = () => {
      const now = performance.now()

      if (!useThrottle || now - lastFrame.current >= frameInterval) {
        const elapsed = (now - t0.current) / 1000
        const currentTime = ((elapsed * speed) % maxDuration + maxDuration) % maxDuration

        // Update only the animated trips layer
        const updatedLayers: Layer[] = layers.map(layer => {
          if (layer.id === "animated-trips") {
            return new TripsLayer({
              id: "animated-trips",
              data: activeData,
              getPath: (d: TripDatum) => d.path,
              getTimestamps: (d: TripDatum) => d.timestamps,
              getColor: (d: TripDatum) => d.color || LIGHT_BLUE,
              getWidth: (d: TripDatum) => {
                // Get frequency for this trip path
                const pathKey = JSON.stringify(d.path)
                const frequency = tripFrequencies.get(pathKey) || 1
                const frequencyMultiplier = Math.min(frequency * 0.8, 4) // Cap at 4x multiplier
                return (px + 1) * (1 + frequencyMultiplier * 0.5)
              },
              widthUnits: "pixels",
              widthMinPixels: px + 1,
              jointRounded: true,
              capRounded: true,
              fadeTrail: true,
              trailLength: trail,
              currentTime, // Only this changes
              opacity: Math.min(0.8, opacity * 4),
              parameters: {
                depthTest: false,
                blend: true,
                blendFunc: [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],
                blendEquation: GL.FUNC_ADD,
              }
            })
          }
          return layer
        })

        overlay.setProps({ layers: updatedLayers })
        lastFrame.current = now
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (overlayRef.current) {
        map.removeControl(overlayRef.current)
        overlayRef.current = null
      }
    }
  }, [map, activeData, speed, trail, lineWidth, fps, opacity, maxDuration, showStaticRoutes, staticRoutes, routePoints, tripFrequencies])

  // File upload handler (optional - if you want to keep this functionality)
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      const text = await file.text()
      const geojson = JSON.parse(text)
      const tripData = convertGeojsonToTrips(geojson)
      setRouteData(tripData)
      onData?.(geojson)
    } catch (err) {
      console.error("Invalid GeoJSON file", err)
      alert("Invalid GeoJSON file")
    }
  }

  return url ? null : (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        right: 20,
        zIndex: 2,
        background: "rgba(20,20,20,0.85)",
        color: "white",
        padding: 12,
        border: "1px solid #444",
        borderRadius: 8,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Load Route Data</div>
      <input 
        type="file" 
        accept=".geojson,application/geo+json,application/json" 
        onChange={onFile} 
      />
    </div>
  )
}

// Helper function to convert GeoJSON to trip data
type TripDatum = {
  path: Position[];
  timestamps: number[];
  color: [number, number, number];
};

// Type guard: check if a Feature is a LineString
function isLineStringFeature<P extends GeoJsonProperties = GeoJsonProperties>(
  f: Feature<Geometry, P> | undefined | null
): f is Feature<LineString, P> {
  return f?.geometry?.type === "LineString";
}


// Accept a single Feature or a FeatureCollection (common in callers)
export function convertGeojsonToTrips(
  geojson: FeatureCollection | Feature
): TripDatum[] {
  const fc: FeatureCollection =
    geojson.type === "FeatureCollection"
      ? geojson
      : ({ type: "FeatureCollection", features: [geojson] } as FeatureCollection);

  const lineFeatures = fc.features.filter(isLineStringFeature);

  return lineFeatures.map((feature, index): TripDatum => {
    const coords = feature.geometry.coordinates as Position[];

    return {
      path: coords,
      // Simple timestamp generation (2s apart); keep length aligned with coords
      timestamps: coords.map((_, i) => i * 2),
      // Alternate two RGB colors
      color: index % 2 === 0 ? [96, 165, 250] : [59, 130, 246],
    };
  });
}