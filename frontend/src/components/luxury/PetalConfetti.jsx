import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * PetalConfetti — premium flower petal burst.
 *
 * Usage:
 *   <PetalConfetti trigger={rsvpSubmitted} duration={4500} count={36} />
 *
 * Triggered = boolean. Component animates one burst then resets after `duration`.
 */
const PETAL_PALETTES = [
  ['#FFB6C1', '#E97451', '#F2D2BD'], // soft rose
  ['#D4AF37', '#FFD7A8', '#FFF8DC'], // gold
  ['#DCAE96', '#8A9A5B', '#F5F5DC'], // modern pastel
];

const Petal = ({ delay, x, palette, drift }) => {
  const color = palette[Math.floor(Math.random() * palette.length)];
  const size = 10 + Math.random() * 14;
  return (
    <motion.div
      initial={{ x, y: -40, rotate: 0, opacity: 0 }}
      animate={{
        x: x + drift,
        y: typeof window !== 'undefined' ? window.innerHeight + 60 : 900,
        rotate: 540,
        opacity: [0, 1, 1, 0],
      }}
      transition={{ duration: 3.6 + Math.random() * 1.6, delay, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: size,
        height: size * 1.4,
        borderRadius: '50% 0 50% 50%',
        background: `linear-gradient(135deg, ${color} 0%, ${color}AA 100%)`,
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.18))',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
};

const PetalConfetti = ({ trigger = false, count = 32, duration = 4500, palette = null }) => {
  const [visible, setVisible] = useState(false);
  const usedPalette = useMemo(() => palette || PETAL_PALETTES[Math.floor(Math.random() * PETAL_PALETTES.length)], [palette]);

  useEffect(() => {
    if (trigger) {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), duration);
      return () => clearTimeout(t);
    }
  }, [trigger, duration]);

  const petals = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const w = window.innerWidth;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      delay: Math.random() * 0.9,
      x: Math.random() * w,
      drift: -120 + Math.random() * 240,
    }));
  }, [count, visible]);

  return (
    <AnimatePresence>
      {visible && (
        <div data-testid="petal-confetti" aria-hidden="true">
          {petals.map((p) => (
            <Petal key={p.id} delay={p.delay} x={p.x} drift={p.drift} palette={usedPalette} />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
};

export default PetalConfetti;
