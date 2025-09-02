"use client";

import { smoothGeoJSON, type SmoothOpts } from "@/utils/smoothRoute";
import type { FeatureCollection, GeoJSON } from "geojson";
import { useEffect, useMemo, useState } from "react";

type UseSmoothRouteArgs = {
    url?: string;                // where to fetch routes.geojson
    data?: GeoJSON | null;       // or provide raw data directly
    options?: SmoothOpts;
};

export function useSmoothRoute({ url = "/assets/routes/route.geojson", data, options }: UseSmoothRouteArgs) {
    const [raw, setRaw] = useState<GeoJSON | null>(data ?? null);
    const [loading, setLoading] = useState<boolean>(!!url && !data);
    const [error, setError] = useState<string | null>(null);

    // Fetch when URL is provided
    useEffect(() => {
        let cancelled = false;
        if (!url || data) return;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = (await res.json()) as GeoJSON;
                if (!cancelled) setRaw(json);
            } catch (e: unknown) {
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
    const smoothed: FeatureCollection | null = useMemo(() => {
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
