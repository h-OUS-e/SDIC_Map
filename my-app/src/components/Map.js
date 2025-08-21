'use client';

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef, useState } from 'react';
import RouteGenerator from './RouteGenerator';
import RouteLayer from './RouteLayer'; // Import the new component
const MAPTILER_API_KEY = "ZAMOU7NPssEmiSXsELqD";


export default function Map() {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [API_KEY] = useState(MAPTILER_API_KEY);
    
    // State to track the current view (true = Bay Area, false = SF)
    const [isZoomedOut, setIsZoomedOut] = useState(false);

    // State to track if the map has finished loading
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    // Define the two camera view configurations
    const sfView = {
        center: [-122.4194, 37.7749], // San Francisco
        zoom: 12,
    };

    const bayAreaView = {
        center: [-122.25, 37.75], // A central point to see SF, Berkeley, and Palo Alto
        zoom: 9.5,
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

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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

            <div 
                ref={mapContainer} 
                className="map"
                style={{ width: '100%', height: '100%' }}
            />
            {isMapLoaded && (
                <>
                    <RouteLayer map={map.current} />
                    <RouteGenerator map={map.current} apiKey={API_KEY} />
                </>                 
            )}
        </div>
    );
}