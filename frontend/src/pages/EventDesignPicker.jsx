/**
 * EventDesignPicker — Step C of the design picker flow.
 *
 * Route: /themes/:themeId/events/:event
 *
 * Shows the 3 photo-design variants for the chosen (theme, event)
 * pair rendered via `UniversalDesignRenderer` (image + theme wash +
 * animated overlays + text). Clicking → /themes/:themeId/events/:event/design/:idx.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, ShoppingBag } from 'lucide-react';
import axios from 'axios';
import UniversalDesignRenderer from '@/themes/UniversalDesignRenderer';
import { useCart } from '@/context/CartContext';
import { ALL_DESIGNS, useThemeDesigns } from '@/themes/allDesigns';
import { KERALA_COLORS } from '@/themes/kerala_backwaters/kerala.colors';
import { getThemeById } from '@/themes/masterThemes';
import { normaliseEvent, resolveDesign } from '@/themes/themeDesignResolver';
import { getThemeSampleData } from '@/themes/sampleData';
import { AnimationProvider } from '@/components/animations';
import ThemeAnimatedBackground from '@/components/ThemeAnimatedBackground';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fadeUp = {
  hidden: { opacity: 0, y: 32, filter: 'blur(10px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.9, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] },
  }),
};

const SAMPLE_PHOTO = 'https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=400&fit=crop&q=85';

const EventDesignPicker = () => {
  const { themeId, event: rawEvent } = useParams();
  const navigate = useNavigate();
  const { add: addToCart } = useCart();
  const [searchParams] = useSearchParams();
  const themeMeta = useMemo(() => getThemeById(themeId), [themeId]);
  const event = useMemo(() => normaliseEvent(rawEvent), [rawEvent]);
  // PHASE 8: lazy-load the selected theme's design config.
  const themeDesigns = useThemeDesigns(themeId);

  // Per-design credit cost — fetched once and used to render a "Credits cost: N"
  // badge on every design card.  Falls back to 0 (Free) when no super-admin
  // price has been configured for the design.
  const [pricing, setPricing] = useState({});
  useEffect(() => {
    axios.get(`${API_URL}/api/public/design-pricing`)
      .then((r) => setPricing(r.data?.pricing || {}))
      .catch(() => setPricing({}));
  }, []);

  // Theme-specific dummy couple/date so each theme's preview shows
  // culturally resonant placeholders.
  const SAMPLE = useMemo(() => {
    const s = getThemeSampleData(themeId) || {};
    return {
      bride: s.bride || 'Anaya',
      groom: s.groom || 'Vihaan',
      date:  s.weddingDate || '14 Feb 2026',
      venue: s.venue || 'The Mandap',
      photo: SAMPLE_PHOTO,
    };
  }, [themeId]);

  const variants = useMemo(() => {
    return [0, 1, 2]
      .map((idx) => {
        const r = resolveDesign(themeId, event, idx);
        return r ? { ...r, index: idx } : null;
      })
      .filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, event, themeDesigns]);

  const tokens = variants[0]?.theme?.tokens || (themeId === 'kerala_backwaters'
    ? { background: KERALA_COLORS.water, text: KERALA_COLORS.text, accent: KERALA_COLORS.secondary }
    : (themeDesigns?.tokens || ALL_DESIGNS[themeId]?.tokens || { background: '#0a0a0a', text: '#F5ECD7', accent: '#D4AF37' }));

  useEffect(() => {
    const prevBody = document.body.style.background;
    // Keep WHITE background
    document.body.style.background = '#FFFFFF';
    document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
    return () => { document.body.style.background = prevBody; };
  }, [tokens.background]);

  if (!themeMeta || variants.length === 0) {
    return (
      <div className="min-h-screen grid place-items-center px-6" style={{ background: '#0a0a0a', color: 'var(--lux-text)' }}>
        <div className="text-center">
          <h2 className="font-display text-3xl mb-3">No designs found for this event.</h2>
          <button onClick={() => navigate(`/themes/${themeId}/events`)} className="lux-btn lux-btn-ghost">
            Back to ceremonies
          </button>
        </div>
      </div>
    );
  }

  const accent = tokens.accentGold || tokens.accent;
  // CRITICAL FIX (Bucket 1 — invisible text): some themes ship pale `tokens.text`
  // (beach #FFF8F2, christian #F8F4EC, muslim #F5ECD7). The design-picker page
  // forces a white background, so we auto-darken those before they reach the
  // page chrome. Card previews keep their own colours.
  const isLightText = (hex) => {
    if (!hex || typeof hex !== 'string') return false;
    const h = hex.replace('#', '');
    if (h.length !== 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7;
  };
  const text = isLightText(tokens.text) ? '#1a1410' : tokens.text;
  const headingFont = tokens.heading || '"Cormorant Garamond", serif';

  return (
    <AnimationProvider>
      {/* 3D Animated Background */}
      <ThemeAnimatedBackground theme={themeId} />
      
      <div className="relative min-h-screen" style={{ background: 'transparent', color: text }} data-testid={`design-picker-${themeId}-${event.toLowerCase()}`}>
        <div className="px-6 md:px-16 pt-12 pb-8 max-w-6xl mx-auto">
          <button
            onClick={() => navigate(`/themes/${themeId}/events`)}
            className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase mb-8 opacity-80 hover:opacity-100 transition-opacity"
            style={{ color: text }}
            data-testid="back-to-events"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Events
          </button>

          <motion.div variants={fadeUp} initial="hidden" animate="visible">
            <span className="block mb-4 text-[10px] tracking-[0.5em] uppercase" style={{ color: accent }}>
              ◈ Step 3 of 3 · {themeMeta.name} · {event}
            </span>
            <h1 className="leading-[1.02]" style={{ color: text, fontFamily: headingFont, fontSize: 'clamp(2.4rem, 6vw, 4.6rem)' }}>
              Three designs.{' '}
              <span style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>
                One love.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed opacity-80" style={{ color: text }}>
              Each design is a complete, animated scene — pick the one that feels like you. The
              names and dates below are samples; you'll edit them in the next step.
            </p>
          </motion.div>
        </div>

        <div className="px-6 md:px-16 pb-24 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {variants.map((v, i) => {
              const designId = v.design.id;
              const rawPrice = pricing?.[designId]?.credits ?? 0;
              const priceInr = rawPrice > 0 ? rawPrice : 2999;  // ₹ price (default 2999)
              // Carry forward any addons/expiry that came from the wizard
              const qs = searchParams.toString();
              const previewHref = `/themes/${themeId}/events/${event}/design/${v.index}`;
              return (
              <motion.div key={designId} variants={fadeUp} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} data-testid={`design-variant-${v.index}`}>
                <div className="w-full text-left transition-transform hover:-translate-y-1 relative">
                  {/* Credit cost badge — top-right of the card */}
                  <div
                    className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] tracking-[0.18em] uppercase"
                    style={{
                      background: 'linear-gradient(135deg, rgba(212,175,55,0.95), rgba(180,140,40,0.9))',
                      color: '#16110C',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,248,220,0.35)',
                      fontWeight: 700,
                    }}
                    data-testid={`design-price-badge-${v.index}`}
                  >
                    ₹{Number(priceInr).toLocaleString('en-IN')}
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(previewHref)}
                    className="block w-full"
                    data-testid={`design-pick-${v.index}`}
                  >
                    <UniversalDesignRenderer
                      design={v.design}
                      theme={v.theme}
                      bride={SAMPLE.bride}
                      groom={SAMPLE.groom}
                      date={SAMPLE.date}
                      venue={SAMPLE.venue}
                      photo={SAMPLE.photo}
                    />
                  </button>

                  <div className="mt-4 px-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: accent }}>
                        Design {v.index + 1} of 3
                      </span>
                    </div>
                    <div className="text-[16px] leading-snug" style={{ color: text, fontFamily: headingFont }}>
                      {v.design.title}
                    </div>
                    <div className="text-[12px] mt-1 leading-relaxed opacity-75" style={{ color: text }}>
                      {v.design.description}
                    </div>

                    {/* Action buttons — Preview (ghost) + Buy this design (filled) */}
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(previewHref)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[11px] tracking-[0.18em] uppercase transition-all hover:opacity-80"
                        style={{ background: 'transparent', border: `1px solid ${accent}`, color: text }}
                        data-testid={`design-preview-btn-${v.index}`}
                      >
                        <Eye className="w-3.5 h-3.5" /> Preview
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await addToCart({
                            design_id: designId,
                            theme_id: themeId,
                            event_type: event,
                            name: v.design.title,
                            price_inr: priceInr,
                          });
                          navigate('/cart');
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[11px] tracking-[0.18em] uppercase transition-all hover:scale-[1.02]"
                        style={{
                          background: 'linear-gradient(135deg,#D4AF37,#B8941F)',
                          color: '#16110C',
                          fontWeight: 600,
                        }}
                        data-testid={`design-addcart-btn-${v.index}`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" /> Get this design
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </AnimationProvider>
  );
};

export default EventDesignPicker;
