"use client"

import maplibregl from "maplibre-gl"
import { useEffect, useRef, useState } from "react"

// ---------- Look & Feel (refined gradient colors from reference image) ----------
const LIGHT_BLUE = "#60a5fa" // Bright electric blue (start color)
const MEDIUM_BLUE = "#3b82f6" // Medium electric blue
const DARK_BLUE = "#1e40af" // Deep blue (end color)
const ACCENT_BLUE = "#1e3a8a" // Navy blue (darkest end)

const CRAYON_WIDTH = 2.5 // Thinner lines
const CRAYON_OPACITY = 0.65 // Reduced opacity

// ---------------------------------------------

export default function RouteLayer({
  map,
  url,
  sourceId = "saved-route",
  layerId = "saved-route-line", // will also create -origin-dot
  opacity = 1.0,
  onData,
  fitOnLoad = false,
  routeImportance = "medium", // "low", "medium", "high", "very-high"
}) {
  const [geojson, setGeojson] = useState(null)
  const lastSentRef = useRef(null)

  // Load from URL if provided
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

    const processedFC = {
      ...fc,
      features: fc.features.map((feature, index) => {
        if (feature.geometry?.type === "LineString") {
          return {
            ...feature,
            properties: {
              ...feature.properties,
              // Add gradient property for line-gradient paint
              gradient: 1,
              hasFillets: Math.random() > 0.5, // 50% chance for fillets
              routeIndex: index,
            },
          }
        }
        return feature
      }),
    }

    // --- add/update LINE source ---
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
          "line-miter-limit": 8,
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
          "line-width": lineStyle.width,
          "line-opacity": lineStyle.opacity * opacity,
        },
      })

      const canvas = map.getCanvas()
      const layerElements = canvas.parentElement?.querySelectorAll(`[data-layer-id="${layerId}"]`)
      layerElements?.forEach((element) => {
        element.style.filter = "url(#crayon-noise)"
      })
    }

    // --- OUTLINE effect ---
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
            "line-width": CRAYON_WIDTH + 2.5,
            "line-opacity": CRAYON_OPACITY * opacity * 0.4,
          },
        },
        layerId,
      ) // Place outline behind main line
    }

    // --- ORIGIN marker: glowy blue circle ---
    const origin = (() => {
      const feat = (fc.features || []).find((x) => x.geometry && x.geometry.type === "LineString")
      const c = feat && feat.geometry && feat.geometry.coordinates && feat.geometry.coordinates[0]
      return Array.isArray(c) && c.length >= 2 ? c : null
    })()

    // --- ENDPOINT marker: glowy blue circle ---
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
            "circle-radius": 12, // Increased from 8
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
            "circle-color": LIGHT_BLUE, // Changed from MEDIUM_BLUE to LIGHT_BLUE
            "circle-radius": 7, // Increased from 5
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
            "circle-color": LIGHT_BLUE, // Changed from ACCENT_BLUE to LIGHT_BLUE
            "circle-radius": 4, // Increased from 3
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
            "circle-color": ACCENT_BLUE, // Changed from LIGHT_BLUE to ACCENT_BLUE
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              1, // At zoom 8, radius is 1px
              10,
              2, // At zoom 10, radius is 2px
              12,
              6, // At zoom 12, radius is 6px
              16,
              12, // At zoom 16, radius is 12px
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
            "circle-color": ACCENT_BLUE, // Changed from MEDIUM_BLUE to ACCENT_BLUE
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.8, // At zoom 8, radius is 0.8px
              10,
              1.5, // At zoom 10, radius is 1.5px
              12,
              4, // At zoom 12, radius is 4px
              16,
              8, // At zoom 16, radius is 8px
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
              8,
              0.5, // At zoom 8, radius is 0.5px
              10,
              1, // At zoom 10, radius is 1px
              12,
              2.5, // At zoom 12, radius is 2.5px
              16,
              5, // At zoom 16, radius is 5px
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
