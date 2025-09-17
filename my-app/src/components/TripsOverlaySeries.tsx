import { TripsLayer } from "@deck.gl/geo-layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { Layer, LayersList } from "deck.gl";
import type maplibregl from "maplibre-gl";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FC, haversineMeters, toTripsData, TripDatum } from "../utils/prepareTrips";
import { CLASS_MODES, CLASS_PALETTE, COLOR_MODES, END_COLOR, getFeatureColor, hexToRGB } from './RouteLayer';



// Getting a list of classes from CLASS_MODES
export type TripClass = typeof CLASS_MODES[keyof typeof CLASS_MODES];
export const CLASS_LIST: TripClass[] = Object.values(CLASS_MODES);


// export type TripDatum = {
//   path: [number, number][];
//   timestamps: number[];
//   color?: [number, number, number];
//   class?: TripClass[];
// };

type colorModeProp = "usePathColor" | "none" | "class" | "months"

export type Props = {
  id: string;
  map?: maplibregl.Map | null; // Now optional since we get it from context
  geoJSON: FC;
  /** seconds of tail we keep lit */
  trail?: number;
  /** line width in *pixels* */
  lineWidth?: number;
  /** fps cap for RAF driving */
  fps?: number;
  /** layer opacity */
  opacity?: number;
  /** loop to start, based on max timestamp in data */
  loop?: boolean;
  /** seconds to pause at the end before looping */
  loopDelay?: number; 
  /** Time-driven profile: { speeds: number[], dt?: number, dts?: number[] } */
  timeSpeedProfile?: { speeds: number[]; dt?: number; dts?: number[] } | null;
  playState?: 'playing' | 'paused' |'idle';
  reset: boolean; 
  colorMode: colorModeProp;
  onReset: ()=>void;
  classFilters?: TripClass[]; // e.g. ["bus","tram"]
};

// Context type definition
type TripsOverlayContextType = {
  registerLayer: (id: string, layerFactory: () => void) => void;
  unregisterLayer: (id: string) => void;
  updateOverlay: () => void;
  isReady: boolean;
  map: maplibregl.Map | null;
};

function matchesClassFilters(classes: string | undefined, filters?: string[]): boolean {

  if (!filters || filters.length === 0) return true;           // no filters → show all
  if (!classes || classes.length === 0) return false;          // trip has no classes → hide
  // Trip must contain at least one of the filter classes
  return filters.some(cls => classes.includes(cls));
}



// Create the context
export const TripsOverlayContext = createContext<TripsOverlayContextType | null>(null);

// Provider component that manages the single MapboxOverlay instance
export function TripsOverlayProvider({ 
  map, 
  children 
}: { 
  map: maplibregl.Map | null; 
  children: React.ReactNode;
}) {
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const layersMapRef = useRef(new Map());
  const [isReady, setIsReady] = useState(false);

  // Create and attach the single overlay
  useEffect(() => {
    if (!map) return;

    // log all style layer ids
    const style = map.getStyle();
    if (style && style.layers) {
      console.log("All Mapbox/Maplibre layer IDs:", style.layers.map(l => l.id));
    }

    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({ interleaved: true });
      console.log("Creating single shared MapboxOverlay", overlayRef.current);
      map.addControl(overlayRef.current);
      setIsReady(true);
    }

    return () => {
      if (overlayRef.current) {
        try {
          map.removeControl(overlayRef.current);
        } catch (e) {
          console.error("Error removing overlay:", e);
        }
        overlayRef.current = null;
        setIsReady(false);
      }
    };
  }, [map]);

  // Register a layer
  const registerLayer = (id: string, layerFactory: () => void) => {
    layersMapRef.current.set(id, layerFactory);
    updateOverlay();
  };

  // Unregister a layer
  const unregisterLayer = (id: string) => {
    layersMapRef.current.delete(id);
    updateOverlay();
  };

  // Update the overlay with all registered layers
  const updateOverlay = () => {
    if (!overlayRef.current) return;
    
    const allLayers: (false | LayersList | Layer | null | undefined)[] = [];
    layersMapRef.current.forEach((layerFactory) => {
      const layer = layerFactory();
      if (layer) allLayers.push(layer);
    });
    
    overlayRef.current.setProps({ layers: allLayers });
  };

  const contextValue: TripsOverlayContextType = {
    registerLayer,
    unregisterLayer,
    updateOverlay,
    isReady,
    map
  };

  return (
    <TripsOverlayContext.Provider value={contextValue}>
      {children}
    </TripsOverlayContext.Provider>
  );
}

// Helper functions
const DEFAULT_PATH_COLOR = hexToRGB(CLASS_PALETTE.none);
console.log("TEST",DEFAULT_PATH_COLOR)

function getMaxTimestamp(arr: TripDatum[]): number {
  let maxT = 0;
  for (const d of arr) {
    const ts = d?.timestamps;
    if (Array.isArray(ts) && ts.length) {
      const t = ts[ts.length - 1];
      if (Number.isFinite(t) && t > maxT) maxT = t;
    }
  }
  return maxT;
}

