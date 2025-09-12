'use client';

import maplibregl from 'maplibre-gl';
import React, { useEffect, useRef, useState } from 'react';
import RouteLayer, { COLOR_MODES } from './RouteLayer';
import TripsOverlaySeries, { TripsOverlayProvider } from './TripsOverlaySeries';

// [TRIPS ADD]
// import { toTripsData } from '../utils/prepareTrips';
import MapHoverOverlay from "./MapHoverOverlay";
import MapLocationLabels from "./MapLocationLabels";

// [KEYFRAME ANIMATION]
import { easingFunctions, useKeyframeAnimation } from '../hooks/useKeyframeAnimation';
import KeyframeControls from './KeyframeControls';

const MAPTILER_API_KEY = "ZAMOU7NPssEmiSXsELqD";
const isAutoStart = true;


// Build your keyframes (same views you had, just as a list):
const initialView = {
    center: [-122.43609, 37.77169],
    zoom: 11,
    bearing: 0,
    pitch: 0,
    duration: 200,
    easing: easingFunctions.easeInOut,
};
const sfView1 = {
    center: [-122.40451, 37.79837],
    zoom: 14.5,
    bearing: 0,
    pitch: 0,
    duration: 8000,
    easing: easingFunctions.easeInOut,
};
const sfView2 = {
    center: [-122.40451, 37.79837],
    zoom: 14,
    bearing: 60,
    pitch: 25,
    duration: 8000,
    easing: easingFunctions.easeInOut,
};
const sfView3 = {
    center: [-122.40451, 37.79837],
    zoom: 13.5,
    bearing: 60,
    pitch: 25,
    duration: 5000,
    easing: easingFunctions.easeInOut,
};
const bayAreaView = {
    center: [-122.27463, 37.61096],
    zoom: 10.25,
    bearing: 0,
    pitch: 0,
    duration: 8000,
    easing: easingFunctions.easeInOut,
};
const bayAreaViewPause = {
    center: [-122.27463, 37.61096],
    zoom: 10.25,
    bearing: 0,
    pitch: 0,
    duration: 4000,
    easing: easingFunctions.easeInOut,
};
const billboard1 = {
    center: [-122.39448, 37.67141],
    zoom: 15,
    bearing: -30,
    pitch: 65,
    duration: 2600,
    easing: easingFunctions.easeInOut,
};
const billboard2 = {
    center: [-122.13066, 37.45415],
    zoom: 18.0,
    bearing: -52,
    pitch: 70,
    duration: 6000,
    easing: easingFunctions.easeInOut,
};
const billboard3 = {
    center: [-122.40751, 37.76422],
    zoom: 17.0,
    bearing: -30,
    pitch: 78,
    duration: 8000,
    easing: easingFunctions.easeInOut,
};
const billboard3Pause = {...COLOR_MODES,
    duration: 1600,
};
const billboard4 = {
    center: [-122.27178, 37.52712],
    zoom: 17.5,
    bearing: -45,
    pitch: 85,
    duration: 4500,
    easing: easingFunctions.easeInOut,
};
const billboard5 = {
    center: [-122.39789, 37.62401],
    zoom: 15.2,
    bearing: -25,
    pitch: 72,
    duration: 7000,
    easing: easingFunctions.easeInOut,
};
const billboard6 = {
    center: [-122.41332, 37.62401],
    zoom: 14.2,
    bearing: -3,
    pitch: 60,
    duration: 17000,
    easing: easingFunctions.linear,
};

const sfView = {
    center: [-122.38279, 37.68716],
    zoom: 12.5,
    bearing: -0,
    pitch: 0,
    duration: 5000,
    easing: easingFunctions.easeInOut,
};

const lastView = {
  ...bayAreaView,
  duration: 4000, // overrides the original duration
  easing: easingFunctions.easeInOut,
};

