"use client"

import maplibregl from "maplibre-gl"
import { useEffect, useRef, useState } from "react"

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

const CRAYON_WIDTH = 3.1
const CRAYON_OPACITY = 0.85

// distance helpers
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

function cumulativeMeters(coords) {
  const cum = [0]
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i-1] + haversineMeters(coords[i-1], coords[i]))
  }
  return cum
}

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


export default function RouteLayer({
  map,
  url = "/assets/routes/route.geojson",
  sourceId = "saved-route",
  layerId = "saved-route-line",
  opacity = 1.0,
  onData,
  fitOnLoad = false,
  routeImportance = "medium",
}) {
  const [geojson, setGeojson] = useState(null)
  const lastSentRef = useRef(null)

  // Load from URL
  useEffect(() => {
    let cancelled = false
    if (!url) return
    ;(async () => {
      try {
        const res = await fetch(url)
        const data = await res.json()
        if (!cancelled) setGeojson(data)
      } catch (e) {
        console.error("Failed to load route from URL", e)
      }
    })()
    return () => { cancelled = true }
  }, [url])

  // Add/update MapLibre sources & layers
  useEffect(() => {
    if (!map || !geojson) return

    // Ensure FeatureCollection
    const fc = geojson.type === "FeatureCollection" ? geojson : { type: "FeatureCollection", features: [geojson] }

    // compute gradient start 't' (where last 500 m begins) 
    // We’ll compute a single total length across all lines to position the tail.
    let grandTotal = 0
    for (const f of fc.features || []) grandTotal += totalLengthMeters(f.geometry)
    const TAIL_METERS = 500
    const startTailT = Math.max(0, Math.min(1, grandTotal > 0 ? 1 - TAIL_METERS / grandTotal : 1))

    // Extract origin & final endpoint from original features
    let firstPoint = null
    let lastPoint = null
    for (const feat of fc.features || []) {
      if (feat.geometry?.type === "LineString" && feat.geometry.coordinates?.length > 0) {
        if (!firstPoint) firstPoint = feat.geometry.coordinates[0]
        lastPoint = feat.geometry.coordinates[feat.geometry.coordinates.length - 1]
      } else if (feat.geometry?.type === "MultiLineString") {
        for (const part of feat.geometry.coordinates || []) {
          if (part.length > 0) {
            if (!firstPoint) firstPoint = part[0]
            lastPoint = part[part.length - 1]
          }
        }
      }
    }
    const origin = firstPoint && firstPoint.length >= 2 ? firstPoint : null
    const endpoints = lastPoint && lastPoint.length >= 2 ? [lastPoint] : []

    // add/update ONE source with lineMetrics enable
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: fc,
        lineMetrics: true, // REQUIRED for line-gradient + line-progress
      })
    } else {
      const src = map.getSource(sourceId)
      src?.setData?.(fc)
    }

    //  style by importance 
    const getLineStyle = (importance) => {
      switch (importance) {
        case "very-high":
        case "high":
        case "medium":
          return { width: CRAYON_WIDTH, opacity: CRAYON_OPACITY }
        case "low":
        default:
          return { width: CRAYON_WIDTH, opacity: CRAYON_OPACITY }
      }
    }
    const lineStyle = getLineStyle(routeImportance)

  
    // Gradient: SDIC blue → darker blue → teal → mint within last 500 m
    const START_COLOR = SDIC_BLUE          // "#3D64F6"
    const MID_COLOR_1 = "#253BE2"
    const MID_COLOR_2 = "#187775"
    const END_COLOR   = "#24DE8C"

    // Put all gradient stops in line-progress space.
    // keep a narrow pre-tail flat region to ensure a crisp start of the fade.
    const t0 = Math.max(0, startTailT - 0.001)
    const t1 = startTailT + (1 - startTailT) * 0.33
    const t2 = startTailT + (1 - startTailT) * 0.66
    const t3 = 1.0

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          // fallback color when gradient isn’t evaluated yet
          "line-color": START_COLOR,
          // smooth gradient across the single continuous path
          "line-gradient": [
            "interpolate", ["linear"], ["line-progress"],
            0.0, "#24DE8C",       // vivid green right at start
            0.05, "#187775",      // teal after 5% of route
            0.55, "#253BE2",      // dark blue 
            0.8,  "#ffffff",      // long stretch 
            // startTailT, "#3D64F6",
            startTailT, "#ffffff",
            t1, "#253BE2",
            t2, "#187775",
            1.0, "#24DE8C"
          ],
          "line-width": lineStyle.width / 2,
          "line-opacity": lineStyle.opacity * opacity,
          // slight blur removes dotty tile seams / joints
          "line-blur": 0.55
        },
      })
    }

    //outline and glow
    const outlineLayerId = `${layerId}-outline`
    if (!map.getLayer(outlineLayerId)) {
      map.addLayer(
        {
          id: outlineLayerId,
          type: "line",
          source: sourceId,
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": START_COLOR,
            "line-gradient": [
              "interpolate",
              ["linear"],
              ["line-progress"],
              0, START_COLOR,
              t0, START_COLOR,
              t1, MID_COLOR_1,
              t2, MID_COLOR_2,
              t3, END_COLOR
            ],
            "line-width": CRAYON_WIDTH + 1.0,
            "line-opacity": (CRAYON_OPACITY * opacity) * 0.55,
            "line-blur": 0.8
          },
        },
        layerId // insert beneath main line
      )
    }

    // origiin and endpoint dots
    const pointSourceId = `${sourceId}-origin-point`
    const endpointSourceId = `${sourceId}-endpoint-point`

    if (origin) {
      const pointFC = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: origin }, properties: {} }] }
      if (!map.getSource(pointSourceId)) map.addSource(pointSourceId, { type: "geojson", data: pointFC })
      else map.getSource(pointSourceId)?.setData(pointFC)

      if (!map.getLayer(`${layerId}-origin-glow-outer`)) {
        map.addLayer({ id: `${layerId}-origin-glow-outer`, type: "circle", source: pointSourceId, paint: { "circle-color": LIGHT_BLUE, "circle-radius": 10, "circle-opacity": 0.15 } })
      }
      if (!map.getLayer(`${layerId}-origin-glow-middle`)) {
        map.addLayer({ id: `${layerId}-origin-glow-middle`, type: "circle", source: pointSourceId, paint: { "circle-color": LIGHT_BLUE, "circle-radius": 8, "circle-opacity": 0.3 } })
      }
      if (!map.getLayer(`${layerId}-origin-dot`)) {
        map.addLayer({ id: `${layerId}-origin-dot`, type: "circle", source: pointSourceId, paint: { "circle-color": LIGHT_BLUE, "circle-radius": 4, "circle-opacity": 0.9 } })
      }
    }

    if (endpoints.length > 0) {
      const endpointFC = { type: "FeatureCollection", features: endpoints.map((c, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { endpointIndex: i } })) }
      if (!map.getSource(endpointSourceId)) map.addSource(endpointSourceId, { type: "geojson", data: endpointFC })
      else map.getSource(endpointSourceId)?.setData(endpointFC)

      if (!map.getLayer(`${layerId}-endpoint-glow-outer`)) {
        map.addLayer({
          id: `${layerId}-endpoint-glow-outer`,
          type: "circle",
          source: endpointSourceId,
          paint: {
            "circle-color": SDIC_BLUE,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1, 10, 2, 12, 6, 16, 8],
            "circle-opacity": 0.25,
          },
        })
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
        })
      }
      if (!map.getLayer(`${layerId}-endpoint-dot`)) {
        map.addLayer({
          id: `${layerId}-endpoint-dot`,
          type: "circle",
          source: endpointSourceId,
          paint: {
            "circle-color": SDIC_BLUE,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 10, 1, 12, 2.5, 16, 5],
            "circle-opacity": 0.9,
          },
        })
      }
    }

    // Optional fit to bounds
    if (fitOnLoad) {
      try {
        const features = fc.features || []
        const bounds = new maplibregl.LngLatBounds()
        features.forEach((f) => {
          if (f.geometry?.type === "LineString") f.geometry.coordinates.forEach((c) => bounds.extend(c))
          else if (f.geometry?.type === "MultiLineString") f.geometry.coordinates.flat().forEach((c) => bounds.extend(c))
        })
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 })
      } catch {}
    }

    // cleanup
    return () => {
      ;[
        `${layerId}-endpoint-dot`,
        `${layerId}-endpoint-glow-middle`,
        `${layerId}-endpoint-glow-outer`,
        `${layerId}-origin-dot`,
        `${layerId}-origin-glow-middle`,
        `${layerId}-origin-glow-outer`,
        outlineLayerId,
        layerId,
      ].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id) })
      if (map.getSource(`${sourceId}-origin-point`)) map.removeSource(`${sourceId}-origin-point`)
      if (map.getSource(`${sourceId}-endpoint-point`)) map.removeSource(`${sourceId}-endpoint-point`)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }, [map, geojson, sourceId, layerId, opacity, fitOnLoad, routeImportance])

  // Notify parent once per dataset change
  useEffect(() => {
    if (!geojson) return
    const fc = geojson.type === "FeatureCollection" ? geojson : { type: "FeatureCollection", features: [geojson] }
    if (lastSentRef.current !== fc) {
      lastSentRef.current = fc
      try { onData && onData(fc) } catch (e) { console.warn("onData threw:", e) }
    }
  }, [geojson, onData])

  // Local file loader
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      setGeojson(data)
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
