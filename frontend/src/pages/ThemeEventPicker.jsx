/**
 * ThemeEventPicker — Step B of the design picker flow.
 *
 * Route: /themes/:themeId/events
 *
 * Shows 6 large ceremony cards (Engagement, Haldi, Mehandi, Sangeeth,
 * Marriage, Reception) for the chosen theme. Each card previews the
 * first photo design of that event as the card background with the
 * ceremony name + description overlaid on top.
 */
import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { ALL_DESIGNS, EVENTS, useThemeDesigns } from '@/themes/allDesigns';
import { KERALA_COLORS } from '@/themes/kerala_backwaters/kerala.colors';
import { getThemeById } from '@/themes/masterThemes';
import { resolveDesign } from '@/themes/themeDesignResolver';
import { getThemeSampleData } from '@/themes/sampleData';
import { AnimationProvider } from '@/components/animations';
import UniversalDesignRenderer from '@/themes/UniversalDesignRenderer';
import ThemeAnimatedBackground from '@/components/ThemeAnimatedBackground';

const SAMPLE_PHOTO = 'https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=400&fit=crop&q=85';

const EVENT_DESCRIPTIONS = {
  Engagement: 'Where the promise begins — rings, blessings and the first glance of forever.',
  Haldi: 'Turmeric, laughter and golden glow — the morning that sets every cheek aglow.',
  Mehandi: 'Henna, music and the slow, intricate art of staining hands for love.',
  Sangeeth: 'A night of song, dance and a dholna that will not sleep until the sky does.',
  Marriage: 'The seven steps, the sacred fire — two families becoming one before God.',
  Reception: 'A grand welcome of the newlyweds — chandeliers, toasts and a thousand smiles.',
};