const keyframes = [
    initialView, sfView1, sfView2, sfView3, bayAreaView, bayAreaViewPause,
     billboard1, billboard3, 
    lastView,
];


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
    const [visualizationMode, setVisualizationMode] = useState("offset"); 
    const layerId = "saved-route-line";
    const sourceId = "saved-route"; // The base sourceId used in RouteLayer


    const basePath = getBasePath();
    const routesUrl = `${basePath}/assets/routes/routes.geojson`;
    const [showSmoothed, setShowSmoothed] = useState(true);
    const toggleSmoothed = () => setShowSmoothed(s => !s);
    
    // State to track the current view (true = Bay Area, false = SF)
    const [isZoomedOut, setIsZoomedOut] = useState(false);

    // State to track if the map has finished loading
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    const [colorMode, setColorMode] = useState(COLOR_MODES.MONTH);

    // route data
    const [geoJSON, setGeoJSON] = useState([]);

    const [resetTripsOverlay, setResetTripsOverlay] = useState([false])

    // [KEYFRAME ANIMATION] Initialize keyframe animation system
    const tripsOverlayRef = useRef(null);
    
    const handleSequenceStart = () => {
        // Reset trips overlay when starting a new sequence
        if (tripsOverlayRef.current) {
            // Force restart of the trips animation
            tripsOverlayRef.current.restart?.();
        }
    };


    // Inside a component:
    const {status, index: currentKeyframeIndex, pause, resume, reset, next, previous} = useKeyframeAnimation(
        map.current, 
        keyframes, 
        {
            autoStart: isAutoStart,         // start automatically once map loads
            autoResetOnEnd: false,   // set to true if you want index to return to 0 when finished
            onStart: () => {/* optional */},
            onEnd: () => {/* optional */},
        }
    );

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
            style: `https://api.maptiler.com/maps/019934cc-16f4-70e2-b59a-96734dcc38bf/style.json?key=pWuuKuOsL6jBB1Gt1ClK`,
            center: initialState.center,
            zoom: initialState.zoom,
            maxPitch: 89,
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
                    totalKeyframes={keyframes.length}
                    isPlaying={status==="playing"}
                    isPaused={status==="paused"}
                    isAutoPlaying={isAutoStart}
                    onNext={next}
                    onPrevious={previous}
                    onResume={resume}
                    onStop={pause}
                    onReset={() => {reset(); setResetTripsOverlay(true)}}
                    onToggleView={toggleView}
                    isZoomedOut={isZoomedOut}
                    onToggleSmoothed={toggleSmoothed}
                    showSmoothed={showSmoothed}
                    viewInfo={viewInfo}
                    setColorMode={setColorMode}
                />
            )}


            <div ref={mapContainer} className="map" style={{ width: '100%', height: '100%' }} />
            {isMapLoaded && (
                <>
                    {/* camera stable by disabling fit; expose data upward */}
                    
                    <RouteLayer 
                        map={map.current} 
                        url={routesUrl}
                        onData={handleGeojson} 
                        fitOnLoad={false} 
                        showSmoothed={showSmoothed}  
                        colorMode={colorMode}
                        sourceId={sourceId}
                        layerId={layerId}
                    />

                    {map.current && geoJSON && geoJSON.features && Object.keys(geoJSON.features).length > 0 && (
                           <TripsOverlayProvider map={map.current}>
                                 <TripsOverlaySeries
                                id={"trips-overlay1"}
                                map={map.current}
                                geoJSON={geoJSON}
                                fps={30}
                                trail={900}
                                opacity={.3}
                                lineWidth={1.5}
                                // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                timeSpeedProfile={{ speeds: [30, 50, 150, 60, 2000, 16000], dts: [3,2, 8.5, 6, 6] }}
                                playState={status}
                                reset={resetTripsOverlay}
                                onReset = {() =>{setResetTripsOverlay(false)}}
                                colorMode = {"none"}
                            />


                            <TripsOverlaySeries
                                id={"trips-overlay2"}
                                map={map.current}
                                geoJSON={geoJSON}
                                fps={30}
                                trail={2}
                                opacity={.6}
                                lineWidth={1.5}
                                // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                timeSpeedProfile={{ speeds: [0, 0, 20000, 100], dts: [16.2, 7, .1] }}
                                playState={status}
                                reset={resetTripsOverlay}
                                onReset = {() =>{setResetTripsOverlay(false)}}
                                colorMode = {"months"}
                            /> 
   </TripsOverlayProvider>
                    )}

                    
                    {/* Hover overlay — point it at your endpoint hit layer (or glow layers) */}
                    {map.current && (
                        <MapHoverOverlay
                            map={map.current}
                            layers={[`${layerId}-endpoint-hit`]}
                            offset={{ x: 14, y: 14 }}
                        />
                    )}

                    {/* Location labels — show location names at zoom 13-15 */}
                    {map.current && (
                        <MapLocationLabels
                            map={map.current}
                            sourceIdOrigin={`${sourceId}-origin-point`}
                            sourceIdEnd={`${sourceId}-endpoint-point`}
                            minZoomM={13}
                            maxZoomM={15}
                            showOriginLabel={true}
                            filterEvents={[
                                "Built on Bedrock Demo Night",
                                "AI After Hours", 
                                "Pitch Global: Startup Pitch Night",
                                "Phone a (AI) Friend with Anthropic",
                                "Robotics Club SF: Simulation as a Service"
                            ]}
                        />
                    )}
                </>                 
            )}
        </div>
    );
}
