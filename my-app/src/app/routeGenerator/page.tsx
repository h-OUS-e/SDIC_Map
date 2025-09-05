"use client";

import Papa from "papaparse";
import React, { useMemo, useState } from "react";
const GOOGLE_MAPS_KEY = "AIzaSyDFTmGfQ-E8ENu8LKCHBAaWIojRwCjn900";
// ---- Types
interface Coord {
  lon: number;
  lat: number;
  name?: string;
}

interface RouteFeature extends GeoJSON.Feature<GeoJSON.LineString> {
  properties: {
    distance_m: number;
    duration_s: number;
    from: string;
    to: string;
    profile: "driving" | "cycling" | "walking";

    // original metadata fields from csv file
    month?: string;
    class?: string;
    team?: string;
    original_from?: string;
    original_to?: string;
    location_name?: string;
    activity?: string;
  };
}

type Profile = "driving" | "cycling" | "walking";
// type Pair = { from: string; to: string };
type Pair = {
  from: string;
  to: string;
  original_from: string;
  original_to: string;
  profile?: Profile;
  month?: string;
  team?: string;
  class?: string;
  location_name?: string;
  activity?: string;
};


function toGTravelMode(p: "driving"|"cycling"|"walking") {
  return p === "cycling" ? "BICYCLE" : p === "walking" ? "WALK" : "DRIVE";
}



// ---- Config
const MAPTILER_KEY =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MAPTILER_KEY) || "ZAMOU7NPssEmiSXsELqD"; 
const DEFAULT_PROFILE: "driving" | "cycling" | "walking" = "driving"; // OSRM profiles

// ---- Helpers
async function geocodeGoogle(query: string, apiKey = GOOGLE_MAPS_KEY): Promise<Coord> {
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
  const r = data?.results?.[0];
  if (!r) throw new Error(`No geocoding result for: ${query}`);
  const { lat, lng } = r.geometry.location;
  return { lon: lng, lat, name: r.formatted_address || query };
}


