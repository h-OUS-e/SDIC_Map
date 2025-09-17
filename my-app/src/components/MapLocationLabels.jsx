// MapLocationLabels.jsx
"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";


const font_style = {
  "version": 8,
  "name": "Custom Samsung Style",
  "glyphs": "/fonts/glyphs/{fontstack}/{range}.pbf",
  "sources": {
    "osm": {
      "type": "vector",
      "url": "https://demotiles.maplibre.org/tiles/tiles.json"
    }
  },
  "layers": [
    {
      "id": "background",
      "type": "background",
      "paint": {
        "background-color": "#000000"
      }
    },
    {
      "id": "city-labels",
      "type": "symbol",
      "source": "osm",
      "source-layer": "place_label",
      "layout": {
        "text-field": "{name}",
        "text-font": ["SamsungSharpSans Regular"],
        "text-size": 14
      },
      "paint": {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 2
      }
    }
  ]
}

/**
 * REFACTORED PROPS:
 * - map: maplibregl.Map (required)
 * - sourceIdOrigin: string     -> ID of the GeoJSON source containing the start points (required) * 
 * - sourceIdEnd: string     -> ID of the GeoJSON source containing the end points (required)
 * - minZoom?: number      -> minimum zoom level to show labels
 * - maxZoom?: number      -> maximum zoom level to show labels
 * - filterEvents?: string[] -> array of activity names to show (optional)
 * - showOriginLabel?: boolean -> whether to show the separate SDIC origin label
 */
