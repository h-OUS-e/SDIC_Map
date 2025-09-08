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

export function useKeyframeAnimation(map, onSequenceStart) {
  const [currentSequence, setCurrentSequence] = useState(null);
  const [currentKeyframeIndex, setCurrentKeyframeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  
  const animationRef = useRef(null);
  const sequenceStartTimeRef = useRef(0);
  const isAutoPlayingRef = useRef(false);

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
      const startTime = performance.now();
      const startCenter = map.getCenter();
      const startZoom = map.getZoom();
      const startBearing = map.getBearing();
      const startPitch = map.getPitch();

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easing(progress);

        // Interpolate camera properties
        const center = [
          startCenter.lng + (keyframe.center[0] - startCenter.lng) * easedProgress,
          startCenter.lat + (keyframe.center[1] - startCenter.lat) * easedProgress,
        ];

        const zoom = startZoom + (keyframe.zoom - startZoom) * easedProgress;
        const bearing = startBearing + ((keyframe.bearing ?? 0) - startBearing) * easedProgress;
        const pitch = startPitch + ((keyframe.pitch ?? 0) - startPitch) * easedProgress;

        map.setCenter(center);
        map.setZoom(zoom);
        map.setBearing(bearing);
        map.setPitch(pitch);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animationRef.current = requestAnimationFrame(animate);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

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
