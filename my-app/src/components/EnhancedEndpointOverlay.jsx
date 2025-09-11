// EnhancedEndpointOverlay.jsx
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Enhanced endpoint overlay that shows more detailed information
 * and makes endpoints more visible
 */
export default function EnhancedEndpointOverlay({
    map,
    layers,
    offset = { x: 12, y: 12 },
    className = "",
    showLabels = true, // Show endpoint labels on map
    labelField = "location_name" // Which field to show as labels
}) {
    const [container, setContainer] = useState(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [feat, setFeat] = useState(null);
    const cleanupFnsRef = useRef([]);
    
    // Samsung font styles
    const samsungFontStyle = {
        fontFamily: "'SamsungSharpSans', 'SamsungOne', system-ui, -apple-system, sans-serif",
        fontWeight: 400,
        fontSize: "13px",
        lineHeight: "1.5",
        color: "rgba(255, 255, 255, 0.95)",
        letterSpacing: "0.01em"
    };

    // Enhanced render function for endpoint information
    const renderEndpointInfo = (f) => {
        if (!f) return null;
        const props = f.properties || {};
        
        return (
            <div style={samsungFontStyle}>
                {/* Header with location name */}
                {props.location_name && (
                    <div style={{ 
                        marginBottom: "8px",
                        paddingBottom: "8px",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.2)"
                    }}>
                        <div style={{ 
                            fontWeight: 600,
                            fontSize: "14px",
                            color: "rgba(255, 255, 255, 1)",
                            marginBottom: "4px"
                        }}>
                            {props.location_name}
                        </div>
                        {props.address && (
                            <div style={{ 
                                fontSize: "11px",
                                color: "rgba(255, 255, 255, 0.7)",
                                fontStyle: "italic"
                            }}>
                                {props.address}
                            </div>
                        )}
                    </div>
                )}

                {/* Activity information */}
                {props.activity && (
                    <div style={{ margin: "6px 0" }}>
                        <span style={{ 
                            fontWeight: 600,
                            color: "rgba(255, 255, 255, 0.8)",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em"
                        }}>
                            Activity:
                        </span>
                        <div style={{ 
                            color: "rgba(255, 255, 255, 0.95)",
                            fontWeight: 400,
                            marginTop: "2px"
                        }}>
                            {props.activity}
                        </div>
                    </div>
                )}

                {/* Team and class info */}
                <div style={{ display: "flex", gap: "12px", margin: "6px 0" }}>
                    {props.team && (
                        <div>
                            <span style={{ 
                                fontWeight: 600,
                                color: "rgba(255, 255, 255, 0.8)",
                                fontSize: "11px",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em"
                            }}>
                                Team:
                            </span>
                            <div style={{ 
                                color: "rgba(255, 255, 255, 0.95)",
                                fontWeight: 400
                            }}>
                                {props.team}
                            </div>
                        </div>
                    )}
                    {props.class && (
                        <div>
                            <span style={{ 
                                fontWeight: 600,
                                color: "rgba(255, 255, 255, 0.8)",
                                fontSize: "11px",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em"
                            }}>
                                Class:
                            </span>
                            <div style={{ 
                                color: "rgba(255, 255, 255, 0.95)",
                                fontWeight: 400
                            }}>
                                {props.class}
                            </div>
                        </div>
                    )}
                </div>

                {/* Month and profile */}
                <div style={{ display: "flex", gap: "12px", margin: "6px 0" }}>
                    {props.month && (
                        <div>
                            <span style={{ 
                                fontWeight: 600,
                                color: "rgba(255, 255, 255, 0.8)",
                                fontSize: "11px",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em"
                            }}>
                                Month:
                            </span>
                            <div style={{ 
                                color: "rgba(255, 255, 255, 0.95)",
                                fontWeight: 400
                            }}>
                                {props.month}
                            </div>
                        </div>
                    )}
                    {props.profile && (
                        <div>
                            <span style={{ 
                                fontWeight: 600,
                                color: "rgba(255, 255, 255, 0.8)",
                                fontSize: "11px",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em"
                            }}>
                                Profile:
                            </span>
                            <div style={{ 
                                color: "rgba(255, 255, 255, 0.95)",
                                fontWeight: 400
                            }}>
                                {props.profile}
                            </div>
                        </div>
                    )}
                </div>

                {/* Fallback for coordinates if no other info */}
                {!props.location_name && !props.activity && !props.team && (
                    <div style={{ 
                        margin: "4px 0",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                    }}>
                        <span style={{ 
                            fontWeight: 600,
                            color: "rgba(255, 255, 255, 0.8)",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em"
                        }}>
                            Coords:
                        </span>
                        <span style={{ 
                            color: "rgba(255, 255, 255, 0.95)",
                            fontWeight: 400,
                            fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', monospace"
                        }}>
                            {f.geometry?.coordinates?.[1]?.toFixed(5)}, {f.geometry?.coordinates?.[0]?.toFixed(5)}
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

        // We'll bind to each layer so leave/enter is reliable.
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

    // Don't render if not hovering or container unknown
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
                // Enhanced glassmorphism background
                background: "rgba(255, 255, 255, 0.12)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                // Enhanced borders and shadows
                borderRadius: "20px",
                padding: "16px 20px",
                maxWidth: 350,
                minWidth: 200,
                // Enhanced shadow system
                boxShadow: `
                    0 12px 40px rgba(0, 0, 0, 0.15),
                    0 4px 12px rgba(0, 0, 0, 0.1),
                    inset 0 1px 0 rgba(255, 255, 255, 0.25),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.08)
                `,
                // Enhanced border with glass effect
                border: "1px solid rgba(255, 255, 255, 0.2)",
                // Typography enhancements
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",
                // Smooth animation on hover
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                // Ensure text is readable
                color: "rgba(255, 255, 255, 0.95)"
            }}
        >
            {renderEndpointInfo(feat)}
        </div>,
        container
    );
}
