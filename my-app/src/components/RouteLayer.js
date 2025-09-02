"use client"

import { useSmoothRoute } from "@/hooks/useSmoothRoute"
import maplibregl from "maplibre-gl"
import { useEffect, useMemo, useRef, useState } from "react"

// Colors
const LIGHT_BLUE = "#60a5fa"
const MEDIUM_BLUE = "#3b82f6"
const DARK_BLUE = "#3D64F6"
const ACCENT_BLUE = "#3D64F6"
const SDIC_BLUE = "#3D64F6"
const SDIC_PINK = "#BA29BC"
const SDIC_PURPLE = "#B026FF"
const BRIGHT_RED = "#ff6b6b"
const NEON_BLUE = "#2323ff"
const WHITE = "#ffffff"
const NEON_GREEN = "#39FF14"
const MINT_GREEN = "#00FF93"
const DARK_GREEN = "#138B4F"

// Parameters
const CRAYON_WIDTH = 3.1
const CRAYON_OPACITY = 0.85


// Distance helpers

/** Haversine: distance in meters between two [lon, lat] points on Earth using Haversine formula. */
function haversineMeters(a, b) {
    const R = 6371000
    const toRad = (x) => (x * Math.PI) / 180
    const [lon1, lat1] = a, [lon2, lat2] = b
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const la1 = toRad(lat1), la2 = toRad(lat2)
    const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2
    return 2 * R * Math.asin(Math.sqrt(h))
}


/** Cumulative distances (m) along a polyline; i = meters from start to coords[i] ([lon, lat]). */
function cumulativeMeters(coords) {
    const cum = [0]
    for (let i = 1; i < coords.length; i++) {
        cum.push(cum[i-1] + haversineMeters(coords[i-1], coords[i]))
    }
    return cum
}

/** Total length (m) of a GeoJSON LineString or MultiLineString. */
function totalLengthMeters(geom) {
    let total = 0
    if (geom?.type === "LineString") {
        total = cumulativeMeters(geom.coordinates).at(-1) || 0
    } else if (geom?.type === "MultiLineString") {
        for (const part of geom.coordinates || []) {
            const cum = cumulativeMeters(part)
            total += cum.at(-1) || 0
        }
    }
    return total
}


// Geojson Helpers
const asFC = (g) =>
    g?.type === "FeatureCollection" ? g : { type: "FeatureCollection", features: [g] };

function gradientStartT(fc, tailMeters = 500) {
    let total = 0;
    for (const f of fc.features || []) total += totalLengthMeters(f.geometry);
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, 1 - tailMeters / total));
}

function endpointsFromFC(fc) {
    let first = null;
    let last = null;
    for (const feat of fc.features || []) {
        const g = feat.geometry;
        if (!g) continue;
        if (g.type === "LineString" && g.coordinates?.length) {
            if (!first) first = g.coordinates[0];
            last = g.coordinates[g.coordinates.length - 1];
        } else if (g.type === "MultiLineString") {
            for (const part of g.coordinates || []) {
                if (part?.length) {
                if (!first) first = part[0];
                    last = part[part.length - 1];
                }
            }
        }
    }
    return { origin: first, endpoints: last ? [last] : [] };
}


/** Create or update a GeoJSON source by id.
 *  If the source doesn’t exist, adds it (optionally with `lineMetrics` for line-progress gradients);
 *  otherwise calls `setData` to refresh the data.
 *  @param map maplibregl.Map
 *  @param id Source id
 *  @param data GeoJSON Feature/FeatureCollection
 *  @param lineMetrics When true, sets { lineMetrics: true } on creation (needed for line-gradient)
 */
function upsertGeoJSONSource(map, id, data, lineMetrics = false) {
    const src = map.getSource(id);
    if (!src) {
        map.addSource(id, { type: "geojson", data, ...(lineMetrics ? { lineMetrics: true } : {}) });
    } else {
        src.setData?.(data);
    }
}

