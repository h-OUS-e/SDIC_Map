import { TripsLayer } from "@deck.gl/geo-layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type maplibregl from "maplibre-gl";
import React, { useEffect, useMemo, useRef } from "react";

export type TripDatum = {
  /** Array of [lng, lat] coordinates */
  path: [number, number][];
  /** Per-vertex timestamps in seconds (same length as path) */
  timestamps: number[];
  /** RGB color [0-255, 0-255, 0-255] */
  color?: [number, number, number];
};

export type Props = {
  map: maplibregl.Map | null;
  data: TripDatum[];
  /** seconds-per-second multiplier */
  speed?: number;
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
  /** If provided, recompute timestamps so speed is constant across all trips */
  metersPerSecond?: number | null;
};


// --- helpers inside TripsOverlay.tsx ---
function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const la1 = toRad(lat1), la2 = toRad(lat2);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function retimeConstantSpeed(d: TripDatum, mps: number): TripDatum {
  const path = d.path || [];
  const ts: number[] = new Array(path.length).fill(0);
  let cum = 0;
  for (let i = 1; i < path.length; i++) {
    cum += haversineMeters(path[i-1], path[i]);
    ts[i] = cum / Math.max(1e-6, mps);
  }
  return { ...d, timestamps: ts };
}



/**
 * Deck.gl overlay that animates simplified routes as time-based trips.
 * - Uses TripsLayer with a clock driven by requestAnimationFrame.
 * - Mounts as a MapboxOverlay control on a MapLibre map instance.
 */
export default function TripsOverlay({
    map,
    data,
    speed = 10, // seconds of data shown per wall-second
    trail = 900,
    lineWidth = 4,
    fps = 30,
    opacity = 0.6,
    loop = true,
    metersPerSecond = null,
}: Props) {
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const rafRef = useRef<number | null>(null);
  const startWallMsRef = useRef<number | null>(null);
  const lastTickMsRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);

  // Compute global max timestamp for looping and bounds
  const maxTs = useMemo(() => getMaxTimestamp(data), [data]);

    // --- create the data you actually feed to TripsLayer ---
    const layerData = useMemo(() => {
        if (!metersPerSecond) return data;
        return data.map(d => retimeConstantSpeed(d, metersPerSecond));
    }, [data, metersPerSecond]);

    

  // Create / attach overlay
  useEffect(() => {
    if (!map) return;
    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({});
      map.addControl(overlayRef.current);
    }
    return () => {
      if (overlayRef.current) {
        try { map.removeControl(overlayRef.current); } catch {}
        overlayRef.current = null;
      }
    };
  }, [map]);

  // Build a layer factory that we can call every frame with a new currentTime
  const makeLayers = (nowS: number) => [
    new TripsLayer<TripDatum>({
      id: "trips-overlay",
      data: layerData,
      opacity,
      currentTime: nowS,
      trailLength: trail,
      getPath: d => d.path,
      getTimestamps: d => d.timestamps,
      getColor: () => [255, 255, 255],
      widthUnits: "pixels",
      getWidth: lineWidth,
      rounded: true,
      capRounded: true,
      jointRounded: true,
    })
  ];

  // Start/drive the animation loop whenever inputs change
  useEffect(() => {
    if (!overlayRef.current) return;

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
      const nextTime = currentTimeRef.current + elapsedS * speed;

      // Loop or clamp
      let current;
      if (loop && maxTs > 0) {
        // Keep time in [0, maxTs). Using % may yield negatives if ever needed.
        current = ((nextTime % maxTs) + maxTs) % maxTs;
      } else {
        current = Math.min(nextTime, maxTs);
      }

      currentTimeRef.current = current;
      startWallMsRef.current = tMs; // reset for delta on next frame

      // Push new layers to the overlay
      overlayRef.current?.setProps({ layers: makeLayers(current) });

      // Stop at the end if not looping
      if (!loop && current >= maxTs) {
        rafRef.current && cancelAnimationFrame(rafRef.current);
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
  }, [data, speed, trail, lineWidth, opacity, fps, loop, maxTs]);

  // If the map re-centers/zooms, overlay remains attached via MapboxOverlay
  // and needs no special syncing here.

  return null;
}

function getMaxTimestamp(data: TripDatum[]): number {
  let maxT = 0;
  for (const d of data) {
    if (Array.isArray(d?.timestamps) && d.timestamps.length) {
      const t = d.timestamps[d.timestamps.length - 1];
      if (Number.isFinite(t) && t > maxT) maxT = t;
    }
  }
  return maxT;
}
