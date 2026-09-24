/**
 * KeralaDesignRenderer — Renders a single Kerala invitation design.
 *
 * Composition:
 *   1. Base poster image (from kerala.designs.js)
 *   2. Stack of animated overlays driven by the design's `overlays` array
 *   3. Foreground text panel with theme-appropriate placement + backdrop
 *
 * This is the universal renderer for all 18 Kerala designs. New designs
 * are added by extending `KERALA_DESIGNS` — no renderer changes needed.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import DesignImage from '@/components/DesignImage';
import {
  WaterRipple, PetalFall, LeafSway, PendulumSwing,
  FlameAnimation, LanternGlow, GoldShimmer, FireflyParticle,
  SkyLanternFloat,
} from '@/components/animations';
import { OVERLAY } from './kerala.designs';
import { KERALA_COLORS } from './kerala.colors';

const KeralaDesignRenderer = ({
  design,
  bride = '[Bride Name]',
  groom = '[Groom Name]',
  date  = '[Date]',
  venue = '[Venue]',
  showText = true,
  className = '',
  style = {},
  testId,
  eager = false,
}) => {
  // PHASE 3 (perf): defer overlays until the image has actually decoded so
  // each Kerala card shows its UNIQUE artwork before the WATER/PETAL/LEAF
  // motion layers come in. Without this, all 18 Kerala cards looked
  // visually identical for the first 2-5 s of load.
  const containerRef = useRef(null);
  const [overlaysActive, setOverlaysActive] = useState(eager);
  const [imageReady, setImageReady] = useState(false);
  const [overlayDelayDone, setOverlayDelayDone] = useState(false);

  useEffect(() => {
    if (overlaysActive) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOverlaysActive(true);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setOverlaysActive(true); io.disconnect(); break; }
        }
      },
      { threshold: 0.15, rootMargin: '200px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [overlaysActive]);

  useEffect(() => {
    if (!imageReady) return;
    const id = setTimeout(() => setOverlayDelayDone(true), 400);
    return () => clearTimeout(id);
  }, [imageReady]);

  if (!design) return null;
  const rawOverlays = design.overlays || [];
  const overlaysShouldMount = overlaysActive && overlayDelayDone;
  const overlays = overlaysShouldMount ? rawOverlays : [];

  const textBlock = (() => {
    const placementStyle = {
      top:    { top: '5%',    bottom: 'auto', transform: 'translate(-50%,0)' },
      center: { top: '50%',   bottom: 'auto', transform: 'translate(-50%,-50%)' },
      bottom: { top: 'auto',  bottom: '6%',   transform: 'translate(-50%,0)' },
    }[design.textPlacement || 'center'];

    return (
      <div
        className="absolute left-1/2 px-4 md:px-6 py-4 rounded-xl text-center"
        style={{
          ...placementStyle,
          width: '88%',
          maxWidth: '92%',
          color: design.textColor,
          background: design.textBackdrop,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(212,162,76,0.35)',
          zIndex: 30,
        }}
        data-testid={`${testId || design.id}-text`}
      >
        <div
          className="text-[10px] md:text-[11px] tracking-[0.5em] uppercase mb-3"
          style={{ color: KERALA_COLORS.secondary }}
        >
          ◈ {design.headline}
        </div>
        <div
          className="text-[1.4rem] md:text-[2rem] leading-tight"
          style={{
            fontFamily: '"Cormorant Garamond", serif',
            fontWeight: 500,
            letterSpacing: '0.02em',
            textShadow: '0 4px 22px rgba(0,0,0,0.55)',
            wordBreak: 'break-word',
          }}
        >
          {bride}
          <span
            style={{
              color: KERALA_COLORS.secondary,
              fontFamily: '"Great Vibes", cursive',
              fontStyle: 'italic',
              margin: '0 0.35em',
            }}
          >&amp;</span>
          {groom}
        </div>
        <div
          className="text-[11px] md:text-[12px] tracking-[0.35em] uppercase mt-4 opacity-80"
          style={{ color: design.textColor }}
        >
          {date} · {venue}
        </div>
      </div>
    );
  })();

  return (
    <motion.div
      ref={containerRef}
      data-testid={testId || design.id}
      initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '3 / 4',
        overflow: 'hidden',
        borderRadius: 14,
        background: design.bg || KERALA_COLORS.background,
        boxShadow: '0 30px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.35)',
        ...style,
      }}
    >
      {/* Base poster image — goes through DesignImage so we get the
          build-time WebP/srcset + per-design dominant-colour + LQIP. */}
      {design.image && (
        <DesignImage
          src={design.image}
          alt={design.title}
          eager={eager}
          fetchPriority={eager ? 'high' : 'low'}
          onReady={() => setImageReady(true)}
          pictureStyle={{ position: 'absolute', inset: 0, zIndex: 0 }}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            opacity: 0.92,
            zIndex: 0,
          }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            setImageReady(true);
          }}
        />
      )}

      {/* Dark gradient wash for readability — fades in once image decodes. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background:
            'linear-gradient(180deg, rgba(5,30,35,0.35) 0%, rgba(5,30,35,0.05) 30%, rgba(5,30,35,0.35) 70%, rgba(5,30,35,0.55) 100%)',
          opacity: imageReady ? 1 : 0,
          transition: 'opacity 350ms ease',
          zIndex: 1,
        }}
      />

      {/* Animated overlays */}
      {overlays.includes(OVERLAY.WATER) && (
        <WaterRipple
          base="transparent"
          highlight={KERALA_COLORS.waterHighlight}
          shadow="#062B30"
          sparkles={6}
          zIndex={2}
          subtle  /* Phase 3A: never tint the underlying design image */
        />
      )}

      {overlays.includes(OVERLAY.LOTUS_BLOOM) && <LotusOverlay />}
      {overlays.includes(OVERLAY.LILY_PADS)   && <LilyPadsOverlay />}
      {overlays.includes(OVERLAY.BANANA_LEAF) && <BananaLeafOverlay />}
      {overlays.includes(OVERLAY.BRASS_BELLS) && <BrassBellsOverlay />}
      {overlays.includes(OVERLAY.BRASS_LAMPS) && <BrassLampsOverlay />}
      {overlays.includes(OVERLAY.PEACOCK)     && <PeacockShimmer />}
      {overlays.includes(OVERLAY.SACRED_FIRE) && <SacredFireOverlay />}
      {overlays.includes(OVERLAY.GANESHA_GLOW) && <GaneshaGlowOverlay />}
      {overlays.includes(OVERLAY.HOUSEBOAT)   && <HouseboatOverlay />}
      {overlays.includes(OVERLAY.WATER_RIPPLE_RINGS) && <WaterRippleRings />}
      {overlays.includes(OVERLAY.TURMERIC_STEAM) && <TurmericSteamOverlay />}
      {overlays.includes(OVERLAY.SWING)       && <SwingOverlay />}

      {overlays.includes(OVERLAY.PETALS_LOTUS) && (
        <PetalFall colors={[KERALA_COLORS.lotus, KERALA_COLORS.lotusDeep, '#FFE2EC']} count={14} zIndex={6} />
      )}
      {overlays.includes(OVERLAY.PETALS_WHITE) && (
        <PetalFall colors={['#FFFFFF', '#FFF6E9', '#FFE7D6']} count={12} zIndex={6} />
      )}
      {overlays.includes(OVERLAY.PETALS_MARIGOLD) && (
        <PetalFall colors={['#FF8C00', '#FFC000', '#FFD700']} count={16} zIndex={6} />
      )}

      {overlays.includes(OVERLAY.FIREFLY) && (
        <FireflyParticle count={14} color={KERALA_COLORS.particle} zIndex={8} />
      )}
      {overlays.includes(OVERLAY.SKY_LANTERN) && (
        <SkyLanternFloat count={6} zIndex={7} />
      )}
      {overlays.includes(OVERLAY.GOLD_SHIMMER) && (
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 8,
            border: '1.5px solid rgba(212,162,76,0.55)',
            borderRadius: 12,
            pointerEvents: 'none',
            zIndex: 9,
          }}
        >
          <GoldShimmer duration={6} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <span style={{ display: 'block', width: '100%', height: '100%' }} />
          </GoldShimmer>
        </div>
      )}

      {/* Text overlay */}
      {showText && textBlock}
    </motion.div>
  );
};