/** Ensure a line layer exists with the given paint props.
 *  Creates the layer (round caps/joins) if missing, or updates its paint properties if present.
 *  Optionally inserts before another layer via `beforeId`.
 *  @param map maplibregl.Map
 *  @param id Layer id
 *  @param sourceId Source id to draw from
 *  @param paint MapLibre line paint object
 *  @param beforeId (optional) Layer id to insert before
 */
function ensureLineLayer(map, id, sourceId, paint, beforeId) {
    if (!map.getLayer(id)) map.addLayer({ id, type: "line", source: sourceId, layout: { "line-cap":"round","line-join":"round" }, paint }, beforeId);
    else Object.entries(paint).forEach(([k, v]) => map.setPaintProperty(id, k, v));
}

/** Ensure a circle (point) layer exists with the given paint props.
 *  Creates it if missing, or updates its paint properties if it already exists.
 *  @param map maplibregl.Map
 *  @param id Layer id
 *  @param sourceId Source id to draw from
 *  @param paint MapLibre circle paint object
 */
function ensurePointLayer(map, id, sourceId, paint) {
    if (!map.getLayer(id)) map.addLayer({ id, type: "circle", source: sourceId, paint });
    else Object.entries(paint).forEach(([k, v]) => map.setPaintProperty(id, k, v));
}


/** Make a FeatureCollection of Points from all coordinates in fc.
 *  Includes Point/MultiPoint as-is, and vertices of LineString/MultiLineString/Polygon/MultiPolygon.
 *  Caps to ~maxPoints by sampling with a stride when needed.
 */
function fcToPointFC(fc, maxPoints = 5000) {
  const coords = []

  for (const feat of fc.features || []) {
    const g = feat.geometry
    if (!g) continue
    if (g.type === "Point") {
      coords.push(g.coordinates)
    } else if (g.type === "MultiPoint") {
      for (const c of g.coordinates || []) coords.push(c)
    } else if (g.type === "LineString") {
      for (const c of g.coordinates || []) coords.push(c)
    } else if (g.type === "MultiLineString") {
      for (const part of g.coordinates || []) for (const c of part || []) coords.push(c)
    } else if (g.type === "Polygon") {
      for (const ring of g.coordinates || []) for (const c of ring || []) coords.push(c)
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates || [])
        for (const ring of poly || [])
          for (const c of ring || []) coords.push(c)
    }
  }

  if (coords.length === 0) return { type: "FeatureCollection", features: [] }

  const stride = Math.max(1, Math.ceil(coords.length / maxPoints))
  const features = coords
    .filter((_, i) => i % stride === 0)
    .map((c, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: c },
      properties: { vertexIndex: i, stride },
    }))

  return { type: "FeatureCollection", features }
}


