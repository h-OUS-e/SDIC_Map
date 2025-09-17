'use client';

import maplibregl from 'maplibre-gl';
import React, { useEffect, useRef, useState } from 'react';
import map_style from '../app/style.json';
import RouteLayer, { CLASS_MODES, COLOR_MODES } from './RouteLayer';
import TripsOverlaySeries, { TripsOverlayProvider } from './TripsOverlaySeries';

// [TRIPS ADD]
// import { toTripsData } from '../utils/prepareTrips';
import BillboardLayer from "./BillboardLayer";
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
    duration: 12000,
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

// Billboard data with the coordinates picked
const billboardData = [
    {
        id: "billboard-1",
        coordinates: [-122.40493, 37.64193],
        name: "Billboard 1",
        imageUrl: "/billboards/b1.jpg" // Local image
    },
    {
        id: "billboard-2", 
        coordinates: [-122.41014, 37.65219],
        name: "Billboard 2",
        imageUrl: "/billboards/b2.jpg" // Local image
    },
    {
        id: "billboard-3",
        coordinates: [-122.39128, 37.67396], 
        name: "Billboard 3",
        imageUrl: "/billboards/b3.jpg" // Local image
    },
    {
        id: "billboard-4",
        coordinates: [-122.42230, 37.71933],
        name: "Billboard 4", 
        imageUrl: "/billboards/b4.jpg" // Local image
    },
    {
        id: "billboard-5",
        coordinates: [-122.44058, 37.67395],
        name: "Billboard 5",
        imageUrl: "/billboards/b5.jpg" // Local image
    },
    {
        id: "billboard-6",
        coordinates: [-122.39379, 37.70915],
        name: "Billboard 6",
        imageUrl: "/billboards/b6.jpg" 
    },
    {
        id: "billboard-7",
        coordinates: [-122.40760, 37.66095],
        name: "Billboard 7",
        imageUrl: "/billboards/b7.jpg" 
    },
    {
        id: "billboard-8",
        coordinates: [-122.41163, 37.67993],
        name: "Billboard 8",
        imageUrl: "/billboards/b8.jpg" 
    },
    {
        id: "billboard-9",
        coordinates: [-122.43926, 37.69813],
        name: "Billboard 9",
        imageUrl: "/billboards/b9.jpg" 
    },
    {
        id: "billboard-10",
        coordinates: [-122.40001, 37.69972],
        name: "Billboard 10",
        imageUrl: "/billboards/b10.jpg" 
    },
    {
        id: "billboard-11",
        coordinates: [-122.40699, 37.76111],
        name: "Billboard 11",
        imageUrl: "/billboards/b11.jpg" 
    },
    {
        id: "billboard-12",
        coordinates: [-122.40473, 37.76223],
        name: "Billboard 12",
        imageUrl: "/billboards/b12.jpg" 
    },
    {
        id: "billboard-13",
        coordinates: [-122.40742, 37.76454],
        name: "Billboard 13",
        imageUrl: "/billboards/b13.jpg" 
    },
    {
        id: "billboard-14",
        coordinates: [-122.41157, 37.76533 ],
        name: "Billboard 14",
        imageUrl: "/billboards/b14.jpg" 
    },
    {
        id: "billboard-15",
        coordinates: [-122.39532, 37.66450],
        name: "Billboard 15",
        imageUrl: "/billboards/b15.jpg" 
    },
    {
        id: "billboard-17",
        coordinates: [-122.40548, 37.76747],
        name: "Billboard 17",
        imageUrl: "/billboards/b17.jpg" 
    },
    {
        id: "billboard-18",
        coordinates: [-122.40141, 37.72321],
        name: "Billboard 18",
        imageUrl: "/billboards/b18.jpg" 
    },
    {
        id: "billboard-19",
        coordinates: [-122.40834, 37.73743],
        name: "Billboard 19",
        imageUrl: "/billboards/b19.jpg" 
    },
    {
        id: "billboard-20",
        coordinates: [-122.40429, 37.75307],
        name: "Billboard 20",
        imageUrl: "/billboards/b20.jpg" 
    },
    {
        id: "billboard-21",
        coordinates: [-122.40388, 37.74683],
        name: "Billboard 21",
        imageUrl: "/billboards/b21.jpg" 
    },
    {
        id: "billboard-22",
        coordinates: [-122.42828, 37.76771],
        name: "Billboard 22",
        imageUrl: "/billboards/b22.jpg" 
    },

    // lng: -122.40834, lat: 37.73743

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
    const [colorMode, setColorMode] = useState(COLOR_MODES.CLASS);
    const [nodeColorMode, setNodeColorMode] = useState(COLOR_MODES.None);
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

    // clicked coordinates for helper function
    const [clickedCoordinates, setClickedCoordinates] = useState(null);

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
            // style: `https://api.maptiler.com/maps/019934cc-16f4-70e2-b59a-96734dcc38bf/style.json?key=pWuuKuOsL6jBB1Gt1ClK`,
            style: map_style,
            center: initialState.center,
            zoom: initialState.zoom,
            maxPitch: 89,
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        // When the map's style has loaded, set our state to true
        map.current.on('load', () => {
            setIsMapLoaded(true);
        });

        // Add click event listener to capture coordinates
        map.current.on('click', (e) => {
            const { lng, lat } = e.lngLat;
            setClickedCoordinates({ lng, lat });
            console.log(`Clicked coordinates: lng=${lng.toFixed(5)}, lat=${lat.toFixed(5)}`);
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
                    clickedCoordinates={clickedCoordinates}
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
                                    trail={8}
                                    opacity={.3}
                                    lineWidth={1.5}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [30, 50, 150, 60, 2000, 16000], dts: [3,2, 7.5, 1, 1] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"none"}

                                />

    
                                {/* Showing design events */}
                                <TripsOverlaySeries
                                    id={"trips-overlay2.1.1"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={1.5}
                                    opacity={1}
                                    lineWidth={4}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 5000, 500, 500000, 500000], dts: [14.6, 2, 1,.1, 5] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"class"}
                                    classFilters={[CLASS_MODES.design_events]}
                                />  

                                {/* Showing art exhibit events */}
                                <TripsOverlaySeries
                                    id={"trips-overlay2.1.2"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={2}
                                    opacity={1}
                                    lineWidth={4}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 5000, 500, 500000, 500000], dts: [16, 2, 1,.1,5] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"class"}
                                    classFilters={[CLASS_MODES.art_exhibit]}
                                /> 

                                {/* Showing art exhibit events */}
                                <TripsOverlaySeries
                                    id={"trips-overlay2.1.3"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={2}
                                    opacity={1}
                                    lineWidth={4}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 5000, 500, 500000, 500000], dts: [17.4, 2, 1,.1,5] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"class"}
                                    classFilters={[CLASS_MODES.academic_conferences]}
                                /> 

                                {/* Showing Tech Events */}
                                <TripsOverlaySeries
                                    id={"trips-overlay2.2.1"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={2}
                                    opacity={.7}
                                    lineWidth={4}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 5000, 500, 500000, 500000], dts: [18.8, 2, 1,.1,5] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"class"}
                                    classFilters={[CLASS_MODES.tech_meetups]}
                                /> 

                                <TripsOverlaySeries
                                    id={"trips-overlay2.2.2"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={2}
                                    opacity={.7}
                                    lineWidth={4}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 5000, 500, 500000, 500000], dts: [20.2, 2, 1,.1,5] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"class"}
                                    classFilters={[CLASS_MODES.startup_pitches]}
                                /> 

                                <TripsOverlaySeries
                                    id={"trips-overlay2.2.3"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={2}
                                    opacity={.7}
                                    lineWidth={4}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 5000, 500, 500000, 500000], dts: [21.6, 2, 1,.1, 5] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"class"}
                                    classFilters={[CLASS_MODES.tech_summit]}
                                /> 

                                {/* Showing other niche events under the banner of "social and cultural" events */}
                                <TripsOverlaySeries
                                    id={"trips-overlay2.3"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={2}
                                    opacity={.1}
                                    lineWidth={4}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 5000, 500, 500000,500000], dts: [23, 2, 1,.1,5] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"class"}
                                    classFilters={[CLASS_MODES.networking_dinner, CLASS_MODES.local_protests, CLASS_MODES.gamer_meetups, CLASS_MODES.comedy_shows]}
                                /> 
                                {/* Showing all classes at once */}
                                {/* <TripsOverlaySeries
                                    id={"trips-overlay2.4"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={5}
                                    opacity={1}
                                    lineWidth={2}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 12000, 150], dts: [23.0, 7, 1] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"class"}
                                />  */}

                                {/* Single visual burst of all roads without class type */}
                                <TripsOverlaySeries
                                    id={"trips-overlay3.1"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={1}
                                    opacity={.3}
                                    lineWidth={2}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 25000, 5000], dts: [30, 6, 6] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"none"}
                                />  

                                {/* Single visual burst of all roads when zoomed out showing roads far away */}
                                <TripsOverlaySeries
                                    id={"trips-overlay3.2"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={2}
                                    opacity={.5}
                                    lineWidth={2}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 50000, 10,50000], dts: [34, 4, 5,1] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"none"}
                                />  

                                <TripsOverlaySeries
                                    id={"trips-overlay4.1"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={1}
                                    opacity={.5}
                                    lineWidth={8}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 10000, 5000], dts: [42, 1, 1] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"none"}
                                />  

                                <TripsOverlaySeries
                                    id={"trips-overlay4.2"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={1}
                                    opacity={.5}
                                    lineWidth={10}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 10000, 5000,50000], dts: [45, 1, 1,1] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"none"}
                                />  

                                <TripsOverlaySeries
                                    id={"trips-overlay4.3"}
                                    map={map.current}
                                    geoJSON={geoJSON}
                                    fps={30}
                                    trail={1}
                                    opacity={.7}
                                    lineWidth={12}
                                    // if you have 4 speeds, you need 3 dts. dts are in seconds and define how long it takes to go from s1 to s2
                                    timeSpeedProfile={{ speeds: [0, 0, 10000, 4000,50000], dts: [48.4, 1, 2,1] }}
                                    playState={status}
                                    reset={resetTripsOverlay}
                                    onReset = {() =>{setResetTripsOverlay(false)}}
                                    colorMode = {"none"}
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

                    {/* Billboard Layer — show billboard images at specific coordinates */}
                    {map.current && (
                        <BillboardLayer
                            map={map.current}
                            billboardData={billboardData}
                            minZoom={14}
                            maxZoom={18}
                        />
                    )}
                </>                 
            )}
        </div>
    );
}
