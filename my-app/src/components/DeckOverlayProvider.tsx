// DeckOverlayProvider.tsx
import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type maplibregl from "maplibre-gl";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type Ctx = {
  addLayer: (layer: Layer) => string;   // returns token
  updateLayer: (token: string, layer: Layer) => void;
  removeLayer: (token: string) => void;
  beforeId?: string;
};
const DeckOverlayCtx = createContext<Ctx | null>(null);

export function useDeckOverlay() {
  const ctx = useContext(DeckOverlayCtx);
  if (!ctx) throw new Error("useDeckOverlay must be used inside <DeckOverlayProvider/>");
  return ctx;
}

export function DeckOverlayProvider({
  map,
  beforeId = "saved-route-line-endpoint-glow4",
  children
}: {
  map: maplibregl.Map | null;
  beforeId?: string;
  children: React.ReactNode;
}) {
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [layerMap, setLayerMap] = useState<Record<string, Layer>>({});

  // create a single overlay, interleaved with the map's style layers
  useEffect(() => {
    if (!map) return;
    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({ interleaved: true });
      map.addControl(overlayRef.current);
    }
    return () => {
      if (overlayRef.current) {
        try { map.removeControl(overlayRef.current); } catch {}
        overlayRef.current = null;
      }
    };
  }, [map]);

  // push combined layers to deck.gl whenever any child changes
  useEffect(() => {
    if (!overlayRef.current) return;
    const layers = Object.values(layerMap);
    overlayRef.current.setProps({ layers });
  }, [layerMap]);

  const api = useMemo<Ctx>(() => {
    return {
      beforeId,
      addLayer(layer) {
        const token = Math.random().toString(36).slice(2);
        setLayerMap(m => ({ ...m, [token]: layer }));
        return token;
      },
      updateLayer(token, layer) {
        setLayerMap(m => (m[token] ? { ...m, [token]: layer } : m));
      },
      removeLayer(token) {
        setLayerMap(m => {
          const { [token]: _, ...rest } = m;
          return rest;
        });
      }
    };
  }, [beforeId]);

  return <DeckOverlayCtx.Provider value={api}>{children}</DeckOverlayCtx.Provider>;
}
