"use client"

import maplibregl from "maplibre-gl"
import { useEffect, useRef, useState } from "react"

// ===== Palette & knobs =====
const INK_BASE   = "#2323ff"  // main ink
const HILITE_A   = "#77e3b6"  // head start tint
const HILITE_B   = "#6aa9ff"  // head mid tint
const OUTLINE    = "#1e40af"  // deep blue outline

const CRAYON_WIDTH   = 3.1
const CRAYON_OPACITY = 0.65

export default function RouteLayer({
  map,
  url = "/assets/routes/route.geojson",
  sourceId = "saved-route",
  layerId = "saved-route-line",
  opacity = 0.5,
  onData,
  fitOnLoad = false,
}) {
  const [geojson, setGeojson] = useState(null)
  const lastSentRef = useRef(null)

  // load data
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

  useEffect(() => {
    if (!map || !geojson) return

    // normalize FC
    const fc =
      geojson.type === "FeatureCollection"
        ? geojson
        : { type: "FeatureCollection", features: [geojson] }

    // add source
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: fc, lineMetrics: true })
    } else {
      map.getSource(sourceId).setData(fc)
    }

    // outline
    const outlineId = `${layerId}-outline`
    if (!map.getLayer(outlineId)) {
      map.addLayer({
        id: outlineId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": OUTLINE,
          "line-width": CRAYON_WIDTH + 2.2,
          "line-opacity": 0.98 * opacity,
          "line-blur": 0.95,
        },
      })
    }

    // base ink
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": INK_BASE,
          "line-width": CRAYON_WIDTH,
          "line-opacity": CRAYON_OPACITY * opacity,
          "line-blur": 0.2,
        },
      })
    }

    // comet head (only ~20%)
    const headId = `${layerId}-head`
    if (!map.getLayer(headId)) {
      map.addLayer({
        id: headId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-gradient": [
            "interpolate", ["linear"], ["line-progress"],
            0.00, "rgba(119,227,182,1.0)",   
            0.02, "rgba(106,169,255,1.0)",   
            0.20, "rgba(106,169,255,0.6)",
            0.60, "rgba(106,169,255,0.0)",
            1.00, "rgba(106,169,255,0.0)",
          ],
          "line-width": CRAYON_WIDTH * 1.05 + 0.5,
          "line-opacity": 1.0,
          "line-blur": 0.95,
        },
      })
    }

    // optional fit
    if (fitOnLoad) {
      try {
        const bounds = new maplibregl.LngLatBounds()
        fc.features.forEach(f => {
          if (f.geometry?.type === "LineString") {
            f.geometry.coordinates.forEach(c => bounds.extend(c))
          } else if (f.geometry?.type === "MultiLineString") {
            f.geometry.coordinates.flat().forEach(c => bounds.extend(c))
          }
        })
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 })
      } catch {}
    }

    // cleanup
    return () => {
      ;[`${layerId}-head`, layerId, outlineId].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id)
      })
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }, [map, geojson, sourceId, layerId, opacity, fitOnLoad])

  // notify parent
  useEffect(() => {
    if (!geojson) return
    const fc =
      geojson.type === "FeatureCollection"
        ? geojson
        : { type: "FeatureCollection", features: [geojson] }
    if (lastSentRef.current !== fc) {
      lastSentRef.current = fc
      try { onData && onData(fc) } catch (e) { console.warn("onData threw:", e) }
    }
  }, [geojson, onData])

  // file loader
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      setGeojson(data)
      const fc =
        data.type === "FeatureCollection"
          ? data
          : { type: "FeatureCollection", features: [data] }
      lastSentRef.current = fc
      onData && onData(fc)
    } catch (err) {
      console.error("Invalid GeoJSON file", err)
      alert("Invalid GeoJSON file")
    }
  }

  return (
    <div style={{
      position: "absolute",
      bottom: 20,
      right: 20,
      zIndex: 2,
      background: "rgba(20,20,20,0.85)",
      color: "white",
      padding: 12,
      border: "1px solid #444",
      borderRadius: 8,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Render saved route</div>
      <input type="file" accept=".geojson,application/geo+json,application/json" onChange={onFile} />
    </div>
  )
}
