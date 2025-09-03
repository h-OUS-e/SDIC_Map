"use client"

import { useSmoothRoute } from "@/hooks/useSmoothRoute"
import maplibregl from "maplibre-gl"
import { useEffect, useMemo, useRef, useState } from "react"

// Colors
const LIGHT_BLUE = "#60a5fa"
const MEDIUM_BLUE = "#3b82f6"
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
const CRAYON_WIDTH = 5.1
const CRAYON_OPACITY = .6
const START_COLOR = NEON_GREEN;
const MID_COLOR = "#235382";
const END_COLOR = NEON_BLUE;
const head_t = 10;
const tail_t = 10;
const inner_head_t = 1000;
const inner_tail_t = 1000;

const showVertices = false;
const showGradientVertices = false;

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

function computeStopsForGeometry(geom, {
    // outer "manual" head/tail -> t1, t5
    headMeters = 500,
    tailMeters = 500,

    // inner "manual" head/tail -> t2, t4
    innerHeadMeters = 1000,
    innerTailMeters = 1000,

    // minimum normalized gap between neighboring stops
    minGapT = 1e-4,
} = {}) {

    const total = totalLengthMeters(geom) || 0;
    const t0 = 0, t6 = 1;

    // Degenerate geometry: keep everything sane and ordered.
    if (!(total > 0)) {
        return {
            t0, t1: 0, t2: 0, t3: 0.5, t4: 1, t5: 1, t6,
            totalMeters: 0
        };
    }
    
    const clamp01 = v => Math.max(0, Math.min(1, v));

    // 1) Outer band (t1, t5) from head/tail ---
    let headT1 = clamp01(headMeters / total);
    let tailT1 = clamp01(tailMeters / total);

    // Ensure head+tail leave at least 2*minGapT of middle.
    const maxOuterBudget = Math.max(0, 1 - 2 * minGapT);
    const usedOuter = headT1 + tailT1;
    if (usedOuter > maxOuterBudget) {
        const s = maxOuterBudget / usedOuter;
        headT1 *= s;
        tailT1 *= s;
    }

    let t1 = headT1;
    let t5 = 1 - tailT1;

    // If t1/t5 still collide, pinch them to a tiny valid band around their midpoint.
    if (t5 <= t1 + 2 * minGapT) {
        const mid = (t1 + t5) / 2;
        t1 = clamp01(mid - minGapT);
        t5 = clamp01(mid + minGapT);
    }

    // 2) Inner band (t2, t4) from inner head/tail, then fit inside (t1, t5) ---
    let headT2 = clamp01(innerHeadMeters / total);
    let tailT2 = clamp01(innerTailMeters / total);

    // Available normalized budget for (head2 + tail2) inside [t1, t5] after reserving min gaps around t2/t4.
    const innerWindow = t5 - t1;
    const maxInnerBudget = Math.max(0, innerWindow - 2 * minGapT);

    const usedInner = headT2 + tailT2;
    if (usedInner > maxInnerBudget) {
        // Scale inner head/tail proportionally to fit the available window.
        const s = maxInnerBudget / (usedInner || 1);
        headT2 *= s;
        tailT2 *= s;
    }

    // Place t2, t4 from global 0/1 but clamp to [t1+minGapT, t5-minGapT]
    let t2 = Math.max(t1 + minGapT, headT2);
    let t4 = Math.min(t5 - minGapT, 1 - tailT2);

    // If they still collide or invert, center them within (t1, t5) with min gap.
    if (t4 <= t2 + 2 * minGapT) {
        const mid = (t1 + t5) / 2;
        t2 = Math.max(t1 + minGapT, mid - minGapT);
        t4 = Math.min(t5 - minGapT, mid + minGapT);
    }

    // 3) Midpoint ---
    const t3 = (t2 + t4) / 2;

    return {
        t0, t1, t2, t3, t4, t5, t6,
        totalMeters: total
    };

}


/** Linear interpolate between two [lon,lat] coords */
function lerpCoord(a, b, t) {
  const [ax, ay] = a, [bx, by] = b;
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/** Coordinate at distance (m) along a LineString coordinate array */
function coordAtDistanceOnLine(coords, distM) {
  if (!coords?.length) return null;
  if (distM <= 0) return coords[0];
  let run = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const seg = haversineMeters(coords[i], coords[i+1]);
    if (run + seg >= distM) {
      const t = seg > 0 ? (distM - run) / seg : 0;
      return lerpCoord(coords[i], coords[i+1], t);
    }
    run += seg;
  }
  return coords[coords.length - 1];
}

