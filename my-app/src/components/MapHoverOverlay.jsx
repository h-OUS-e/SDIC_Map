// MapHoverOverlay.jsx
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Props:
 *  - map: maplibregl.Map (required)
 *  - layers: string[]      -> layer IDs to listen on (required)
 *  - offset?: {x:number,y:number} tooltip offset from cursor (default {x:12,y:12})
 *  - render?: (feature: any) => React.ReactNode  -> custom content; gets the topmost hovered feature
 *  - className?: string     -> optional class for the tooltip box
 */
export default function MapHoverOverlay({
    map,
    layers,
    offset = { x: 12, y: 12 },
    render,
    className = ""
}) {
    const [container, setContainer] = useState(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [feat, setFeat] = useState(null);
    const cleanupFnsRef = useRef([]);

  // simple default content
  const defaultRender = (f) => {
    if (!f) return null;
    const c = f.geometry?.coordinates;
    const [lng, lat] = Array.isArray(c) ? c : []
    return (
      <div
        style={{
          font: "500 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          color: "white",
        }}
      >
        {Object.entries(f.properties || {}).map(([k, v]) => (
          <div key={k} style={{ margin: "2px 0" }}>
            <strong>{k}:</strong> {String(v)}
          </div>
        ))}
        {!Object.keys(f?.properties || {}).length && lng != null && lat != null && (
          <div>
            <strong>Coords:</strong> {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
        )}
      </div>
    )
  }

  useEffect(() => {
    if (!map) return;
    setContainer(map.getContainer());
}, [map]);


    // attach listeners to each target layer
    useEffect(() => {
        if (!map || !layers?.length) return;

        // make sure previous handlers are removed if props change
        cleanupFnsRef.current.forEach((fn) => fn?.());
        cleanupFnsRef.current = [];

    const onMove = (e) => {
      // point in pixel space
      setPos({ x: e.point.x, y: e.point.y })

            // find topmost feature among our layers at pointer
            const hits = map.queryRenderedFeatures(e.point, { layers });
            setFeat(hits?.[0] || null);
        };
        const onLeave = () => setFeat(null);
        const onEnter = () => map.getCanvas().style.cursor = "pointer";
        const onExit = () => map.getCanvas().style.cursor = "";

        // We’ll bind to each layer so leave/enter is reliable.
        for (const lid of layers) {
            // Guards: layer may not exist immediately
            if (!map.getLayer(lid)) continue;
            map.on("mousemove", lid, onMove);
            map.on("mouseenter", lid, onEnter);
            map.on("mouseleave", lid, () => { onExit(); onLeave(); });

            // store cleanup
            cleanupFnsRef.current.push(() => {
                try { map.off("mousemove", lid, onMove); } catch {}
                try { map.off("mouseenter", lid, onEnter); } catch {}
                try { map.off("mouseleave", lid, onLeave); } catch {}
            });
        }

        // global cleanup when component unmounts or layers change
        return () => {
            cleanupFnsRef.current.forEach((fn) => fn?.());
            cleanupFnsRef.current = [];
            try { map.getCanvas().style.cursor = ""; } catch {}
        };
    }, [map, layers]);

  // Don’t render if not hovering or container unknown
  if (!container || !feat) return null

  // Keep tooltip inside map bounds a bit
    // Keep tooltip inside map bounds a bit
    const rect = container.getBoundingClientRect();
    const left = Math.min(Math.max(pos.x + offset.x, 0), rect.width - 10);
    const top  = Math.min(Math.max(pos.y + offset.y, 0), rect.height - 10);
    
  return createPortal(
    <div
      className={className}
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(0, 0)",
        pointerEvents: "none",
        zIndex: 3,
        background: `
                    radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3), transparent 50%),
                    radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.15), transparent 50%),
                    radial-gradient(circle at 40% 40%, rgba(120, 119, 198, 0.15), transparent 50%),
                    url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E"),
                    rgba(255, 255, 255, 0.1)
                `,
        backdropFilter: "blur(16px) saturate(180%)",
        WebkitBackdropFilter: "blur(16px) saturate(180%)",
        color: "white",
        borderRadius: 16,
        padding: "12px 16px",
        boxShadow: `
                    0 8px 32px rgba(0, 0, 0, 0.12),
                    0 2px 8px rgba(0, 0, 0, 0.08),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.05)
                `,
        border: "1px solid rgba(255, 255, 255, 0.2)",
        maxWidth: 280,
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        animation: "fadeInGlass 0.2s ease-out",
      }}
    >
      {render ? render(feat) : defaultRender(feat)}
      <style jsx>{`
                @keyframes fadeInGlass {
                    from {
                        opacity: 0;
                        transform: translateY(-4px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
    </div>,
    container,
  )
}
