"use client"

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react"
import { MapboxOverlay } from "@deck.gl/mapbox"
import { TripsLayer } from "@deck.gl/geo-layers"
import { GL } from "@luma.gl/constants"

const SUBTLE_BLUE = [195, 221, 253] // #60a5fa - lighter blue for better visibility

const TripsOverlay = forwardRef(function TripsOverlay({
  map,
  data,
  speed = 0.8, 
  trail = 24,
  lineWidth = 0.05,
  fps = 30,
  opacity = 0.55, // Much lower opacity for subtle animation
  loop = true,
  metersPerSecond = null,
}, ref) {
  const overlayRef = useRef(null)
  const rafRef = useRef(null)
  const t0 = useRef(0)
  const lastFrame = useRef(0)

  // Expose restart function via ref
  useImperativeHandle(ref, () => ({
    restart: () => {
      t0.current = performance.now()
      lastFrame.current = 0
    }
  }), [])

  useEffect(() => {
    if (!map || !data?.length) {
      return
    }

    const baseProps = {
      id: "trips",
      data,
      getPath: (d) => d.path,
      getTimestamps: (d) => d.timestamps,
      getColor: (d) => SUBTLE_BLUE, // Single color function for cleaner look
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

    // Animate with fps throttle
    t0.current = performance.now()
    lastFrame.current = 0
    const frameInterval = 1000 / fps

    const animate = () => {
      const now = performance.now()
      if (now - lastFrame.current >= frameInterval) {
        const elapsed = (now - t0.current) / 1000
        const period = 30 // Shorter period for faster cycling
        
        let currentTime
        if (loop) {
          currentTime = (elapsed * speed) % period
        } else {
          currentTime = elapsed * speed
        }

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
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (overlayRef.current) {
        map.removeControl(overlayRef.current)
        overlayRef.current = null
      }
    }
  }, [map, data, speed, trail, lineWidth, fps, opacity, loop])

  return null
})

export default TripsOverlay