/* ─────────────────────────────────────────────────────────────────────
 * Overlay primitives — pure SVG + animation library compositions
 * ───────────────────────────────────────────────────────────────────── */

const LotusSVG = ({ size = 70, color = KERALA_COLORS.lotus, deep = false }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
    {[...Array(8)].map((_, i) => (
      <ellipse
        key={i}
        cx="40" cy="22"
        rx="7" ry="18"
        fill={color}
        opacity={0.85 - (i % 2) * (deep ? 0.15 : 0.25)}
        transform={`rotate(${i * 22.5} 40 40)`}
      />
    ))}
    <circle cx="40" cy="40" r="5" fill={KERALA_COLORS.secondary} />
  </svg>
);

const LotusOverlay = () => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', left: '6%',  top: '70%' }}>
      <LeafSway amplitude={2} duration={6}><LotusSVG size={72} /></LeafSway>
    </div>
    <div style={{ position: 'absolute', right: '8%', top: '78%' }}>
      <LeafSway amplitude={3} duration={7} delay={0.5}><LotusSVG size={56} color={KERALA_COLORS.lotusDeep} deep /></LeafSway>
    </div>
    <div style={{ position: 'absolute', left: '46%', top: '85%' }}>
      <LeafSway amplitude={2} duration={8} delay={1}><LotusSVG size={48} /></LeafSway>
    </div>
  </div>
);

