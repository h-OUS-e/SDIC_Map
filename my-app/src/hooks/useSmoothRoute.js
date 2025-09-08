"use client";

import { smoothGeoJSON } from "@/utils/smoothRoute";
import { useEffect, useMemo, useState } from "react";

export function useSmoothRoute({ url = "/assets/routes/route.geojson", data, options }) {
    const [raw, setRaw] = useState(data ?? null);
    const [loading, setLoading] = useState(!!url && !data);
    const [error, setError] = useState(null);

    // Fetch when URL is provided
    useEffect(() => {
        let cancelled = false;
        if (!url || data) return;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!cancelled) setRaw(json);
            } catch (e) {
                if (!cancelled) {
                    const message = e instanceof Error ? e.message : "Failed to load GeoJSON";
                    setError(message);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [url, data]);

    // Smooth only when the input changes
    const smoothed = useMemo(() => {
        if (!raw) return null;
        try {
            return smoothGeoJSON(raw, options);
        } catch (e) {
            console.warn("Smoothing failed:", e);
            setError("Smoothing failed");
            return null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [raw, JSON.stringify(options || {})]);

    return { data: smoothed, original: raw, loading, error, setRaw };
}
