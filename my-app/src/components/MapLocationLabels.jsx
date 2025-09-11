// MapLocationLabels.jsx
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Props:
 *  - map: maplibregl.Map (required)
 *  - layers: string[]      -> layer IDs to listen on (required)
 *  - minZoom?: number     -> minimum zoom level to show labels (default 14)
 *  - maxZoom?: number     -> maximum zoom level to show labels (default 15)
 *  - className?: string   -> optional class for the label container
 */
export default function MapLocationLabels({
    map,
    layers,
    minZoom = 13,
    maxZoom = 15,
    className = ""
}) {
    const [container, setContainer] = useState(null);
    const [zoom, setZoom] = useState(null);
    const [features, setFeatures] = useState([]);
    const cleanupFnsRef = useRef([]);
    
    // Check if current zoom level is within the range to show labels
    const shouldShowLabels = zoom !== null && zoom >= minZoom && zoom <= maxZoom;
    
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
        transition: "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
        opacity: shouldShowLabels ? 1 : 0,
        transform: shouldShowLabels ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.8)"
    };

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

    // Don't render if container unknown or no features
    if (!container || !features.length) return null;

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
            {features.map((feature, index) => {
                if (!feature.geometry?.coordinates) return null;
                
                const [lng, lat] = Array.isArray(feature.geometry.coordinates) 
                    ? feature.geometry.coordinates 
                    : [];
                
                if (lng == null || lat == null) return null;

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
                            background: "rgba(0, 0, 0, 0.4)",
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
