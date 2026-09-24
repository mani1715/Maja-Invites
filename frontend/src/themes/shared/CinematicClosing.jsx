/* ════════════════════════════════════════════════════════════════════════
 * CinematicClosing — the *real* movie-style outro.
 *
 * Sits as a full-width 100vh section ABOVE the footer.  Triggers itself
 * when scrolled into view (IntersectionObserver) and plays a 5–6s sequence
 * that mirrors the opening's cinematic feel:
 *
 *   1. The design hero photo fades in with a *reverse* Ken-Burns (slow
 *      zoom-out from 1.05 → 1.18) — gives the camera-pulls-away feeling
 *      a film uses at the close.
 *   2. Letterbox bars close inwards (open at top/bottom, then narrow to
 *      80vh frame), reinforcing the matte-to-end feel.
 *   3. A *gentle* theme motif drifts across — slower than the opening
 *      (petals descending, candle smoke rising, ocean foam pulling away).
 *   4. Dedication text fades up over a vignette:
 *         WITH ALL OUR LOVE
 *         [Bride] & [Groom]
 *         [Date]
 *   5. Final fade-to-deep-cream with monogram.
 *
 * Unlike the opening, this is NOT a fixed overlay — it lives in document
 * flow so it scrolls naturally with the page.  No skip button (the user
 * already scrolled here intentionally).
 * ════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const useInView = (rootMargin = '0px 0px -10% 0px', threshold = 0.3) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) setInView(true); }),
      { rootMargin, threshold },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [rootMargin, threshold]);
  return [ref, inView];
};

/* ──────────────────────────────────────────────────────────────
   Closing-specific motifs — slower, more elegiac than the opening.
   ────────────────────────────────────────────────────────────── */

const FallingPetals = () => (
  <>
    {Array.from({ length: 22 }).map((_, i) => (
      <motion.div key={i}
        initial={{ y: -30, x: 0, rotate: 0, opacity: 0 }}
        animate={{ y: '100vh', x: (i % 2 ? 1 : -1) * (40 + Math.random() * 80),
                   rotate: 540, opacity: [0, 0.85, 0.85, 0] }}
        transition={{ duration: 5 + Math.random() * 2.5, delay: i * 0.18, ease: 'linear' }}
        style={{
          position: 'absolute', left: `${4 + i * 4.2}%`, top: 0,
          width: 14 + Math.random() * 6, height: 10 + Math.random() * 4,
          borderRadius: '70% 30% 70% 30%',
          background: ['#F8C6CB', '#F4A4B5', '#E07C8F', '#FBD3DA', '#F7E5E3'][i % 5],
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
        }} />
    ))}
  </>
);

const FoamPullingAway = () => {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    const { width: w, height: h } = c.getBoundingClientRect();
    c.width = w * window.devicePixelRatio;
    c.height = h * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    let t = 0, raf;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const wave = Math.max(0, 220 - t * 2.5); // recedes
      const yMid = h - 60 - wave;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const wob = Math.sin((x + t * 3) * 0.022) * 6 + Math.cos((x + t * 1.5) * 0.04) * 3;
        ctx.lineTo(x, yMid + wob);
      }
      ctx.lineTo(w, h); ctx.closePath();
      const g = ctx.createLinearGradient(0, yMid, 0, h);
      g.addColorStop(0, 'rgba(131,208,201,0.6)');
      g.addColorStop(1, 'rgba(31,127,118,0.7)');
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const wob = Math.sin((x + t * 3) * 0.022) * 6 + Math.cos((x + t * 1.5) * 0.04) * 3;
        if (x === 0) ctx.moveTo(x, yMid + wob); else ctx.lineTo(x, yMid + wob);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      t += 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen' }} />;
};

const RisingEmbers = () => (
  <>
    {Array.from({ length: 26 }).map((_, i) => (
      <motion.div key={i}
        initial={{ y: '105vh', opacity: 0, scale: 0.4 }}
        animate={{ y: -60, opacity: [0, 0.95, 0.7, 0], scale: [0.4, 1, 0.6] }}
        transition={{ duration: 5 + Math.random() * 2, delay: i * 0.18, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: `${3 + i * 3.6}%`, bottom: 0,
          width: 5, height: 5, borderRadius: '50%',
          background: 'radial-gradient(circle, #FFD78A 0%, #E89A2A 60%, transparent 100%)',
          boxShadow: '0 0 10px #FFB060, 0 0 20px rgba(255,176,96,0.5)',
        }} />
    ))}
  </>
);

