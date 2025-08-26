'use client';

import maplibregl from 'maplibre-gl';
import React, { useEffect, useRef, useState } from 'react';

export default function RouteLayer({
  map,
  url = '/assets/routes/route.geojson',
  sourceId = 'saved-route',
  layerId = 'saved-route-line',
  opacity = 0.3
}) {
  const [geojson, setGeojson] = useState(null);
  const popupRef = useRef(null);
  console.log("TEST", url)

  // helpers
  const escapeHtml = (s) =>
    String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const fmtLatLng = (lng, lat) =>
    `${lat?.toFixed?.(5) ?? lat}, ${lng?.toFixed?.(5) ?? lng}`;

  const pickToAddress = (props = {}) =>
    props.to ?? props.to_address ?? props.destination ?? props.end ?? props.name ?? null;

  // register triangle once
  useEffect(() => {
    if (!map) return;
    const imageName = 'route-start-triangle';
    if (map.hasImage && map.hasImage(imageName)) return;
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.moveTo(size / 2, 6);
    ctx.lineTo(6, size - 6);
    ctx.lineTo(size - 6, size - 6);
    ctx.closePath();
    ctx.fillStyle = '#00c853';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'white';
    ctx.stroke();
    const imageData = ctx.getImageData(0, 0, size, size);
    try { map.addImage(imageName, imageData, { pixelRatio: 2 }); } catch {}
  }, [map]);

  // load from URL
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
    return () => { cancelled = true; };
  }, [url]);

  // layers
  useEffect(() => {
    if (!map || !geojson) return;

    const fc = geojson.type === 'FeatureCollection'
      ? geojson
      : { type: 'FeatureCollection', features: [geojson] };

    // route lines
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: fc });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#3838f2',
          'line-width': 5,
          'line-opacity': opacity
        }
      });
    } else {
      const src = map.getSource(sourceId);
      if (src?.setData) src.setData(fc);
    }

    // starts/ends + bounds
    const starts = [];
    const ends = [];
    const bounds = new maplibregl.LngLatBounds();

    let lineIdx = 0;
    (fc.features || []).forEach((f) => {
      const g = f.geometry;
      if (!g) return;

      const addLine = (coords) => {
        if (!Array.isArray(coords) || coords.length < 1) return;
        coords.forEach((c) => bounds.extend(c));
        const start = coords[0];
        const end = coords[coords.length - 1];

        // pull fields from your properties
        const p = f.properties || {};
        const to = pickToAddress(p);
        const original_to = p.original_to ?? p.originalTo ?? null;
        const month = p.month ?? null;
        const activity = p.activity ?? null;
        const profile = p.profile ?? p.mode ?? null;

        starts.push({
          type: 'Feature',
          properties: { idx: lineIdx },
          geometry: { type: 'Point', coordinates: start }
        });

        ends.push({
          type: 'Feature',
          properties: {
            idx: lineIdx,
            to: to ?? '',
            original_to: original_to ?? '',
            month: month ?? '',
            activity: activity ?? '',
            profile: profile ?? ''
          },
          geometry: { type: 'Point', coordinates: end }
        });

        lineIdx += 1;
      };

      if (g.type === 'LineString') addLine(g.coordinates);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(addLine);
    });

    try { if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 }); } catch {}

    // start triangles
    const startSourceId = `${sourceId}-starts`;
    const startLayerId = `${layerId}-starts`;
    const startFC = { type: 'FeatureCollection', features: starts };

    if (starts.length) {
      if (!map.getSource(startSourceId)) map.addSource(startSourceId, { type: 'geojson', data: startFC });
      else map.getSource(startSourceId)?.setData(startFC);

      if (!map.getLayer(startLayerId)) {
        map.addLayer({
          id: startLayerId,
          type: 'symbol',
          source: startSourceId,
          layout: {
            'icon-image': 'route-start-triangle',
            'icon-size': 0.8,
            'icon-allow-overlap': true
          }
        });
      }
    } else {
      if (map.getLayer(startLayerId)) map.removeLayer(startLayerId);
      if (map.getSource(startSourceId)) map.removeSource(startSourceId);
    }

    // end circles
    const endSourceId = `${sourceId}-ends`;
    const endLayerId = `${layerId}-ends`;
    const endFC = { type: 'FeatureCollection', features: ends };

    if (ends.length) {
      if (!map.getSource(endSourceId)) map.addSource(endSourceId, { type: 'geojson', data: endFC });
      else map.getSource(endSourceId)?.setData(endFC);

      if (!map.getLayer(endLayerId)) {
        map.addLayer({
          id: endLayerId,
          type: 'circle',
          source: endSourceId,
          paint: {
            'circle-radius': 7,
            'circle-color': '#ff5252',
            'circle-stroke-color': 'white',
            'circle-stroke-width': 2,
            'circle-opacity': 0.95
          }
        });
      }
    } else {
      if (map.getLayer(endLayerId)) map.removeLayer(endLayerId);
      if (map.getSource(endSourceId)) map.removeSource(endSourceId);
    }

    // popup
    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    }

    const onEnter = (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const feat = e.features?.[0];
      const p = feat?.properties || {};
      const [lng, lat] = feat?.geometry?.coordinates || [];

      // Build rows only for present values
      const rows = [];
      const addRow = (label, val) => {
        if (!val || !`${val}`.trim()) return;
        rows.push(
          `<div style="margin:2px 0"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(val)}</div>`
        );
      };

      addRow('To', p.to);
      addRow('Original To', p.original_to);
      addRow('Month', p.month);
      addRow('Activity', p.activity);
      addRow('Profile', p.profile);

      if (!rows.length) {
        rows.push(
          `<div style="margin:2px 0"><strong>To (coords):</strong> ${escapeHtml(fmtLatLng(lng, lat))}</div>`
        );
      }

      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="color:#111; font: 500 13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
             ${rows.join('')}
           </div>`
        )
        .addTo(map);
    };

    const onMove = (e) => popupRef.current?.setLngLat(e.lngLat);
    const onLeave = () => { map.getCanvas().style.cursor = ''; popupRef.current?.remove(); };

    if (map.getLayer(endLayerId)) {
      map.on('mouseenter', endLayerId, onEnter);
      map.on('mousemove', endLayerId, onMove);
      map.on('mouseleave', endLayerId, onLeave);
    }

    // cleanup
    return () => {
      if (map.getLayer(endLayerId)) {
        map.off('mouseenter', endLayerId, onEnter);
        map.off('mousemove', endLayerId, onMove);
        map.off('mouseleave', endLayerId, onLeave);
      }
      popupRef.current?.remove();

      if (map.getLayer(startLayerId)) map.removeLayer(startLayerId);
      if (map.getSource(startSourceId)) map.removeSource(startSourceId);
      if (map.getLayer(endLayerId)) map.removeLayer(endLayerId);
      if (map.getSource(endSourceId)) map.removeSource(endSourceId);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, geojson, sourceId, layerId, opacity]);

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
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Render saved routes</div>
      <input type="file" accept=".geojson,application/geo+json,application/json" onChange={onFile} />
    </div>
  );
}
