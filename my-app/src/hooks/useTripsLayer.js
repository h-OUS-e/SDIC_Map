import { TripsLayer } from "@deck.gl/geo-layers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { END_COLOR, getFeatureColor, hexToRGB } from '../components/RouteLayer';
import { haversineMeters, toTripsData } from "../utils/prepareTrips";

// ... (Keep all your helper functions like TripDatum, Props, getMaxTimestamp, upperBound, etc.)
// ... (Make sure to export the 'Props' and 'TripDatum' types if needed elsewhere)
function getMaxTimestamp(arr) {
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

// 👇 This hook no longer runs its own animation loop
export default function useTripsLayer({
  id,
  geoJSON,
  currentTime, // Now a required prop!
  trail = 900,
  lineWidth = 4,
  opacity = 0.6,
  timeSpeedProfile = null,
  colorMode = "none"
}) {

  // Prepare geoJSON with timestamps. This part stays the same.
  const data = useMemo(() => toTripsData(geoJSON, timeSpeedProfile), [geoJSON, timeSpeedProfile]);

  // Create the layer. This is now a simple memoized object.
  const layer = useMemo(() => new TripsLayer({
    id: id,
    data,
    opacity,
    currentTime: currentTime, // Use the prop from the parent
    trailLength: trail,
    getPath: (d) => d.path,
    getTimestamps: (d) => d.timestamps,
    getColor: (path) => {
        const pathColorMode = colorMode === "usePathColor" ? "usePathColor" : (colorMode === "months" ? "month" : colorMode);
        if (pathColorMode === "usePathColor") {
            return path.color ? path.color : hexToRGB(END_COLOR);
        } else {
            const HEX = getFeatureColor(path, pathColorMode, END_COLOR);
            return hexToRGB(HEX);
        }
    },
    widthUnits: "pixels",
    getWidth: lineWidth,
    rounded: true,
    capRounded: true,
    jointRounded: true,
  }), [id, data, opacity, trail, lineWidth, colorMode, currentTime]); // Add currentTime to dependency array

  return layer;
}