export default function MapLocationLabels({
    map,
    sourceIdOrigin,
    sourceIdEnd,
    minZoomL = 10,
    maxZoomL = 18,
    minZoomM = 13,
    maxZoomM = 18,
    minZoomS = 15,
    maxZoomS = 18,
    filterEvents = null,
    showOriginLabel = true,
}) {
    // --- State for the separate, DOM-based SDIC label ---
    const [container, setContainer] = useState(null);
    const [zoom, setZoom] = useState(null);
    const [sdicPosition, setSdicPosition] = useState(null);
    const SDIC_ORIGIN = [-122.40109460000001, 37.7981955];
    const shouldShowSDICLabel = zoom !== null && zoom >= 10 && showOriginLabel;
    const labelsLayerIdS = "location-labels-small";
    const labelsLayerIdM = "location-labels-medium";
    const labelsLayerIdOrigin = "location-labels-origin";

    // --- Core Logic for MapLibre Symbol Layer ---
    useEffect(() => {
        if (!map || !sourceIdOrigin || !sourceIdEnd) return;

        // Wait for the source data to be available before adding the layer
        const addLayerWhenReady = () => {

            if (!map.getSource(sourceIdEnd)) {

                // If source doesn't exist yet, wait a moment and try again.
                setTimeout(addLayerWhenReady, 100);
                return;
            }
            console.log("Map layers: ", map.getStyle().layers.map(layer => layer.id))
           

            // If the layer already exists, don't add it again.
            if (!map.getLayer(labelsLayerIdS)) {
                map.addLayer({
                    id: labelsLayerIdS,
                    type: "symbol",
                    source: sourceIdEnd, // Use the provided source
                    minzoom: minZoomS,
                    maxzoom: maxZoomS,
                    layout: {
                        // Use the 'location_name' property from the GeoJSON feature for the text
                        "text-field": ["get", "location_name"],
                        // Note: Custom fonts like 'SamsungSharpSans' need to be loaded into the map style itself.
                        // We'll use a standard font available in most MapTiler styles for robustness.
                        "text-font": ["SamsungOne 300"],
                        "text-size": 11,
                        "text-anchor": "top",
                        "text-offset": [0, 0.8], // Offset the label slightly below the point
                        "text-allow-overlap": false,
                        "text-ignore-placement": false,
                    },
                    paint: {
                        "text-color": "#ffffff",
                        "text-halo-color": "rgba(0, 0, 0, 0.85)", // Adds a dark outline for readability
                        "text-halo-width": 1,
                        "text-halo-blur": 1,
                    },
                });
            }

            if (!map.getLayer(labelsLayerIdM)) {
                map.addLayer({
                    id: labelsLayerIdM,
                    type: "symbol",
                    source: sourceIdEnd, // Use the provided source
                    minzoom: minZoomM,
                    maxzoom: maxZoomM,
                    layout: {
                        // Use the 'location_name' property from the GeoJSON feature for the text
                        "text-field": ["get", "location_name"],
                        // Note: Custom fonts like 'SamsungSharpSans' need to be loaded into the map style itself.
                        // We'll use a standard font available in most MapTiler styles for robustness.
                        "text-font": ["Open Sans Regular"],
                        "text-size": 12,
                        "text-anchor": "top",
                        "text-offset": [0, 0.8], // Offset the label slightly below the point
                        "text-allow-overlap": false,
                        "text-ignore-placement": false,
                    },
                    paint: {
                        "text-color": "#ffffff",
                        "text-halo-color": "rgba(0, 0, 0, 0.85)", // Adds a dark outline for readability
                        "text-halo-width": 1,
                        "text-halo-blur": 1,
                    },
                });
            }



            // Dynamic font for SDIC Label
            let fontSizeL = 16
            // if (typeof zoom === "number") {
            //     if (zoom <= 12) fontSizeL = 14;
            //     else if (zoom >= 13) fontSizeL = 16;
            //     else fontSizeL = 12 + (zoom - 12) * (16 - 12);
            // }

            // Adding SDIC Label
            if (!map.getLayer(labelsLayerIdOrigin)) {
                map.addLayer({
                    id: labelsLayerIdOrigin,
                    type: "symbol",
                    source: sourceIdOrigin, 
                    minzoom: minZoomL,
                    maxzoom: maxZoomL,
                    layout: {
                        "text-field": "SDIC",
                        // Note: Custom fonts like 'SamsungSharpSans' need to be loaded into the map style itself.
                        // We'll use a standard font available in most MapTiler styles for robustness.
                        "text-font": ["SamsungOne 600"],
                        "text-size": fontSizeL,
                        "text-anchor": "top",
                        "text-offset": [0, 0.0], // Offset the label slightly below the point
                        "text-allow-overlap": false,
                        "text-ignore-placement": false,
                    },
                    paint: {
                        "text-color": "#ffffff",
                        "text-halo-color": "rgba(0, 0, 0, 0.85)", // Adds a dark outline for readability
                        "text-halo-width": 1,
                        "text-halo-blur": 1,
                    },
                });
            }
        };

        addLayerWhenReady();

        // Cleanup function to remove the layer when the component unmounts
        return () => {
            if (map.getLayer(labelsLayerIdS)) {
                map.removeLayer(labelsLayerIdS);
            }
            if (map.getLayer(labelsLayerIdM)) {
                map.removeLayer(labelsLayerIdM);
            }
            if (map.getLayer(labelsLayerIdOrigin)) {
                map.removeLayer(labelsLayerIdOrigin);
            }
        };
    }, [map, sourceIdOrigin, sourceIdEnd, minZoomS, maxZoomS, minZoomM, maxZoomM, minZoomL, maxZoomL]);
    
    // Effect to manage the filter dynamically
    useEffect(() => {
        if (!map) return;

        if (map.getLayer(labelsLayerIdM) && filterEvents) {
            let filterExpression = null;
            if (filterEvents && filterEvents.length > 0) {
                // MapLibre filter: show feature if its 'activity' property is in our list
                filterExpression = ["in", ["get", "activity"], ["literal", filterEvents]];
            }
            map.setFilter(labelsLayerIdM, filterExpression);
        }
    }, [map, filterEvents]);


    // --- Logic for the separate SDIC label (which still uses the DOM) ---
    useEffect(() => {
        if (!map) return;
        setContainer(map.getContainer());
        const updateZoom = () => setZoom(map.getZoom());
        const updatePosition = () => setSdicPosition(map.project(SDIC_ORIGIN));
        
        map.on('zoom', updateZoom);
        map.on('move', updatePosition);
        
        updateZoom();
        updatePosition();

        return () => {
            map.off('zoom', updateZoom);
            map.off('move', updatePosition);
        };
    }, [map]);

    // const getSDICLabelStyle = () => {
    //     let fontSize = 12;
    //     if (typeof zoom === "number") {
    //         if (zoom <= 12) fontSize = 12;
    //         else if (zoom >= 13) fontSize = 16;
    //         else fontSize = 12 + (zoom - 12) * (16 - 12);
    //     }
    //     return {
    //         position: "absolute",
    //         left: sdicPosition ? sdicPosition.x : 0,
    //         top: sdicPosition ? sdicPosition.y : 0,
    //         fontFamily: "'SamsungSharpSans', 'SamsungOne', system-ui, sans-serif",
    //         fontWeight: 600,
    //         fontSize: `${fontSize}px`,
    //         color: "rgba(255, 255, 255, 0.95)",
    //         textShadow: "0 2px 4px rgba(0, 0, 0, 0.9)",
    //         whiteSpace: "nowrap",
    //         transform: "translate(-50%, -50%)",
    //         transition: "opacity 0.6s, font-size 0.3s",
    //         opacity: shouldShowSDICLabel ? 1 : 0,
    //         pointerEvents: "none",
    //     };
    // };

    // if (!container) return null;

    // We only create a portal for the single SDIC label.
    // The event location labels are now handled entirely by MapLibre.
    // return createPortal(
    //     <>
    //         {showOriginLabel && sdicPosition && (
    //             // <div style={getSDICLabelStyle()}>
    //             //     SDIC
    //             // </div>
    //         )}
    //     </>,
    //     container
    // );
}
