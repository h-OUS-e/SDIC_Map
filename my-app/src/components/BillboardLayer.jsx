// BillboardLayer.jsx
"use client";
import React, { useEffect, useState, useRef } from "react";

/**
 * Preprocess billboard image to fix orientation and sizing issues
 */
function preprocessBillboardImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set a standard size for all billboards (adjust as needed)
    const standardWidth = 200;
    const standardHeight = 300;
    
    canvas.width = standardWidth;
    canvas.height = standardHeight;
    
    // Clear canvas with transparent background
    ctx.clearRect(0, 0, standardWidth, standardHeight);
    
    // Calculate scaling to fit image in standard size while maintaining aspect ratio
    const imgAspect = img.width / img.height;
    const standardAspect = standardWidth / standardHeight;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (imgAspect > standardAspect) {
        // Image is wider than standard - fit to width
        drawWidth = standardWidth;
        drawHeight = standardWidth / imgAspect;
        offsetX = 0;
        offsetY = (standardHeight - drawHeight) / 2;
    } else {
        // Image is taller than standard - fit to height
        drawHeight = standardHeight;
        drawWidth = standardHeight * imgAspect;
        offsetX = (standardWidth - drawWidth) / 2;
        offsetY = 0;
    }
    
    // Draw the image centered and scaled
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    
    // Create a new Image object from the processed canvas
    const processedImg = new Image();
    processedImg.src = canvas.toDataURL();
    
    return processedImg;
}

/**
 * BillboardLayer - Displays billboard images at specific coordinates
 * Props:
 * - map: maplibregl.Map
 * - billboardData: array of {id, coordinates: [lng, lat], imageUrl, name} (required)
 * - minZoom?: number -> minimum zoom level to show billboards
 * - maxZoom?: number -> maximum zoom level to show billboards
 */

export default function BillboardLayer({
    map,
    billboardData = [],
    minZoom = 13,
    maxZoom = 18,
}) {
    const billboardSourceId = "billboard-source";
    const billboardLayerId = "billboard-layer";
    const [imagesLoaded, setImagesLoaded] = useState(false);
    const imagesLoadedRef = useRef(false);

    // Convert billboard data to GeoJSON
    const billboardGeoJSON = React.useMemo(() => {
        if (!billboardData || billboardData.length === 0) {
            return {
                type: "FeatureCollection",
                features: []
            };
        }

        return {
            type: "FeatureCollection",
            features: billboardData.map((billboard, index) => ({
                type: "Feature",
                id: billboard.id || index,
                geometry: {
                    type: "Point",
                    coordinates: billboard.coordinates
                },
                properties: {
                    id: billboard.id || index,
                    name: billboard.name || `Billboard ${index + 1}`,
                    imageId: billboard.id || `billboard-${index}`, // Use this for icon-image
                }
            }))
        };
    }, [billboardData]);

    // Load images and add them to the map style
    useEffect(() => {
        if (!map || !billboardData.length || imagesLoadedRef.current) return;

        const loadImages = async () => {
            try {
                // Load each billboard image
                for (const billboard of billboardData) {
                    const imageId = billboard.id; // Use the billboard.id directly
                    
                    // Check if image is already loaded
                    if (!map.hasImage(imageId)) {
                        // Create a new Image object
                        const img = new Image();
                        img.crossOrigin = 'anonymous'; // Handle CORS if needed
                        
                        // Wait for image to load and preprocess it
                        await new Promise((resolve, reject) => {
                            img.onload = () => {
                                // Double-check if image still doesn't exist before adding
                                if (!map.hasImage(imageId)) {
                                    try {
                                        // Preprocess the image to fix orientation and sizing issues
                                        const processedImg = preprocessBillboardImage(img);
                                        map.addImage(imageId, processedImg);
                                        resolve();
                                    } catch (addError) {
                                        console.warn(`Image ${imageId} already exists, skipping...`);
                                        resolve();
                                    }
                                } else {
                                    console.warn(`Image ${imageId} already exists, skipping...`);
                                    resolve();
                                }
                            };
                            img.onerror = reject;
                            img.src = billboard.imageUrl;
                        });
                    }
                }
                imagesLoadedRef.current = true;
                setImagesLoaded(true);
            } catch (error) {
                console.error('Error loading billboard images:', error);
                imagesLoadedRef.current = true;
                setImagesLoaded(true); // Still try to show billboards even if images fail
            }
        };

        loadImages();

        // Cleanup function to remove images when component unmounts
        return () => {
            // Remove images when component unmounts
            billboardData.forEach(billboard => {
                const imageId = billboard.id;
                if (map.hasImage(imageId)) {
                    map.removeImage(imageId);
                }
            });
            imagesLoadedRef.current = false;
        };
    }, [map, billboardData]);

    // Add source and layer to map
    useEffect(() => {
        if (!map || !billboardGeoJSON.features.length || !imagesLoaded) return;

        // Add or update the source
        if (map.getSource(billboardSourceId)) {
            map.getSource(billboardSourceId).setData(billboardGeoJSON);
        } else {
            map.addSource(billboardSourceId, {
                type: "geojson",
                data: billboardGeoJSON
            });
        }

        // Add the symbol layer for billboard images
        if (!map.getLayer(billboardLayerId)) {
            map.addLayer({
                id: billboardLayerId,
                type: "symbol",
                source: billboardSourceId,
                minzoom: minZoom,
                maxzoom: maxZoom,
                layout: {
                    // Use icon-image to display images
                    "icon-image": ["get", "imageId"],
                    "icon-size": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        minZoom, 0.4,  // Bigger at min zoom
                        15, 0.6,       // Medium size at zoom 15
                        maxZoom, 0.8   // Larger at max zoom
                    ],
                    "icon-anchor": "bottom",
                    "icon-allow-overlap": true,
                    "icon-ignore-placement": true,
                    "icon-pitch-alignment": "viewport", // Keep icons upright when map tilts
                    "icon-rotation-alignment": "viewport", // Keep icons upright when map rotates
                    // Optional: add text labels below the image
                    "text-field": ["get", "name"],
                    "text-font": ["Open Sans Regular"],
                    "text-size": 10,
                    "text-anchor": "top",
                    "text-offset": [0, 0.2],
                    "text-allow-overlap": false,
                },
                paint: {
                    "text-color": "#ffffff",
                    "text-halo-color": "rgba(0, 0, 0, 0.85)",
                    "text-halo-width": 1,
                    "text-halo-blur": 1,
                },
            });
        }

        // Cleanup function
        return () => {
            if (map.getLayer(billboardLayerId)) {
                map.removeLayer(billboardLayerId);
            }
            if (map.getSource(billboardSourceId)) {
                map.removeSource(billboardSourceId);
            }
            // Images are cleaned up in the first useEffect
        };
    }, [map, billboardGeoJSON, minZoom, maxZoom, imagesLoaded]);

    return null; // This component doesn't render anything directly
}