// Modified TripsOverlaySeries component
export default function TripsOverlaySeries({
  id,
  map: mapProp, // Can still accept map as prop for backwards compatibility
  geoJSON,
  trail = 900,
  lineWidth = 4,
  fps = 30,
  opacity = 0.6,
  loopDelay = 5, 
  loop = true,
  timeSpeedProfile = null,
  playState = 'playing',
  reset,
  onReset,
  colorMode = "none",
  classFilters,
}: Props) {
  // Get the shared context
  const context = useContext(TripsOverlayContext);
  
  // Use map from context if available, otherwise fall back to prop
  const map = context?.map || mapProp;
  
  // Animation state refs
  const rafRef = useRef<number | null>(null);
  const startWallMsRef = useRef<number | null>(null);
  const lastTickMsRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const holdUntilRef = useRef<number | null>(null);
  const resetRef = useRef<boolean>(false);
  const colorModeRef = useRef<colorModeProp>(colorMode);

  // Prepare geoJSON with timestamps
  const data: TripDatum[] = toTripsData(geoJSON, timeSpeedProfile);

  const filteredData = useMemo(
    () => data.filter(d =>
        matchesClassFilters(d.class, classFilters)
  ),[data, classFilters]);

  
  // Layer data
  const layerData = useMemo(() => filteredData, [filteredData]);

  // Global max timestamp
  const maxTs = useMemo(() => getMaxTimestamp(layerData), [layerData]);

  // --- helpers for logging ---
  // Binary search: first index with arr[idx] > x
  const upperBound = (arr: number[], x: number) => {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // Approx instantaneous speed at time t by finite difference on a single trip
  const approxSpeedFromTrip = (trip: TripDatum, t: number): number | null => {
    const ts = trip.timestamps;
    const path = trip.path;
    if (!ts?.length || !path?.length) return null;

    // Before the first timestamp — use first segment
    if (t <= ts[0] && ts.length >= 2) {
      const dt = ts[1] - ts[0];
      const ds = haversineMeters(path[0], path[1]);
      return ds / Math.max(1e-6, dt);
    }

    const i = upperBound(ts, t);
    if (i <= 0) return null;

    const j = Math.min(i, ts.length - 1);
    const dt = ts[j] - ts[j - 1];
    if (dt <= 0) return null;
    const ds = haversineMeters(path[j - 1], path[j]);
    return ds / dt;
  };

  // Which trip is the longest (used as a reliable fallback)
  const longestTripIndex = useMemo(() => {
    if (!layerData.length) return 0;
    let best = 0;
    let bestLast = layerData[0]?.timestamps?.slice(-1)[0] ?? 0;
    for (let i = 1; i < layerData.length; i++) {
      const last = layerData[i]?.timestamps?.slice(-1)[0] ?? 0;
      if (last > bestLast) {
        bestLast = last;
        best = i;
      }
    }
    return best;
  }, [layerData]);

  // Optionally, build theoretical v(t) from timeSpeedProfile (never runs out)
  const speedAtTime = useMemo(() => {
    const p = timeSpeedProfile;
    if (!p?.speeds || p.speeds.length < 2) return null;

    const s = p.speeds.map((v) => Math.max(1e-6, v));
    const m = s.length - 1;
    const dts =
      p.dts && p.dts.length === m
        ? p.dts.map((x) => Math.max(1e-6, x))
        : new Array(m).fill(Math.max(1e-6, p.dt ?? 10));

    const T = new Array(m + 1).fill(0);
    for (let i = 0; i < m; i++) T[i + 1] = T[i] + dts[i];

    return (t: number) => {
      if (t >= T[m]) return s[m];
      // find j with T[j] <= t < T[j+1]
      let lo = 0,
        hi = m;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (T[mid + 1] <= t) lo = mid + 1;
        else hi = mid;
      }
      const j = lo;
      const v0 = s[j],
        v1 = s[j + 1],
        tau = dts[j];
      const a = (v1 - v0) / tau;
      const u = t - T[j];
      return v0 + a * u;
    };
  }, [timeSpeedProfile]);

  // Create layer factory function
  
  const createLayer = (nowS: number) => {
    return new TripsLayer<TripDatum>({
      id: id,
      beforeId: "saved-route-line-origin-glow6",
      data: layerData,
      opacity,
      currentTime: nowS,
      trailLength: trail,
      getPath: (d) => d.path,
      getTimestamps: (d) => d.timestamps,
      getColor: (path, {index}) => {
        if (colorModeRef.current === "usePathColor") {
          return path.color ? path.color : DEFAULT_PATH_COLOR as [number, number, number, number];
        } 
        else if (colorModeRef.current === "none") {
          const color = hexToRGB(CLASS_PALETTE.none);
          return color? color as [number, number, number, number] : DEFAULT_PATH_COLOR as [number, number, number, number];
        } else {
          const HEX = getFeatureColor(path, colorModeRef.current, END_COLOR);
          const color = hexToRGB(HEX);
          return color ? color as [number, number, number, number] : DEFAULT_PATH_COLOR as [number, number, number, number];
        }
      },
      widthUnits: "pixels",
      getWidth: lineWidth,
      rounded: true,
      capRounded: true,
      jointRounded: true,
    });
  };

  useEffect(() => {
  }, [data, filteredData, classFilters]);


  // Register this layer with the context (or create own overlay if no context)
  useEffect(() => {
    if (context?.isReady) {
      // Using shared overlay through context
      const layerFactory = () => createLayer(currentTimeRef.current);
      context.registerLayer(id, layerFactory);

      return () => {
        context.unregisterLayer(id);
      };
    } else if (map && !context) {
      // Fallback: create own overlay if no context provided (backwards compatibility)
      console.warn(`TripsOverlaySeries ${id}: No TripsOverlayProvider found. Creating individual overlay (not recommended for multiple layers).`);
      
      // This is the old behavior - you might want to keep this for backwards compatibility
      // or remove it to enforce using the provider
      const overlay = new MapboxOverlay({ interleaved: false }); // Use false when standalone
      map.addControl(overlay);
      
      // Set initial layer
      overlay.setProps({ layers: [createLayer(0)] });
      
      // Store overlay reference for animation updates
      // You'd need to handle this differently...
      
      return () => {
        try {
          map.removeControl(overlay);
        } catch {}
      };
    }
  }, [id, context, layerData, lineWidth, opacity, trail, map]);

  // Handle reset
  useEffect(() => {
    if (reset === undefined || resetRef.current === true || reset === false) return;
    resetRef.current = true;
    currentTimeRef.current = 0;
    holdUntilRef.current = null;
    startWallMsRef.current = null;
    
    // Update through context if available
    if (context) {
      context.updateOverlay();
    }
    
    onReset();
    resetRef.current = false;
  }, [reset, onReset, context]);

  // Update color mode if it changes
  useEffect(() => {
    colorModeRef.current = colorMode;
  }, [colorMode]);

  // Animation loop
  useEffect(() => {
    // Only run animation if we have context (shared overlay) or map
    if (!context?.isReady && !map) return;

    // If we're paused, do not start RAF
    if (playState === 'paused' || playState === 'idle') {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Reset clock
    startWallMsRef.current = null;
    lastTickMsRef.current = 0;

    const frameInterval = 1000 / Math.max(1, fps);

    const tick = (tMs: number) => {
      // Cap FPS
      if (tMs - lastTickMsRef.current < frameInterval) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTickMsRef.current = tMs;

      // Establish wall-clock start
      if (startWallMsRef.current == null) startWallMsRef.current = tMs;

      // Advance simulation time in seconds
      const elapsedS = (tMs - startWallMsRef.current) / 1000;
      const nextTime = currentTimeRef.current + elapsedS;

      // Loop or clamp
      let current: number;
      if (loop && maxTs > 0) {
        if (holdUntilRef.current != null) {
          if (tMs < holdUntilRef.current) {
            current = maxTs - 1e-6; // parked just shy of the end
          } else {
            holdUntilRef.current = null;
            current = 0;
            startWallMsRef.current = tMs; // reset integration
          }
        } else {
          const candidate = currentTimeRef.current + elapsedS;
          if (candidate >= maxTs && (loopDelay ?? 0) > 0) {
            // Allow currentTime to continue increasing until maxTs + trail
            const endLimit = maxTs + trail + loopDelay;  // extend so tail can still render
            current = Math.min(candidate, endLimit);
            // Start loopDelay timer once we hit endLimit
            if (candidate >= endLimit) {
              holdUntilRef.current = tMs ;
            }
          } else {
            current = candidate % maxTs;
          }
        }
      } else {
        current = Math.min(nextTime, maxTs);
      }

      currentTimeRef.current = current;
      startWallMsRef.current = tMs; // reset for delta on next frame

      // -------- DEBUG LOGGING (robust) --------
      const t = currentTimeRef.current;

      // Pick a trip that's still active at time t; else fallback to longest
      const trip =
        layerData.find((tr) => (tr.timestamps.at(-1) ?? 0) >= t) ??
        layerData[longestTripIndex];

      if (trip) {
        const vApprox = approxSpeedFromTrip(trip, t);
        if (vApprox != null && Number.isFinite(vApprox)) {
          // console.log(`${id} t=${t.toFixed(2)}s approxSpeed=${vApprox.toFixed(2)} m/s`);
        }
      }

      // Optional: also log theoretical schedule v(t) if provided
      if (speedAtTime) {
        const vSched = speedAtTime(t);
        // console.log(`${id} t=${t.toFixed(2)}s scheduleSpeed=${vSched.toFixed(2)} m/s`);
      }
      // ----------------------------------------

      // Update overlay through context
      if (context) {
        context.updateOverlay();
      }

      // Stop at the end if not looping
      if (!loop && current >= maxTs) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    // Kickoff
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [layerData, lineWidth, opacity, fps, loop, maxTs, loopDelay, longestTripIndex, speedAtTime, playState, context, id]);

  return null;
}
