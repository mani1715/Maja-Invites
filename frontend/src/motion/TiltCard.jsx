import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useReducedMotion } from '../hooks/useMotionDefaults';
import { SPRING } from './presets';

// Module-level cache — the GPU probe is expensive-ish (renders a WebGL
// context) so it should run once for the whole app, not once per card.
let gpuTierPromise = null;
function getCachedGPUTier() {
  if (!gpuTierPromise) {
    gpuTierPromise = import('detect-gpu')
      .then(({ getGPUTier }) => getGPUTier())
      .catch(() => ({ tier: 1 }));
  }
  return gpuTierPromise;
}

/**
 * TiltCard — pointer-tracked 3D tilt wrapper with a light-sheen overlay that
 * follows the cursor. Wrap it OUTSIDE existing clickable markup (an <a> or
 * <button>) rather than replacing it.
 *
 * Renders a static passthrough div (same className/style, no listeners) when:
 *   - the user prefers reduced motion
 *   - the pointer isn't fine (touch — this product is primarily used on
 *     mobile, so tilt must never intercept taps)
 *   - the GPU tier is below 2, or the tier hasn't resolved yet (progressive
 *     enhancement: static until proven capable, no flash of tilt-then-static)
 */
const TiltCard = ({ children, maxTilt = 7, scale = 1.02, className, style, ...rest }) => {
  const ref = useRef(null);
  const reducedMotion = useReducedMotion();
  const [pointerFine] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
  );
  const [gpuOk, setGpuOk] = useState(false);

  useEffect(() => {
    if (reducedMotion || !pointerFine) return undefined; // already static, skip the probe
    let cancelled = false;
    getCachedGPUTier().then((gpu) => {
      if (!cancelled) setGpuOk(Boolean(gpu && gpu.tier >= 2));
    });
    return () => {
      cancelled = true;
    };
  }, [reducedMotion, pointerFine]);

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRotateX = useSpring(rotateX, SPRING.gentle);
  const springRotateY = useSpring(rotateY, SPRING.gentle);
  const sheenLeft = useMotionValue('50%');
  const sheenTop = useMotionValue('50%');
  const sheenBackground = useTransform(
    [sheenLeft, sheenTop],
    ([left, top]) => `radial-gradient(circle at ${left} ${top}, rgba(255,255,255,0.14), transparent 55%)`
  );
  const [hovered, setHovered] = useState(false);

  const handlePointerMove = useCallback(
    (e) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width; // 0..1
      const py = (e.clientY - rect.top) / rect.height; // 0..1
      rotateY.set((px - 0.5) * 2 * maxTilt);
      rotateX.set(-(py - 0.5) * 2 * maxTilt);
      sheenLeft.set(`${px * 100}%`);
      sheenTop.set(`${py * 100}%`);
    },
    [maxTilt, rotateX, rotateY, sheenLeft, sheenTop]
  );

  const handlePointerLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    setHovered(false);
  }, [rotateX, rotateY]);

  const disabled = reducedMotion || !pointerFine || !gpuOk;

  if (disabled) {
    return (
      <div className={className} style={{ display: 'block', width: 'auto', ...style }} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ display: 'block', width: 'auto', position: 'relative', perspective: 900, ...style }}
      whileHover={{ scale }}
      transition={SPRING.gentle}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={handlePointerLeave}
      {...rest}
    >
      <motion.div
        style={{
          transformStyle: 'preserve-3d',
          rotateX: springRotateX,
          rotateY: springRotateY,
        }}
      >
        {children}
        <motion.div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            background: sheenBackground,
          }}
          animate={{ opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.25 }}
        />
      </motion.div>
    </motion.div>
  );
};

TiltCard.displayName = 'TiltCard';

export default TiltCard;
