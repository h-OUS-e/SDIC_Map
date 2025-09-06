"use client";

/*
CHANGES (endpoint cleanup):
- Removed the runtime prop `showEndpoints`.
- Commented out ALL origin/endpoint sources & circle layers (glow + dot).
- Commented out their cleanup lines.
- Everything else (line rendering, outline, frequency logic, absolute-distance bands) is unchanged.
*/

import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

const LIGHT_BLUE = "#60a5fa";
const MEDIUM_BLUE = "#3b82f6";
const DARK_BLUE = "#3D64F6";
const ACCENT_BLUE = "#3D64F6";
const SDIC_BLUE = "#3D64F6";
const SDIC_PINK = "#BA29BC";
const SDIC_PURPLE = "#B026FF";
const BRIGHT_RED = "#ff6b6b";
const NEON_BLUE = "#2323ff";
const WHITE = "#ffffff";
const NEON_GREEN = "#39FF14";
const MINT_GREEN = "#00FF93";
const DARK_GREEN = "#138B4F";

const CRAYON_WIDTH = 3.1;
const CRAYON_OPACITY = 0.35;

// Absolute-distance palette (in meters)
const COLOR_BANDS = [
  { upto:  500,  color: SDIC_BLUE },
  { upto:  3000, color: SDIC_BLUE },
  { upto: 40000, color: SDIC_BLUE },
  { upto: 10000, color: DARK_GREEN },
];
const END_TIP_METERS = 500;
const END_TIP_COLOR = MINT_GREEN;

// --- distance helpers ---
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const la1 = toRad(lat1), la2 = toRad(lat2);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function cumulativeMeters(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i-1] + haversineMeters(coords[i-1], coords[i]));
  }
  return cum;
}

function pointAtDistance(coords, cum, d) {
  if (d <= 0) return coords[0];
  const total = cum[cum.length - 1];
  if (d >= total) return coords[coords.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < d) i++;
  const a = coords[i-1], b = coords[i];
  const segStart = cum[i-1], segLen = cum[i] - segStart;
  const t = (d - segStart) / segLen;
  return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t];
}

function sliceAlongMeters(coords, d0, d1) {
  const cum = cumulativeMeters(coords);
  const total = cum[cum.length - 1];
  const start = Math.max(0, Math.min(d0, total));
  const end   = Math.max(0, Math.min(d1, total));
  if (end <= start) return null;
  const out = [];
  out.push(pointAtDistance(coords, cum, start));
  for (let i = 1; i < coords.length; i++) {
    const dist = cum[i];
    if (dist > start && dist < end) out.push(coords[i]);
  }
  out.push(pointAtDistance(coords, cum, end));
  return out;
}

function explodeLineToAbsoluteBands(feature, baseProps = {}) {
  const coords = feature.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const cum = cumulativeMeters(coords);
  const total = cum[cum.length - 1];

  const tipLen = Math.min(END_TIP_METERS, total);
  const tipStart = Math.max(0, total - tipLen);
  const out = [];

  // bands from 0 → tipStart
  let lastEdge = 0;
  if (tipStart > 0) {
    for (let i = 0; i < COLOR_BANDS.length; i++) {
      const bandStart = lastEdge;
      const bandEndAbs = COLOR_BANDS[i].upto;
      const bandEnd = Math.min(bandEndAbs, tipStart);
      if (bandEnd > bandStart) {
        const seg = sliceAlongMeters(coords, bandStart, bandEnd);
        if (seg && seg.length >= 2) {
          out.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: seg },
            properties: { ...baseProps, color: COLOR_BANDS[i].color, segmentIndex: i, isTip: false },
          });
        }
        lastEdge = bandEnd;
      }
      if (lastEdge >= tipStart) break;
      if (i === COLOR_BANDS.length - 1 && lastEdge < tipStart) {
        const seg = sliceAlongMeters(coords, lastEdge, tipStart);
        if (seg && seg.length >= 2) {
          out.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: seg },
            properties: { ...baseProps, color: COLOR_BANDS[i].color, segmentIndex: i + 1, isTip: false },
          });
        }
        lastEdge = tipStart;
      }
    }
  }

  // end tip
  if (tipLen > 0) {
    const tipSeg = sliceAlongMeters(coords, tipStart, total);
    if (tipSeg && tipSeg.length >= 2) {
      out.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: tipSeg },
        properties: { ...baseProps, color: END_TIP_COLOR, segmentIndex: 999, isTip: true },
      });
    }
  }

  return out;
}