const GoldDustVeil = () => (
  <>
    {Array.from({ length: 60 }).map((_, i) => (
      <motion.div key={i}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: '100vh', opacity: [0, 0.9, 0] }}
        transition={{ duration: 4 + Math.random() * 3, delay: Math.random() * 2, ease: 'linear' }}
        style={{
          position: 'absolute', left: `${Math.random() * 100}%`, top: 0,
          width: 2 + Math.random() * 2, height: 2 + Math.random() * 2,
          borderRadius: '50%', background: '#C8A45D',
          boxShadow: '0 0 6px #C8A45D',
        }} />
    ))}
  </>
);

const SoftSnowfall = () => (
  <>
    {Array.from({ length: 30 }).map((_, i) => (
      <motion.div key={i}
        initial={{ y: -20, x: 0, opacity: 0 }}
        animate={{ y: '105vh', x: (i % 2 ? 1 : -1) * 24, opacity: [0, 1, 0.6, 0] }}
        transition={{ duration: 6 + Math.random() * 3, delay: i * 0.12, ease: 'linear' }}
        style={{
          position: 'absolute', left: `${3 + i * 3.2}%`, top: 0,
          width: 4, height: 4, borderRadius: '50%',
          background: '#FFFCF4', boxShadow: '0 0 6px rgba(255,252,244,0.6)',
        }} />
    ))}
  </>
);

const LanternsDriftingUp = () => (
  <>
    {[0, 1, 2, 3, 4].map((i) => (
      <motion.div key={i}
        initial={{ y: '110vh', x: 0, opacity: 0 }}
        animate={{ y: '-20vh', x: (i % 2 ? 1 : -1) * 30, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 7 + Math.random() * 2, delay: i * 0.6, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: `${15 + i * 16}%`, bottom: 0,
          width: 38, height: 56, borderRadius: '50% 50% 30% 30%',
          background: 'radial-gradient(ellipse at 50% 30%, #FFE5A0 0%, #E89A2A 70%, #8B4A12 100%)',
          filter: 'drop-shadow(0 0 24px #FFB060)',
        }} />
    ))}
  </>
);

const ConfettiSettling = () => (
  <>
    {Array.from({ length: 50 }).map((_, i) => (
      <motion.div key={i}
        initial={{ y: -40, opacity: 0, rotate: 0 }}
        animate={{
          y: '105vh',
          x: (i % 2 ? 1 : -1) * (20 + Math.random() * 50),
          rotate: 720 + Math.random() * 360,
          opacity: [0, 1, 1, 0],
        }}
        transition={{ duration: 4.5 + Math.random() * 3, delay: i * 0.05, ease: 'linear' }}
        style={{
          position: 'absolute', left: `${Math.random() * 100}%`, top: 0,
          width: 6 + Math.random() * 4, height: 10 + Math.random() * 6,
          background: ['#FFD700', '#FF1744', '#00C9FF', '#FF66CC', '#9FFF66', '#FF9933'][i % 6],
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }} />
    ))}
  </>
);

const HeartFloat = () => (
  <>
    {Array.from({ length: 14 }).map((_, i) => (
      <motion.div key={i}
        initial={{ y: '105vh', opacity: 0, scale: 0.6 }}
        animate={{ y: -80, opacity: [0, 0.9, 0.5, 0], scale: [0.6, 1.2, 0.9] }}
        transition={{ duration: 6 + Math.random() * 2.5, delay: i * 0.4, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: `${6 + i * 6.5}%`, bottom: 0,
          width: 22, height: 20,
          background: 'radial-gradient(circle at 30% 30%, #FFB6C1 0%, #E91E63 70%, transparent 100%)',
          clipPath: 'polygon(50% 90%, 0 35%, 0 15%, 25% 0, 50% 25%, 75% 0, 100% 15%, 100% 35%)',
          filter: 'drop-shadow(0 0 12px rgba(233,30,99,0.5))',
        }} />
    ))}
  </>
);

const TurmericDust = () => (
  <>
    {Array.from({ length: 80 }).map((_, i) => (
      <motion.div key={i}
        initial={{ y: -20, x: 0, opacity: 0 }}
        animate={{
          y: '108vh',
          x: (i % 2 ? 1 : -1) * (10 + Math.random() * 40),
          opacity: [0, 0.95, 0.8, 0],
        }}
        transition={{ duration: 4 + Math.random() * 3, delay: Math.random() * 1.5, ease: 'linear' }}
        style={{
          position: 'absolute', left: `${Math.random() * 100}%`, top: 0,
          width: 3 + Math.random() * 3, height: 3 + Math.random() * 3,
          borderRadius: '50%',
          background: ['#FFD54F', '#FFC107', '#FF9800', '#FFEB3B'][i % 4],
          boxShadow: '0 0 8px #FFD54F',
        }} />
    ))}
  </>
);

