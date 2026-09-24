/**
 * KeralaBackground — Continuous ambient backwater scene.
 *
 * Composes the 12-component animation library:
 *  • <WaterRipple /> as the deep teal hero canvas
 *  • Floating lotus + lily-pad SVGs with LeafSway
 *  • Drifting jasmine + lotus petals (PetalFall)
 *  • Distant houseboat silhouette gliding slowly
 *  • Faint gold sparkles on the water (FireflyParticle, warm gold)
 *
 * Drop this behind any Kerala-themed invitation card to give it life.
 *
 * Props:
 *   intensity — 'subtle' | 'normal' | 'festive' (default 'normal')
 *               controls petal count, sparkle count, boat presence.
 */
import React from 'react';
import { motion } from 'framer-motion';
import {
  WaterRipple, PetalFall, LeafSway, FireflyParticle,
} from '@/components/animations';
import { KERALA_COLORS } from './kerala.colors';

const KeralaBackground = ({ intensity = 'normal', children, className = '', style = {} }) => {
  const conf = {
    subtle:  { petals: 8,  sparkles: 8,  boat: false },
    normal:  { petals: 14, sparkles: 14, boat: true },
    festive: { petals: 22, sparkles: 20, boat: true },
  }[intensity] || { petals: 14, sparkles: 14, boat: true };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: KERALA_COLORS.background,
        overflow: 'hidden',
        ...style,
      }}
      data-testid="kerala-background"
    >
      {/* Layer 0 — moving water surface */}
      <WaterRipple
        base={KERALA_COLORS.water}
        highlight={KERALA_COLORS.waterHighlight}
        shadow="#062B30"
        sparkle="#FFFFFF"
        sparkles={conf.sparkles}
        zIndex={0}
      />

      {/* Layer 1 — distant houseboat silhouette slowly drifting right (only on normal/festive) */}
      {conf.boat && (
        <motion.div
          initial={{ x: '-10%' }}
          animate={{ x: '110%' }}
          transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            top: '38%',
            width: 140, height: 60,
            zIndex: 1,
            opacity: 0.45,
            pointerEvents: 'none',
          }}
          data-testid="kerala-bg-boat"
        >
          <svg viewBox="0 0 140 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Arched bamboo roof */}
            <path d="M22 26 Q70 6 118 26 L118 32 L22 32 Z" fill="#3A2418" />
            {/* Hull */}
            <path d="M10 32 L130 32 L120 48 L20 48 Z" fill="#1F1108" />
            {/* Reflection */}
            <path d="M10 50 L130 50 L120 58 L20 58 Z" fill="#1F1108" opacity="0.35" />
          </svg>
        </motion.div>
      )}

      {/* Layer 2 — floating lotus pads (SVGs with subtle sway, scattered) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: '8%', top: '72%' }}>
          <LeafSway amplitude={2} duration={7} intensity="subtle">
            <LotusSVG size={68} color={KERALA_COLORS.lotus} />
          </LeafSway>
        </div>
        <div style={{ position: 'absolute', right: '6%', top: '68%' }}>
          <LeafSway amplitude={3} duration={9} delay={0.6} intensity="subtle">
            <LotusSVG size={84} color={KERALA_COLORS.lotusDeep} />
          </LeafSway>
        </div>
        <div style={{ position: 'absolute', left: '42%', top: '83%' }}>
          <LeafSway amplitude={2} duration={6} delay={1.2} intensity="subtle">
            <LilyPadSVG size={72} color={KERALA_COLORS.bananaLeaf} />
          </LeafSway>
        </div>
        <div style={{ position: 'absolute', right: '30%', top: '88%' }}>
          <LeafSway amplitude={2} duration={8} delay={0.3} intensity="subtle">
            <LilyPadSVG size={60} color={KERALA_COLORS.bananaLeaf} />
          </LeafSway>
        </div>
      </div>

      {/* Layer 3 — drifting jasmine + lotus petals across the water */}
      <PetalFall
        colors={[KERALA_COLORS.lotus, KERALA_COLORS.lily, '#FFE2EC']}
        count={conf.petals}
        minSize={6}
        maxSize={14}
        driftX={40}
        speed={0.55}
        shape="oval"
        zIndex={3}
      />

      {/* Layer 4 — warm gold sparkles glinting on water */}
      <FireflyParticle
        count={conf.sparkles}
        color={KERALA_COLORS.particle}
        size={2}
        speed={0.4}
        zIndex={4}
      />

      {/* Content slot (z above all layers) */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%' }}>
        {children}
      </div>
    </div>
  );
};

/* ── Inline decorative SVGs ─────────────────────────────────────────── */

const LotusSVG = ({ size = 60, color = '#F4A6C0' }) => (
  <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    {[...Array(6)].map((_, i) => (
      <ellipse
        key={i}
        cx="30" cy="18"
        rx="6" ry="14"
        fill={color}
        opacity={0.85 - (i % 2) * 0.2}
        transform={`rotate(${i * 30} 30 30)`}
      />
    ))}
    <circle cx="30" cy="30" r="4" fill="#D4A24C" />
  </svg>
);

const LilyPadSVG = ({ size = 60, color = '#2F5D3A' }) => (
  <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M30 8 A22 22 0 1 1 8 30 L30 30 Z"
      fill={color}
      opacity={0.78}
    />
    <path d="M30 30 L30 14" stroke="#1F3F26" strokeWidth="1" opacity="0.6" />
  </svg>
);

export default KeralaBackground;
