"use client";

import React, { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap, LngLatBoundsLike } from "maplibre-gl";
import type {
  Feature,
  FeatureCollection,
  LineString,
  Position,
  Geometry,
} from "geojson";

// ---------- Look & Feel (same palette) ----------
const LIGHT_BLUE = "#60a5fa";
const MEDIUM_BLUE = "#3b82f6";
const DARK_BLUE = "#1e40af";
const ACCENT_BLUE = "#1e3a8a";

const CRAYON_WIDTH = 2.5;
const CRAYON_OPACITY = 0.65;

// ---------- Types ----------
type GroupKeyFn = (a: Position, b: Position) => string;

type Props = {
  map: MLMap | null | undefined;
  url?: string;
  sourceId?: string;
  layerId?: string;
  opacity?: number;
  onData?: (fc: FeatureCollection<Geometry, any>) => void;
  fitOnLoad?: boolean;
  routeImportance?: "low" | "medium" | "high";
  visualizationMode?: "offset" | "stack";
  maxFrequency?: number;
  groupKeyFn?: GroupKeyFn;
};

// ---------- Component ----------
export default function RouteLayerWithFrequency({
  map,
  url,
  sourceId = "saved-route-freq",
  layerId = "saved-route-freq-line",
  opacity = 1.0,
  onData,
  fitOnLoad = false,
  routeImportance = "medium",
  visualizationMode = "offset",
  maxFrequency = 10,
  groupKeyFn,
}: Props) {
  const [geojson, setGeojson] = useState<FeatureCollection<Geometry, any> | null>(null);
  const lastSentRef = useRef<FeatureCollection<Geometry, any> | null>(null);

  // Load from URL (if provided)
  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url);
        const data = (await res.json()) as FeatureCollection<Geometry, any> | Feature<Geometry, any>;
        const fc: FeatureCollection<Geometry, any> =
          data && "type" in data && data.type === "FeatureCollection"
            ? (data as FeatureCollection<Geometry, any>)
            : { type: "FeatureCollection", features: [data as Feature<Geometry, any>] };

        if (!cancelled) {
          setGeojson(fc);
          lastSentRef.current = fc;
          onData?.(fc);
        }
      } catch (e) {
        console.error("Failed to load route from URL", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, onData]);

  // Add SVG texture filter (once)
  useEffect(() => {
    if (!map) return;
    const svgFilter = `
      <svg style="position: absolute; width: 0; height: 0;">
        <defs>
          <filter id="crayon-noise" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence baseFrequency="1.8" numOctaves="4" result="noise" seed="2"/>
            <feColorMatrix in="noise" type="saturate" values="0"/>
            <feComponentTransfer>
              <feFuncA type="discrete" tableValues="0.2 0.3 0.4 0.5 0.6 0.7"/>
            </feComponentTransfer>
            <feComposite operator="multiply" in2="SourceGraphic"/>
          </filter>
        </defs>
      </svg>
    `;
    const mapContainer = map.getContainer();
    let svgElement = mapContainer.querySelector<HTMLDivElement>("#crayon-svg-filter");
    if (!svgElement) {
      svgElement = document.createElement("div");
      svgElement.id = "crayon-svg-filter";
      svgElement.innerHTML = svgFilter;
      mapContainer.appendChild(svgElement);
    }
    return () => {
      const el = mapContainer.querySelector("#crayon-svg-filter");
      if (el) el.remove();
    };
  }, [map]);

  // Default group key (direction-agnostic A<->B), rounded to reduce jitter
  const defaultGroupKey: GroupKeyFn = (a, b) => {
    const round = (x: number) => Math.round(x * 1e4) / 1e4;
    const sa: Position = [round(a[0]), round(a[1])];
    const sb: Position = [round(b[0]), round(b[1])];
    const key1 = `${sa[0]},${sa[1]}__${sb[0]},${sb[1]}`;
    const key2 = `${sb[0]},${sb[1]}__${sa[0]},${sa[1]}`;
    return key1 < key2 ? key1 : key2;
  };

  // Build & render frequency-expanded collection
  useEffect(() => {
    if (!map || !geojson) return;

    // Filter to LineString features only (for grouping)
    const lineFeatures: Feature<LineString, any>[] = geojson.features
      .filter((f): f is Feature<LineString, any> => f.geometry?.type === "LineString");

    // Group by start/end
    const keyFn = groupKeyFn ?? defaultGroupKey;
    const groups = new Map<string, Feature<LineString, any>[]>();

    for (const f of lineFeatures) {
      const coords = f.geometry.coordinates;
      if (!coords || coords.length < 2) continue;
      const start = coords[0];
      const end = coords[coords.length - 1];
      const key = keyFn(start, end);
      const arr = groups.get(key);
      if (arr) arr.push(f);
      else groups.set(key, [f]);
    }

    // Duplicate features to show frequency: offset or stack
    const GAP_PX = 3.5;
    const expanded: Feature<LineString, any>[] = [];

    for (const [, arr] of groups) {
      const freq = Math.min(arr.length, Math.max(1, maxFrequency));
      for (let i = 0; i < freq; i++) {
        const base = arr[i % arr.length];
        const offsetIndex = i - (freq - 1) / 2;
        const lineOffset = visualizationMode === "offset" ? offsetIndex * GAP_PX : 0;

        expanded.push({
          type: "Feature",
          geometry: base.geometry,
          properties: {
            ...(base.properties ?? {}),
            freq: arr.length,
            freqRank: i + 1,
            lineOffset,
            gradient: 1,
            hasFillets: true,
          },
        });
      }
    }

    const processedFC: FeatureCollection<LineString, any> = {
      type: "FeatureCollection",
      features: expanded.map((f, idx) => ({
        ...f,
        properties: { ...(f.properties ?? {}), routeIndex: idx },
      })),
    };

    // Add or update source
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: processedFC,
        lineMetrics: true,
      } as maplibregl.GeoJSONSourceOptions);
    } else {
      const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      src?.setData(processedFC);
    }

    // Frequency-aware width/opacity
    const widthByFreq: any = [
      "interpolate",
      ["linear"],
      ["min", ["get", "freq"], maxFrequency],
      1, CRAYON_WIDTH,
      maxFrequency, CRAYON_WIDTH + 2.0,
    ];

    const baseOpacity = CRAYON_OPACITY * opacity;
    const opacityByFreq: any = [
      "interpolate",
      ["linear"],
      ["min", ["get", "freq"], maxFrequency],
      1, baseOpacity,
      maxFrequency, Math.min(1.0, baseOpacity + 0.25),
    ];

    // Main line
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-gradient": [
            "interpolate",
            ["linear"],
            ["line-progress"],
            0, LIGHT_BLUE,
            0.5, MEDIUM_BLUE,
            1, ACCENT_BLUE,
          ],
          "line-width": widthByFreq,
          "line-opacity": opacityByFreq,
          "line-offset": ["get", "lineOffset"],
        },
      });
    }

    // Outline
    const outlineId = `${layerId}-outline`;
    if (!map.getLayer(outlineId)) {
      map.addLayer(
        {
          id: outlineId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-gradient": [
              "interpolate",
              ["linear"],
              ["line-progress"],
              0, MEDIUM_BLUE,
              1, DARK_BLUE,
            ],
            "line-width": ["+", ["to-number", widthByFreq], 2.5] as any,
            "line-opacity": ["*", ["to-number", opacityByFreq], 0.4] as any,
            "line-offset": ["get", "lineOffset"],
          },
        },
        layerId,
      );
    }

    // Origin & endpoints (from processed)
    const firstLine = processedFC.features.find(
      (x) => x.geometry?.type === "LineString",
    );
    const origin = firstLine ? firstLine.geometry.coordinates[0] : null;

    const endpoints: Position[] = processedFC.features
      .filter((x) => x.geometry?.type === "LineString")
      .map((feat) => {
        const coords = feat.geometry.coordinates;
        return coords[coords.length - 1];
      });

    const pointSourceId = `${sourceId}-origin-point`;
    const endpointSourceId = `${sourceId}-endpoint-point`;

    if (origin) {
      const pointFC: FeatureCollection = {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Point", coordinates: origin }, properties: {} }],
      };
      if (!map.getSource(pointSourceId)) {
        map.addSource(pointSourceId, { type: "geojson", data: pointFC });
      } else {
        (map.getSource(pointSourceId) as maplibregl.GeoJSONSource).setData(pointFC);
      }

      if (!map.getLayer(`${layerId}-origin-glow-outer`)) {
        map.addLayer({
          id: `${layerId}-origin-glow-outer`,
          type: "circle",
          source: pointSourceId,
          paint: { "circle-color": LIGHT_BLUE, "circle-radius": 12, "circle-opacity": 0.15 },
        });
      }
      if (!map.getLayer(`${layerId}-origin-glow-middle`)) {
        map.addLayer({
          id: `${layerId}-origin-glow-middle`,
          type: "circle",
          source: pointSourceId,
          paint: { "circle-color": LIGHT_BLUE, "circle-radius": 7, "circle-opacity": 0.3 },
        });
      }
      if (!map.getLayer(`${layerId}-origin-dot`)) {
        map.addLayer({
          id: `${layerId}-origin-dot`,
          type: "circle",
          source: pointSourceId,
          paint: { "circle-color": LIGHT_BLUE, "circle-radius": 4, "circle-opacity": 0.9 },
        });
      }
    }

    if (endpoints.length > 0) {
      const endpointFC: FeatureCollection = {
        type: "FeatureCollection",
        features: endpoints.map((c, i) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: c },
          properties: { endpointIndex: i },
        })),
      };
      if (!map.getSource(endpointSourceId)) {
        map.addSource(endpointSourceId, { type: "geojson", data: endpointFC });
      } else {
        (map.getSource(endpointSourceId) as maplibregl.GeoJSONSource).setData(endpointFC);
      }

      if (!map.getLayer(`${layerId}-endpoint-glow-outer`)) {
        map.addLayer({
          id: `${layerId}-endpoint-glow-outer`,
          type: "circle",
          source: endpointSourceId,
          paint: {
            "circle-color": ACCENT_BLUE,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1, 10, 2, 12, 6, 16, 12],
            "circle-opacity": 0.15,
          },
        });
      }
      if (!map.getLayer(`${layerId}-endpoint-glow-middle`)) {
        map.addLayer({
          id: `${layerId}-endpoint-glow-middle`,
          type: "circle",
          source: endpointSourceId,
          paint: {
            "circle-color": ACCENT_BLUE,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 10, 1.5, 12, 4, 16, 8],
            "circle-opacity": 0.3,
          },
        });
      }
      if (!map.getLayer(`${layerId}-endpoint-dot`)) {
        map.addLayer({
          id: `${layerId}-endpoint-dot`,
          type: "circle",
          source: endpointSourceId,
          paint: {
            "circle-color": ACCENT_BLUE,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 10, 1, 12, 2.5, 16, 5],
            "circle-opacity": 0.9,
          },
        });
      }
    }

    if (fitOnLoad) {
      try {
        const bounds = new maplibregl.LngLatBounds();
        processedFC.features.forEach((f) => {
          if (f.geometry?.type === "LineString") {
            f.geometry.coordinates.forEach((c) => bounds.extend(c as LngLatBoundsLike));
          }
        });
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 });
      } catch {
        /* ignore */
      }
    }

    // cleanup
    return () => {
      [
        `${layerId}-endpoint-dot`,
        `${layerId}-endpoint-glow-middle`,
        `${layerId}-endpoint-glow-outer`,
        `${layerId}-origin-dot`,
        `${layerId}-origin-glow-middle`,
        `${layerId}-origin-glow-outer`,
        layerId,
        `${layerId}-outline`,
      ].forEach((id) => map.getLayer(id) && map.removeLayer(id));

      if (map.getSource(`${sourceId}-endpoint-point`)) map.removeSource(`${sourceId}-endpoint-point`);
      if (map.getSource(`${sourceId}-origin-point`)) map.removeSource(`${sourceId}-origin-point`);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [
    map,
    geojson,
    sourceId,
    layerId,
    opacity,
    fitOnLoad,
    routeImportance,
    visualizationMode,
    maxFrequency,
    groupKeyFn,
  ]);

  // Local file loader (optional)
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as FeatureCollection<Geometry, any> | Feature<Geometry, any>;
      const fc: FeatureCollection<Geometry, any> =
        data && "type" in data && data.type === "FeatureCollection"
          ? (data as FeatureCollection<Geometry, any>)
          : { type: "FeatureCollection", features: [data as Feature<Geometry, any>] };

      setGeojson(fc);
      lastSentRef.current = fc;
      onData?.(fc);
    } catch (err) {
      console.error("Invalid GeoJSON file", err);
      alert("Invalid GeoJSON file");
    }
  };

  // Small overlay UI (optional)
  return (
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
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        Render routes (frequency-aware)
      </div>
      <input
        type="file"
        accept=".geojson,application/geo+json,application/json"
        onChange={onFile}
      />
    </div>
  );
}
