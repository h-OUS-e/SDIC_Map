'use client';

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef, useState } from 'react';
import RouteGenerator from './RouteGenerator';
import RouteLayer from './RouteLayer'; 
import RouteLayerWithFrequency from "./RouteLayerWithFrequency" 

// [TRIPS ADD]
import TripsOverlay from './TripsOverlay';
import { toTripsData } from '../utils/prepareTrips';

const MAPTILER_API_KEY = "ZAMOU7NPssEmiSXsELqD";

export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [API_KEY] = useState(MAPTILER_API_KEY);

  const [isZoomedOut, setIsZoomedOut] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const [trips, setTrips] = useState([]);
  const lastFCRef = useRef(null);

  // remount key to restart TripsOverlay
  const [replayNonce, setReplayNonce] = useState(0);

  const [viewInfo, setViewInfo] = useState({
    lng: -122.4194,
    lat: 37.7749,
    zoom: 12,
  });

  const sfView = {
    center: [-122.43609, 37.77169],
    zoom: 12.9,
  };

  const bayAreaView = {
    center: [-122.27463, 37.61096],
    zoom: 10.25,
  };

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const initialState = sfView;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${API_KEY}`,
      center: initialState.center,
      zoom: initialState.zoom,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setIsMapLoaded(true);
    });

    return () => {
      map.current.remove();
      map.current = null;
    };
  }, [API_KEY]);

  // Sync view info
  useEffect(() => {
    if (!isMapLoaded || !map.current) return;

    const logView = () => {
      const c = map.current.getCenter();
      const z = map.current.getZoom();
      setViewInfo({ lng: c.lng, lat: c.lat, zoom: z });
      console.log(
        `[Map] center=(${c.lng.toFixed(5)}, ${c.lat.toFixed(5)}), zoom=${z.toFixed(2)}`
      );
    };

    logView();
    map.current.on('moveend', logView);
    map.current.on('zoomend', logView);
    map.current.on('rotateend', logView);

    return () => {
      if (!map.current) return;
      map.current.off('moveend', logView);
      map.current.off('zoomend', logView);
      map.current.off('rotateend', logView);
    };
  }, [isMapLoaded]);

  // Hide endpoint dots after load
  useEffect(() => {
    if (!isMapLoaded || !map.current) return;

    const timer = setTimeout(() => {
      try {
        map.current.setLayoutProperty('saved-route-origin-dot', 'visibility', 'none');
        map.current.setLayoutProperty('saved-route-destination-dot', 'visibility', 'none');
        console.log('[Map] Hiding origin/destination dots');
      } catch (err) {
        console.warn('No endpoint layers found to hide', err);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [isMapLoaded]);

  // Toggle SF / Bay Area view
  const toggleView = () => {
    if (!map.current) return;
    const targetView = isZoomedOut ? sfView : bayAreaView;
    map.current.flyTo({
      center: targetView.center,
      zoom: targetView.zoom,
      essential: true,
      duration: 2000,
    });
    setIsZoomedOut(!isZoomedOut);
  };

  // Prepare trips data
  const handleGeojson = (fc) => {
    try {
      lastFCRef.current = fc;
      const t = toTripsData(fc);
      setTrips(t);
      console.log(`[Trips] prepared ${t.length} routes`);
    } catch (e) {
      console.error('Failed to prepare trips', e);
    }
  };

  // Restart animation
  const restartAnimation = () => {
    if (lastFCRef.current) {
      setTrips(toTripsData(lastFCRef.current));
    }
    setReplayNonce((n) => n + 1);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Toggle button */}
      <button
        onClick={toggleView}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 2,
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

      {/* Restart trips button */}
      <button
        onClick={restartAnimation}
        style={{
          position: 'absolute',
          top: '20px',
          left: '210px',
          zIndex: 2,
          padding: '10px 15px',
          backgroundColor: '#333',
          color: 'white',
          border: '1px solid #555',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '16px',
        }}
      >
        Restart Trips
      </button>

      {/* Info readout */}
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

      <div
        ref={mapContainer}
        className="map"
        style={{ width: '100%', height: '100%' }}
      />

      {isMapLoaded && (
        <>
          {/* Keep RouteLayer mounted to trigger onData */}
          <RouteLayer
            map={map.current}
            url="/assets/routes/routes.geojson"
            onData={handleGeojson}
            fitOnLoad={false}
            opacity={0} 
          />

          {map.current && trips.length > 0 && (
            <TripsOverlay
              key={replayNonce}
              map={map.current}
              data={trips}
              speed={10.8}
              trail={900}
              opacity={0.25}
              lineWidth={3.1}
              fps={30}
            />
          )}

          {/* <RouteGenerator map={map.current} apiKey={API_KEY} /> */}
          {/* <RouteLayerWithFrequency ... /> */}
        </>
      )}
    </div>
  );
}
