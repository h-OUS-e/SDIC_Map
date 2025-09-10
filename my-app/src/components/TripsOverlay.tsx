import { TripsLayer } from "@deck.gl/geo-layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type maplibregl from "maplibre-gl";
import React, { useEffect, useMemo, useRef } from "react";
import { FC, haversineMeters, toTripsData } from "../utils/prepareTrips";

export type TripDatum = {
  path: [number, number][];
  timestamps: number[];
  color?: [number, number, number];
};

export type Props = {
  map: maplibregl.Map | null;
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
};

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

export default function TripsOverlay({
  map,
  geoJSON,
  trail = 900,
  lineWidth = 4,
  fps = 30,
  opacity = 0.1,
  loopDelay = 5, 
  loop = true,
  timeSpeedProfile = null,
}: Props) {
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const rafRef = useRef<number | null>(null);
  const startWallMsRef = useRef<number | null>(null);
  const lastTickMsRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const holdUntilRef = useRef<number | null>(null);

  // Prepare geoJSON with timestamps (your helper accepts these args)
  const data: TripDatum[] = toTripsData(geoJSON, timeSpeedProfile);

  // Layer data
  const layerData = useMemo(() => data, [data]);

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

  // Create / attach overlay
  useEffect(() => {
    if (!map) return;
    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({});
      map.addControl(overlayRef.current);
    }
    return () => {
      if (overlayRef.current) {
        try {
          map.removeControl(overlayRef.current);
        } catch {}
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
      getPath: (d) => d.path,
      getTimestamps: (d) => d.timestamps,
      getColor: () => [168, 203, 255],
      widthUnits: "pixels",
      getWidth: lineWidth,
      rounded: true,
      capRounded: true,
      jointRounded: true,
    }),
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
      const nextTime = currentTimeRef.current + elapsedS

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
          current = maxTs - 1e-6;
          holdUntilRef.current = tMs + (loopDelay! * 1000);
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
          console.log(`t=${t.toFixed(2)}s approxSpeed=${vApprox.toFixed(2)} m/s`);
        }
      }

      // Optional: also log theoretical schedule v(t) if provided
      if (speedAtTime) {
        const vSched = speedAtTime(t);
        console.log(`t=${t.toFixed(2)}s scheduleSpeed=${vSched.toFixed(2)} m/s`);
      }
      // ----------------------------------------

      // Push new layers to the overlay
      overlayRef.current?.setProps({ layers: makeLayers(current) });

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
  }, [layerData, lineWidth, opacity, fps, loop, maxTs, loopDelay, longestTripIndex, speedAtTime]);

  return null;
}
