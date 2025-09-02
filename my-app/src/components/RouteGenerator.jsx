'use client';

import maplibregl from 'maplibre-gl';
import React, { useMemo, useState } from 'react';

// Small helpers

async function geocodeGoogle(query, apiKey = GOOGLE_MAPS_KEY){
  if (!apiKey) throw new Error("Missing Google Maps API key");
  const params = new URLSearchParams({
    address: query,
    language: "en",
    components: "country:US", // optional: bias to US like your MapTiler call
    key: apiKey,
  });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status}) for: ${query}`);
  const data = await res.json();
  console.log("TEST", data)
  const r = data?.results?.[0];
  if (!r) throw new Error(`No geocoding result for: ${query}`);
  const { lat, lng } = r.geometry.location;
  return { lon: lng, lat, name: r.formatted_address || query };
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

const GOOGLE_MAPS_KEY = "AIzaSyDFTmGfQ-E8ENu8LKCHBAaWIojRwCjn900";


function toGTravelMode(p) {
  return p === "cycling" ? "BICYCLE" : p === "walking" ? "WALK" : "DRIVE";
}

// Google Routes API — returns GeoJSON already
async function routeGoogle(a, b, profile) {
  if (!GOOGLE_MAPS_KEY) throw new Error("Missing Google Maps API key");

  const body = {
    origin:       { location: { latLng: { latitude: a.lat, longitude: a.lon } } },
    destination:  { location: { latLng: { latitude: b.lat, longitude: b.lon } } },
    travelMode:   toGTravelMode(profile),
    polylineEncoding: "GEO_JSON_LINESTRING",
    polylineQuality:  "HIGH_QUALITY"
  };

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_KEY,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring"
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google routing failed (${res.status}) for: ${a.name} → ${b.name}`);
  const data = await res.json();
  const r = data?.routes?.[0];
  const line = r?.polyline?.geoJsonLinestring ;
  if (!line) throw new Error(`No Google route geometry for: ${a.name} → ${b.name}`);

  // optional: keep your "last meters to door" tail
  const coords = line.coordinates.slice();
  const last = coords[coords.length - 1];
  const tail = [b.lon, b.lat];
  const extra = haversineMeters(last, tail);
  if (extra > 0) coords.push(tail);

  // Google returns duration like "1234s" — parse to seconds
  const seconds = typeof r.duration === "string" ? parseFloat(r.duration.replace("s","")) : 0;

  return {
    type: "Feature",
    properties: {
      distance_m: r.distanceMeters,
      duration_s: seconds,
      from: a.name || "from",
      to: b.name || "to",
      profile,
    },
    geometry: { type: "LineString", coordinates: coords },
  };
}


  const buildRoute = async () => {
    try {
      setErr(null);
      setLoading(true);
      const [p1, p2] = await Promise.all([geocodeGoogle(from, GOOGLE_MAPS_KEY), geocodeGoogle(to, GOOGLE_MAPS_KEY)]);
      const feat = await routeGoogle(p1, p2, profile);
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
        bottom: 60,
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
