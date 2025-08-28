"use client"

import maplibregl from "maplibre-gl"
import { useEffect, useRef, useState } from "react"


const LIGHT_BLUE = "#60a5fa" // Bright electric blue (start color)
const MEDIUM_BLUE = "#3b82f6" // Medium electric blue
const DARK_BLUE = "#1e40af" // Deep blue (end color)
const ACCENT_BLUE = "#1e3a8a" // Navy blue (darkest end)

const CRAYON_WIDTH = 3.5 
const CRAYON_OPACITY = 0.65


export default function RouteLayer({
  map,
  url = '/assets/routes/route.geojson',
  sourceId = "saved-route",
  layerId = "saved-route-line", //origin line?
  opacity = 1.0,
  onData, //callback to notify after reloading the data
  fitOnLoad = false, //whether we want to autozoom the route once awe load it
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
    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    if (!map) return

    // Create SVG filter for crayon texture
    //doesnt change anything bs maplibre drawa to canvas not dom elements per layer. this filter is not affecting the gl dom layer
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
    `

    // Add SVG to map container
    const mapContainer = map.getContainer()
    let svgElement = mapContainer.querySelector("#crayon-svg-filter")
    if (!svgElement) {
      svgElement = document.createElement("div")
      svgElement.id = "crayon-svg-filter"
      svgElement.innerHTML = svgFilter
      mapContainer.appendChild(svgElement)
    }

    return () => {
      const element = mapContainer.querySelector("#crayon-svg-filter")
      if (element) element.remove()
    }
  }, [map])

  // Add/update MapLibre sources & layers
  useEffect(() => {
    if (!map || !geojson) return

    // Ensure FeatureCollection
    const fc = geojson.type === "FeatureCollection" ? geojson : { type: "FeatureCollection", features: [geojson] }


//FREWUENCY ANNOTATION 
//     Two identical polylines (even if one is reversed) should be considered “the same” segment.
    const round = (n, p = 6) => Math.round(n * 10 ** p) / 10 ** p

    const normLine = (coords) => {
      const cleaned = []
      let prev = null
      for (const c of coords || []) {
        const rc = [round(c[0]), round(c[1])]
        if (!prev || rc[0] !== prev[0] || rc[1] !== prev[1]) cleaned.push(rc)
        prev = rc
      }
      if (cleaned.length < 2) return cleaned.concat(cleaned)
      const f = cleaned.map((c) => `${c[0]},${c[1]}`).join("|")
      const b = [...cleaned].reverse().map((c) => `${c[0]},${c[1]}`).join("|")
      return f < b ? f : b // direction-agnostic
    }

    const normMulti = (multi) => {
      const parts = (multi || []).map((p) => normLine(p)).filter(Boolean)
      return parts.sort().join("||")
    }

    const geomKey = (geom) => {
      if (!geom) return "NONE"
      if (geom.type === "LineString") return "L:" + normLine(geom.coordinates)
      if (geom.type === "MultiLineString") return "ML:" + normMulti(geom.coordinates)
      return "O:" + JSON.stringify(geom.coordinates)
    }

    // Count identical geometries
    const freqMap = new Map()
    for (const feat of fc.features || []) {
      const k = geomKey(feat.geometry)
      freqMap.set(k, (freqMap.get(k) || 0) + 1)
    }

 // we count duplicates and style them
    const processedFC = {
      ...fc,
      features: (fc.features || []).map((feature, index) => {
        const k = geomKey(feature.geometry)
        const freq = freqMap.get(k) || 1
        if (feature.geometry?.type === "LineString" || feature.geometry?.type === "MultiLineString") {
          return {
            ...feature,
            properties: {
              ...feature.properties,
              gradient: 2,
              hasFillets: Math.random() > 0.7, // 70% chance for fillets
              routeIndex: index,
              freq, 
            },
          }
        }
        return feature
      }),
    }


    //add/update LINE source 
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: processedFC,
        lineMetrics: true, // Enable line metrics for gradient support
      })
    } else {
      const src = map.getSource(sourceId)
      if (src && src.setData) src.setData(processedFC)
    }

    // Determine line style based on route importance
    const getLineStyle = (importance) => {
      switch (importance) {
        case "very-high":
          return { width: CRAYON_WIDTH, color: MEDIUM_BLUE, opacity: CRAYON_OPACITY }
        case "high":
          return { width: CRAYON_WIDTH, color: MEDIUM_BLUE, opacity: CRAYON_OPACITY }
        case "medium":
          return { width: CRAYON_WIDTH, color: MEDIUM_BLUE, opacity: CRAYON_OPACITY }
        case "low":
        default:
          return { width: CRAYON_WIDTH, color: MEDIUM_BLUE, opacity: CRAYON_OPACITY }
      }
    }

    const lineStyle = getLineStyle(routeImportance)

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
            "round", // Rounded joins for fillet effect
            "miter", // Sharp joins for non-fillet routes
          ],
          "line-miter-limit": 2,
        },
        paint: {
          "line-gradient": [
            "interpolate",
            ["linear"],
            ["line-progress"],
            0,
            LIGHT_BLUE, // Start with light blue
            0.5,
            MEDIUM_BLUE, // Middle with medium blue
            1,
            ACCENT_BLUE, // End with dark navy blue
          ],
          //  thickness scales with frequency (sqrt curve; min 1×)
          "line-width": [
            "*",
            lineStyle.width,
            ["max", 0.2, ["^", ["coalesce", ["get", "freq"], 1], 0.1]],
          ],
          // Slightly increase opacity with frequency
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "freq"], 1],
            1, lineStyle.opacity * opacity * 0.95,
            3, lineStyle.opacity * opacity * 0.9,
            6, lineStyle.opacity * opacity,
            10, Math.min(1, lineStyle.opacity * opacity * 1.05),
          ],
        },
      })

      const canvas = map.getCanvas()
      const layerElements = canvas.parentElement?.querySelectorAll(`[data-layer-id="${layerId}"]`)
      layerElements?.forEach((element) => {
        element.style.filter = "url(#crayon-noise)"
      })
    }

    // outline effect
    const outlineLayerId = `${layerId}-outline`
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
            "line-gradient": [
              "interpolate",
              ["linear"],
              ["line-progress"],
              0,
              MEDIUM_BLUE, // Start with medium blue
              1,
              DARK_BLUE, // End with dark blue
            ],
            // outline also scales with FREQUENCY 
            "line-width": [
              "*",
              CRAYON_WIDTH + 2.5,
              ["max", 1, ["^", ["coalesce", ["get", "freq"], 1], 0.5]],
            ],
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "freq"], 1],
              1, CRAYON_OPACITY * opacity * 0.25,
              3, CRAYON_OPACITY * opacity * 0.32,
              6, CRAYON_OPACITY * opacity * 0.4,
            ],
          },
        },
        layerId,
      ) // Place outline behind main line
    }

    //ORIGIN marker: glowy blue circle
    const origin = (() => {
      const feat = (fc.features || []).find((x) => x.geometry && x.geometry.type === "LineString")
      const c = feat && feat.geometry && feat.geometry.coordinates && feat.geometry.coordinates[0]
      return Array.isArray(c) && c.length >= 2 ? c : null
    })()

    // ENDPOINT marker: glowy blue circle
    const endpoints = (() => {
      const lineFeatures = (fc.features || []).filter((x) => x.geometry && x.geometry.type === "LineString")
      return lineFeatures
        .map((feat) => {
          const coords = feat.geometry.coordinates
          return coords[coords.length - 1]
        })
        .filter((c) => Array.isArray(c) && c.length >= 2)
    })()

    const pointSourceId = `${sourceId}-origin-point`
    const endpointSourceId = `${sourceId}-endpoint-point`

    if (origin) {
      const pointFC = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: origin },
            properties: {},
          },
        ],
      }

      if (!map.getSource(pointSourceId)) {
        map.addSource(pointSourceId, { type: "geojson", data: pointFC })
      } else {
        const ps = map.getSource(pointSourceId)
        if (ps && ps.setData) ps.setData(pointFC)
      }

      // Outer glow layer
      if (!map.getLayer(`${layerId}-origin-glow-outer`)) {
        map.addLayer({
          id: `${layerId}-origin-glow-outer`,
          type: "circle",
          source: pointSourceId,
          paint: {
            "circle-color": LIGHT_BLUE,
            "circle-radius": 16, 
            "circle-opacity": 0.15,
          },
        })
      }

      // Middle glow layer
      if (!map.getLayer(`${layerId}-origin-glow-middle`)) {
        map.addLayer({
          id: `${layerId}-origin-glow-middle`,
          type: "circle",
          source: pointSourceId,
          paint: {
            "circle-color": LIGHT_BLUE, 
            "circle-radius": 12, 
            "circle-opacity": 0.3,
          },
        })
      }

      // Core circle
      if (!map.getLayer(`${layerId}-origin-dot`)) {
        map.addLayer({
          id: `${layerId}-origin-dot`,
          type: "circle",
          source: pointSourceId,
          paint: {
            "circle-color": LIGHT_BLUE, 
            "circle-radius": 4, 
            "circle-opacity": 0.9,
          },
        })
      }
    }

    if (endpoints.length > 0) {
      const endpointFC = {
        type: "FeatureCollection",
        features: endpoints.map((coords, index) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: coords },
          properties: { endpointIndex: index },
        })),
      }

      if (!map.getSource(endpointSourceId)) {
        map.addSource(endpointSourceId, { type: "geojson", data: endpointFC })
      } else {
        const ps = map.getSource(endpointSourceId)
        if (ps && ps.setData) ps.setData(endpointFC)
      }

      // Outer glow layer for endpoint
      if (!map.getLayer(`${layerId}-endpoint-glow-outer`)) {
        map.addLayer({
          id: `${layerId}-endpoint-glow-outer`,
          type: "circle",
          source: endpointSourceId,
          paint: {
            "circle-color": ACCENT_BLUE, 
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8, 1,
              10, 2,
              12, 6,
              16, 8,
            ],
            "circle-opacity": 0.15,
          },
        })
      }

      // Middle glow layer for endpoint
      if (!map.getLayer(`${layerId}-endpoint-glow-middle`)) {
        map.addLayer({
          id: `${layerId}-endpoint-glow-middle`,
          type: "circle",
          source: endpointSourceId,
          paint: {
            "circle-color": ACCENT_BLUE,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8, 0.8,
              10, 1.5,
              12, 4,
              16, 8,
            ],
            "circle-opacity": 0.3,
          },
        })
      }

      // Core circle for endpoint
      if (!map.getLayer(`${layerId}-endpoint-dot`)) {
        map.addLayer({
          id: `${layerId}-endpoint-dot`,
          type: "circle",
          source: endpointSourceId,
          paint: {
            "circle-color": ACCENT_BLUE, // Already correct dark blue
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8, 0.5,
              10, 1,
              12, 2.5,
              16, 5,
            ],
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
          if (f.geometry?.type === "LineString") {
            f.geometry.coordinates.forEach((c) => bounds.extend(c))
          } else if (f.geometry?.type === "MultiLineString") {
            f.geometry.coordinates.flat().forEach((c) => bounds.extend(c))
          }
        })
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 })
      } catch (e) {
        // ignore
      }
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
        layerId,
        outlineLayerId,
      ].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id)
      })
      // remove sources
      if (map.getSource(endpointSourceId)) map.removeSource(endpointSourceId)
      if (map.getSource(`${sourceId}-origin-point`)) map.removeSource(`${sourceId}-origin-point`)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }, [map, geojson, sourceId, layerId, opacity, fitOnLoad, routeImportance])

  // Notify parent once per dataset change
  useEffect(() => {
    if (!geojson) return
    const fc = geojson.type === "FeatureCollection" ? geojson : { type: "FeatureCollection", features: [geojson] }
    if (lastSentRef.current !== fc) {
      lastSentRef.current = fc
      try {
        onData && onData(fc)
      } catch (e) {
        console.warn("onData threw:", e)
      }
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
