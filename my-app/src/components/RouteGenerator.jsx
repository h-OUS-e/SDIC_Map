'use client';

import maplibregl from 'maplibre-gl';
import React, { useMemo, useState } from 'react';

// Small helpers
async function geocode(query, apiKey) {
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${apiKey}&limit=1&language=en&country=US`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  const feat = data?.features?.[0];
  if (!feat?.center) throw new Error(`No result for: ${query}`);
  // MapTiler returns [lon, lat] in 'center'
  return { lon: feat.center[0], lat: feat.center[1], name: feat.place_name || query };
}

async function routeOSRM(a, b, profile = 'driving') {
  // OSRM expects lon,lat;lon,lat and can return GeoJSON geometry
  const base = 'https://router.project-osrm.org/route/v1';
  const url = `${base}/${profile}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`);
  const data = await res.json();
  const r = data?.routes?.[0];
  if (!r?.geometry) throw new Error('No route geometry returned');
  // Wrap as a Feature so we can save/render consistently
  return {
    type: 'Feature',
    properties: {
      distance_m: r.distance,
      duration_s: r.duration,
      profile
    },
    geometry: r.geometry // GeoJSON LineString in [lon, lat]
  };
}

function haversineMeters([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function routeOSRMWithTail(a, b, profile = "walking") {
  const base = "https://router.project-osrm.org/route/v1";
  const url = `${base}/${"profile"}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (${res.status}) for: ${a.name} → ${b.name}`);
  const data = await res.json();
  const r = data?.routes?.[0];
  if (!r?.geometry) throw new Error(`No route geometry for: ${a.name} → ${b.name}`);

  const geom = r.geometry;
  const coords = geom.coordinates.slice();
  const last = coords[coords.length - 1];
  const tail = [b.lon, b.lat] ;

  // append a short “last meters to door” segment
  coords.push(tail);
  const extra = haversineMeters(last, tail);

  return {
    type: "Feature",
    properties: {
      distance_m: r.distance + extra,
      duration_s: r.duration,               // keep car time; (see option 3 to model walking time)
      from: a.name || "from",
      to: b.name || "to",
      profile,
    },
    geometry: { type: "LineString", coordinates: coords },
  };
}

function downloadJSON(obj, filename = 'route.geojson') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/geo+json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function RouteGenerator({
  map,
  apiKey,
  addresses, // optional: [from, to]
  profile = 'driving',
  autoFit = true,
  sourceId = 'commute-route',
  layerId = 'commute-route-line'
}) {
  const [from, setFrom] = useState(addresses?.[0] || '');
  const [to, setTo] = useState(addresses?.[1] || '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [routeFeature, setRouteFeature] = useState(null);

  const canBuild = useMemo(() => !!from && !!to && !!apiKey, [from, to, apiKey]);

  const addOrUpdateLayer = (feature) => {
    if (!map) return;
    const fc = { type: 'FeatureCollection', features: [feature] };
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: fc });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#00D1FF',
          'line-width': 4,
          'line-opacity': 0.9
        }
      });
    } else {
      const src = map.getSource(sourceId);
      if (src && src.setData) src.setData(fc);
    }

    // Fit bounds to the route
    const coords = feature.geometry.coordinates;
    const bounds = new maplibregl.LngLatBounds();
    coords.forEach(c => bounds.extend(c));
    if (!bounds.isEmpty() && autoFit) {
      map.fitBounds(bounds, { padding: 60, duration: 900 });
    }
  };

  const buildRoute = async () => {
    try {
      setErr(null);
      setLoading(true);
      const [p1, p2] = await Promise.all([geocode(from, apiKey), geocode(to, apiKey)]);
      const feat = await routeOSRMWithTail(p1, p2, profile);
      setRouteFeature(feat);
      // Immediately render on the map
      addOrUpdateLayer(feat);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onDownload = () => {
    if (!routeFeature) return;
    const filename = `route_${profile}.geojson`;
    downloadJSON({ type: 'FeatureCollection', features: [routeFeature] }, filename);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        zIndex: 2,
        background: 'rgba(20,20,20,0.85)',
        color: 'white',
        padding: 12,
        border: '1px solid #444',
        borderRadius: 8,
        maxWidth: 380
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Build commute route</div>

      {!addresses && (
        <>
          <input
            placeholder="From (address)"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ width: '100%', marginBottom: 6, padding: 8, borderRadius: 4, border: '1px solid #555', background: '#111', color: 'white' }}
          />
          <input
            placeholder="To (address)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: 8, borderRadius: 4, border: '1px solid #555', background: '#111', color: 'white' }}
          />
        </>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={buildRoute}
          disabled={!canBuild || loading}
          style={{ padding: '8px 12px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: 6, cursor: canBuild && !loading ? 'pointer' : 'not-allowed' }}
        >
          {loading ? 'Building…' : 'Build & Render'}
        </button>
        <button
          onClick={onDownload}
          disabled={!routeFeature}
          style={{ padding: '8px 12px', background: '#222', color: 'white', border: '1px solid #555', borderRadius: 6, cursor: routeFeature ? 'pointer' : 'not-allowed' }}
        >
          Download .geojson
        </button>
      </div>

      {err && <div style={{ color: '#ff8a80', marginTop: 8 }}>⚠️ {err}</div>}
      {routeFeature && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
          Distance: {(routeFeature.properties.distance_m / 1000).toFixed(2)} km ·
          Duration: {(routeFeature.properties.duration_s / 60).toFixed(0)} min
        </div>
      )}
    </div>
  );
}