function haversineMeters([lon1, lat1]: number[], [lon2, lat2]: number[]) {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Google Routes API — returns GeoJSON already
async function routeGoogle(
  a: Coord, b: Coord, profile: "driving"|"cycling"|"walking"
): Promise<RouteFeature> {
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
  const line = r?.polyline?.geoJsonLinestring as GeoJSON.LineString | undefined;
  if (!line) throw new Error(`No Google route geometry for: ${a.name} → ${b.name}`);

  // optional: keep your "last meters to door" tail
  const coords = line.coordinates.slice();
  const last = coords[coords.length - 1];
  const tail: [number, number] = [b.lon, b.lat];
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



function downloadJSON(obj: unknown, filename = "routes.geojson") {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/geo+json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- CSV interpretation
// Supports two shapes:
// 1) Pairwise rows:   from,to
// 2) Sequential list: address (routes will be built between consecutive rows)




function toPairsFromCSV(parsed: Papa.ParseResult<unknown>): Pair[] {
  const data = parsed.data ?? [];
  const rows = data.filter((r): r is Record<string, unknown> | unknown[] => r != null);

  if (rows.length === 0) return [];

  const first = rows[0];

  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);


  // helpers
  const normKeys = (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[String(k).trim().toLowerCase()] = v;
    }
    return out;
  };
  
  const asString = (v: unknown): string | undefined => {
    if (v === null || v === undefined) return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  };

  const parseProfile = (v: unknown): Profile | undefined => {
    const s = asString(v)?.toLowerCase();
    if (s === "driving" || s === "cycling" || s === "walking") return s;
    return undefined; // or return "driving" to default
  };

  if (isPlainObject(first)) {
    // headered CSV
    const headerKeys = Object.keys(first).map((k) => k.trim().toLowerCase());
    const hasFromTo = headerKeys.includes("from") && headerKeys.includes("to");
    // const hasAddress = headerKeys.includes("address") || headerKeys.includes("addresses");

    if (hasFromTo) {
      return rows
      .map((r) => {
        if (!isPlainObject(r)) return null;
        const row = normKeys(r);
        const from = asString(row["from"]);
        const to = asString(row["to"]);
        if (!from || !to) return null;

        const profile = parseProfile(row["profile"]);

        const pair: Pair = {
          from,
          to,
          original_from: from,
          original_to: to,
          ...(profile ? { profile } : {}),
          month: asString(row["month"]),
          team: asString(row["team"]),
          class: asString(row["class"]),
          location_name: asString(row["location_name"]),
          activity: asString(row["activity"]),
        };

        return pair;
      })
      .filter((p): p is Pair => p !== null);
    }
  }

  return [];

}


// ---- Page Component
export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<RouteFeature[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const readyToGenerate = useMemo(() => pairs.length > 0 && !generating, [pairs, generating]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPairs([]);
    setFeatures(null);
    setError(null);
  };

  const parseCSV = async () => {
    if (!file) return;
    setParsing(true);
    setError(null);
    setPairs([]);
    setFeatures(null);

    await new Promise<void>((resolve) => {
      Papa.parse(file, {
        header: true, 
        delimiter: ';', // use semicolon to avoid commas inside addresses
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const ps = toPairsFromCSV(results);
            console.log("pairs", ps);
            if (ps.length === 0) throw new Error("No address pairs found. Provide columns 'from,to' OR a single 'address' column.");
            setPairs(ps);
          } catch (e: unknown) {
            if (e instanceof Error) {
              setError(e.message || String(e));
            }
          } finally {
            setParsing(false);
            resolve();
          }
        },
        error: (err) => {
          setError(err.message || String(err));
          setParsing(false);
          resolve();
        },
      });
    });
  };

  const generateRoutes = async () => {
    if (pairs.length === 0) return;
    if (!MAPTILER_KEY || MAPTILER_KEY === "YOUR_MAPTILER_KEY_HERE") {
      setError("Missing MapTiler API key. Set NEXT_PUBLIC_MAPTILER_KEY in .env.local.");
      return;
    }

    setGenerating(true);
    setError(null);
    setFeatures(null);
    setProgress({ done: 0, total: pairs.length });

    const cache = new Map<string, Coord>();
    const feats: RouteFeature[] = [];

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const { from, to, profile } = pair;
      try {
        const [a, b] = await Promise.all([
          cache.get(from) || geocodeGoogle(from, GOOGLE_MAPS_KEY).then((c) => (cache.set(from, c), c)),
          cache.get(to) || geocodeGoogle(to, GOOGLE_MAPS_KEY).then((c) => (cache.set(to, c), c)),
        ]);
        const feat = await routeGoogle(a, b, profile ?? DEFAULT_PROFILE);
        

        // add metadata to properties
        const enriched: RouteFeature = {
          ...feat,
          properties: {
            ...feat.properties,
            month: pair.month,
            class: pair.class,
            team: pair.team,
            original_from: pair.original_from ?? pair.from,
            original_to: pair.original_to ?? pair.to,
            location_name: pair.location_name,
            activity: pair.activity,
          },
        };

        feats.push(enriched);

      } catch (e: Error | unknown) {
        console.warn("Skipping pair due to error:", from, to, e);
      }
      setProgress({ done: i + 1, total: pairs.length });
      // Gentle pacing for public endpoints
      await sleep(150);
    }

    if (feats.length === 0) {
      setError("No routes generated. Check addresses and try again.");
    }

    setFeatures(feats);
    setGenerating(false);
  };

  const onDownload = () => {
    if (!features || features.length === 0) return;
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    downloadJSON(fc, "routes.geojson");
  };

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px", color: "#eaeaea" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Route generator (CSV → routes.geojson)</h1>
      <p style={{ opacity: 0.85, marginBottom: 18 }}>
        Upload a CSV of addresses and get a <code>routes.geojson</code> with a LineString for each route.
        Supported CSV formats: <code>from;to</code> (semicolon-separated pairwise rows) or a single <code>address</code> column (routes between consecutive rows).
      </p>

      <section style={{ display: "grid", gap: 12, alignItems: "center", gridTemplateColumns: "1fr auto" }}>
        <div>
          <input type="file" accept=".csv,text/csv" onChange={onPickFile} />
        </div>
        <div>
          <label style={{ marginRight: 8 }}>Profile:</label>
        </div>
      </section>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          onClick={parseCSV}
          disabled={!file || parsing}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #555", background: parsing ? "#333" : "#222", color: "#fff" }}
        >
          {parsing ? "Parsing…" : "Parse CSV"}
        </button>
        <button
          onClick={generateRoutes}
          disabled={!readyToGenerate}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #555", background: readyToGenerate ? "#0f4" : "#333", color: "#000" }}
        >
          Generate routes
        </button>
        <button
          onClick={onDownload}
          disabled={!features || features.length === 0}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #555", background: !features || features.length === 0 ? "#333" : "#ffd166", color: "#000" }}
        >
          Download routes.geojson
        </button>
      </div>

      {/* Status */}
      <div style={{ marginTop: 14, fontSize: 14 }}>
        {pairs.length > 0 && (
          <div style={{ opacity: 0.9 }}>Pairs ready: <b>{pairs.length}</b></div>
        )}
        {generating && (
          <div style={{ marginTop: 6 }}>
            Generating… {progress.done} / {progress.total}
            <div style={{ height: 6, background: "#333", marginTop: 6, borderRadius: 6 }}>
              <div
                style={{
                  height: 6,
                  width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                  background: "#0f4",
                  borderRadius: 6,
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </div>
        )}
        {features && features.length > 0 && !generating && (
          <div style={{ marginTop: 8 }}>
            ✅ Generated <b>{features.length}</b> route{features.length === 1 ? "" : "s"}. Click <b>Download</b> to save <code>routes.geojson</code>.
          </div>
        )}
        {error && (
          <div style={{ color: "#ff8a80", marginTop: 10 }}>⚠️ {error}</div>
        )}
      </div>

      <hr style={{ margin: "24px 0", borderColor: "#333" }} />

      <details>
        <summary style={{ cursor: "pointer" }}>CSV examples</summary>
        <pre
          style={{
            marginTop: 12,
            background: "#111",
            padding: 12,
            borderRadius: 8,
            border: "1px solid #333",
            overflowX: "auto",
          }}
        >{`from;to
1 Dr Carlton B Goodlett Pl, San Francisco, CA 94102;1 Ferry Building, San Francisco, CA 94111
Golden Gate Park, San Francisco, CA;Twin Peaks, San Francisco, CA`}</pre>
        <pre
          style={{
            marginTop: 12,
            background: "#111",
            padding: 12,
            borderRadius: 8,
            border: "1px solid #333",
            overflowX: "auto",
          }}
        >{`address
1 Dr Carlton B Goodlett Pl, San Francisco, CA 94102
1 Ferry Building, San Francisco, CA 94111
Golden Gate Park, San Francisco, CA`}</pre>
      </details>

      <p style={{ marginTop: 18, fontSize: 13, opacity: 0.8 }}>
        Notes: Uses MapTiler Geocoding for each address and OSRM public demo for routing. For production, consider a managed routing provider
        (e.g., OpenRouteService) and add retries/backoff.
      </p>
    </main>
  );
}
