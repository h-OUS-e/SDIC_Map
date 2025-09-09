"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

// Easing functions
export const easingFunctions = {
  linear: (t) => t,
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  smooth: (t) => t * t * (3 - 2 * t), // smoothstep
};

export function useKeyframeAnimation(map, onSequenceStart, { autoStart = true } = {}) {
  const [currentSequence, setCurrentSequence] = useState(null);
  const [currentKeyframeIndex, setCurrentKeyframeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  
  const animationRef = useRef(null);
  const sequenceStartTimeRef = useRef(0);
  const isAutoPlayingRef = useRef(false);
  const autoplayStartedRef = useRef(false);

  // Define your keyframe sequences
  // Faster camera transitions with SF-centered Bay Area view
  const sequences = [
    {
      id: 'cinematic-intro',
      name: 'Cinematic Intro',
      keyframes: [
        {
          center: [-122.40451, 37.79837], // Telegraph Hill area (white sparkly origin point)
          zoom: 14.5, // Zoomed-in view of the origin (was 16)
          bearing: 0,
          pitch: 0,
          duration: 8000, // 8 seconds - zoomed-in view of origin
          easing: easingFunctions.easeInOut,
        },
        {
          center: [-122.40451, 37.79837], // Same origin point (Telegraph Hill)
          zoom: 14, // Slightly zoomed out for orbiting
          bearing: 60, // Subtle orbit around origin (was 180°)
          pitch: 25, // Gentle pitch for cinematic effect (was 45°)
          duration: 8000, // 8 seconds - gentle orbit around origin
          easing: easingFunctions.easeInOut,
        },
        {
          center: [-122.27463, 37.61096], // Exact Bay Area coordinates from your image
          zoom: 10.25, // Exact zoom level from your image
          bearing: 0, // Return to top-down view
          pitch: 0,
          duration: 8000, // 8 seconds - exact Bay Area view
          easing: easingFunctions.easeInOut,
        },
      ],
      totalDuration: 24000, // 24 seconds total - much faster
    },
  ];

  const currentSequenceRef = useRef(null);
  const currentKeyframeIndexRef = useRef(0);

  // Update refs when state changes
  useEffect(() => {
    currentSequenceRef.current = currentSequence;
    currentKeyframeIndexRef.current = currentKeyframeIndex;
  }, [currentSequence, currentKeyframeIndex]);

  const animateToKeyframe = useCallback((
  keyframe,
  duration = 2000,
  easing = easingFunctions.easeInOut
) => {
  if (!map) return Promise.resolve();

  return new Promise((resolve) => {
    // Convert your easing [0..1] -> [0..1] to a function MapLibre expects
    const easeFn = (t) => easing(Math.min(1, Math.max(0, t)));

    // Use the built-in camera animator
    map.easeTo(
      {
        center: keyframe.center,
        zoom: keyframe.zoom,
        bearing: keyframe.bearing ?? 0,
        pitch: keyframe.pitch ?? 0,
        duration: keyframe.duration ?? duration,
        easing: easeFn,
      },
      { animate: true }
    );

    // Resolve when the animation ends
    const onIdle = () => {
      map.off('idle', onIdle);
      resolve();
    };
    map.on('idle', onIdle);
  });
}, [map]);


  const playKeyframe = useCallback(async (keyframeIndex) => {
    if (!currentSequenceRef.current || !map) return;

    const keyframe = currentSequenceRef.current.keyframes[keyframeIndex];
    if (!keyframe) return;

    await animateToKeyframe(
      keyframe,
      keyframe.duration ?? 2000,
      keyframe.easing ?? easingFunctions.easeInOut
    );
  }, [animateToKeyframe, map]);

  const nextKeyframe = useCallback(async () => {
    if (!currentSequenceRef.current) return;

    const nextIndex = currentKeyframeIndexRef.current + 1;
    if (nextIndex >= currentSequenceRef.current.keyframes.length) {
      // End of sequence
      setIsPlaying(false);
      setIsAutoPlaying(false);
      return;
    }

    setCurrentKeyframeIndex(nextIndex);
    await playKeyframe(nextIndex);
  }, [playKeyframe]);

  const previousKeyframe = useCallback(async () => {
    if (!currentSequenceRef.current) return;

    const prevIndex = currentKeyframeIndexRef.current - 1;
    if (prevIndex < 0) return;

    setCurrentKeyframeIndex(prevIndex);
    await playKeyframe(prevIndex);
  }, [playKeyframe]);

  const playSequence = useCallback(async () => {
    if (!currentSequenceRef.current) return;

    console.log('🎬 Starting keyframe sequence...');
    setIsPlaying(true);
    setIsAutoPlaying(true);
    isAutoPlayingRef.current = true;
    sequenceStartTimeRef.current = performance.now();
    
    // Notify that sequence is starting (for TripsOverlay reset)
    onSequenceStart?.();

    // Play all keyframes in sequence
    for (let i = 0; i < currentSequenceRef.current.keyframes.length; i++) {
      if (!isAutoPlayingRef.current) {
        console.log('🛑 Auto-play cancelled');
        break; // Stop if auto-play was cancelled
      }
      
      console.log(`🎯 Playing keyframe ${i + 1}/${currentSequenceRef.current.keyframes.length}`);
      setCurrentKeyframeIndex(i);
      await playKeyframe(i);
    }

    console.log('✅ Keyframe sequence complete');
    setIsPlaying(false);
    setIsAutoPlaying(false);
    isAutoPlayingRef.current = false;
  }, [playKeyframe, onSequenceStart]);

  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsPlaying(false);
    setIsAutoPlaying(false);
    isAutoPlayingRef.current = false;
  }, []);

  const resetToFirstKeyframe = useCallback(() => {
    if (!currentSequenceRef.current || !map) return;
    
    stopAnimation();
    setCurrentKeyframeIndex(0);
    
    const firstKeyframe = currentSequenceRef.current.keyframes[0];
    map.setCenter(firstKeyframe.center);
    map.setZoom(firstKeyframe.zoom);
    map.setBearing(firstKeyframe.bearing ?? 0);
    map.setPitch(firstKeyframe.pitch ?? 0);
    
    // Ensure all states are properly reset
    setIsPlaying(false);
    setIsAutoPlaying(false);
    isAutoPlayingRef.current = false;
  }, [map, stopAnimation]);

  // Initialize with first sequence
  useEffect(() => {
    if (sequences.length > 0 && !currentSequence) {
      setCurrentSequence(sequences[0]);
    }
  }, [currentSequence, sequences]);

  // 🔥 Autoplay when the map is ready and a sequence exists
  useEffect(() => {
    if (!autoStart || autoplayStartedRef.current) return;
    if (!map || !currentSequence) return;

    const start = () => {
      if (autoplayStartedRef.current) return;
      autoplayStartedRef.current = true;

      setCurrentKeyframeIndex(0);

      // Kick off the sequence
      playSequence();
    };

    // Start immediately if map is already loaded, otherwise wait once
    const isLoaded = typeof map.loaded === 'function' ? map.loaded() : true;
    if (isLoaded) {
      start();
    } else {
      map.once('load', start);
    }
    
    // Cleanup on unmount if effect reruns/unmounts
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [autoStart, map, currentSequence, playSequence]);

  return {
    sequences,
    currentSequence,
    currentKeyframeIndex,
    isPlaying,
    isAutoPlaying,
    totalKeyframes: currentSequence?.keyframes.length ?? 0,
    nextKeyframe,
    previousKeyframe,
    playSequence,
    stopAnimation,
    resetToFirstKeyframe,
    setCurrentSequence,
  };
}