export default function RouteLayer({
    map,
    url = "/assets/routes/route.geojson",
    sourceId = "saved-route",
    layerId = "saved-route-line",
    opacity = 1.0,
    onData,
    fitOnLoad = false,
    showVertices = false,  
    routeImportance = "medium",
    showSmoothed = false,
}) {

    // React state holding the loaded route GeoJSON (Feature/FeatureCollection).
    // const [geojson, setGeojson] = useState(null)
    const lastSentRef = useRef(null)
    const { data: smoothed, original: original} = useSmoothRoute({
        url,
        options: {
            simplifyToleranceMeters: 4, // adjust 1–5m
            deflectionThresholdDeg: 20, // what counts as “sharp”
            filletFraction: .4, // how rounded the corner feels (0.15–0.3 feels natural)
            densifySegments: 0,
            spline: true,
            resampleSpacingMeters: 9 // spacing of points in final output
        },
    })

    // // // Load routes json from URL input
    // useEffect(() => {
    //     let cancelled = false
    //     if (!url) return
        
    //     ;(async () => {
    //         try {
    //             const res = await fetch(url)
    //             const data = await res.json()
    //             if (!cancelled) setGeojson(data)
    //         } catch (e) {
    //             console.error("Failed to load route from URL", e)
    //         }
    //     })()
    //     return () => { cancelled = true }
    // }, [url])


    const smoothedFC = useMemo(() => (smoothed ? asFC(smoothed) : null), [smoothed])
    const originalFC = useMemo(() => (original ? asFC(original) : null), [original])

    const fc = showSmoothed ? smoothedFC : originalFC

    /* From the current FeatureCollection fc, it calculates once (per fc change) 
    all the constants the layers need, then caches them: */
    const derived = useMemo(() => {
        if (!fc) return null;
        const startTailT = gradientStartT(fc, 500);
        const { origin, endpoints } = endpointsFromFC(fc);

        // gradient stops in line-progress space
        const t0 = Math.max(0, startTailT - 0.001);
        const t1 = startTailT + (1 - startTailT) * 0.33;
        const t2 = startTailT + (1 - startTailT) * 0.66;
        const t3 = 1.0;

        return { startTailT, t0, t1, t2, t3, origin, endpoints };
    }, [fc]);

    // 1) Source (route geojson)
    useEffect(() => {
        if (!map || !fc) return;
        upsertGeoJSONSource(map, sourceId, fc, true); // lineMetrics for gradient
    }, [map, fc, sourceId]);


    
    // 2) Line layers (main + outline)
    useEffect(() => {
        if (!map || !fc || !derived) return;

        const { t0, t1, t2, t3, startTailT } = derived;
        const START_COLOR = SDIC_BLUE;
        const MID_COLOR_1 = "#253BE2";
        const MID_COLOR_2 = "#187775";
        const END_COLOR   = "#24DE8C";

        const getLineStyle = (importance) => ({ width: CRAYON_WIDTH, opacity: CRAYON_OPACITY });
        const lineStyle = getLineStyle(routeImportance);

        // main gradient line
        ensureLineLayer(map, layerId, sourceId, {
            "line-color": START_COLOR,
            "line-gradient": [
                "interpolate", ["linear"], ["line-progress"],
                0.0, "#24DE8C",
                0.05, "#187775",
                0.55, "#253BE2",
                0.8,  "#ffffff",
                startTailT, "#ffffff",
                t1, "#253BE2",
                t2, "#187775",
                1.0, "#24DE8C",
            ],
            "line-width": lineStyle.width / 2,
            "line-opacity": lineStyle.opacity * opacity,
            "line-blur": 0.55,
        });

        // outline glow
        const outlineId = `${layerId}-outline`;
        ensureLineLayer(map, outlineId, sourceId, {
            "line-color": START_COLOR,
            "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, START_COLOR, t0, START_COLOR, t1, MID_COLOR_1, t2, MID_COLOR_2, t3, END_COLOR],
            "line-width": CRAYON_WIDTH + 1.0,
            "line-opacity": (CRAYON_OPACITY * opacity) * 0.55,
            "line-blur": 0.8,
        }, layerId);

        // cleanup for these two layers on id changes/unmount
        return () => {
            [outlineId, layerId].forEach(id => { if (map.getLayer(id)) map.removeLayer(id) });
        };
    }, [map, fc, derived, sourceId, layerId, opacity, routeImportance]);


    // 3a) Origin & endpoint points
    useEffect(() => {
        if (!map || !derived) return;
        const { origin, endpoints } = derived;

        const pointSrc = `${sourceId}-origin-point`;
        const endSrc   = `${sourceId}-endpoint-point`;

        if (origin) {
            const pointFC = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: origin }, properties: {} }] };
            upsertGeoJSONSource(map, pointSrc, pointFC);
            ensurePointLayer(map, `${layerId}-origin-glow-outer`,  pointSrc, { "circle-color": LIGHT_BLUE, "circle-radius": 10, "circle-opacity": 0.15 });
            ensurePointLayer(map, `${layerId}-origin-glow-middle`, pointSrc, { "circle-color": LIGHT_BLUE, "circle-radius": 8,  "circle-opacity": 0.3  });
            ensurePointLayer(map, `${layerId}-origin-dot`,         pointSrc, { "circle-color": LIGHT_BLUE, "circle-radius": 4,  "circle-opacity": 0.9  });
        }

        if (endpoints?.length) {
            const endpointFC = { type: "FeatureCollection", features: endpoints.map((c, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { endpointIndex: i } })) };
            upsertGeoJSONSource(map, endSrc, endpointFC);
            ensurePointLayer(map, `${layerId}-endpoint-glow-outer`,  endSrc, { "circle-color": SDIC_BLUE,  "circle-radius": ["interpolate", ["linear"], ["zoom"], 8,1, 10,2, 12,6, 16,8],  "circle-opacity": 0.25 });
            ensurePointLayer(map, `${layerId}-endpoint-glow-middle`, endSrc, { "circle-color": ACCENT_BLUE,"circle-radius": ["interpolate", ["linear"], ["zoom"], 8,0.8,10,1.5,12,4,16,8], "circle-opacity": 0.3  });
            ensurePointLayer(map, `${layerId}-endpoint-dot`,         endSrc, { "circle-color": SDIC_BLUE,  "circle-radius": ["interpolate", ["linear"], ["zoom"], 8,0.5,10,1,12,2.5,16,5],  "circle-opacity": 0.9  });
        }

        return () => {
            const ids = [
                `${layerId}-endpoint-dot`,
                `${layerId}-endpoint-glow-middle`,
                `${layerId}-endpoint-glow-outer`,
                `${layerId}-origin-dot`,
                `${layerId}-origin-glow-middle`,
                `${layerId}-origin-glow-outer`,
            ];
            ids.forEach(id => { if (map.getLayer(id)) map.removeLayer(id) });
            if (map.getSource(pointSrc)) map.removeSource(pointSrc);
            if (map.getSource(endSrc))   map.removeSource(endSrc);
        };
    }, [map, derived, sourceId, layerId]);


    // 3b) All vertices as points (FOR DEBUGGING)
    useEffect(() => {
        if (!map || !fc || !showVertices) return

        const vertSrcId = `${sourceId}-vertices`
        const vertGlowId = `${layerId}-vertices-glow`
        const vertCoreId = `${layerId}-vertices-core`

        const pointFC = fcToPointFC(fc, 600000) // sample to ~6000 points max
        upsertGeoJSONSource(map, vertSrcId, pointFC)

        // crisp core
        ensurePointLayer(map, vertCoreId, vertSrcId, {
            "circle-color": NEON_GREEN,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 13, 14, 1, 20, 5],
            "circle-opacity": 0.85,
            "circle-stroke-color": WHITE,
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 8, 0.0, 12, 0.2, 16, 0.4],
        })

        return () => {
            ;[vertCoreId, vertGlowId].forEach(id => { if (map.getLayer(id)) map.removeLayer(id) })
            if (map.getSource(vertSrcId)) map.removeSource(vertSrcId)
        }
    }, [map, fc, sourceId, layerId, showVertices])


    
    // 4) One-time fit-to-bounds
    const didFitRef = useRef(false);
    useEffect(() => {
        if (!map || !fc || !fitOnLoad || didFitRef.current) return;
        try {
            const bounds = new maplibregl.LngLatBounds();
            for (const f of fc.features || []) {
                const g = f.geometry;
                if (!g) continue;
                if (g.type === "LineString") g.coordinates.forEach(c => bounds.extend(c));
                else if (g.type === "MultiLineString") g.coordinates.flat().forEach(c => bounds.extend(c));
            }
            if (!bounds.isEmpty()) {
                didFitRef.current = true;
                map.fitBounds(bounds, { padding: 60, duration: 900 });
            }
        } catch {}
    }, [map, fc, fitOnLoad]);


    
    // Local file loader
    const onFile = async (e) => {
        const file = e.target.files && e.target.files[0]
        if (!file) return
        try {
        const text = await file.text()
        const data = JSON.parse(text)
        //   setGeojson(data)
        const fc = data && data.type === "FeatureCollection" ? data : { type: "FeatureCollection", features: [data] }
        lastSentRef.current = fc
        if (onData) onData(fc)
        } catch (err) {
        console.error("Invalid GeoJSON file", err)
        alert("Invalid GeoJSON file")
        }
    }

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
    )
}
