/**
 * AnimationController — Global GPU-tier + reduced-motion gate.
 *
 * Decides four animation levels for the entire app:
 *   FULL    → high-end desktop (Canvas + WebGL + every loop)
 *   MEDIUM  → mid-range phones  (Canvas + lighter loops)
 *   LOW     → low-end devices   (CSS only, no Canvas, no Three.js)
 *   REDUCED → prefers-reduced-motion (essentially static)
 *
 * Usage:
 *   const level = useAnimationLevel();
 *   if (level.canvasParticles) <PetalFall ... />
 */
import React, { createContext, useContext, useEffect, useState } from 'react';

export const ANIMATION_LEVELS = {
  FULL: {
    id: 'full',
    canvasParticles: true,
    threejsOpening: true,
    continuousAnimations: true,
    particleCount: 22,
    waveDetail: 'high',
  },
  MEDIUM: {
    id: 'medium',
    canvasParticles: true,
    threejsOpening: true,
    continuousAnimations: true,
    particleCount: 12,
    waveDetail: 'medium',
  },
  LOW: {
    id: 'low',
    canvasParticles: false,
    threejsOpening: false,
    continuousAnimations: true,
    particleCount: 0,
    waveDetail: 'none',
  },
  REDUCED: {
    id: 'reduced',
    canvasParticles: false,
    threejsOpening: false,
    continuousAnimations: false,
    particleCount: 0,
    waveDetail: 'none',
  },
};

let cachedLevel = null;

export async function detectAnimationLevel() {
  if (cachedLevel) return cachedLevel;

  if (typeof window === 'undefined') {
    cachedLevel = ANIMATION_LEVELS.FULL;
    return cachedLevel;
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    cachedLevel = ANIMATION_LEVELS.REDUCED;
    return cachedLevel;
  }

  try {
    const { getGPUTier } = await import('detect-gpu');
    const gpu = await getGPUTier();
    if (gpu?.tier >= 2)      cachedLevel = ANIMATION_LEVELS.FULL;
    else if (gpu?.tier === 1) cachedLevel = ANIMATION_LEVELS.MEDIUM;
    else                      cachedLevel = ANIMATION_LEVELS.LOW;
  } catch {
    cachedLevel = ANIMATION_LEVELS.MEDIUM;
  }
  return cachedLevel;
}

const AnimationContext = createContext(ANIMATION_LEVELS.FULL);

export const AnimationProvider = ({ children }) => {
  const [level, setLevel] = useState(ANIMATION_LEVELS.FULL);
  useEffect(() => { detectAnimationLevel().then(setLevel); }, []);
  return (
    <AnimationContext.Provider value={level}>
      {children}
    </AnimationContext.Provider>
  );
};

export const useAnimationLevel = () => useContext(AnimationContext);
