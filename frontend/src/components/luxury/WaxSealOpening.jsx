import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import '../../styles/luxury.css';

/**
 * WaxSealOpening — cinematic intro overlay
 *
 * Renders a full-screen invitation envelope with a wax seal. On user click
 * (or after `autoOpenAfter` ms) the seal cracks, the envelope unfolds in 3D,
 * and the overlay fades out revealing the `children`.
 *
 * Usage:
 *   <WaxSealOpening monogram="A & R" subtitle="Request your presence">
 *     <YourInvitation />
 *   </WaxSealOpening>
 */
const WaxSealOpening = ({
  children,
  monogram = 'A & R',
  subtitle = 'You are cordially invited',
  ctaLabel = 'Open Invitation',
  autoOpenAfter = null, // ms
  storageKey = null,    // if set, opens only once per browser
}) => {
  const reduce = useReducedMotion();
  const [opened, setOpened] = useState(() => {
    if (typeof window !== 'undefined' && storageKey) {
      return window.sessionStorage.getItem(storageKey) === '1';
    }
    return false;
  });
  const [cracking, setCracking] = useState(false);

  useEffect(() => {
    if (autoOpenAfter && !opened) {
      const t = setTimeout(() => triggerOpen(), autoOpenAfter);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerOpen = () => {
    if (opened || cracking) return;
    setCracking(true);
    setTimeout(() => {
      setOpened(true);
      if (storageKey && typeof window !== 'undefined') {
        window.sessionStorage.setItem(storageKey, '1');
      }
    }, reduce ? 200 : 1700);
  };

  return (
    <div className="relative">
      <AnimatePresence>
        {!opened && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }}
            className="fixed inset-0 z-[60] flex items-center justify-center luxe luxe-grain luxe-vignette"
            style={{ background: 'var(--lux-bg)' }}
            data-testid="wax-seal-overlay"
          >
            <div className="lux-orbit" style={{ width: 760, height: 760 }} />
            <div className="lux-orbit" style={{ width: 1100, height: 1100, opacity: 0.45 }} />

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex flex-col items-center px-6"
              style={{ perspective: 1400 }}
            >
              {/* Envelope */}
              <motion.div
                onClick={triggerOpen}
                whileHover={!cracking && !reduce ? { scale: 1.015 } : {}}
                className="relative cursor-pointer select-none"
                style={{
                  width: 'min(86vw, 420px)',
                  aspectRatio: '4 / 3',
                  background: 'linear-gradient(135deg, #1A130B 0%, #2A1D10 50%, #1A130B 100%)',
                  border: '1px solid var(--lux-border-strong)',
                  borderRadius: 14,
                  boxShadow: '0 40px 100px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(212,175,55,0.18)',
                  transformStyle: 'preserve-3d',
                }}
                animate={cracking && !reduce
                  ? { rotateX: [0, -8, -78], y: [0, -10, -40], transition: { duration: 1.6, ease: [0.22, 1, 0.36, 1] } }
                  : {}}
                data-testid="wax-seal-envelope"
              >
                {/* Top flap (the part that opens) */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: '55%',
                    background: 'linear-gradient(180deg, #2A1D10 0%, #1A130B 100%)',
                    clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                    borderBottom: '1px solid rgba(212,175,55,0.2)',
                  }}
                />

                {/* Monogram revealed center */}
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-7 pointer-events-none">
                  <div className="lux-eyebrow mb-2 text-[10px]" style={{ opacity: 0.7 }}>◆ Invitation</div>
                  <div className="font-display text-3xl md:text-4xl text-gold tracking-wide">{monogram}</div>
                </div>

                {/* Wax seal */}
                <motion.div
                  className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 rounded-full grid place-items-center"
                  style={{
                    width: 96, height: 96,
                    background: 'radial-gradient(circle at 30% 30%, #C92121 0%, #8B0000 55%, #4A0000 100%)',
                    boxShadow: '0 10px 30px -8px rgba(139,0,0,0.7), inset 0 2px 6px rgba(255,255,255,0.15), inset 0 -8px 16px rgba(0,0,0,0.4)',
                    border: '2px solid #6B0F0F',
                    zIndex: 4,
                  }}
                  animate={cracking && !reduce ? {
                    scale: [1, 1.08, 0],
                    rotate: [0, -8, 30],
                    opacity: [1, 1, 0],
                    transition: { duration: 1.0, times: [0, 0.4, 1], ease: 'easeOut' },
                  } : {}}
                  data-testid="wax-seal-stamp"
                >
                  <div className="font-display text-2xl" style={{ color: '#FFD7A8', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    M
                  </div>
                  {/* Embossed ring */}
                  <div className="absolute inset-2 rounded-full" style={{ border: '1px dashed rgba(255,215,168,0.4)' }} />
                </motion.div>

                {/* Cracking shards */}
                {cracking && !reduce && (
                  <>
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
                        animate={{
                          opacity: 0,
                          x: (Math.cos((i * Math.PI) / 3) * 140),
                          y: (Math.sin((i * Math.PI) / 3) * 140),
                          rotate: 180 + i * 30,
                        }}
                        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute left-1/2 top-[44%] w-3 h-3 rounded-sm"
                        style={{ background: '#8B0000', zIndex: 5 }}
                      />
                    ))}
                  </>
                )}
              </motion.div>

              {/* Subtitle + CTA */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="mt-10 text-center"
              >
                <p className="lux-eyebrow mb-4">◆ {subtitle}</p>
                <button onClick={triggerOpen} className="lux-btn" disabled={cracking} data-testid="wax-seal-cta">
                  {cracking ? 'Opening…' : ctaLabel}
                </button>
                <p className="mt-5 text-xs tracking-widest uppercase" style={{ color: 'rgba(255,248,220,0.7)' }}>
                  Tap the seal
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
};

export default WaxSealOpening;
