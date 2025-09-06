"use client"

import { useEffect, useRef } from "react"
import type maplibregl from "maplibre-gl"
import { MapboxOverlay } from "@deck.gl/mapbox"
import { TripsLayer } from "@deck.gl/geo-layers"
import type { TripDatum } from "../utils/prepareTrips"
import type { Color } from "@deck.gl/core"
import { GL } from "@luma.gl/constants"

type Props = {
  map: maplibregl.Map | null
  data: TripDatum[]
  speed?: number
  trail?: number
  lineWidth?: number
  fps?: number
  opacity?: number
}

const SUBTLE_BLUE: Color = [195, 221, 253] // #60a5fa - lighter blue for better visibility

export default function TripsOverlay({
  map,
  data,
  speed = 0.8,
  trail = 24,
  lineWidth = 0.05,
  fps = 30,
  opacity = 0.55, // Much lower opacity for subtle animation
}: Props) {
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const rafRef = useRef<number | null>(null)
  const t0 = useRef<number>(0)
  const lastFrame = useRef<number>(0)

  useEffect(() => {
    if (!map || !data?.length) {
      return
    }

    console.log("[v0] TripsOverlay: Starting animation with data", {
      dataLength: data.length,
      firstTrip: data[0],
      speed,
      trail,
      opacity,
    })

    const baseProps = {
      id: "trips",
      data,
      getPath: (d: TripDatum) => d.path,
      getTimestamps: (d: TripDatum) => d.timestamps,
      getColor: (d: TripDatum) => SUBTLE_BLUE, // Single color function for cleaner look
      widthMinPixels: lineWidth,
      widthMaxPixels: lineWidth + 0.3, // Minimal width variation
      rounded: true,
      fadeTrail: true,
      trailLength: trail,
      currentTime: 0,
      opacity,
      parameters: {
        blend: true,
        blendFunc: [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA], // Standard alpha blending instead of additive for subtlety
        blendEquation: GL.FUNC_ADD,
      },
    }

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [new TripsLayer(baseProps)],
    })
    map.addControl(overlay)
    overlayRef.current = overlay

    t0.current = performance.now()
    lastFrame.current = 0
    const frameInterval = 1000 / fps

    const loop = () => {
      const now = performance.now()
      if (now - lastFrame.current >= frameInterval) {
        const elapsed = (now - t0.current) / 1000
        const currentTime = elapsed * speed

        console.log("[v0] Animation frame:", { elapsed, currentTime, speed })

        overlay.setProps({
          layers: [
            new TripsLayer({
              ...baseProps,
              currentTime,
            }),
          ],
        })
        lastFrame.current = now
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (overlayRef.current) {
        map.removeControl(overlayRef.current)
        overlayRef.current = null
      }
    }
  }, [map, data, speed, trail, lineWidth, fps, opacity])

  return null
}