const fadeUp = {
  hidden: { opacity: 0, y: 28, filter: 'blur(8px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.8, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

const ThemeEventPicker = () => {
  const { themeId } = useParams();
  const navigate = useNavigate();
  const themeMeta = useMemo(() => getThemeById(themeId), [themeId]);
  // PHASE 8: lazy-load only the selected theme. Triggers re-render once loaded.
  const themeDesigns = useThemeDesigns(themeId);

  // Theme-specific dummy couple, so previews are visibly themed.
  const SAMPLE_INVITATION = useMemo(() => {
    const s = getThemeSampleData(themeId) || {};
    return {
      bride: s.bride || 'Anaya',
      groom: s.groom || 'Vihaan',
      date:  s.weddingDate || '14 Feb 2026',
      venue: s.venue || 'Falaknuma Palace',
      photo: SAMPLE_PHOTO,
    };
  }, [themeId]);

  // Resolve the first design image per event to use as card background
  const eventPreviews = useMemo(() => {
    return EVENTS.map((evt) => {
      const r = resolveDesign(themeId, evt, 0);
      const hasDesign = !!(r?.design);
      return { event: evt, design: r?.design || null, tokens: r?.theme?.tokens || null, locked: !hasDesign };
    });
    // `themeDesigns`: resolveDesign() reads the module cache, so this MUST
    // recompute when the chunk lands or every event stays falsely `locked`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, themeDesigns]);

  const tokens = useMemo(() => {
    if (themeId === 'kerala_backwaters') {
      return { background: KERALA_COLORS.water, text: KERALA_COLORS.text, accent: KERALA_COLORS.secondary };
    }
    const entry = themeDesigns || ALL_DESIGNS[themeId];
    if (entry) return entry.tokens;
    return { background: '#0a0a0a', text: '#F5ECD7', accent: '#D4AF37' };
  }, [themeId, themeDesigns]);

  useEffect(() => {
    const prevBody = document.body.style.background;
    // Keep WHITE background for ceremony selection
    document.body.style.background = '#FFFFFF';  // Pure white
    document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
    return () => { document.body.style.background = prevBody; };
  }, [tokens.background]);

  if (!themeMeta) {
    return (
      <div className="min-h-screen grid place-items-center px-6" style={{ background: '#0a0a0a', color: 'var(--lux-text)' }}>
        <div className="text-center">
          <h2 className="font-display text-3xl mb-3">Theme not found.</h2>
          <button onClick={() => navigate('/themes')} className="lux-btn lux-btn-ghost">Back to themes</button>
        </div>
      </div>
    );
  }

  const accent = tokens.accentGold || tokens.accent;
  // CRITICAL FIX (Bucket 1 — invisible text):
  // The page background is forced WHITE for the ceremony picker, but several
  // themes (beach, christian, muslim) have light/cream `tokens.text` (#FFF8F2,
  // #F8F4EC, #F5ECD7) which becomes invisible on white. We auto-darken text
  // for page chrome whenever the theme's own text colour is too light to be
  // readable on white. Card previews still use their own dark bg via the
  // UniversalDesignRenderer so their text isn't affected by this.
  const isLightText = (hex) => {
    if (!hex || typeof hex !== 'string') return false;
    const h = hex.replace('#', '');
    if (h.length !== 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // Perceived luminance > 0.7 → too light against white
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7;
  };
  const text = isLightText(tokens.text) ? '#1a1410' : tokens.text;
  const headingFont = tokens.heading || '"Cormorant Garamond", serif';

  return (
    <AnimationProvider>
      {/* 3D Animated Background on WHITE */}
      <ThemeAnimatedBackground theme={themeId} />
      
      <div className="relative min-h-screen" style={{ background: 'transparent', color: text }} data-testid={`event-picker-${themeId}`}>
        <div className="px-6 md:px-16 pt-12 pb-8 max-w-6xl mx-auto">
          <button
            onClick={() => navigate('/themes')}
            className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase mb-8 opacity-80 hover:opacity-100 transition-opacity"
            style={{ color: text }}
            data-testid="back-to-themes"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Themes
          </button>

          <motion.div variants={fadeUp} initial="hidden" animate="visible">
            <span className="block mb-4 text-[10px] tracking-[0.5em] uppercase" style={{ color: accent }}>
              ◈ Step 2 of 3 · {themeMeta.name}
            </span>
            <h1
              className="leading-[1.02]"
              style={{ color: text, fontFamily: headingFont, fontSize: 'clamp(2.4rem, 6vw, 4.6rem)', letterSpacing: '0.01em' }}
            >
              Choose your{' '}
              <span style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>
                ceremony.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed opacity-80" style={{ color: text }}>
              Six ceremonies — every one with three hand-crafted backgrounds waiting for your names.
              Tap one to see its designs.
            </p>
          </motion.div>
        </div>

        <div className="px-6 md:px-16 pb-24 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventPreviews.map(({ event, design, tokens: dtokens, locked }, i) => (
              <motion.button
                key={event}
                type="button"
                variants={fadeUp}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.1 }}
                whileHover={locked ? undefined : { y: -6, scale: 1.015 }}
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                onClick={() => { if (!locked) navigate(`/themes/${themeId}/events/${event}`); }}
                disabled={locked}
                className="group relative overflow-hidden text-left"
                style={{
                  borderRadius: 18,
                  border: `1px solid ${accent}40`,
                  boxShadow: '0 30px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.30)',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.55 : 1,
                  background: tokens.background,
                }}
                data-testid={`event-card-${event.toLowerCase()}${locked ? '-locked' : ''}`}
              >
                {/* Live sample invitation as the card preview */}
                {design && dtokens ? (
                  <div className="relative">
                    <UniversalDesignRenderer
                      design={design}
                      theme={{ tokens: dtokens }}
                      bride={SAMPLE_INVITATION.bride}
                      groom={SAMPLE_INVITATION.groom}
                      date={SAMPLE_INVITATION.date}
                      venue={SAMPLE_INVITATION.venue}
                      photo={SAMPLE_INVITATION.photo}
                      testId={`event-preview-${event.toLowerCase()}`}
                    />
                    {/* Bottom label strip with ceremony name */}
                    <div
                      className="absolute left-0 right-0 bottom-0 p-4 z-40 pointer-events-none"
                      style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 100%)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] tracking-[0.4em] uppercase" style={{ color: accent }}>
                            Event {String(i + 1).padStart(2, '0')}
                          </div>
                          <h3 style={{ fontFamily: headingFont, color: '#FFF8DC', fontSize: 'clamp(1.5rem, 2.4vw, 2rem)', lineHeight: 1.05, textShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
                            {event}
                          </h3>
                        </div>
                        <span className="text-[10px] tracking-[0.3em] uppercase opacity-90 px-2.5 py-1 rounded-full"
                              style={{ background: 'rgba(0,0,0,0.45)', color: '#F5ECD7', border: `1px solid ${accent}66` }}>
                          3 designs
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-snug" style={{ color: 'rgba(255,248,220,0.85)', textShadow: '0 2px 12px rgba(0,0,0,0.55)' }}>
                        {EVENT_DESCRIPTIONS[event]}
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] tracking-[0.3em] uppercase" style={{ color: accent }}>
                        Choose design <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ aspectRatio: '4 / 5', background: `linear-gradient(135deg, ${accent}40, ${tokens.background})` }} />
                )}
                {/* Locked overlay — shown when this theme has no designs for the event */}
                {locked && (
                  <div
                    className="absolute inset-0 z-50 flex items-center justify-center"
                    style={{ background: 'rgba(8,5,3,0.72)', backdropFilter: 'blur(2px)' }}
                    data-testid={`event-card-${event.toLowerCase()}-locked-badge`}
                  >
                    <div
                      className="px-4 py-2 rounded-full text-[11px] tracking-[0.3em] uppercase"
                      style={{ background: 'rgba(212,175,55,0.18)', color: accent, border: `1px solid ${accent}66` }}
                    >
                      ◇ Coming Soon
                    </div>
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </AnimationProvider>
  );
};

export default ThemeEventPicker;
