'use client';

import maplibregl from 'maplibre-gl';
import React, { useEffect, useRef, useState } from 'react';
import RouteGenerator from './RouteGenerator';
import RouteLayer from './RouteLayer';

// [TRIPS ADD]
import { toTripsData } from '../utils/prepareTrips';
import MapHoverOverlay from "./MapHoverOverlay";
import TripsOverlay from './TripsOverlay';

const MAPTILER_API_KEY = "ZAMOU7NPssEmiSXsELqD";


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

    const basePath = getBasePath();
    const routesUrl = `${basePath}/assets/routes/routes.geojson`;
    const [showSmoothed, setShowSmoothed] = useState(true);
    const toggleSmoothed = () => setShowSmoothed(s => !s);
    
    // State to track the current view (true = Bay Area, false = SF)
    const [isZoomedOut, setIsZoomedOut] = useState(false);

    // State to track if the map has finished loading
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    // [TRIPS ADD] animated trips data
    const [trips, setTrips] = useState([]);

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

    // Initialize map
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        // Use the initial SF view when the map loads
        const initialState = sfView;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${API_KEY}`,
            center: initialState.center,
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
    const handleGeojson = (fc) => {
        try {
            const t = toTripsData(fc); // -> [{ path, timestamps, color }]
            setTrips(t);
            console.log(`[Trips] prepared ${t.length} routes`);
        } catch (e) {
            console.error('Failed to prepare trips', e);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
            {/* A Switch button to toggle between SF zoom in and out.*/}
            <button
                onClick={toggleView}
                style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                zIndex: 1, // Ensure button is on top of the map
                padding: '10px 15px',
                backgroundColor: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                }}
            >
                {isZoomedOut ? 'Zoom to San Francisco' : 'Zoom to Bay Area'}
            </button>

            {/* Smoothed/original toggle */}
            <button
                onClick={toggleSmoothed}
                aria-pressed={showSmoothed}
                style={{
                    position: 'absolute',
                    top: '60px',            // stacked below the first button
                    left: '20px',
                    zIndex: 1,
                    padding: '10px 15px',
                    backgroundColor: showSmoothed ? '#3b82f6' : '#333',
                    color: 'white',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '16px',
                }}
                >
                {showSmoothed ? 'Show Original' : 'Show Smooth'}
            </button>

            {/* on-map readout */}
            <div
                style={{
                position: 'absolute',
                left: '20px',
                bottom: '20px',
                zIndex: 1,
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                padding: '8px 10px',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '13px',
                pointerEvents: 'none', 
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                }}
            >
                lng: {viewInfo.lng.toFixed(5)} | lat: {viewInfo.lat.toFixed(5)} | zoom:{' '}
                {viewInfo.zoom.toFixed(2)}
            </div>

            <div ref={mapContainer} className="map" style={{ width: '100%', height: '100%' }} />
            {isMapLoaded && (
                <>
                    {/* camera stable by disabling fit; expose data upward */}
                    <RouteLayer map={map.current} url={routesUrl} onData={handleGeojson} fitOnLoad={false} showSmoothed={showSmoothed} />

                    {map.current && trips.length > 0 && (
                        <TripsOverlay
                            map={map.current}
                            data={trips}
                            speed={25}    // tweak freely
                            trail={900}
                            opacity={.2}
                            lineWidth={3}
                            metersPerSecond={45}  // ~18 km/h cycling pace
                        />
                    )}

                    {/* <RouteGenerator map={map.current} apiKey={API_KEY} /> */}

                    
                    {/* Hover overlay — point it at your endpoint hit layer (or glow layers) */}
                    {map.current && (
                        <MapHoverOverlay
                            map={map.current}
                            layers={[`${layerId}-endpoint-hit`]}
                            offset={{ x: 14, y: 14 }}
                            render={(f) => {
                                // Custom content (uses whatever you copied onto endpoint properties)
                                const p = f.properties || {};
                                const [lng, lat] = f.geometry?.coordinates || [];
                                const show = (v) => (v && String(v).trim().length ? v : "—");
                                return (
                                    <div style={{ font: "500 12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" }}>
                                        <div><strong>Month:</strong> {show(p.month)}</div>
                                        <div><strong>Team:</strong> {show(p.team)}</div>
                                        <div><strong>Class:</strong> {show(p.class)}</div>
                                        <div><strong>Location:</strong> {show(p.location_name)}</div>
                                        <div><strong>Address:</strong> {show(p.address)}</div>
                                        <div><strong>Activity:</strong> {show(p.activity)}</div>
                                        <div><strong>Profile:</strong> {show(p.profile)}</div>
                                    </div>
                                );
                            }}
                        />
                    )};
                </>                 
            )}
        </div>
    );
}
