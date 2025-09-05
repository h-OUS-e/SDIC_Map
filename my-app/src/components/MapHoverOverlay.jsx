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
        const [lng, lat] = Array.isArray(c) ? c : [];
        return (
            <div style={{ font: "500 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", color: "#111" }}>
                {Object.entries(f.properties || {}).map(([k, v]) => (
                <div key={k} style={{ margin: "2px 0" }}>
                    <strong>{k}:</strong> {String(v)}
                </div>
                ))}
                {!Object.keys(f?.properties || {}).length && (lng != null && lat != null) && (
                <div><strong>Coords:</strong> {lat.toFixed(5)}, {lng.toFixed(5)}</div>
                )}
            </div>
        );
    };

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
            setPos({ x: e.point.x, y: e.point.y });

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
    if (!container || !feat) return null;

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
                background: "white",
                color: "#111",
                borderRadius: 8,
                padding: "8px 10px",
                boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
                border: "1px solid rgba(0,0,0,0.08)",
                maxWidth: 280,
                // adapt to hi-dpi text
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale"
            }}
        >
            {render ? render(feat) : defaultRender(feat)}
        </div>,
        container
    );
}
