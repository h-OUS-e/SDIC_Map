// EndpointLabelsOverlay.jsx
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Component that shows endpoint labels for specific locations between zoom 14-15
 * Based on MapHoverOverlay but shows labels without hover, only location names
 */
export default function EndpointLabelsOverlay({
    map,
    geoJSON,
    minZoom = 14,
    maxZoom = 15,
    className = ""
}) {
    const [container, setContainer] = useState(null);
    const [currentZoom, setCurrentZoom] = useState(0);
    const [labelPositions, setLabelPositions] = useState([]);
    const cleanupFnsRef = useRef([]);

    // Helper function to get coordinate at position t along a geometry (same as RouteLayer)
    const coordAtT = (geom, t) => {
        if (!geom) return null;
        
        if (geom.type === "LineString") {
            const coords = geom.coordinates;
            if (!coords || coords.length === 0) return null;
            
            const index = Math.round(t * (coords.length - 1));
            return coords[Math.min(index, coords.length - 1)];
        }
        
        return null;
    };

    // Extract actual endpoint coordinates from GeoJSON data
    const actualEndpoints = useMemo(() => {
        console.log('EndpointLabelsOverlay - GeoJSON received:', geoJSON);
        
        if (!geoJSON || !geoJSON.features) {
            console.log('EndpointLabelsOverlay - No GeoJSON or features');
            return [];
        }
        
        console.log('EndpointLabelsOverlay - Processing', geoJSON.features.length, 'features');
        
        const endpoints = [];
        const targetNames = ["Cowell Theater", "Github SF Headquarters", "AWS Builder Loft", "Anthropic Headquarters"];
        
        geoJSON.features.forEach((feature, index) => {
            if (!feature.geometry) return;
            
            const props = feature.properties || {};
            const locationName = props.location_name || "";
            
            console.log(`Feature ${index}: location_name="${locationName}", to="${props.to}"`);
            
            // Get the endpoint coordinate (t=1 means end of route)
            const endCoord = coordAtT(feature.geometry, 1);
            if (!endCoord) return;
            
            // Check if this endpoint matches one of our target locations
            const matchedTarget = targetNames.find(target => 
                locationName.toLowerCase().includes(target.toLowerCase().split(' ')[0])
            );
            
            if (matchedTarget) {
                console.log(`Matched endpoint: ${matchedTarget} at ${endCoord}`);
                endpoints.push({
                    name: matchedTarget,
                    coordinates: endCoord,
                    address: props.to || props.address || "",
                    location_name: locationName,
                    properties: props
                });
            }
        });
        
        console.log('Found endpoints:', endpoints);
        return endpoints;
    }, [geoJSON]);

    // Samsung font styles (same as MapHoverOverlay)
    const samsungFontStyle = {
        fontFamily: "'SamsungSharpSans', 'SamsungOne', system-ui, -apple-system, sans-serif",
        fontWeight: 600,
        fontSize: "13px",
        lineHeight: "1.5",
        color: "rgba(255, 255, 255, 0.95)",
        letterSpacing: "0.01em"
    };

    useEffect(() => {
        if (!map) return;
        setContainer(map.getContainer());
    }, [map]);

    // Update zoom level and positions
    useEffect(() => {
        if (!map || !container) return;

        const updateZoomAndPositions = () => {
            const zoom = map.getZoom();
            setCurrentZoom(zoom);
            
            console.log(`Current zoom: ${zoom}, range: ${minZoom}-${maxZoom}, endpoints: ${actualEndpoints.length}`);
            
            // Only calculate positions if we're in the correct zoom range
            if (zoom >= minZoom && zoom <= maxZoom) {
                const positions = actualEndpoints.map(endpoint => {
                    // Use the same approach as MapHoverOverlay
                    const pixel = map.project(endpoint.coordinates);
                    const rect = container.getBoundingClientRect();
                    
                    // Keep labels inside map bounds (same as MapHoverOverlay)
                    const x = Math.min(Math.max(pixel.x, 0), rect.width - 10);
                    const y = Math.min(Math.max(pixel.y - 30, 0), rect.height - 10);
                    
                    const visible = pixel.x >= -50 && pixel.x <= rect.width + 50 && 
                                   pixel.y >= -50 && pixel.y <= rect.height + 50;
                    
                    console.log(`Endpoint ${endpoint.name}: coords=${endpoint.coordinates}, pixel=${pixel.x},${pixel.y}, visible=${visible}`);
                    
                    return {
                        ...endpoint,
                        x: x,
                        y: y,
                        visible: visible
                    };
                });
                console.log('Setting label positions:', positions);
                setLabelPositions(positions);
            } else {
                setLabelPositions([]);
            }
        };

        updateZoomAndPositions(); // Initial update
        map.on('zoom', updateZoomAndPositions);
        map.on('move', updateZoomAndPositions);

        return () => {
            map.off('zoom', updateZoomAndPositions);
            map.off('move', updateZoomAndPositions);
        };
    }, [map, container, actualEndpoints, minZoom, maxZoom]);

    // Don't render if not in the correct zoom range or no container
    if (!container || currentZoom < minZoom || currentZoom > maxZoom) {
        return null;
    }

    return createPortal(
        <div className={className}>
            {labelPositions.map((label, index) => {
                if (!label.visible) return null;

                return (
                    <div
                        key={`${label.name}-${index}`}
                        style={{
                            position: "absolute",
                            left: label.x,
                            top: label.y,
                            transform: "translate(0, 0)",
                            pointerEvents: "none",
                            zIndex: 3,
                            // Same glassmorphism styling as MapHoverOverlay
                            background: "rgba(255, 255, 255, 0.08)",
                            backdropFilter: "blur(20px)",
                            WebkitBackdropFilter: "blur(20px)",
                            borderRadius: "16px",
                            padding: "12px 16px",
                            maxWidth: 300,
                            // Same shadow system as MapHoverOverlay
                            boxShadow: `
                                0 8px 32px rgba(0, 0, 0, 0.12),
                                0 2px 8px rgba(0, 0, 0, 0.08),
                                inset 0 1px 0 rgba(255, 255, 255, 0.2),
                                inset 0 -1px 0 rgba(0, 0, 0, 0.05)
                            `,
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            WebkitFontSmoothing: "antialiased",
                            MozOsxFontSmoothing: "grayscale",
                            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                            color: "rgba(255, 255, 255, 0.95)"
                        }}
                    >
                        <div style={samsungFontStyle}>
                            {label.name}
                        </div>
                    </div>
                );
            })}
        </div>,
        container
    );
}
