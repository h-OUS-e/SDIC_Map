// BillboardLayer.jsx
"use client";
import React, { useEffect, useRef, useState } from "react";

/**
 * Preprocess billboard image to fix orientation and sizing issues
 */
function preprocessBillboardImage(
  img,
  {
    width = 200,
    height = 300,
    cornerRadius = 24,  // fillet radius in px
    saturation = 0.6,   // 1 = normal, 0 = grayscale
    background = 'transparent', // or 'rgba(0,0,0,0)'
  } = {}
) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = width;
  canvas.height = height;

  // optional background fill (keep transparent by default)
  if (background && background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  // Calculate fit while preserving aspect ratio
  const imgAspect = img.width / img.height;
  const boxAspect = width / height;

  let drawWidth, drawHeight, offsetX, offsetY;
  if (imgAspect > boxAspect) {
    drawWidth = width;
    drawHeight = width / imgAspect;
    offsetX = 0;
    offsetY = (height - drawHeight) / 2;
  } else {
    drawHeight = height;
    drawWidth = height * imgAspect;
    offsetX = (width - drawWidth) / 2;
    offsetY = 0;
  }

  // Build a rounded-rect path that clips the final image
  const r = Math.max(0, Math.min(cornerRadius, Math.min(width, height) / 2));

  function roundedRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Clip to rounded rect covering the full card
  ctx.save();
  roundedRectPath(0, 0, width, height, r);
  ctx.clip();

  // Prefer fast CSS filter desaturation if available
  const supportsFilter = typeof ctx.filter === 'string';
  if (supportsFilter) {
    ctx.filter = `saturate(${saturation})`;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    ctx.filter = 'none';
  } else {
    // Fallback: draw, then manually reduce saturation
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    // Move each pixel toward its luminance by (1 - saturation)
    const desat = 1 - Math.max(0, Math.min(saturation, 1));
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      data[i]     = r + (luminance - r) * desat;
      data[i + 1] = g + (luminance - g) * desat;
      data[i + 2] = b + (luminance - b) * desat;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  ctx.restore();

  // Export as an Image (preserves transparency for rounded corners)
  const processedImg = new Image();
  processedImg.src = canvas.toDataURL('image/png');
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
                                        const processedImg = preprocessBillboardImage(img, {
                                            width: 200,
                                            height: 300,
                                            cornerRadius: 24, // tweak to taste
                                            saturation: 0.6,  // lower = less saturated
                                            // background: 'transparent', // or set a color if you want a card backplate
                                        });
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
                        ["exponential", 1.8],
                        ["zoom"],
                        minZoom, 0.5,  // Bigger at min zoom
                        15, 0.7,       // Medium size at zoom 15
                        maxZoom + 1 , 1 // Larger at max zoom
                    ],
                    "icon-anchor": "bottom",
                    "icon-allow-overlap": true,
                    "icon-ignore-placement": true,
                    "icon-pitch-alignment": "viewport", // Keep icons upright when map tilts
                    "icon-rotation-alignment": "viewport", // Keep icons upright when map rotates
                    // Optional: add text labels below the image
                    "text-field": ["get", "name"],
                    "text-font": ["Open Sans Regular"],
                    "text-size": 0,
                    "text-anchor": "top",
                    "text-offset": [0, 0.2],
                    "text-allow-overlap": false,
                },
                paint: {
                    "icon-opacity": [
                        "interpolate",
                        ["exponential", 1.2],
                        ["zoom"],
                        minZoom - 3, 0,      // Start fading much earlier
                        minZoom - 1, 0.2,    
                        minZoom - 0.3, 0.6, 
                        minZoom, 1,          
                        maxZoom - 0.5, 1,    
                        maxZoom, 1,          
                        maxZoom + 0.8, 0.9,  
                        maxZoom + 1.5, 0.7,  
                        maxZoom + 2.5, 0.4, 
                        maxZoom + 3.5, 0.15, 
                        maxZoom + 4.5, 0.03, 
                        maxZoom + 6, 0       
                    ],
                    "text-color": "#ffffff",
                    "text-halo-color": "rgba(0, 0, 0, 0.85)",
                    "text-halo-width": 1,
                    "text-halo-blur": 1,
                    "text-opacity": [
                        "interpolate",
                        ["exponential", 1.2],
                        ["zoom"],
                        minZoom - 2, 0,     
                        minZoom - 0.5, 0.3,  
                        minZoom, 1,          
                        maxZoom, 1,          
                        maxZoom + 0.5, 0.95, 
                        maxZoom + 1, 0.8,    
                        maxZoom + 2, 0.5,    
                        maxZoom + 3, 0.2,    
                        maxZoom + 4, 0.05,  
                        maxZoom + 5, 0       
                    ],
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
