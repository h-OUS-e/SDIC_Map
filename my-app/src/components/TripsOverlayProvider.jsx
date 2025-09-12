import { TripsLayer } from "@deck.gl/geo-layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

// Context for managing a single overlay instance
const TripsOverlayContext = createContext(null);

// Provider component that manages the single MapboxOverlay instance
export function TripsOverlayProvider({ map, children }) {
  const overlayRef = useRef(null);
  const layersMapRef = useRef(new Map());
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // Create and attach the single overlay
  useEffect(() => {
    if (!map) return;

    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({ interleaved: true });
      map.addControl(overlayRef.current);
    }

    return () => {
      if (overlayRef.current) {
        try {
          map.removeControl(overlayRef.current);
        } catch {}
        overlayRef.current = null;
      }
    };
  }, [map]);

  // Register a layer
  const registerLayer = (id, layerFactory) => {
    layersMapRef.current.set(id, layerFactory);
    updateOverlay();
  };

  // Unregister a layer
  const unregisterLayer = (id) => {
    layersMapRef.current.delete(id);
    updateOverlay();
  };

  // Update the overlay with all registered layers
  const updateOverlay = () => {
    if (!overlayRef.current) return;
    
    const allLayers = [];
    layersMapRef.current.forEach((layerFactory) => {
      const layer = layerFactory();
      if (layer) allLayers.push(layer);
    });
    
    overlayRef.current.setProps({ layers: allLayers });
    setUpdateTrigger(prev => prev + 1); // Force re-render if needed
  };

  const contextValue = {
    registerLayer,
    unregisterLayer,
    updateOverlay,
    isReady: !!overlayRef.current
  };

  return (
    <TripsOverlayContext.Provider value={contextValue}>
      {children}
    </TripsOverlayContext.Provider>
  );
}

