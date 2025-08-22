'use client';

import maplibregl from 'maplibre-gl';
import React, { useEffect, useState } from 'react';

export default function RouteLayer({
  map,
  url, // optional: URL to a .geojson file
  sourceId = 'saved-route',
  layerId = 'saved-route-line',
  opacity = 0.3 //  transparency (0.0 = invisible, 1.0 = solid)
}) {
  const [geojson, setGeojson] = useState(null);

  // Load from URL if provided
  useEffect(() => {
    let cancelled = false;
    if (!url) return;
    (async () => {
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!cancelled) setGeojson(data);
      } catch (e) {
        console.error('Failed to load route from URL', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Add or update layer when we have data
  useEffect(() => {
    if (!map || !geojson) return;

    // Ensure FeatureCollection
    const fc = geojson.type === 'FeatureCollection' ? geojson : { type: 'FeatureCollection', features: [geojson] };

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: fc });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#3838f2',
          'line-width': 5,
          'line-opacity': 0.3
        }
      });
    } else {
        const src = map.getSource(sourceId);
        if (src && src.setData) src.setData(fc);
    }

    // Fit to bounds
    try {
      const features = fc.features || [];
      const bounds = new maplibregl.LngLatBounds();
      features.forEach(f => {
        if (f.geometry?.type === 'LineString') {
          f.geometry.coordinates.forEach(c => bounds.extend(c));
        } else if (f.geometry?.type === 'MultiLineString') {
          f.geometry.coordinates.flat().forEach(c => bounds.extend(c));
        }
      });
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 });
    } catch (e) {
      // ignore fit errors
    }

    return () => {
      // Optional cleanup if you remove the component entirely
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, geojson, sourceId, layerId]);

  // Local file loader
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setGeojson(data);
    } catch (err) {
      console.error('Invalid GeoJSON file', err);
      alert('Invalid GeoJSON file');
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        zIndex: 2,
        background: 'rgba(20,20,20,0.85)',
        color: 'white',
        padding: 12,
        border: '1px solid #444',
        borderRadius: 8
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Render saved route</div>
      <input type="file" accept=".geojson,application/geo+json,application/json" onChange={onFile} />
    </div>
  );
}
