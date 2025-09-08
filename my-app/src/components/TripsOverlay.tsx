import { TripsLayer } from "@deck.gl/geo-layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type maplibregl from "maplibre-gl";
import React, { useEffect, useMemo, useRef } from "react";
import { FC, haversineMeters, toTripsData } from '../utils/prepareTrips';

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
  geoJSON: FC;
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


// helpers inside TripsOverlay.tsx ---

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



/**
 * Deck.gl overlay that animates simplified routes as time-based trips.
 * - Uses TripsLayer with a clock driven by requestAnimationFrame.
 * - Mounts as a MapboxOverlay control on a MapLibre map instance.
 */
export default function TripsOverlay({
    map,
    geoJSON,
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

  // Prepare geoJSON with timestamps
  const data: TripDatum[] = toTripsData(geoJSON, metersPerSecond)
  // console.log(`Prepared ${data.length} trips for animation.`);


  // Create the data you actually feed to TripsLayer
  const layerData = useMemo(() => {
    console.log(data)
      return data;      
  }, [data]);

  // Compute global max timestamp for looping and bounds
  const maxTs = useMemo(() => getMaxTimestamp(layerData), [layerData]);
    

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
  }, [data, speed, lineWidth, opacity, fps, loop, maxTs]);

  // If the map re-centers/zooms, overlay remains attached via MapboxOverlay
  // and needs no special syncing here.

  return null;
}