// Individual trip series component
export function TripsOverlaySeries({
  id,
  geoJSON,
  trail = 900,
  lineWidth = 4,
  fps = 30,
  opacity = 0.6,
  loopDelay = 5,
  loop = true,
  timeSpeedProfile = null,
  playState = 'playing',
  reset,
  onReset,
  colorMode = "none"
}) {
  const context = useContext(TripsOverlayContext);
  const rafRef = useRef(null);
  const startWallMsRef = useRef(null);
  const lastTickMsRef = useRef(0);
  const currentTimeRef = useRef(0);
  const holdUntilRef = useRef(null);
  const resetRef = useRef(false);
  const colorModeRef = useRef(colorMode);

  // Mock implementations - replace with your actual implementations
  const toTripsData = (geojson) => {
    // Your actual toTripsData implementation
    return [];
  };

  const hexToRGB = (hex) => [255, 0, 0];
  const getFeatureColor = (path, mode, defaultColor) => "#FF0000";
  const DEFAULT_PATH_COLOR = [128, 128, 128];
  const END_COLOR = "#0000FF";

  // Prepare data
  const data = toTripsData(geoJSON, timeSpeedProfile);
  const layerData = useMemo(() => data, [data]);

  // Calculate max timestamp
  const maxTs = useMemo(() => {
    let maxT = 0;
    for (const d of layerData) {
      const ts = d?.timestamps;
      if (Array.isArray(ts) && ts.length) {
        const t = ts[ts.length - 1];
        if (Number.isFinite(t) && t > maxT) maxT = t;
      }
    }
    return maxT;
  }, [layerData]);

  // Create layer factory
  const createLayer = (currentTime) => {
    return new TripsLayer({
      id: id,
      beforeId: "saved-route-line-endpoint-glow4",
      data: layerData,
      opacity,
      currentTime: currentTime,
      trailLength: trail,
      getPath: (d) => d.path,
      getTimestamps: (d) => d.timestamps,
      getColor: (path, { index }) => {
        if (colorModeRef.current === "usePathColor") {
          return path.color ? path.color : DEFAULT_PATH_COLOR;
        } else {
          const HEX = getFeatureColor(path, colorModeRef.current, END_COLOR);
          const color = hexToRGB(HEX);
          return color ? color : DEFAULT_PATH_COLOR;
        }
      },
      widthUnits: "pixels",
      getWidth: lineWidth,
      rounded: true,
      capRounded: true,
      jointRounded: true,
    });
  };

  // Register this layer with the context
  useEffect(() => {
    if (!context?.isReady) return;

    // Register a layer factory that uses the current time
    const layerFactory = () => createLayer(currentTimeRef.current);
    context.registerLayer(id, layerFactory);

    return () => {
      context.unregisterLayer(id);
    };
  }, [id, context, layerData, lineWidth, opacity, trail]);

  // Handle reset
  useEffect(() => {
    if (reset === undefined || resetRef.current === true || reset === false) return;
    resetRef.current = true;
    currentTimeRef.current = 0;
    holdUntilRef.current = null;
    startWallMsRef.current = null;
    context?.updateOverlay();
    onReset();
    resetRef.current = false;
  }, [reset, onReset, context]);

  // Update color mode
  useEffect(() => {
    colorModeRef.current = colorMode;
  }, [colorMode]);

  // Animation loop
  useEffect(() => {
    if (!context?.isReady) return;

    if (playState === 'paused' || playState === 'idle') {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    startWallMsRef.current = null;
    lastTickMsRef.current = 0;

    const frameInterval = 1000 / Math.max(1, fps);

    const tick = (tMs) => {
      if (tMs - lastTickMsRef.current < frameInterval) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTickMsRef.current = tMs;

      if (startWallMsRef.current == null) startWallMsRef.current = tMs;

      const elapsedS = (tMs - startWallMsRef.current) / 1000;
      let current;

      if (loop && maxTs > 0) {
        if (holdUntilRef.current != null) {
          if (tMs < holdUntilRef.current) {
            current = maxTs - 1e-6;
          } else {
            holdUntilRef.current = null;
            current = 0;
            startWallMsRef.current = tMs;
          }
        } else {
          const candidate = currentTimeRef.current + elapsedS;
          if (candidate >= maxTs && (loopDelay ?? 0) > 0) {
            current = maxTs - 1e-6;
            holdUntilRef.current = tMs + (loopDelay * 1000);
          } else {
            current = candidate % maxTs;
          }
        }
      } else {
        current = Math.min(currentTimeRef.current + elapsedS, maxTs);
      }

      currentTimeRef.current = current;
      startWallMsRef.current = tMs;

      // Update the overlay with all layers
      context.updateOverlay();

      if (!loop && current >= maxTs) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [context, playState, fps, loop, maxTs, loopDelay]);

  return null;
}

// Example usage component
export default function Example() {
  const [map, setMap] = useState(null);
  const [status, setStatus] = useState('playing');
  const [resetTripsOverlay, setResetTripsOverlay] = useState(false);
  
  // Mock GeoJSON data
  const geoJSON = { type: "FeatureCollection", features: [] };

  return (
    <div>
      <div style={{ padding: '20px', background: '#f0f0f0', borderRadius: '8px', marginBottom: '20px' }}>
        <h2>Multiple TripsOverlay Layers Example</h2>
        <p>This example shows how to properly manage multiple trip layers with a single MapboxOverlay instance.</p>
        
        <div style={{ marginTop: '10px' }}>
          <button 
            onClick={() => setStatus(status === 'playing' ? 'paused' : 'playing')}
            style={{ marginRight: '10px', padding: '8px 16px' }}
          >
            {status === 'playing' ? 'Pause' : 'Play'}
          </button>
          <button 
            onClick={() => setResetTripsOverlay(true)}
            style={{ padding: '8px 16px' }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Wrap your trip layers in the provider */}
      <TripsOverlayProvider map={map}>
        <TripsOverlaySeries
          id="trips-overlay1"
          geoJSON={geoJSON}
          fps={30}
          trail={900}
          opacity={0.3}
          lineWidth={1.5}
          timeSpeedProfile={{ speeds: [30, 50, 150, 60, 2000, 16000], dts: [3, 2, 8.5, 6, 6] }}
          playState={status}
          reset={resetTripsOverlay}
          onReset={() => setResetTripsOverlay(false)}
          colorMode="none"
        />

        <TripsOverlaySeries
          id="trips-overlay2"
          geoJSON={geoJSON}
          fps={30}
          trail={2}
          opacity={0.6}
          lineWidth={1.5}
          timeSpeedProfile={{ speeds: [0, 0, 20000, 100], dts: [16.2, 7, 0.1] }}
          playState={status}
          reset={resetTripsOverlay}
          onReset={() => setResetTripsOverlay(false)}
          colorMode="months"
        />
      </TripsOverlayProvider>

      <div style={{ marginTop: '20px', padding: '15px', background: '#e8f4ff', borderRadius: '8px' }}>
        <h3>Key Changes:</h3>
        <ul>
          <li><strong>Single MapboxOverlay:</strong> All layers share one overlay instance managed by the Provider</li>
          <li><strong>Layer Registration:</strong> Each TripsOverlaySeries registers its layer factory with the context</li>
          <li><strong>Coordinated Updates:</strong> The overlay updates with all registered layers at once</li>
          <li><strong>No Conflicts:</strong> With interleaved: true, layers properly integrate with Mapbox's layer system</li>
        </ul>
      </div>
    </div>
  );
}