const LilyPadsOverlay = () => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none' }}>
    {[
      { left: '15%', top: '82%', size: 70 },
      { left: '62%', top: '88%', size: 56 },
      { left: '38%', top: '92%', size: 84 },
    ].map((p, i) => (
      <div key={i} style={{ position: 'absolute', left: p.left, top: p.top }}>
        <LeafSway amplitude={2} duration={6 + i} delay={i * 0.4} intensity="subtle">
          <svg width={p.size} height={p.size} viewBox="0 0 80 80" fill="none">
            <path d="M40 8 A30 30 0 1 1 8 40 L40 40 Z" fill={KERALA_COLORS.bananaLeaf} opacity={0.7} />
          </svg>
        </LeafSway>
      </div>
    ))}
  </div>
);

const BananaLeafOverlay = () => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', left: '-4%', top: '4%' }}>
      <LeafSway amplitude={5} duration={6} origin="bottom left">
        <svg width="170" height="200" viewBox="0 0 170 200" fill="none">
          <path d="M10 200 Q60 60 160 20 Q120 110 80 200 Z" fill="#2F5D3A" opacity="0.82" />
          <path d="M30 190 Q70 70 150 30" stroke="#1E3F26" strokeWidth="1.5" fill="none" opacity="0.5" />
        </svg>
      </LeafSway>
    </div>
    <div style={{ position: 'absolute', right: '-4%', top: '8%', transform: 'scaleX(-1)' }}>
      <LeafSway amplitude={5} duration={7} delay={0.6} origin="bottom right">
        <svg width="150" height="180" viewBox="0 0 170 200" fill="none">
          <path d="M10 200 Q60 60 160 20 Q120 110 80 200 Z" fill="#2F5D3A" opacity="0.78" />
        </svg>
      </LeafSway>
    </div>
  </div>
);

const BrassBellsOverlay = () => (
  <div style={{ position: 'absolute', top: '3%', left: 0, right: 0, zIndex: 7, display: 'flex', justifyContent: 'space-around', pointerEvents: 'none' }}>
    {[0, 1, 2].map((i) => (
      <PendulumSwing key={i} amplitude={4} duration={2.6 + i * 0.4} delay={i * 0.3}>
        <svg width="28" height="48" viewBox="0 0 28 48" fill="none">
          <line x1="14" y1="0" x2="14" y2="14" stroke="#7A4E2C" strokeWidth="1.4" />
          <path d="M4 14 L24 14 L20 38 Q14 44 8 38 Z" fill="#D4A24C" />
          <circle cx="14" cy="42" r="2.5" fill="#9B6F2C" />
        </svg>
      </PendulumSwing>
    ))}
  </div>
);

const BrassLampsOverlay = () => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none' }}>
    {[
      { left: '8%',  top: '6%'  },
      { right: '8%', top: '6%'  },
    ].map((pos, i) => (
      <div key={i} style={{ position: 'absolute', ...pos }}>
        <LanternGlow swingAmp={3} swingDur={3.4 + i * 0.4} delay={i * 0.3} glowSize={90}>
          <svg width="34" height="58" viewBox="0 0 34 58" fill="none">
            <line x1="17" y1="0" x2="17" y2="10" stroke="#7A4E2C" strokeWidth="1.4" />
            <path d="M6 10 L28 10 L24 36 Q17 44 10 36 Z" fill="#D4A24C" />
            <circle cx="17" cy="22" r="6" fill="#FFB94A" />
          </svg>
          <div style={{ position: 'absolute', left: '50%', top: '60%', transform: 'translate(-50%,-50%)' }}>
            <FlameAnimation size={10} color="gold" glow={false} />
          </div>
        </LanternGlow>
      </div>
    ))}
  </div>
);

const PeacockShimmer = () => (
  <div
    aria-hidden
    style={{
      position: 'absolute', inset: 0,
      mixBlendMode: 'screen',
      pointerEvents: 'none',
      zIndex: 6,
      background:
        'radial-gradient(circle at 80% 70%, rgba(80,200,180,0.18) 0%, transparent 30%), ' +
        'radial-gradient(circle at 20% 80%, rgba(255,180,80,0.14) 0%, transparent 30%)',
      animation: 'peacock-shimmer 8s ease-in-out infinite',
    }}
  >
    <style>{`
      @keyframes peacock-shimmer {
        0%,100% { filter: hue-rotate(0deg)  brightness(1); }
        50%     { filter: hue-rotate(30deg) brightness(1.15); }
      }
    `}</style>
  </div>
);

