'use client';

import maplibregl from 'maplibre-gl';
import React, { useEffect, useRef, useState } from 'react';
import RouteGenerator from './RouteGenerator';
import RouteLayer from './RouteLayer';

// [TRIPS ADD]
// import { toTripsData } from '../utils/prepareTrips';
import MapHoverOverlay from "./MapHoverOverlay";
import TripsOverlay from './TripsOverlay';

// [KEYFRAME ANIMATION]
import { useKeyframeAnimation } from '../hooks/useKeyframeAnimation';
import KeyframeControls from './KeyframeControls';

const MAPTILER_API_KEY = "ZAMOU7NPssEmiSXsELqD";
const MAPTILER_2 = "pWuuKuOsL6jBB1Gt1ClK";


function getBasePath() {
  if (typeof window === 'undefined') return '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  // On GH Pages: /<repo>/...  -> use the first segment
  return parts.length ? `/${parts[0]}` : '';
}


export default function Map() {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [API_KEY] = useState(MAPTILER_API_KEY);
    const [API_KEY2] = useState(MAPTILER_2);
    const [visualizationMode, setVisualizationMode] = useState("offset"); 
    const layerId = "saved-route-line";

    const basePath = getBasePath();
    const routesUrl = `${basePath}/assets/routes/routes.geojson`;
    const [showSmoothed, setShowSmoothed] = useState(true);
    const toggleSmoothed = () => setShowSmoothed(s => !s);
    
    // State to track the current view (true = Bay Area, false = SF)
    const [isZoomedOut, setIsZoomedOut] = useState(false);

    // State to track if the map has finished loading
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    // route data
    const [geoJSON, setGeoJSON] = useState([]);

    // [KEYFRAME ANIMATION] Initialize keyframe animation system
    const tripsOverlayRef = useRef(null);
    
    const handleSequenceStart = () => {
        // Reset trips overlay when starting a new sequence
        if (tripsOverlayRef.current) {
            // Force restart of the trips animation
            tripsOverlayRef.current.restart?.();
        }
    };

    const {
        currentSequence,
        currentKeyframeIndex,
        isPlaying,
        isAutoPlaying,
        totalKeyframes,
        nextKeyframe,
        previousKeyframe,
        playSequence,
        stopAnimation,
        resetToFirstKeyframe,
    } = useKeyframeAnimation(map.current, handleSequenceStart, { autoStart: true });

    // live view info for on-screen readout
    const [viewInfo, setViewInfo] = useState({
        lng: -122.4194,
        lat: 37.7749,
        zoom: 12,
    });

    // Define the two camera view configurations
    const sfView = {
        center: [-122.43609, 37.77169], // San Francisco
        zoom: 12.9,
    };

    const bayAreaView = {
        center: [-122.27463, 37.61096], // A central point to see SF, Berkeley, and Palo Alto
        zoom: 10.25,
    };

    const initialView = {
        center: [-122.43609, 37.77169], // A central point to see SF, Berkeley, and Palo Alto
        zoom: 11,
    };


    // Initialize map
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        // Use the initial SF view when the map loads
        const initialState = initialView;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            // style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${API_KEY}`,
            // style: `https://api.maptiler.com/maps/019934cc-16f4-70e2-            b59a-96734dcc38bf/?key=${API_KEY2}`,
            style: `https://api.maptiler.com/maps/019934cc-16f4-70e2-b59a-96734dcc38bf/style.json?key=pWuuKuOsL6jBB1Gt1ClK`,
            // style: `https://api.maptiler.com/maps/01993504-3098-7ba1-b982-0d03e511e2ca/style.json?key=pWuuKuOsL6jBB1Gt1ClK`,
            zoom: initialState.zoom,
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        // When the map's style has loaded, set our state to true
        map.current.on('load', () => {
            setIsMapLoaded(true);
        });

        return () => {
            map.current.remove();
            map.current = null;
        };
    }, [API_KEY]); // Only run once on mount


    // Log center/zoom after interactions and keep readout in sync
    useEffect(() => {
        if (!isMapLoaded || !map.current) return;

        const logView = () => {
            const c = map.current.getCenter();
            const z = map.current.getZoom();
            // Update on-screen readout
            setViewInfo({ lng: c.lng, lat: c.lat, zoom: z });
            // Console log
            console.log(
                `[Map] center=(${c.lng.toFixed(5)}, ${c.lat.toFixed(5)}), zoom=${z.toFixed(2)}`
            );
        };

        // Do an initial log/readout sync
        logView();

        // Use *end events to avoid spammy logs
        map.current.on('moveend', logView);
        map.current.on('zoomend', logView);
        map.current.on('rotateend', logView); // optional, in case rotation nudges center

        return () => {
            if (!map.current) return;
                map.current.off('moveend', logView);
                map.current.off('zoomend', logView);
                map.current.off('rotateend', logView);
        };
    }, [isMapLoaded]);

    // Function to handle the button click
    const toggleView = () => {
        if (!map.current) return;

        // Determine the target view based on the current state
        const targetView = isZoomedOut ? sfView : bayAreaView;

        // Use flyTo for a smooth animation
        map.current.flyTo({
            center: targetView.center,
            zoom: targetView.zoom,
            essential: true, // this animation is considered essential with respect to prefers-reduced-motion
            duration: 2000, // animation duration in milliseconds
        });
        
        // Toggle the state for the next click
        setIsZoomedOut(!isZoomedOut);
    };

    // receive GeoJSON from RouteLayer; convert to trips
    const handleGeojson = (data) => {
        try {
            setGeoJSON(data);
            console.log(`Finished GeoJSON data update. Prepared ${Object.keys(data.features).length} routes.`);
        } catch (e) {
            console.error('Failed to prepare geoJSON data', e);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
            {/* [KEYFRAME CONTROLS] */}
            {isMapLoaded && (
                <KeyframeControls
                    currentKeyframeIndex={currentKeyframeIndex}
                    totalKeyframes={totalKeyframes}
                    isPlaying={isPlaying}
                    isAutoPlaying={isAutoPlaying}
                    onNext={nextKeyframe}
                    onPrevious={previousKeyframe}
                    onPlaySequence={playSequence}
                    onStop={stopAnimation}
                    onReset={resetToFirstKeyframe}
                    onToggleView={toggleView}
                    isZoomedOut={isZoomedOut}
                    onToggleSmoothed={toggleSmoothed}
                    showSmoothed={showSmoothed}
                    viewInfo={viewInfo}
                />
            )}


            <div ref={mapContainer} className="map" style={{ width: '100%', height: '100%' }} />
            {isMapLoaded && (
                <>
                    {/* camera stable by disabling fit; expose data upward */}
                    <RouteLayer map={map.current} url={routesUrl} onData={handleGeojson} fitOnLoad={false} showSmoothed={showSmoothed} />

                    {map.current && geoJSON && geoJSON.features && Object.keys(geoJSON.features).length > 0 && (
                        <TripsOverlay
                            ref={tripsOverlayRef}
                            map={map.current}
                            geoJSON={geoJSON}
                            fps={30}
                            trail={900}
                            opacity={.3}
                            lineWidth={1.5}
                            // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                            timeSpeedProfile={{ speeds: [30, 50, 150, 60, 2000, 16000], dts: [3,2, 8.5, 6, 6] }}
                        />
                    )}

                    {/* <RouteGenerator map={map.current} apiKey={API_KEY} /> */}

                    
                    {/* Hover overlay — point it at your endpoint hit layer (or glow layers) */}
                    {map.current && (
                        <MapHoverOverlay
                            map={map.current}
                            layers={[`${layerId}-endpoint-hit`]}
                            offset={{ x: 14, y: 14 }}
                        />
                    )};
                </>                 
            )}
        </div>
    );
}