// MapLocationLabels.jsx
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Props:
 *  - map: maplibregl.Map (required)
 *  - layers: string[]      -> layer IDs to listen on (required)
 *  - minZoom?: number     -> minimum zoom level to show labels (default 13)
 *  - maxZoom?: number     -> maximum zoom level to show labels (default 15)
 *  - className?: string   -> optional class for the label container
 *  - filterEvents?: string[] -> array of activity names to show (optional)
 */
export default function MapLocationLabels({
    map,
    layers,
    minZoom = 14,
    maxZoom = 15,
    className = "",
    filterEvents = null,
    showOriginLabel = true
}) {
    const [container, setContainer] = useState(null);
    const [zoom, setZoom] = useState(null);
    const [features, setFeatures] = useState([]);
    const [isVisible, setIsVisible] = useState(false);
    const cleanupFnsRef = useRef([]);
    
    // SDIC origin point coordinates (735 Battery Street, San Francisco)
    const SDIC_ORIGIN = [-122.40109460000001, 37.7981955];
    
    // Check if current zoom level is within the range to show labels
    const shouldShowLabels = zoom !== null && zoom >= minZoom && zoom <= maxZoom;
    
    // Check if SDIC origin label should be shown (zoom >= 10)
    const shouldShowSDICLabel = zoom !== null && zoom >= 10 && showOriginLabel;
    
    // Smooth animation control
    useEffect(() => {
        if (shouldShowLabels) {
            // Small delay to ensure smooth appearance
            const timer = setTimeout(() => setIsVisible(true), 50);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [shouldShowLabels]);
    
    // Samsung font styles for location names
    const locationNameStyle = {
        fontFamily: "'SamsungSharpSans', 'SamsungOne', system-ui, -apple-system, sans-serif",
        fontWeight: 500,
        fontSize: "12px",
        lineHeight: "1.4",
        color: "rgba(255, 255, 255, 0.9)",
        letterSpacing: "0.02em",
        textShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
        whiteSpace: "nowrap",
        // Smooth transitions for fade in/out
        transition: "opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.9)",
        pointerEvents: isVisible ? "none" : "none"
    };

    // SDIC origin label style with zoom-based sizing
    // Smoothly interpolate font size between 12px (zoom 12 and below) and 16px (zoom 13 and above)
    const getSDICLabelStyle = () => {
        let fontSize = 12;
        if (typeof zoom === "number") {
            if (zoom <= 12) {
                fontSize = 12;
            } else if (zoom >= 13) {
                fontSize = 16;
            } else {
                // Smooth interpolation between 12 and 16 for zoom 12 < z < 13
                fontSize = 12 + (zoom - 12) * (16 - 12) / (13 - 12);
            }
        }
        return {
            fontFamily: "'SamsungSharpSans', 'SamsungOne', system-ui, -apple-system, sans-serif",
            fontWeight: 600, // Slightly bolder for SDIC
            fontSize: `${fontSize}px`,
            lineHeight: "1.2",
            color: "rgba(255, 255, 255, 0.95)",
            letterSpacing: "0.05em",
            textShadow: "0 2px 4px rgba(0, 0, 0, 0.9)",
            whiteSpace: "nowrap",
            transition: "opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), font-size 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            opacity: shouldShowSDICLabel ? 1 : 0,
            transform: shouldShowSDICLabel ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.8)",
            pointerEvents: "none"
        };
    };
    // const getSDICLabelStyle = () => {
    //     let fontSize = "12px"; // Default size
        
    //     if (zoom >= 12 && zoom <= 13) {
    //         // Bigger size for zoom 10-13
    //         fontSize = zoom <= 11 ? "12px" : zoom <= 12 ? "14px" : "12px";
    //     } else if (zoom > 13) {
    //         // Normal size for zoom > 13
    //         fontSize = "16px";
    //     }
        
    //     return {
    //         fontFamily: "'SamsungSharpSans', 'SamsungOne', system-ui, -apple-system, sans-serif",
    //         fontWeight: 600, // Slightly bolder for SDIC
    //         fontSize: fontSize,
    //         lineHeight: "1.2",
    //         color: "rgba(255, 255, 255, 0.95)",
    //         letterSpacing: "0.05em",
    //         textShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
    //         whiteSpace: "nowrap",
    //         transition: "opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    //         opacity: shouldShowSDICLabel ? 1 : 0,
    //         transform: shouldShowSDICLabel ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.8)",
    //         pointerEvents: "none"
    //     };
    // };

    useEffect(() => {
        if (!map) return;
        setContainer(map.getContainer());
        setZoom(map.getZoom());
    }, [map]);

    // Listen for zoom changes
    useEffect(() => {
        if (!map) return;

        const onZoom = () => {
            setZoom(map.getZoom());
        };

        map.on('zoom', onZoom);
        map.on('zoomend', onZoom);

        return () => {
            map.off('zoom', onZoom);
            map.off('zoomend', onZoom);
        };
    }, [map]);

    // Get all features from the specified layers
    useEffect(() => {
        if (!map || !layers?.length || !shouldShowLabels) {
            setFeatures([]);
            return;
        }

        const updateFeatures = () => {
            try {
                const allFeatures = [];
                
                // Get features from each layer
                for (const layerId of layers) {
                    if (map.getLayer(layerId)) {
                        const layerFeatures = map.queryRenderedFeatures({ layers: [layerId] });
                        allFeatures.push(...layerFeatures);
                    }
                }
                
                setFeatures(allFeatures);
            } catch (error) {
                console.warn('Error querying features:', error);
                setFeatures([]);
            }
        };

        // Update features when map moves or zooms
        const onMove = () => updateFeatures();
        const onZoomEnd = () => updateFeatures();

        map.on('moveend', onMove);
        map.on('zoomend', onZoomEnd);

        // Initial update
        updateFeatures();

        return () => {
            map.off('moveend', onMove);
            map.off('zoomend', onZoomEnd);
        };
    }, [map, layers, shouldShowLabels]);

    // Don't render if container unknown (but allow SDIC label even without features)
    if (!container) return null;

    return createPortal(
        <div
            className={className}
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 2
            }}
        >
            {/* SDIC Origin Label */}
            {shouldShowSDICLabel && (
                <div
                    style={{
                        position: "absolute",
                        left: map.project(SDIC_ORIGIN).x,
                        top: map.project(SDIC_ORIGIN).y,
                        ...getSDICLabelStyle(),
                        // Enhanced background for SDIC label
                        // background: "rgba(0, 0, 0, 0.6)",
                        textShadow: "0 2px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)",
                        // backdropFilter: "blur(10px)",
                        // WebkitBackdropFilter: "blur(10px)",
                        // borderRadius: "12px",
                        // padding: "6px 12px",
                        // border: "1px solid rgba(255, 255, 255, 0.2)",
                        // boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
                        // background: "rgba(0, 0, 0, 0.2)",
                        // backdropFilter: "blur(8px)",
                        // WebkitBackdropFilter: "blur(8px)",
                        // borderRadius: "8px",
                        // padding: "4px 8px",
                        // border: "1px solid rgba(255, 255, 255, 0.1)",
                        // boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
                    }}
                >
                    SDIC
                </div>
            )}
            
            {features.map((feature, index) => {
                if (!feature.geometry?.coordinates) return null;
                
                const [lng, lat] = Array.isArray(feature.geometry.coordinates) 
                    ? feature.geometry.coordinates 
                    : [];
                
                if (lng == null || lat == null) return null;

                // Filter by events if filterEvents is provided
                if (filterEvents && filterEvents.length > 0) {
                    const activity = feature.properties?.activity;
                    if (!activity || !filterEvents.includes(activity)) {
                        return null; // Skip this feature if it doesn't match the filter
                    }
                }

                // Convert coordinates to pixel position
                const point = map.project([lng, lat]);
                

                // Get location name from properties - only use location_name
                // const locationName = feature.properties?.name || 
                // feature.properties?.location || 
                // feature.properties?.address ||
                // feature.properties?.label ||
                // 'Unknown Location';
                const locationName = feature.properties?.location_name || 'Unknown Location';

                return (
                    <div
                        key={`${feature.layer?.id || 'unknown'}-${index}`}
                        style={{
                            position: "absolute",
                            left: point.x,
                            top: point.y,
                            ...locationNameStyle,
                            // Glassmorphism background for better readability
                            background: "rgba(0, 0, 0, 0.2)",
                            backdropFilter: "blur(8px)",
                            WebkitBackdropFilter: "blur(8px)",
                            borderRadius: "8px",
                            padding: "4px 8px",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
                        }}
                    >
                        {locationName}
                    </div>
                );
            })}
        </div>,
        container
    );
}