/** Coordinate at global fraction t ∈ [0,1] along a LineString or MultiLineString */
function coordAtT(geom, t) {
  if (!geom) return null;
  const total = totalLengthMeters(geom);
  if (!(total > 0)) return null;
  const dist = Math.max(0, Math.min(1, t)) * total;

  if (geom.type === "LineString") {
    return coordAtDistanceOnLine(geom.coordinates, dist);
  } else if (geom.type === "MultiLineString") {
    let acc = 0;
    for (const part of geom.coordinates || []) {
      const len = (cumulativeMeters(part).at(-1) || 0);
      if (acc + len >= dist) {
        const within = dist - acc;
        return coordAtDistanceOnLine(part, within);
      }
      acc += len;
    }
    const last = geom.coordinates?.[geom.coordinates.length - 1];
    return last?.[last.length - 1] || null;
  }
  return null;
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
    routeImportance = "medium",
    showSmoothed = false,
}) {

    // React state holding the loaded route GeoJSON (Feature/FeatureCollection).
    // const [geojson, setGeojson] = useState(null)
    const lastSentRef = useRef(null)
    const featureLayerIdsRef = useRef([]);

    const { data: smoothed, original: original} = useSmoothRoute({
        url,
        options: {
            simplifyToleranceMeters: 4, // adjust 1–5m
            deflectionThresholdDeg: 20, // what counts as “sharp”
            filletFraction: .4, // how rounded the corner feels (0.15–0.3 feels natural)
            densifySegments: 0,
            spline: false,
            resampleSpacingMeters: 9 // spacing of points in final output
        },
    })


    // Load routes json from URL input
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

    // 0) Get lines decorated with t1,t2,t3 stops for gradient rendering
    // Build a cloned FC that carries per-feature stops
    const fcIndexed = useMemo(() => {
        if (!fc) return null;
        return {
            type: "FeatureCollection",
            features: (fc.features || []).map((feat, i) => ({
            ...feat,
            id: i, // give it a real Feature.id
            properties: { ...(feat.properties || {}), __idx: i },
            })),
        };
    }, [fc]);

    const { origin, endpoints } = useMemo(() => {
        if (!fcIndexed) return { origin: null, endpoints: [] };
        let originPt = null;
        const ends = [];

        for (const feat of fcIndexed.features || []) {
            const g = feat.geometry;
            if (!g) continue;
            const start = coordAtT(g, 0); // uses your helper
            const end   = coordAtT(g, 1);

            if (!originPt && start) originPt = start;
            if (end) ends.push(end);
        }
        return { origin: originPt, endpoints: ends };
    }, [fcIndexed]);
    
    
    // 1) Source (route geojson)
    useEffect(() => {
        if (!map || !fcIndexed) return;
        upsertGeoJSONSource(map, sourceId, fcIndexed, true); // lineMetrics for gradient
    }, [map, fcIndexed, sourceId]);

    
    // 2) Line layers (main + outline)
    useEffect(() => {
        if (!map || !fcIndexed) return;

        // Clean up any previously created per-feature layers
        // clear previously created layers
        featureLayerIdsRef.current.forEach(id => map.getLayer(id) && map.removeLayer(id));
        featureLayerIdsRef.current = [];

        (fcIndexed.features || []).forEach((feat, i) => {
            // Compute per-feature stops
            const { t1, t2, t3, t4, t5 } = computeStopsForGeometry(feat.geometry, {
                headMeters: head_t,
                tailMeters: tail_t,
                innerHeadMeters: inner_head_t,
                innerTailMeters: inner_tail_t,
                minGapT: 1e-3,
            });

            const id = `${layerId}-${i}`;

            // Build a gradient that uses only LITERAL stop positions
            const lineGradient = [
                "interpolate", ["linear"], ["line-progress"],
                0.0,   START_COLOR,
                t1,  START_COLOR,
                t2,  MID_COLOR,
                t3,  MID_COLOR,
                t4,  MID_COLOR,
                t5,  END_COLOR,
                1,   END_COLOR,
            ] ;

            // Add the layer, filtered to just this feature.id
            map.addLayer({
                id,
                type: "line",
                source: sourceId,
                layout: { "line-cap": "round", "line-join": "round" },
                paint: {
                    "line-gradient": lineGradient,
                    "line-width": CRAYON_WIDTH / 2,
                    "line-opacity": CRAYON_OPACITY ,
                    "line-blur": 0.5,
                },
                // draw only the parts that belong to this original feature (route)
                filter: ["==", ["id"], i],
            });

            featureLayerIdsRef.current.push(id);           
        });


        // cleanup for these two layers on id changes/unmount
        return () => {
            featureLayerIdsRef.current.forEach(id => map.getLayer(id) && map.removeLayer(id));
            featureLayerIdsRef.current = [];
        };
    }, [map, fc, fcIndexed, sourceId, layerId, opacity, routeImportance]);


    // 3a) Origin & endpoint points
    useEffect(() => {
        if (!map || !fcIndexed) return;

        const pointSrc = `${sourceId}-origin-point`;
        const endSrc   = `${sourceId}-endpoint-point`;

        if (origin) {
            const pointFC = {
                type: "FeatureCollection",
                features: [{ type: "Feature", geometry: { type: "Point", coordinates: origin }, properties: {} }],
            };
            upsertGeoJSONSource(map, pointSrc, pointFC);
            const baseZoomRadius = (k) => [
                "interpolate", ["linear"], ["zoom"],
                8,  20 * k,
                12, 65 * k,
                16, 65 * k
            ];
            const ks = [1.0, .6, , .3, .2, .1];
            ks.forEach((k, i) => {
                ensurePointLayer(map, `${layerId}-origin-glow${i+1}`, pointSrc, {
                    "circle-color": START_COLOR,
                    "circle-radius": baseZoomRadius(k),   // <-- stays top-level interpolate
                    "circle-opacity": i === 0 ? 0.1 : 0.15,
                    "circle-blur": i === 0 ? 0.5 : 0.25,
                });
            });
        }

        if (endpoints.length) {
            const endpointFC = {
                type: "FeatureCollection",
                features: endpoints.map((c, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { endpointIndex: i } })),
            };
            upsertGeoJSONSource(map, endSrc, endpointFC);
            const baseZoomRadius = (k) => [
                "interpolate", ["linear"], ["zoom"],
                10,  15 * k,
                12, 20 * k,
                16, 65 * k
            ];
            const ks = [1.0, .3, .2, .1];
            ks.forEach((k, i) => {
                ensurePointLayer(map, `${layerId}-endpoint-glow${i+1}`, endSrc, {
                    "circle-color": END_COLOR,
                    "circle-radius": baseZoomRadius(k),   // <-- stays top-level interpolate
                    "circle-opacity": i === 0 ? 0.1 : 0.2,
                    "circle-blur": i === 0 ? 0.5 : 0.25,
                });
            });
        }

        return () => {
            const ids = [
                `${layerId}-origin-glow1`,
                `${layerId}-origin-glow2`,
                `${layerId}-origin-glow3`,
                `${layerId}-origin-glow4`,
                `${layerId}-origin-glow5`,
                `${layerId}-origin-glow6`,
                `${layerId}-endpoint-glow1`,
                `${layerId}-endpoint-glow2`,
                `${layerId}-endpoint-glow3`,
                `${layerId}-endpoint-glow4`,
                `${layerId}-endpoint-glow5`,
                `${layerId}-endpoint-glow6`,
            ];
            ids.forEach(id => { if (map.getLayer(id)) map.removeLayer(id) });
            if (map.getSource(pointSrc)) map.removeSource(pointSrc);
            if (map.getSource(endSrc))   map.removeSource(endSrc);
        };
    }, [map, fcIndexed, origin, endpoints, sourceId, layerId]);


    // 3b) Show vertices as points (FOR DEBUGGING)
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


    // 3c) Visualizing points where gradient changes (for debugging only)
    useEffect(() => {
        if (!map || !fcIndexed || !showGradientVertices) return;

        const stopSrcId   = `${sourceId}-stops`;
        const stopCoreId  = `${layerId}-stops-core`;
        const stopLabelId = `${layerId}-stops-labels`;

        // Build points: t1,t2,t3 for each feature using your existing computeStopsForGeometry
        const features = [];
        (fcIndexed.features || []).forEach((feat, i) => {
            const { t0, t1, t2, t3, t4, t5, t6 } = computeStopsForGeometry(feat.geometry, {
                headMeters: head_t,
                tailMeters: tail_t,
                innerHeadMeters: inner_head_t,
                innerTailMeters: inner_tail_t,
                minGapT: 1e-3,
            });

            const addStop = (label, t) => {
                const coord = coordAtT(feat.geometry, t);
                if (!coord) return;
                features.push({
                    type: "Feature",
                    geometry: { type: "Point", coordinates: coord },
                    properties: { label, t, routeIndex: i },
                });
            };
            addStop("t0", t0);
            addStop("t1", t1);
            addStop("t2", t2);
            addStop("t3", t3);
            addStop("t4", t4);
            addStop("t5", t5);
            addStop("t6", t6);
        });

        const stopsFC = { type: "FeatureCollection", features };
        upsertGeoJSONSource(map, stopSrcId, stopsFC);

        // Nice, crisp points
        ensurePointLayer(map, stopCoreId, stopSrcId, {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 3, 20, 7],
            "circle-color": [
            "match", ["get", "label"],
            "t0", START_COLOR,
            "t1", START_COLOR,
            "t2", MID_COLOR,
            "t3", MID_COLOR,
            "t4", MID_COLOR,
            "t5", END_COLOR,
            "t6", END_COLOR,

            /* default */ "#000000"
            ],
            "circle-stroke-color": "#000000",
            "circle-stroke-width": 0.75,
            "circle-opacity": 0.95,
        });

        // Optional: labels right next to the dots
        if (!map.getLayer(stopLabelId)) {
            map.addLayer({
            id: stopLabelId,
            type: "symbol",
            source: stopSrcId,
            layout: {
                "text-field": ["get", "label"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 8, 8, 16, 12],
                "text-offset": [0.3, .3],
                "text-anchor": "top",
            },
            paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#000000",
                "text-halo-width": 0.8,
                "text-opacity": 0.9,
            },
            });
        }

        return () => {
            [stopLabelId, stopCoreId].forEach(id => map.getLayer(id) && map.removeLayer(id));
            map.getSource(stopSrcId) && map.removeSource(stopSrcId);
        };
    }, [map, fcIndexed, sourceId, layerId]);
    
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
