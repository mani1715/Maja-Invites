/**
 * ZoomInOpening — A single, universal opening animation for ALL themes.
 *
 * Design (locked Feb 2026 per user direction):
 *   • Full-screen background = the couple's chosen "opening photo"
 *     (or fallback to the design/hero image).
 *   • A soft darkening vignette so the names read clearly.
 *   • Centered names typeset in the luxe serif palette, fading + zooming
 *     in for ≈ 2.5 s (cinematic), then auto-dismisses into the invitation.
 *
 * Replaces every previous per-theme cinematic / 3D opening orchestrator.
 * Keep it intentionally simple — the user found the prior intros
 * "ugly" and asked for one calm zoom-in.
 */
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

const FALLBACK_BG =
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=85';

const ZoomInOpening = ({
  image,
  bride,
  groom,
  date,
  duration = 2.5,        // seconds (user picked option b — 2.5 s)
  onComplete,
}) => {
  useEffect(() => {
    if (!onComplete) return undefined;
    const t = setTimeout(() => onComplete(), duration * 1000);
    return () => clearTimeout(t);
  }, [duration, onComplete]);

  const bgUrl = image || FALLBACK_BG;

  return (
    <motion.div
      data-testid="opening-zoomin"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        overflow: 'hidden',
        background: '#0A0707',
      }}
    >
      {/* Zooming photo background */}
      <motion.div
        initial={{ scale: 1.18 }}
        animate={{ scale: 1.0 }}
        transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url("${bgUrl}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Vignette overlay for legibility */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(8,5,11,0.15) 0%, rgba(8,5,11,0.55) 55%, rgba(8,5,11,0.85) 100%)',
        }}
      />

      {/* Names block */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          padding: '0 24px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.86, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          data-testid="opening-zoomin-names"
        >
          <div
            style={{
              fontFamily: 'Cinzel, "Cormorant Garamond", serif',
              fontWeight: 500,
              fontSize: 'clamp(34px, 7vw, 86px)',
              lineHeight: 1.05,
              letterSpacing: '0.04em',
              color: '#FFF8DC',
              textShadow:
                '0 2px 18px rgba(0,0,0,0.55), 0 0 60px rgba(212,175,55,0.18)',
            }}
          >
            {bride || 'Bride'}
          </div>
          <div
            style={{
              fontFamily: '"Great Vibes", "Pinyon Script", cursive',
              fontSize: 'clamp(28px, 5.5vw, 64px)',
              color: '#D4AF37',
              margin: '6px 0',
              textShadow: '0 2px 18px rgba(0,0,0,0.5)',
            }}
          >
            &amp;
          </div>
          <div
            style={{
              fontFamily: 'Cinzel, "Cormorant Garamond", serif',
              fontWeight: 500,
              fontSize: 'clamp(34px, 7vw, 86px)',
              lineHeight: 1.05,
              letterSpacing: '0.04em',
              color: '#FFF8DC',
              textShadow:
                '0 2px 18px rgba(0,0,0,0.55), 0 0 60px rgba(212,175,55,0.18)',
            }}
          >
            {groom || 'Groom'}
          </div>
          {date && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0, duration: 1.0 }}
              style={{
                marginTop: 22,
                fontFamily: 'Cinzel, serif',
                fontSize: 'clamp(11px, 1.6vw, 14px)',
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: 'rgba(255,248,220,0.85)',
              }}
            >
              {date}
            </motion.div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default ZoomInOpening;
