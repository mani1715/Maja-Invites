/**
 * KeralaDesignGallery — Showcase page for all 18 Kerala Backwaters designs.
 *
 * Renders every event (Engagement → Sangeeth) with its 3 design variants.
 * Each design is fully live: real animations on real poster images.
 *
 * Route: /themes/kerala_backwaters/gallery (added in App.js)
 */
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import KeralaDesignRenderer from '@/themes/kerala_backwaters/KeralaDesignRenderer';
import { KERALA_DESIGNS, KERALA_EVENTS } from '@/themes/kerala_backwaters/kerala.designs';
import { KERALA_COLORS, keralaStyle } from '@/themes/kerala_backwaters/kerala.colors';
import KeralaBackground from '@/themes/kerala_backwaters/KeralaBackground';
import { AnimationProvider } from '@/components/animations';

const fadeUp = {
  hidden:  { opacity: 0, y: 24, filter: 'blur(6px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.8, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
};

const KeralaDesignGallery = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  return (
    <AnimationProvider>
      <div
        className="min-h-screen relative"
        style={{ ...keralaStyle(), background: KERALA_COLORS.background }}
        data-testid="kerala-design-gallery"
      >
        {/* Ambient backwater behind everything */}
        <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
          <KeralaBackground intensity="subtle" />
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div className="px-6 md:px-16 pt-12 pb-8 max-w-6xl mx-auto">
            <button
              onClick={() => navigate('/themes')}
              className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase mb-8"
              style={{ color: KERALA_COLORS.textMuted }}
              data-testid="kerala-gallery-back"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Themes
            </button>

            <motion.div variants={fadeUp} initial="hidden" animate="visible">
              <span
                className="block mb-4 text-[10px] tracking-[0.5em] uppercase"
                style={{ color: KERALA_COLORS.secondary }}
              >
                ◈ Kerala Backwaters · The Full Catalogue
              </span>
              <h1
                className="leading-[1.02]"
                style={{
                  color: KERALA_COLORS.text,
                  fontFamily: '"Cormorant Garamond", serif',
                  fontSize: 'clamp(2.4rem, 6vw, 4.6rem)',
                  letterSpacing: '0.02em',
                }}
              >
                Eighteen designs.
                <br />
                <span
                  style={{
                    color: KERALA_COLORS.secondary,
                    fontFamily: '"Great Vibes", cursive',
                    fontStyle: 'italic',
                  }}
                >
                  one slow backwater.
                </span>
              </h1>
              <p
                className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed"
                style={{ color: KERALA_COLORS.textMuted }}
              >
                Six ceremonies, three designs each — every card is a living scene:
                water that ripples, lotus that blooms, brass lamps that flicker,
                houseboats that drift. Pick the one that feels like your wedding.
              </p>
            </motion.div>
          </div>

          {/* Per-event sections */}
          {KERALA_EVENTS.map((event, ei) => (
            <section
              key={event}
              className="px-6 md:px-16 py-10 max-w-6xl mx-auto"
              data-testid={`kerala-event-${event.toLowerCase()}`}
            >
              <motion.div
                variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
                className="flex items-baseline justify-between mb-7"
              >
                <h2
                  style={{
                    color: KERALA_COLORS.text,
                    fontFamily: '"Cormorant Garamond", serif',
                    fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
                  }}
                >
                  {event}
                  <Sparkles className="inline w-5 h-5 ml-3" style={{ color: KERALA_COLORS.secondary }} />
                </h2>
                <span
                  className="text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: KERALA_COLORS.textMuted }}
                >
                  {String(ei + 1).padStart(2, '0')} · 3 designs
                </span>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {KERALA_DESIGNS[event].map((design, di) => (
                  <motion.div
                    key={design.id}
                    variants={fadeUp}
                    custom={di}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.15 }}
                    data-testid={`design-card-${design.id}`}
                  >
                    <KeralaDesignRenderer
                      design={design}
                      bride="Meera"
                      groom="Arjun"
                      date="12 Sep 2026"
                      venue="Kumarakom"
                    />
                    <div className="mt-3 px-1">
                      <div
                        className="text-[10px] tracking-[0.3em] uppercase mb-1"
                        style={{ color: KERALA_COLORS.secondary }}
                      >
                        Design {di + 1}
                      </div>
                      <div
                        className="text-[14px] leading-snug"
                        style={{ color: KERALA_COLORS.text, fontFamily: '"Cormorant Garamond", serif' }}
                      >
                        {design.title}
                      </div>
                      <div
                        className="text-[12px] mt-1 leading-relaxed"
                        style={{ color: KERALA_COLORS.textMuted }}
                      >
                        {design.description}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          ))}

          <div className="h-32" />
        </div>
      </div>
    </AnimationProvider>
  );
};

export default KeralaDesignGallery;
