/**
 * ThemeDesignGallery — Generic gallery for any theme in `ALL_DESIGNS`.
 *
 * Route: /themes/:themeId/gallery
 *
 * Reads the themeId from the URL, looks up the theme tokens + 18 designs
 * (6 events × 3 designs), and renders them through UniversalDesignRenderer.
 *
 * Kerala has its own dedicated gallery (`/themes/kerala_backwaters/gallery`)
 * because it was shipped first with theme-specific background ambience.
 */
import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import UniversalDesignRenderer from '@/themes/UniversalDesignRenderer';
import { ALL_DESIGNS, EVENTS, useThemeDesigns } from '@/themes/allDesigns';
import { getThemeById } from '@/themes/masterThemes';
import { getThemeSampleData } from '@/themes/sampleData';
import { AnimationProvider } from '@/components/animations';

const fadeUp = {
  hidden:  { opacity: 0, y: 24, filter: 'blur(6px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.8, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
};

const ThemeDesignGallery = () => {
  const { themeId } = useParams();
  const navigate = useNavigate();
  const themeMeta = useMemo(() => getThemeById(themeId), [themeId]);
  // PHASE 8: lazy-load only the selected theme's design config.
  const themeData = useThemeDesigns(themeId);
  const tokens = themeData?.tokens;
  const SAMPLE = useMemo(() => {
    const s = getThemeSampleData(themeId) || {};
    return {
      bride: s.bride || 'Anaya',
      groom: s.groom || 'Vihaan',
      date:  s.weddingDate || '14 Feb 2026',
      venue: s.venue || (themeMeta?.name?.split(' ')[0] || ''),
    };
  }, [themeId, themeMeta]);

  useEffect(() => {
    if (!tokens) return;
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = tokens.background;
    document.documentElement.style.background = tokens.background;
    // Remove leftover dark theme classes
    document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, [tokens]);

  if (!themeData) {
    return (
      <div className="luxe min-h-screen grid place-items-center px-6">
        <div className="lux-glass p-10 max-w-md text-center">
          <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--lux-text)' }}>
            Gallery not yet available.
          </h2>
          <p className="mb-6" style={{ color: 'var(--lux-text-muted)' }}>
            This theme is on the roadmap. Try the live ones.
          </p>
          <button onClick={() => navigate('/themes')} className="lux-btn lux-btn-ghost">
            Browse all themes
          </button>
        </div>
      </div>
    );
  }

  const tokensLocal = themeData.tokens;
  const bg = tokensLocal.background;
  const text = tokensLocal.text;
  const accent = tokensLocal.accent;
  const accentGold = tokensLocal.accentGold || tokensLocal.accent;

  return (
    <AnimationProvider>
      <div
        className="relative"
        style={{ background: bg, color: text, minHeight: '100vh', width: '100%' }}
        data-testid={`theme-gallery-${themeId}`}
      >
        {/* Header */}
        <div className="px-6 md:px-16 pt-12 pb-8 max-w-6xl mx-auto">
          <button
            onClick={() => navigate('/themes')}
            className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase mb-8 opacity-80"
            style={{ color: text }}
            data-testid="theme-gallery-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Themes
          </button>

          <motion.div variants={fadeUp} initial="hidden" animate="visible">
            <span
              className="block mb-4 text-[10px] tracking-[0.5em] uppercase"
              style={{ color: accentGold }}
            >
              ◈ {themeMeta?.culture || themeId} · The Full Catalogue
            </span>
            <h1
              className="leading-[1.02]"
              style={{
                color: text,
                fontFamily: tokensLocal.heading || '"Cormorant Garamond", serif',
                fontSize: 'clamp(2.4rem, 6vw, 4.6rem)',
                letterSpacing: '0.02em',
              }}
            >
              Eighteen designs.
              <br />
              <span
                style={{
                  color: accentGold,
                  fontFamily: '"Great Vibes", cursive',
                  fontStyle: 'italic',
                }}
              >
                {themeMeta?.name || 'a single story'}.
              </span>
            </h1>
            <p
              className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed opacity-80"
              style={{ color: text }}
            >
              {themeMeta?.description ||
                'Six ceremonies, three designs each — every card a living scene.'}
            </p>
          </motion.div>
        </div>

        {/* Events */}
        {EVENTS.map((event, ei) => {
          const designs = themeData.events[event] || [];
          if (designs.length === 0) return null;
          return (
            <section
              key={event}
              className="px-6 md:px-16 py-10 max-w-6xl mx-auto"
              data-testid={`event-${themeId}-${event.toLowerCase()}`}
            >
              <motion.div
                variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
                className="flex items-baseline justify-between mb-7"
              >
                <h2
                  style={{
                    color: text,
                    fontFamily: tokensLocal.heading || '"Cormorant Garamond", serif',
                    fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
                  }}
                >
                  {event}
                  <Sparkles className="inline w-5 h-5 ml-3" style={{ color: accentGold }} />
                </h2>
                <span
                  className="text-[10px] tracking-[0.3em] uppercase opacity-70"
                  style={{ color: text }}
                >
                  {String(ei + 1).padStart(2, '0')} · {designs.length} designs
                </span>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {designs.map((design, di) => (
                  <motion.div
                    key={design.id}
                    variants={fadeUp}
                    custom={di}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.15 }}
                    data-testid={`design-card-${design.id}`}
                  >
                    <UniversalDesignRenderer
                      design={design}
                      theme={{ tokens }}
                      bride={SAMPLE.bride}
                      groom={SAMPLE.groom}
                      date={SAMPLE.date}
                      venue={SAMPLE.venue}
                      /* PHASE 4: only the first event's first design loads eagerly.
                         Everything else defers until IntersectionObserver fires,
                         so we never request 18 oversized PNGs at once. */
                      eager={ei === 0 && di === 0}
                    />
                    <div className="mt-3 px-1">
                      <div
                        className="text-[10px] tracking-[0.3em] uppercase mb-1"
                        style={{ color: accentGold }}
                      >
                        Design {di + 1}
                      </div>
                      <div
                        className="text-[14px] leading-snug"
                        style={{ color: text, fontFamily: tokensLocal.heading || '"Cormorant Garamond", serif' }}
                      >
                        {design.title}
                      </div>
                      <div
                        className="text-[12px] mt-1 leading-relaxed opacity-75"
                        style={{ color: text }}
                      >
                        {design.description}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          );
        })}

        <div className="h-32" />
      </div>
    </AnimationProvider>
  );
};

export default ThemeDesignGallery;
