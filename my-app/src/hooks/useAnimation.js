import { useEffect, useRef, useState } from 'react';

export function useAnimation({ playState, maxTs, loop, loopDelay, fps = 30 }) {
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef(null);
  const lastTickMsRef = useRef(0);
  const holdUntilRef = useRef(null);

  useEffect(() => {
    if (playState !== 'playing' || maxTs <= 0) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTickMsRef.current = 0; // Reset for when we resume
      return;
    }

    const frameInterval = 1000 / fps;
    let timeAccumulator = currentTime;

    const tick = (tMs) => {
      if (lastTickMsRef.current === 0) {
        lastTickMsRef.current = tMs;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const deltaMs = tMs - lastTickMsRef.current;
      if (deltaMs < frameInterval) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      lastTickMsRef.current = tMs;
      const deltaS = deltaMs / 1000;
      timeAccumulator += deltaS;

      let current;
      if (loop) {
        if (holdUntilRef.current != null) {
          if (tMs < holdUntilRef.current) {
            current = maxTs - 1e-6;
          } else {
            holdUntilRef.current = null;
            current = 0;
            timeAccumulator = 0;
          }
        } else {
          if (timeAccumulator >= maxTs && loopDelay > 0) {
            current = maxTs - 1e-6;
            holdUntilRef.current = tMs + loopDelay * 1000;
          } else {
            current = timeAccumulator % maxTs;
          }
        }
      } else {
        current = Math.min(timeAccumulator, maxTs);
      }

      setCurrentTime(current);

      if (!loop && current >= maxTs) {
        return; // Animation ended
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [playState, maxTs, loop, loopDelay, fps]);

  // Function to manually reset the animation
  const resetAnimation = () => {
      setCurrentTime(0);
      lastTickMsRef.current = 0;
      holdUntilRef.current = null;
  }

  return { currentTime, resetAnimation };
}