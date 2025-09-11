// MapHoverOverlay.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COLOR_MODES, hexToRGB, MONTH_PALETTE, TEAM_PALETTE } from './RouteLayer';

/**
     * Props:
     *  - map: maplibregl.Map (required)
     *  - layers: string[]      -> layer IDs to listen on (required)
     *  - offset?: {x:number,y:number} tooltip offset from cursor (default {x:12,y:12})
     *  - render?: (feature: any, index?: number, total?: number) => React.ReactNode
     *  - className?: string
     *  - stackFanOffset?: number   -> px offset per card when stacking (default 8)
     *  - stackMaxVisible?: number  -> cap number of visible cards in the fan (default 5)
*/
export default function MapHoverOverlay({
    map,
    layers,
    offset = { x: 12, y: 12 },
    render,
    className = "",
    stackFanOffset = -8,
    stackMaxVisible = 10,
}) {
    const [container, setContainer] = useState(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [feats, setFeats] = useState(null); // array or null
    const cleanupFnsRef = useRef([]);

    // Samsung font styles
    const samsungFontStyle = {
        fontFamily:
        "'SamsungSharpSans', 'SamsungOne', system-ui, -apple-system, sans-serif",
        fontWeight: 400,
        fontSize: "13px",
        lineHeight: "1.5",
        color: "rgba(255, 255, 255, 0.95)",
        letterSpacing: "0.01em",
    };

    // simple default content for a single card
    const defaultRender = (f) => {
        if (!f) return null;
        const c = f.geometry?.coordinates;
        const color = hexToRGB(MONTH_PALETTE[f.properties.month])
        console.log("TEST", color, f.properties.month)

        const [lng, lat] = Array.isArray(c) ? c : [];
        return (
            <div style={samsungFontStyle}>
                {Object.entries(f.properties || {}).map(([k, v]) => (
                    
                    <div
                        key={k}
                        style={{
                            margin: "4px 0",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <span
                        style={{
                            fontWeight: 600,
                            color: "rgba(255, 255, 255, 0.8)",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                        }}
                        >
                        {k}:
                        </span>
                        <span
                        style={{
                            color: "rgba(255, 255, 255, 0.95)",
                            fontWeight: 400,
                        }}
                        >
                        {String(v)}
                        </span>
                    </div>
                ))}
                {!Object.keys(f?.properties || {}).length && lng != null && lat != null && (
                    <div
                        style={{
                            margin: "4px 0",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                    <span
                        style={{
                            fontWeight: 600,
                            color: "rgba(255, 255, 255, 0.8)",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                        }}
                    >
                        Coords:
                    </span>
                    <span
                        style={{
                            color: "rgba(255, 255, 255, 0.95)",
                            fontWeight: 400,
                            fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', monospace",
                        }}
                    >
                        {lat.toFixed(5)}, {lng.toFixed(5)}
                    </span>
                    </div>
                )}
            </div>
        );
    };

    useEffect(() => {
        if (!map) return;
        setContainer(map.getContainer());
    }, [map]);

    // Get key for Point coords, rounded to avoid float noise
    const pointKey = (feature) => {
        if (!feature?.geometry) return null;
        if (feature.geometry.type !== "Point") return null;
        const [lng, lat] = feature.geometry.coordinates || [];
        if (typeof lng !== "number" || typeof lat !== "number") return null;
        const r = (n) => Math.round(n * 1e6) / 1e6; // 6 dp
        return `${r(lng)},${r(lat)}`;
    };

    // attach listeners to each target layer
    useEffect(() => {
        if (!map || !layers?.length) return;

        // clear previous
        cleanupFnsRef.current.forEach((fn) => fn?.());
        cleanupFnsRef.current = [];

        const onMove = (e) => {
        setPos({ x: e.point.x, y: e.point.y });

        const hits = map.queryRenderedFeatures(e.point, { layers }) || [];

        if (!hits.length) {
            setFeats(null);
            return;
        }

        // Group by identical point coordinates
        const groups = new Map();
        for (const f of hits) {
            const k = pointKey(f);
            if (!k) continue; // ignore non-Point for stacking
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(f);
        }

        // If there is any group with >1, choose the largest group.
        let bestGroup = null;
        for (const g of groups.values()) {
            if (g.length > 1 && (!bestGroup || g.length > bestGroup.length)) {
            bestGroup = g;
            }
        }

        if (bestGroup) {
            setFeats(bestGroup);
        } else {
            // show the topmost single hit (even if it's not a Point)
            setFeats([hits[0]]);
        }
        };

        const onLeave = () => setFeats(null);
        const onEnter = () => (map.getCanvas().style.cursor = "pointer");
        const onExit = () => (map.getCanvas().style.cursor = "");

        for (const lid of layers) {
            if (!map.getLayer(lid)) continue;
            map.on("mousemove", lid, onMove);
            map.on("mouseenter", lid, onEnter);
            map.on("mouseleave", lid, () => {
                onExit();
                onLeave();
            });

            cleanupFnsRef.current.push(() => {
                try {
                    map.off("mousemove", lid, onMove);
                } catch {}
                try {
                    map.off("mouseenter", lid, onEnter);
                } catch {}
                try {
                    map.off("mouseleave", lid, onLeave);
                } catch {}
            });
        }

        return () => {
            cleanupFnsRef.current.forEach((fn) => fn?.());
            cleanupFnsRef.current = [];
            try {
                map.getCanvas().style.cursor = "";
            } catch {}
        };
    }, [map, layers]);

    

    

    


    const panelTheme = useMemo(() => {
        if (!feats?.length) return null;

        // pick source for the color:
        // 1) by month 
        const month = feats[0]?.properties?.month;
        const hex = month != null ? MONTH_PALETTE[month] : null;

        // fallback by team:
        // const team = feats[0]?.properties?.team;
        // const hex = team ? TEAM_PALETTE[team] : null;

        if (!hex) return null;

        // assuming hexToRGB returns [r, g, b] or {r,g,b}. Handle both:
        const rgb = hexToRGB(hex);
        const [r, g, b] = Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b];

        return {
            // translucent fill that picks up the feature color
            bg: `rgba(${r}, ${g}, ${b}, 0.18)`,
            // stronger border to match the color
            border: `rgba(${r}, ${g}, ${b}, 0.8)`,
            // a subtle colored glow
            shadow: `0 8px 32px rgba(${r}, ${g}, ${b}, 0.25), 0 2px 8px rgba(0,0,0,0.08)`,
            // optional: a tint gradient for a bit more depth
            gradient: `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.22), rgba(${r}, ${g}, ${b}, 0.10))`,
        };
    }, [feats]);


    if (!container || !feats || !feats.length) return null;

    // Keep tooltip inside map bounds a bit
    const rect = container.getBoundingClientRect();
    const left = Math.min(Math.max(pos.x + offset.x, 0), rect.width - 10);
    const top = Math.min(Math.max(pos.y + offset.y, 0), rect.height - 10);

    // stacked vs single
    const isStack = feats.length > 1 && feats.every((f) => pointKey(f));

    // Limit visible cards for huge piles; indicate count on the top card
    const visibleFeats = isStack
        ? feats.slice(0, stackMaxVisible).reverse() // reverse so the topmost is last in DOM
        : feats;
    


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
            }}
        >
            {/* Outer glass container (acts as the "top" card) */}
            <div
                style={{
                position: "relative",
                // Base card visuals
                background: panelTheme?.gradient || panelTheme?.bg || "rgba(255, 255, 255, 0.23)",
                backdropFilter: "blur(15px)",
                WebkitBackdropFilter: "blur(15px)",
                borderRadius: "16px",
                padding: "22px 16px 12px 26px",
                maxWidth: 300,
                boxShadow:panelTheme?.shadow || `
                    0 8px 32px rgba(0, 0, 0, 0.12),
                    0 2px 8px rgba(0, 0, 0, 0.08),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.05)
                `,
                border: `1px solid ${panelTheme?.border || "rgba(255, 255, 255, 0.5)"}`,
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                color: "rgba(255, 255, 255, 0.95)",
                // Give height so the fanned children fit
                minHeight: isStack ? 48 : undefined,
                }}
            >
            {/* Fanned background cards (only for stacks) */}
            {isStack && visibleFeats.map((f, i) => {
                // i runs 0..N-1 (bottom .. top-1), we’ll paint them as absolute layers behind the content
                const translate = (i + 1) * stackFanOffset; // px
                const rotate = 0 //(i % 2 === 0 ? -1 : 1) * Math.min(1 + i * 0.2, 3); // subtle wobble
                const opacity = 0.3 + (i / visibleFeats.length) * 0.05; // more opaque near top
                return (
                <div
                    key={`bg-${i}`}
                    style={{
                    position: "absolute",
                    inset: 0,
                    transform: `translate(${-translate * 0.6}px, ${
                        translate * 0.6
                    }px) rotate(${rotate}deg)`,
                    borderRadius: "16px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(155, 155, 155, 0.99)",
                    boxShadow:
                        "0 6px 20px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.18)",
                    opacity,
                    pointerEvents: "none",
                    zIndex: -i, // lower zIndex than the main content
                    }}
                />
                );
            })}

            {/* Top content (either single card or the “stack top”) */}
            <div style={{ position: "relative", zIndex: visibleFeats.length + 1 }}>
            {isStack && (
                <div
                style={{
                    ...samsungFontStyle,
                    fontSize: "11px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.75)",
                    marginBottom: 6,
                    // padding: "12px 16px 12px 16px",

                }}
                >
                {feats.length} items here
                {feats.length > stackMaxVisible
                    ? ` · showing ${stackMaxVisible}`
                    : ""}
                </div>
            )}

            {/* Render the top-most feature content (or allow custom render) */}
            {(render || defaultRender)(
                feats[0],
                0,
                feats.length
            )}
            </div>
        </div>
        </div>,
        container
    );
}