const BlossomDescent = () => (
  <>
    {Array.from({ length: 28 }).map((_, i) => (
      <motion.div key={i}
        initial={{ y: -30, rotate: 0, opacity: 0 }}
        animate={{
          y: '105vh',
          x: (i % 2 ? 1 : -1) * (30 + Math.random() * 60),
          rotate: 360 + Math.random() * 180,
          opacity: [0, 0.95, 0.85, 0],
        }}
        transition={{ duration: 6 + Math.random() * 3, delay: i * 0.18, ease: 'linear' }}
        style={{
          position: 'absolute', left: `${2 + i * 3.5}%`, top: 0,
          width: 16 + Math.random() * 8, height: 16 + Math.random() * 8,
          background: ['#FFFFFF', '#FFE4E1', '#FFC0CB', '#FFB6C1'][i % 4],
          borderRadius: '60% 40% 60% 40%',
          boxShadow: '0 4px 14px rgba(255,182,193,0.5)',
          filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.5))',
        }} />
    ))}
  </>
);

const motifFor = (themeId = '', eventType = 'marriage') => {
  const e = (eventType || 'marriage').toLowerCase();
  const t = themeId.toLowerCase();

  // Haldi / Sangeet / Mehendi — vibrant turmeric/confetti regardless of theme
  if (['haldi', 'sangeet', 'mehendi'].includes(e)) {
    if (t.includes('minimal')) return <ConfettiSettling />;
    return <TurmericDust />;
  }

  // Reception — celebration confetti for most themes
  if (e === 'reception') {
    if (t.includes('beach')) return <FoamPullingAway />;
    if (t.includes('kerala') || t.includes('temple')) return <RisingEmbers />;
    return <ConfettiSettling />;
  }

  // Engagement — intimate, romantic motifs
  if (e === 'engagement') {
    if (t.includes('beach')) return <FoamPullingAway />;
    if (t.includes('minimal')) return <SoftSnowfall />;
    return <HeartFloat />;
  }

  // Marriage — theme-specific signature motif
  if (t.includes('temple')) return <RisingEmbers />;
  if (t.includes('beach')) return <FoamPullingAway />;
  if (t.includes('nature') || t.includes('eco')) return <FallingPetals />;
  if (t.includes('punjabi')) return <LanternsDriftingUp />;
  if (t.includes('mughal')) return <GoldDustVeil />;
  if (t.includes('christian')) return <BlossomDescent />;
  if (t.includes('kerala')) return <RisingEmbers />;
  if (t.includes('muslim') || t.includes('nikah')) return <SoftSnowfall />;
  if (t.includes('bengali')) return <GoldDustVeil />;
  if (t.includes('minimal')) return <SoftSnowfall />;
  return <FallingPetals />;
};

const dedicationFor = (eventType = 'marriage') => {
  const e = (eventType || 'marriage').toLowerCase();
  if (e === 'engagement') return { tag: '◆ A promise begins', closing: 'Together · Forever' };
  if (e === 'reception') return { tag: '◆ Celebrating us', closing: 'A night to remember' };
  if (['haldi', 'sangeet', 'mehendi'].includes(e)) return { tag: '◆ With joyful blessings', closing: 'A burst of colour' };
  return { tag: '◆ With all our love', closing: 'Forever' };
};

/* ──────────────────────────────────────────────────────────────
   Main component
   ────────────────────────────────────────────────────────────── */