const SacredFireOverlay = () => (
  <div style={{ position: 'absolute', left: '50%', bottom: '14%', transform: 'translateX(-50%)', zIndex: 9, pointerEvents: 'none' }}>
    <FlameAnimation size={42} color="amber" intensity={1.2} />
  </div>
);

const GaneshaGlowOverlay = () => (
  <div
    aria-hidden
    style={{
      position: 'absolute', left: '50%', top: '8%',
      transform: 'translateX(-50%)',
      width: 120, height: 120,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(212,162,76,0.55) 0%, transparent 65%)',
      filter: 'blur(6px)',
      animation: 'ganesha-pulse 4s ease-in-out infinite',
      pointerEvents: 'none',
      zIndex: 6,
    }}
  >
    <style>{`
      @keyframes ganesha-pulse {
        0%,100% { opacity: .45; transform: translateX(-50%) scale(1); }
        50%     { opacity: .85; transform: translateX(-50%) scale(1.18); }
      }
    `}</style>
  </div>
);

const HouseboatOverlay = () => (
  <div
    style={{
      position: 'absolute',
      bottom: '22%',
      width: 200, height: 70,
      zIndex: 4, pointerEvents: 'none',
      animation: 'houseboat-drift 30s linear infinite',
    }}
  >
    <style>{`
      @keyframes houseboat-drift {
        0%   { transform: translateX(-30%); }
        100% { transform: translateX(130%); }
      }
    `}</style>
    <svg viewBox="0 0 240 100" fill="none" width="100%" height="100%">
      <path d="M28 50 Q120 8 212 50 L212 60 L28 60 Z" fill="#3A2418" />
      <path d="M12 60 L228 60 L210 86 L30 86 Z" fill="#1F1108" />
      <rect x="108" y="50" width="24" height="10" fill="#0A0604" />
    </svg>
  </div>
);

const WaterRippleRings = () => (
  <div style={{ position: 'absolute', left: '50%', top: '70%', transform: 'translate(-50%,-50%)', zIndex: 3, pointerEvents: 'none' }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          position: 'absolute', left: 0, top: 0,
          width: 80, height: 80,
          border: '1px solid rgba(255,255,255,0.45)',
          borderRadius: '50%',
          transform: 'translate(-50%,-50%)',
          animation: `ripple-ring 3.2s ease-out ${i * 1}s infinite`,
        }}
      />
    ))}
    <style>{`
      @keyframes ripple-ring {
        0%   { opacity: .55; transform: translate(-50%,-50%) scale(0.4); }
        100% { opacity: 0;   transform: translate(-50%,-50%) scale(2.2); }
      }
    `}</style>
  </div>
);

const TurmericSteamOverlay = () => (
  <div style={{ position: 'absolute', left: '50%', bottom: '14%', transform: 'translateX(-50%)', zIndex: 6, pointerEvents: 'none' }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          position: 'absolute', left: i * 14 - 14, bottom: 0,
          width: 8, height: 20, borderRadius: 4,
          background: 'rgba(255,255,255,0.45)',
          filter: 'blur(3px)',
          animation: `turmeric-steam 3.4s ease-out ${i * 0.5}s infinite`,
        }}
      />
    ))}
    <style>{`
      @keyframes turmeric-steam {
        0%   { opacity: .55; transform: translateY(0)    scale(1); }
        100% { opacity: 0;   transform: translateY(-50px) scale(1.6); }
      }
    `}</style>
  </div>
);

const SwingOverlay = () => (
  <div style={{ position: 'absolute', left: '50%', top: '14%', transform: 'translateX(-50%)', zIndex: 5, pointerEvents: 'none' }}>
    <PendulumSwing amplitude={7} duration={4.2} origin="top center">
      <div style={{ position: 'relative', width: 110, height: 130 }}>
        <line style={{ position: 'absolute', left: 4,   top: 0, width: 1.5, height: 100, background: '#7A4E2C' }} />
        <span style={{ position: 'absolute', left: 0,   top: 0, width: 1.5, height: 100, background: '#7A4E2C', display: 'block' }} />
        <span style={{ position: 'absolute', right: 0,  top: 0, width: 1.5, height: 100, background: '#7A4E2C', display: 'block' }} />
        <div style={{ position: 'absolute', bottom: 18, left: -8, right: -8, height: 14, background: '#8B5E3A', borderRadius: 4 }} />
        <div style={{ position: 'absolute', bottom: 0,  left: -8, right: -8, height: 8,  background: '#FFB400', borderRadius: 8 }} />
      </div>
    </PendulumSwing>
  </div>
);

export default KeralaDesignRenderer;
