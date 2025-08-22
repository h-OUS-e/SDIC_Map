"use client";

import Papa from "papaparse";
import React, { useMemo, useState } from "react";

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
  };
}


// ---- Config
const MAPTILER_KEY =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MAPTILER_KEY) || "ZAMOU7NPssEmiSXsELqD"; 
const DEFAULT_PROFILE: "driving" | "cycling" | "walking" = "driving"; // OSRM profiles

// ---- Helpers
async function geocodeMapTiler(query: string, apiKey: string): Promise<Coord> {
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
    query
  )}.json?key=${apiKey}&limit=1&language=en&country=US`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status}) for: ${query}`);
  const data = await res.json();
  const feat = data?.features?.[0];
  if (!feat?.center) throw new Error(`No geocoding result for: ${query}`);
  // MapTiler returns [lon, lat] in 'center'
  return { lon: feat.center[0], lat: feat.center[1], name: feat.place_name || query };
}

async function routeOSRM(
  a: Coord,
  b: Coord,
  profile: "driving" | "cycling" | "walking" = DEFAULT_PROFILE
): Promise<RouteFeature> {
  // OSRM expects lon,lat;lon,lat and returns GeoJSON with geometries=geojson
  const base = "https://router.project-osrm.org/route/v1";
  const url = `${base}/${profile}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (${res.status}) for: ${a.name} → ${b.name}`);
  const data = await res.json();
  const r = data?.routes?.[0];
  if (!r?.geometry) throw new Error(`No route geometry for: ${a.name} → ${b.name}`);
  return {
    type: "Feature",
    properties: {
      distance_m: r.distance,
      duration_s: r.duration,
      from: a.name || "from",
      to: b.name || "to",
      profile,
    },
    geometry: r.geometry, // GeoJSON LineString in [lon, lat]
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

type Pair = { from: string; to: string };

function toPairsFromCSV(parsed: Papa.ParseResult<any>): Pair[] {
  const rows: any[] = parsed.data?.filter(Boolean) || [];
  if (rows.length === 0) return [];

  const first = rows[0];
  const hasHeaderObjects = typeof first === "object" && !Array.isArray(first);

  if (hasHeaderObjects) {
    // headered CSV
    const headerKeys = Object.keys(first).map((k) => k.trim().toLowerCase());
    const hasFromTo = headerKeys.includes("from") && headerKeys.includes("to");
    const hasAddress = headerKeys.includes("address") || headerKeys.includes("addresses");

    if (hasFromTo) {
      return rows
        .map((r) => ({ from: String(r["from"]).trim(), to: String(r["to"]).trim() }))
        .filter((p) => p.from && p.to);
    }
    if (hasAddress) {
      const list: string[] = rows.map((r) => String(r["address"] ?? r["addresses"]).trim()).filter(Boolean);
      return list.slice(0, -1).map((addr, i) => ({ from: addr, to: list[i + 1] }));
    }

    // Fallback: try first two columns as from/to
    return rows
      .map((r) => {
        const cols = Object.values(r);
        return { from: String(cols[0] ?? "").trim(), to: String(cols[1] ?? "").trim() };
      })
      .filter((p) => p.from && p.to);
  } else {
    // headerless rows are arrays
    const arrRows: any[][] = rows as any[];
    // if two+ columns → treat [0]=from, [1]=to per row
    const twoCol = arrRows.every((r) => Array.isArray(r) && r.length >= 2 && r[0] && r[1]);
    if (twoCol) {
      return arrRows.map((r) => ({ from: String(r[0]).trim(), to: String(r[1]).trim() }));
    }
    // otherwise treat first column as sequential list
    const list = arrRows.map((r) => String(r?.[0] ?? "").trim()).filter(Boolean);
    console.log("list", list);
    return list.slice(0, -1).map((addr, i) => ({ from: addr, to: list[i + 1] }));
  }
}

// ---- Page Component
export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<"driving" | "cycling" | "walking">(DEFAULT_PROFILE);
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
          } catch (e: any) {
            setError(e.message || String(e));
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
      const { from, to } = pairs[i];
      try {
        const [a, b] = await Promise.all([
          cache.get(from) || geocodeMapTiler(from, MAPTILER_KEY).then((c) => (cache.set(from, c), c)),
          cache.get(to) || geocodeMapTiler(to, MAPTILER_KEY).then((c) => (cache.set(to, c), c)),
        ]);
        const feat = await routeOSRM(a, b, profile);
        feats.push(feat);
      } catch (e: any) {
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
          <select value={profile} onChange={(e) => setProfile(e.target.value as any)}>
            <option value="driving">driving</option>
            <option value="cycling">cycling</option>
            <option value="walking">walking</option>
          </select>
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
