'use client';

import maplibregl from 'maplibre-gl';
import React, { useEffect, useMemo, useState } from 'react';

// ---------- CSV PARSER FOR NEW COLUMNS ----------
/**
 * Expects a header row like:
 * month;team;class;from;to;location_name;activity
 * Returns array of { month, team, class, from, to, location_name, activity }
 */
function parseRoutesCSV(csvText) {
  if (!csvText) return [];
  // Normalize line endings, split into lines, trim empties
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  // Detect delimiter — default to semicolon, but allow comma if someone exports differently
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';

  const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);

  // Minimal required columns
  const fromIdx = idx('from');
  const toIdx = idx('to');

  if (fromIdx === -1 || toIdx === -1) {
    throw new Error("CSV must include 'from' and 'to' columns in the header.");
  }

  const monthIdx = idx('month');
  const teamIdx = idx('team');
  const classIdx = idx('class');
  const locIdx = idx('location_name');
  const actIdx = idx('activity');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    // Simple split (no quoted-field support). If you need quotes, swap in a CSV lib.
    const parts = raw.split(delimiter).map(s => s.trim());
    const from = parts[fromIdx] || '';
    const to = parts[toIdx] || '';
    if (!from || !to) continue; // skip incomplete rows

    rows.push({
      month: monthIdx > -1 ? parts[monthIdx] || '' : '',
      team: teamIdx > -1 ? parts[teamIdx] || '' : '',
      class: classIdx > -1 ? parts[classIdx] || '' : '',
      from,
      to,
      location_name: locIdx > -1 ? parts[locIdx] || '' : '',
      activity: actIdx > -1 ? parts[actIdx] || '' : ''
    });
  }
  return rows;
}

// ---------- EXISTING HELPERS ----------
async function geocode(query, apiKey) {
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${apiKey}&limit=1&language=en&country=US`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  const feat = data?.features?.[0];
  if (!feat?.center) throw new Error(`No result for: ${query}`);
  return { lon: feat.center[0], lat: feat.center[1], name: feat.place_name || query };
}

async function routeOSRM(a, b, profile = 'driving') {
  const base = 'https://router.project-osrm.org/route/v1';
  const url = `${base}/${profile}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`);
  const data = await res.json();
  const r = data?.routes?.[0];
  if (!r?.geometry) throw new Error('No route geometry returned');
  return {
    type: 'Feature',
    properties: {
      distance_m: r.distance,
      duration_s: r.duration,
      profile
    },
    geometry: r.geometry
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

// ---------- UPDATED COMPONENT ----------
export default function RouteGenerator({
  map,
  apiKey,
  // Old prop still supported: either ['from','to'] or array of such pairs
  addresses,
  // New optional: pass CSV text directly (you can also upload via the UI)
  csvText,
  profile = 'driving',
  autoFit = true,
  sourceId = 'commute-route',
  layerId = 'commute-route-line'
}) {
  // Manual inputs (still supported)
  const [from, setFrom] = useState(addresses?.[0] || '');
  const [to, setTo] = useState(addresses?.[1] || '');

  // Parsed rows from the new CSV format
  const [rows, setRows] = useState([]);
  const [selectedRow, setSelectedRow] = useState(-1);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [routeFeature, setRouteFeature] = useState(null);

  // Parse incoming csvText prop if provided
  useEffect(() => {
    if (!csvText) return;
    try {
      const parsed = parseRoutesCSV(csvText);
      setRows(parsed);
      setSelectedRow(parsed.length ? 0 : -1);
    } catch (e) {
      setErr(e.message || String(e));
    }
  }, [csvText]);

  // If a row is selected, reflect its from/to in the inputs (visible & editable)
  useEffect(() => {
    if (selectedRow >= 0 && rows[selectedRow]) {
      setFrom(rows[selectedRow].from || '');
      setTo(rows[selectedRow].to || '');
    }
  }, [selectedRow, rows]);

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
      const feat = await routeOSRM(p1, p2, profile);

      // Attach some metadata from the selected CSV row if present
      const meta = selectedRow >= 0 && rows[selectedRow] ? rows[selectedRow] : {};
      feat.properties = {
        ...feat.properties,
        ...meta
      };

      setRouteFeature(feat);
      addOrUpdateLayer(feat);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onDownload = () => {
    if (!routeFeature) return;
    const meta = routeFeature.properties || {};
    const safe = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    // Prefer including activity/location_name if available
    const parts = [
      'route',
      safe(profile),
      safe(meta.month),
      safe(meta.team),
      safe(meta.location_name || ''),
      safe(meta.activity || '')
    ].filter(Boolean);
    const filename = `${parts.join('_')}.geojson`;
    downloadJSON({ type: 'FeatureCollection', features: [routeFeature] }, filename);
  };

  const onCSVUpload = async (file) => {
    setErr(null);
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseRoutesCSV(text);
      setRows(parsed);
      setSelectedRow(parsed.length ? 0 : -1);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const RowLabel = (r, i) => {
    const left = r.location_name || r.activity;
    const right = `${r.from} → ${r.to}`;
    const prefix = [r.month, r.team].filter(Boolean).join(' • ');
    return `${prefix ? prefix + ' | ' : ''}${left ? left + ' | ' : ''}${right}`;
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
        maxWidth: 420
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Build commute route</div>

      {/* CSV upload (optional) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          type="file"
          accept=".csv,.txt"
          onChange={(e) => onCSVUpload(e.target.files?.[0])}
          style={{ flex: 1 }}
        />
      </div>

      {/* Row selector if CSV rows are present */}
      {rows.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, opacity: 0.9, display: 'block', marginBottom: 4 }}>
            Select a row
          </label>
          <select
            value={selectedRow}
            onChange={(e) => setSelectedRow(Number(e.target.value))}
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #555', background: '#111', color: 'white' }}
          >
            {rows.map((r, i) => (
              <option key={i} value={i}>
                {RowLabel(r, i)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Manual inputs remain (auto-filled when a row is selected) */}
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
          {routeFeature?.properties?.location_name && (
            <> · Location: {routeFeature.properties.location_name}</>
          )}
          {routeFeature?.properties?.activity && (
            <> · Activity: {routeFeature.properties.activity}</>
          )}
        </div>
      )}
    </div>
  );
}
