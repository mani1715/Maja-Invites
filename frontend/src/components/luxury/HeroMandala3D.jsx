import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * HeroMandala3D — CSS/SVG animated gold mandala + dust particles.
 *
 * 2026-05 perf overhaul:
 *   - Desktop renders ONE mandala (was 3)
 *   - Mobile is hidden entirely
 *   - Particle count 22 → 6
 *   - Slower glow pulse + slower rotation
 *   - Pauses rotation when scrolled out of the hero viewport
 */
const GOLD = '#C9A84C';
const LIGHT_GOLD = '#E8D5A3';

const PARTICLE_COUNT = 6;

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.innerWidth <= 768;

const HeroMandala3D = () => {
  const [hidden] = useState(isMobileViewport());
  const ref = useRef(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (hidden) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hidden]);

  if (hidden) return null;

  return (
    <div
      ref={ref}
      className="hero-mandala-3d"
      aria-hidden="true"
      style={{ animationPlayState: inView ? 'running' : 'paused' }}
    >
      {/* Single mandala — much cheaper than 3 stacked rotating SVGs */}
      <div className="mandala-stack" style={{ animationPlayState: inView ? 'running' : 'paused' }}>
        <Mandala size={620} duration={180} reverse={false} opacity={0.85} ringCount={10} paused={!inView} />
      </div>

      {/* Gold dust particles — reduced from 22 to 6 */}
      <div className="gold-dust-container">
        {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
          <span
            key={i}
            className="gold-dust"
            style={{
              left:  `${Math.random() * 100}%`,
              bottom: `${Math.random() * 100}%`,
              width:  `${1.5 + Math.random() * 3}px`,
              height: `${1.5 + Math.random() * 3}px`,
              animationDelay:    `${Math.random() * 24}s`,
              animationDuration: `${22 + Math.random() * 18}s`,
              animationPlayState: inView ? 'running' : 'paused',
              opacity:           0.25 + Math.random() * 0.4,
            }}
          />
        ))}
      </div>

      {/* Inner gold glow — slower, subtler */}
      <motion.div
        className="mandala-glow"
        animate={inView ? { opacity: [0.35, 0.55, 0.35] } : { opacity: 0.35 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
};

const Mandala = ({ size, duration, reverse, opacity, ringCount = 8, paused = false }) => {
  const r = size / 2 - 20;
  const cx = size / 2;
  const cy = size / 2;
  const petals = ringCount * 2;

  return (
    <motion.svg
      className="mandala-svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ opacity }}
      animate={paused ? { rotate: 0 } : { rotate: reverse ? -360 : 360 }}
      transition={paused ? { duration: 0 } : { duration, repeat: Infinity, ease: 'linear' }}
    >
      <defs>
        <radialGradient id={`g-${size}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={LIGHT_GOLD} stopOpacity="0.0" />
          <stop offset="60%"  stopColor={GOLD}       stopOpacity="0.4" />
          <stop offset="100%" stopColor={GOLD}       stopOpacity="0.0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r}      fill="none" stroke={GOLD}       strokeWidth="0.6" strokeOpacity="0.7" />
      <circle cx={cx} cy={cy} r={r - 14} fill="none" stroke={LIGHT_GOLD} strokeWidth="0.4" strokeOpacity="0.4" strokeDasharray="3 5" />
      <circle cx={cx} cy={cy} r={r * 0.6} fill="none" stroke={GOLD} strokeWidth="0.4" strokeOpacity="0.6" />
      <circle cx={cx} cy={cy} r={r * 0.42} fill="none" stroke={LIGHT_GOLD} strokeWidth="0.3" strokeOpacity="0.4" strokeDasharray="2 3" />

      {Array.from({ length: petals }).map((_, i) => {
        const angle = (i / petals) * Math.PI * 2;
        const innerR = r * 0.3;
        const outerR = r;
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * outerR;
        const y2 = cy + Math.sin(angle) * outerR;
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={i % 2 === 0 ? GOLD : LIGHT_GOLD}
            strokeWidth={i % 2 === 0 ? 0.7 : 0.4}
            strokeOpacity={i % 2 === 0 ? 0.7 : 0.4}
            strokeLinecap="round"
          />
        );
      })}

      {Array.from({ length: ringCount }).map((_, i) => {
        const angle = (i / ringCount) * 360;
        return (
          <g key={`petal-${i}`} transform={`rotate(${angle} ${cx} ${cy})`}>
            <path
              d={`M ${cx} ${cy - r * 0.55} Q ${cx + r * 0.12} ${cy - r * 0.4} ${cx} ${cy - r * 0.25} Q ${cx - r * 0.12} ${cy - r * 0.4} ${cx} ${cy - r * 0.55} Z`}
              fill="none"
              stroke={GOLD}
              strokeWidth="0.5"
              strokeOpacity="0.6"
            />
          </g>
        );
      })}

      <circle cx={cx} cy={cy} r={r * 0.08} fill={GOLD} fillOpacity="0.7" />
      <circle cx={cx} cy={cy} r={r * 0.04} fill={LIGHT_GOLD} />
      <circle cx={cx} cy={cy} r={r * 0.95} fill={`url(#g-${size})`} />
    </motion.svg>
  );
};

export default HeroMandala3D;
