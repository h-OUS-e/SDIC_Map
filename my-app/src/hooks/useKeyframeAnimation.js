"use client";

import { useCallback, useEffect, useRef, useState } from "react";


// Easing functions (customize as needed)
export const easingFunctions = {
  linear: (t) => t,
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  smooth: (t) => t * t * (3 - 2 * t), // smoothstep
};

/**
 * @typedef {Object} Keyframe
 * @property {[number, number]} center [lng, lat]
 * @property {number} zoom
 * @property {number} [bearing=0]
 * @property {number} [pitch=0]
 * @property {number} [duration=2000] ms
 * @property {(t:number)=>number} [easing=easingFunctions.easeInOut]
 */

/**
 * Simplified, reliable keyframe animation hook for Mapbox GL/MapLibre maps.
 *
 * @param {any} map - Map instance (Mapbox GL JS / MapLibre)
 * @param {Keyframe[]} initialKeyframes - Array of keyframes for the sequence
 * @param {{
 *   autoStart?: boolean,
 *   autoResetOnEnd?: boolean,
 *   onStart?: () => void,
 *   onEnd?: () => void
 * }} opts
 */
export function useKeyframeAnimation(
  map,
  initialKeyframes = [],
  { autoStart = true, autoResetOnEnd = false, onStart, onEnd } = {}
) {
  // --- State
  const [keyframes, setKeyframes] = useState(initialKeyframes);
  const [index, setIndex] = useState(0); // current keyframe index
  const [status, setStatus] = useState/** @type {'idle'|'playing'|'paused'} */("idle");

  // Derived
  const total = keyframes.length;
  const isPlaying = status === "playing";
  const isPaused = status === "paused";

  // --- Refs (to avoid stale closures in async loops)
  const indexRef = useRef(index);
  const statusRef = useRef(status);
  const keyframesRef = useRef(keyframes);
  const controllerRef = useRef/** @type {AbortController | null} */(null);
  const autoStartedRef = useRef(false);
  const pausedViewRef = useRef/** @type {null | {center:[number,number],zoom:number,bearing:number,pitch:number}} */(null);

  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { statusRef.current = status}, [status]);


  // --- Helpers
  const getSnapshot = useCallback(() => {
    if (!map) return null;
    const c = typeof map.getCenter === "function" ? map.getCenter() : { lng: 0, lat: 0 };
    return {
      center: [c.lng, c.lat],
      zoom: typeof map.getZoom === "function" ? map.getZoom() : 0,
      bearing: typeof map.getBearing === "function" ? map.getBearing() : 0,
      pitch: typeof map.getPitch === "function" ? map.getPitch() : 0,
    };
  }, [map]);

  const abortInFlight = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (map && typeof map.stop === "function") map.stop();
  }, [map]);

  const jumpTo = useCallback((kf) => {
    if (!map || !kf) return;
    map.jumpTo({
      center: kf.center,
      zoom: kf.zoom,
      bearing: kf.bearing ?? 0,
      pitch: kf.pitch ?? 0,
    });
  }, [map]);

  const animateTo = useCallback((kf, signal) => {

    if (!map || !kf) return Promise.resolve();
    if (signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const duration = kf.duration ?? 2000;
      const easing = kf.easing ?? easingFunctions.easeInOut;

      const onDone = () => {
        map.off("idle", onDone);
        map.off("moveend", onDone);
        signal?.removeEventListener?.("abort", onAbort);
        resolve();
      };

      const onAbort = () => {
        if (typeof map.stop === "function") map.stop();
        onDone();
      };

      signal?.addEventListener?.("abort", onAbort, { once: true });
      map.once("idle", onDone);
      map.once("moveend", onDone);

      map.easeTo(
        {
          center: kf.center,
          zoom: kf.zoom,
          bearing: kf.bearing ?? 0,
          pitch: kf.pitch ?? 0,
          duration,
          easing: (t) => easing(Math.max(0, Math.min(1, t))),
        },
        { animate: true }
      );
    });
  }, [map]);

  // --- Controls
  const play = useCallback(async () => {
    if (!map || total === 0) return;
    
    // Prepare
    abortInFlight();
    controllerRef.current = new AbortController();

    setStatus("playing");
    onStart?.();

    // If we finished before, optionally reset to 0 for a fresh play
    let start = indexRef.current;
    if (start >= total) start = 0;

    // Play from current index to end
    for (let i = start; i < total; i++) {
      if (statusRef.current !== "playing") break;
      setIndex(i);
      await animateTo(keyframesRef.current[i], controllerRef.current.signal);
      if (statusRef.current !== "playing") break;
    }

    // End of sequence or externally stopped
    if (statusRef.current === "playing") {
      setStatus("idle");
      statusRef.current = "idle"

      if (autoResetOnEnd) setIndex(0);
      onEnd?.();
    }
    controllerRef.current = null;
  }, [animateTo, abortInFlight, autoResetOnEnd, map, onEnd, onStart, total]);

  const pause = useCallback(() => {
    if (statusRef.current !== "playing") return;
    pausedViewRef.current = getSnapshot();
    abortInFlight();
    setStatus("paused");
    statusRef.current = "paused"
  }, [abortInFlight, getSnapshot]);

  const resume = useCallback(async () => {

    if (!map ) return;

    // Restore the paused pose (in case the user dragged)
    if (pausedViewRef.current) jumpTo(pausedViewRef.current);

    // If we landed exactly on a keyframe, advance to next
    let start = indexRef.current;
    const kf = keyframesRef.current[start];
    const v = pausedViewRef.current;

    const approxEqual = (a, b, epsCenter = 1e-5, epsOther = 1e-3) => {
      if (!a || !b) return false;
      const [lngA, latA] = a.center;
      const [lngB, latB] = b.center;
      return (
        Math.abs(lngA - lngB) < epsCenter &&
        Math.abs(latA - latB) < epsCenter &&
        Math.abs((a.zoom ?? 0) - (b.zoom ?? 0)) < epsOther &&
        Math.abs((a.bearing ?? 0) - (b.bearing ?? 0)) < 0.1 &&
        Math.abs((a.pitch ?? 0) - (b.pitch ?? 0)) < 0.1
      );
    };

    if (kf && v && approxEqual(kf, v)) start = Math.min(start + 1, total);

    setStatus("playing");
    statusRef.current = "playing"
    controllerRef.current = new AbortController();

    for (let i = start; i < total; i++) {
      if (statusRef.current !== "playing") break;
      setIndex(i);
      await animateTo(keyframesRef.current[i], controllerRef.current.signal);
      if (statusRef.current !== "playing") break;
    }

    if (statusRef.current === "playing") {
      setStatus("idle");
      statusRef.current = "idle"
      if (autoResetOnEnd) setIndex(0);
      onEnd?.();
    }
    controllerRef.current = null;
  }, [animateTo, autoResetOnEnd, jumpTo, map, onEnd, total]);


  const stop = useCallback(() => {
    abortInFlight();
    setStatus("idle");
    statusRef.current = "idle"
  }, [abortInFlight]);

  const reset = useCallback(() => {
    abortInFlight();
    setStatus("idle");
    statusRef.current = "idle"
    setIndex(0);
    if (keyframesRef.current[0]) jumpTo(keyframesRef.current[0]);
    pausedViewRef.current = null;
  }, [abortInFlight, jumpTo]);

  const next = useCallback(() => {
    if (total === 0) return;
    abortInFlight();
    const nextIdx = Math.min(indexRef.current + 1, total - 1);
    setIndex(nextIdx);
    jumpTo(keyframesRef.current[nextIdx]);
    setStatus("idle"); // allow Play to continue from here
    statusRef.current = "idle"
    pausedViewRef.current = keyframesRef.current[nextIdx];
  }, [abortInFlight, jumpTo, total]);

  const previous = useCallback(() => {
    if (total === 0) return;
    abortInFlight();
    const prevIdx = Math.max(indexRef.current - 1, 0);
    setIndex(prevIdx);
    jumpTo(keyframesRef.current[prevIdx]);
    setStatus("idle");
    statusRef.current = "idle"
    pausedViewRef.current = keyframesRef.current[prevIdx];
  }, [abortInFlight, jumpTo, total]);

  const jumpToIndex = useCallback((i) => {
    if (i < 0 || i >= total) return;
    abortInFlight();
    setIndex(i);
    jumpTo(keyframesRef.current[i]);
    setStatus("idle");
    statusRef.current = "idle"
  }, [abortInFlight, jumpTo, total]);

  // --- Autostart once map is ready
  useEffect(() => {
    if (!autoStart || autoStartedRef.current || !map || total === 0) return;

    const start = () => {
      if (autoStartedRef.current) return;
      autoStartedRef.current = true;
      setIndex(0);
      setStatus("playing");
      statusRef.current = "playing"
      play();
    };

    const loaded = typeof map.loaded === "function" ? map.loaded() : true;
    if (loaded) start();
    else map.once("load", start);

    // cleanup: if unmounting mid-animation, abort
    return () => abortInFlight();
  }, [abortInFlight, autoStart, map, total]);


  // put this below your other effects
  useEffect(() => {
    if (!initialKeyframes || initialKeyframes.length === 0) return;

    // 1) sync state + refs
    setKeyframes(initialKeyframes);
    keyframesRef.current = initialKeyframes;

    // 2) clamp index if needed
    const clampedIndex = Math.min(indexRef.current, initialKeyframes.length - 1);
    if (clampedIndex !== indexRef.current) setIndex(clampedIndex);

    // 3) react based on current status
    const kf = initialKeyframes[clampedIndex];

    if (statusRef.current === "playing") {
      // Abort current tween and continue playing from the same index with new keyframes
      abortInFlight();
      controllerRef.current = new AbortController();

      (async () => {
        for (let i = clampedIndex; i < initialKeyframes.length; i++) {
          if (statusRef.current !== "playing") break;
          setIndex(i);
          await animateTo(initialKeyframes[i], controllerRef.current.signal);
          if (statusRef.current !== "playing") break;
        }
        if (statusRef.current === "playing") {
          setStatus("idle");
          statusRef.current = "idle";
          if (autoResetOnEnd) setIndex(0);
          onEnd?.();
        }
        controllerRef.current = null;
      })();
    } else {
      // paused or idle: immediately reflect the new list in the view
      if (kf) jumpTo(kf);
    }
  }, [initialKeyframes]); // <-- key: react to changes here


  return {
    // state
    status,
    isPlaying,
    isPaused,
    index,
    total,

    // controls
    play,
    pause,
    resume,
    stop,
    reset,
    next,
    previous,
    jumpTo: jumpToIndex,

    // config
    setKeyframes,
  };
}