export default function CinematicClosing({ themeId, image, bride, groom, date, eventType = 'marriage' }) {
  const [ref, inView] = useInView();
  const [phase, setPhase] = useState(0);
  const { tag: dedicationTag, closing: closingLine } = dedicationFor(eventType);

  useEffect(() => {
    if (!inView) return;
    const ts = [
      setTimeout(() => setPhase(1), 80),    // letterbox in
      setTimeout(() => setPhase(2), 500),   // photo + reverse Ken-Burns
      setTimeout(() => setPhase(3), 1400),  // motif drifts
      setTimeout(() => setPhase(4), 2800),  // dedication text fades in
      setTimeout(() => setPhase(5), 5800),  // final cream-fade
    ];
    return () => ts.forEach(clearTimeout);
  }, [inView]);

  const monogram = `${(bride || '?')[0]} & ${(groom || '?')[0]}`;

  return (
    <section
      ref={ref}
      data-testid="cinematic-closing"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '92vh',
        background: '#0A0604',
        overflow: 'hidden',
        marginTop: 60,
      }}
    >
      {/* HERO PHOTO — design image with REVERSE Ken Burns (zoom OUT) */}
      <motion.div
        initial={{ scale: 1.04, opacity: 0 }}
        animate={{
          scale: phase >= 2 ? 1.18 : 1.04,
          opacity: phase >= 2 ? 0.72 : 0,
        }}
        transition={{
          opacity: { duration: 1.0, ease: 'easeOut' },
          scale: { duration: 5.5, ease: 'linear' },
        }}
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url("${image || ''}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.82) saturate(0.95)',
        }}
      />

      {/* Deep cinematic vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 20%, rgba(0,0,0,0.85) 100%)',
      }} />

      {/* Bottom-to-top dark gradient for legible text */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.78) 100%)',
      }} />

      {/* Letterbox bars closing inward */}
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: phase >= 1 ? '7vh' : 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, background: '#000', zIndex: 5 }}
      />
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: phase >= 1 ? '7vh' : 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#000', zIndex: 5 }}
      />

      {/* Theme motif overlay (petals, embers, foam, etc) */}
      {phase >= 3 && (
        <div style={{ position: 'absolute', inset: '7vh 0', pointerEvents: 'none', zIndex: 8 }}>
          {motifFor(themeId, eventType)}
        </div>
      )}

      {/* Dedication text */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', textAlign: 'center',
          padding: '0 1.5rem',
          pointerEvents: 'none',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: phase >= 4 ? 1 : 0, y: phase >= 4 ? 0 : 18 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            fontSize: '10px',
            letterSpacing: '0.6em',
            textTransform: 'uppercase',
            color: '#D4AF37',
            marginBottom: 24,
            fontFamily: 'Manrope, sans-serif',
          }}
        >
          ◆ {dedicationTag.replace('◆ ', '')}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{
            opacity: phase >= 4 ? 1 : 0,
            scale: phase >= 4 ? 1 : 0.94,
            y: phase >= 4 ? 0 : 20,
          }}
          transition={{ duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{
            fontFamily: '"Cormorant Garamond", serif',
            fontSize: 'clamp(2.4rem, 6.5vw, 5.6rem)',
            fontWeight: 300,
            lineHeight: 1.05,
            color: '#FFF8DC',
            textShadow: '0 4px 24px rgba(0,0,0,0.7), 0 1px 0 rgba(212,175,55,0.3)',
          }}
        >
          {bride || 'Bride'}
          <span style={{
            display: 'block',
            fontFamily: '"Great Vibes", "Tangerine", cursive',
            fontStyle: 'italic',
            color: '#E8C766',
            fontSize: '0.6em',
            margin: '0.2em 0',
          }}>
            &amp;
          </span>
          {groom || 'Groom'}
        </motion.div>

        {date && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: phase >= 4 ? 0.88 : 0, y: phase >= 4 ? 0 : 14 }}
            transition={{ duration: 1.4, delay: 0.7 }}
            style={{
              marginTop: 28,
              fontSize: '13px',
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
              color: 'rgba(255,248,220,0.85)',
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            {date}
          </motion.div>
        )}

        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{
            width: phase >= 4 ? 'min(280px, 40vw)' : 0,
            opacity: phase >= 4 ? 1 : 0,
          }}
          transition={{ duration: 2.2, delay: 1.1, ease: 'easeOut' }}
          style={{
            marginTop: 36,
            height: 1,
            background: 'linear-gradient(90deg, transparent, #D4AF37 50%, transparent)',
          }}
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 4 ? 0.65 : 0 }}
          transition={{ duration: 1.6, delay: 1.5 }}
          style={{
            marginTop: 22,
            fontSize: '11px',
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            color: 'rgba(255,248,220,0.78)',
            fontFamily: 'Manrope, sans-serif',
          }}
        >
          {monogram} · {closingLine}
        </motion.div>
      </div>

      {/* Final warm-cream fade overlay (mirrors opening's white fade-in) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 5 ? 0.18 : 0 }}
        transition={{ duration: 1.4 }}
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(255,247,229,0.4) 0%, transparent 70%)',
          zIndex: 12, pointerEvents: 'none',
        }}
      />
    </section>
  );
}