export default function RouteLayer({
  map,
  url = "/assets/routes/route.geojson",
  sourceId = "saved-route",
  layerId = "saved-route-line",
  opacity = 1.0,
  onData,
  fitOnLoad = false,
  routeImportance = "medium",
  // NOTE: showEndpoints prop removed — endpoints are fully disabled below.
}) {
  const [geojson, setGeojson] = useState(null);
  const lastSentRef = useRef(null);

  // Load from URL
  useEffect(() => {
    let cancelled = false;
    if (!url) return;
    (async () => {
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!cancelled) setGeojson(data);
      } catch (e) {
        console.error("Failed to load route from URL", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!map) return;

    // Create SVG filter (MapLibre draws to canvas; effect is subtle)
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
    let svgElement = mapContainer.querySelector("#crayon-svg-filter");
    if (!svgElement) {
      svgElement = document.createElement("div");
      svgElement.id = "crayon-svg-filter";
      svgElement.innerHTML = svgFilter;
      mapContainer.appendChild(svgElement);
    }
    return () => {
      const element = mapContainer.querySelector("#crayon-svg-filter");
      if (element) element.remove();
    };
  }, [map]);

  // Add/update sources & layers
  useEffect(() => {
    if (!map || !geojson) return;

    const fc = geojson.type === "FeatureCollection" ? geojson : { type: "FeatureCollection", features: [geojson] };

    // ---- frequency annotation (direction-agnostic) ----
    const round = (n, p = 6) => Math.round(n * 10 ** p) / 10 ** p;

    const normLine = (coords) => {
      const cleaned = [];
      let prev = null;
      for (const c of coords || []) {
        const rc = [round(c[0]), round(c[1])];
        if (!prev || rc[0] !== prev[0] || rc[1] !== prev[1]) cleaned.push(rc);
        prev = rc;
      }
      if (cleaned.length < 2) return cleaned.concat(cleaned);
      const f = cleaned.map((c) => `${c[0]},${c[1]}`).join("|");
      const b = [...cleaned].reverse().map((c) => `${c[0]},${c[1]}`).join("|");
      return f < b ? f : b;
    };

    const normMulti = (multi) => {
      const parts = (multi || []).map((p) => normLine(p)).filter(Boolean);
      return parts.sort().join("||");
    };

    const geomKey = (geom) => {
      if (!geom) return "NONE";
      if (geom.type === "LineString") return "L:" + normLine(geom.coordinates);
      if (geom.type === "MultiLineString") return "ML:" + normMulti(geom.coordinates);
      return "O:" + JSON.stringify(geom.coordinates);
    };

    const freqMap = new Map();
    for (const feat of fc.features || []) {
      const k = geomKey(feat.geometry);
      freqMap.set(k, (freqMap.get(k) || 0) + 1);
    }

    // explode colored segments
    const processedFC = {
      type: "FeatureCollection",
      features: (fc.features || []).flatMap((feature, index) => {
        const k = geomKey(feature.geometry);
        const freq = freqMap.get(k) || 1;

        if (feature.geometry?.type === "LineString") {
          const baseProps = {
            ...feature.properties,
            gradient: 2,
            hasFillets: Math.random() > 0.7,
            routeIndex: index,
            freq,
          };
          return explodeLineToAbsoluteBands(feature, baseProps);
        }

        if (feature.geometry?.type === "MultiLineString") {
          const parts = feature.geometry.coordinates || [];
          const baseProps = {
            ...feature.properties,
            gradient: 5,
            hasFillets: Math.random() > 0.7,
            routeIndex: index,
            freq,
          };
          return parts.flatMap((part) => {
            const f = { type: "Feature", geometry: { type: "LineString", coordinates: part }, properties: feature.properties || {} };
            return explodeLineToAbsoluteBands(f, baseProps);
          });
        }

        return [{ ...feature, properties: { ...feature.properties, freq } }];
      }),
    };

    // source
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: processedFC,
        lineMetrics: true,
      });
    } else {
      const src = map.getSource(sourceId);
      if (src && src.setData) src.setData(processedFC);
    }

    const getLineStyle = (importance) => {
      switch (importance) {
        case "very-high":
        case "high":
        case "medium":
          return { width: CRAYON_WIDTH, color: MEDIUM_BLUE, opacity: CRAYON_OPACITY };
        case "low":
        default:
          return { width: CRAYON_WIDTH, color: MEDIUM_BLUE, opacity: CRAYON_OPACITY };
      }
    };

    const lineStyle = getLineStyle(routeImportance);

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-cap": "round",
          "line-join": [
            "case",
            ["get", "hasFillets"],
            "round",
            "miter",
          ],
          "line-miter-limit": 2,
        },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["*", lineStyle.width, ["max", 0.2, ["^", ["coalesce", ["get", "freq"], 1], 0.1]]],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "freq"], 1],
            1,  lineStyle.opacity * opacity * 0.95,
            10, lineStyle.opacity * opacity * 0.9,
            12, lineStyle.opacity * opacity,
            12.9, Math.min(1, lineStyle.opacity * opacity * 1.05),
          ],
        },
      });

      const canvas = map.getCanvas();
      const layerElements = canvas.parentElement?.querySelectorAll(`[data-layer-id="${layerId}"]`);
      layerElements?.forEach((element) => {
        element.style.filter = "url(#crayon-noise)";
      });
    }

    // outline effect
    const outlineLayerId = `${layerId}-outline`;
    if (!map.getLayer(outlineLayerId)) {
      map.addLayer(
        {
          id: outlineLayerId,
          type: "line",
          source: sourceId,
          layout: {
            "line-cap": "round",
            "line-join": ["case", ["get", "hasFillets"], "round", "miter"],
            "line-miter-limit": 8,
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["*", CRAYON_WIDTH + 2.5, ["max", 1, ["^", ["coalesce", ["get", "freq"], 1], 0.5]]],
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "freq"], 1],
              10, CRAYON_OPACITY * opacity * 0.25,
              12, CRAYON_OPACITY * opacity * 0.32,
              12.9, CRAYON_OPACITY * opacity * 0.4,
            ],
          },
        },
        layerId
      );
    }

    // ====== ENDPOINTS REMOVED ======
    // const pointSourceId = `${sourceId}-origin-point`;
    // const endpointSourceId = `${sourceId}-endpoint-point`;
    // (All origin/endpoint addSource/addLayer blocks were here — commented out.)

    // Optional fit to bounds
    if (fitOnLoad) {
      try {
        const features = fc.features || [];
        const bounds = new maplibregl.LngLatBounds();
        features.forEach((f) => {
          if (f.geometry?.type === "LineString") {
            f.geometry.coordinates.forEach((c) => bounds.extend(c));
          } else if (f.geometry?.type === "MultiLineString") {
            f.geometry.coordinates.flat().forEach((c) => bounds.extend(c));
          }
        });
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 });
      } catch (e) {}
    }

    // cleanup
    return () => {
      const outlineLayerId2 = `${layerId}-outline`;
      [
        // `${layerId}-endpoint-dot`,
        // `${layerId}-endpoint-glow-middle`,
        // `${layerId}-endpoint-glow-outer`,
        // `${layerId}-origin-dot`,
        // `${layerId}-origin-glow-middle`,
        // `${layerId}-origin-glow-outer`,
        layerId,
        outlineLayerId2,
      ].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      // if (map.getSource(`${sourceId}-endpoint-point`)) map.removeSource(`${sourceId}-endpoint-point`);
      // if (map.getSource(`${sourceId}-origin-point`)) map.removeSource(`${sourceId}-origin-point`);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, geojson, sourceId, layerId, opacity, fitOnLoad, routeImportance]);
  // NOTE: showEndpoints was removed from deps

  // (Visibility toggle effect for endpoints deleted)

  // Notify parent once per dataset change
  useEffect(() => {
    if (!geojson) return;
    const fc = geojson.type === "FeatureCollection" ? geojson : { type: "FeatureCollection", features: [geojson] };
    if (lastSentRef.current !== fc) {
      lastSentRef.current = fc;
      try {
        onData && onData(fc);
      } catch (e) {
        console.warn("onData threw:", e);
      }
    }
  }, [geojson, onData]);

  // Local file loader UI
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setGeojson(data);
      const fc = data && data.type === "FeatureCollection" ? data : { type: "FeatureCollection", features: [data] };
      lastSentRef.current = fc;
      if (onData) onData(fc);
    } catch (err) {
      console.error("Invalid GeoJSON file", err);
      alert("Invalid GeoJSON file");
    }
  };

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
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Render saved route</div>
      <input type="file" accept=".geojson,application/geo+json,application/json" onChange={onFile} />
    </div>
  );
}
