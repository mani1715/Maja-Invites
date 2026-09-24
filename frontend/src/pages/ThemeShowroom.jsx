import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Crown, Heart, ExternalLink } from 'lucide-react';
import ScrollSection from '@/components/luxury/ScrollSection';
import WaxSealOpening from '@/components/luxury/WaxSealOpening';
import { getAllThemes, getThemeById, getCategoryLabel } from '@/themes/masterThemes';
import { resolveDesign, resolveHeroDesign, useResolvedThemeDesigns } from '@/themes/themeDesignResolver';
import UniversalDesignRenderer from '@/themes/UniversalDesignRenderer';
import { getThemeSampleData } from '@/themes/sampleData';
import { usePricing } from '@/hooks/usePricing';
import '@/styles/luxury.css';

/**
 * ThemeShowroom — Public theme catalog + per-theme preview pages.
 *   /themes              → grid of all 10 cultural themes
 *   /themes/:themeId     → cinematic preview of a single theme (couple-less sample)
 *
 * Purpose:
 *   - SEO landing pages for each theme
 *   - Share-able links photographers can send to couples to choose a style
 *   - Demonstrates the locked-luxury layout without leaking real wedding data
 */

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(6px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.8, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] },
  }),
};

const ThemeShowroom = () => {
  const { themeId } = useParams();
  const navigate = useNavigate();
  const themes = useMemo(() => getAllThemes(), []);
  const pricing = usePricing('normal_user');
  const groups = useMemo(() => {
    const map = new Map();
    themes.forEach((t) => {
      const k = t.category;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    });
    return Array.from(map.entries());
  }, [themes]);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  // Detail mode
  if (themeId) return <ThemeDetail themeId={themeId} navigate={navigate} />;

  return (
    <div className="luxe min-h-screen relative" data-testid="theme-showroom">
      <Header navigate={navigate} />

      <section className="px-6 md:px-16 pt-24 md:pt-28 pb-12 max-w-6xl mx-auto">
        <ScrollSection>
          <span className="lux-eyebrow block mb-5">◆ The Theme Library</span>
          <h1 className="font-display text-[2.6rem] md:text-[4.4rem] leading-[1.02]" style={{ color: 'var(--lux-text)' }}>
            Ten cinematic
            <br />
            <span className="text-gold italic font-script">love languages.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed" style={{ color: 'var(--lux-text)' }}>
            Every theme is a locked-luxury layout designed by hand — Royal Mughal palace nights,
            South Indian temple gold, Bengali shaadi reds. Photographers customise content. The
            design never breaks.
          </p>
        </ScrollSection>
      </section>

      {groups.map(([cat, list], gi) => (
        <section key={cat} className="px-6 md:px-16 py-10 max-w-6xl mx-auto" data-testid={`theme-group-${cat}`}>
          <ScrollSection>
            <div className="flex items-baseline justify-between mb-7">
              <h2 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--lux-text)' }}>
                {getCategoryLabel(cat)}
              </h2>
              <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                {String(gi + 1).padStart(2, '0')} · {list.length} {list.length > 1 ? 'themes' : 'theme'}
              </span>
            </div>
          </ScrollSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {list.map((t, i) => (
              <motion.div
                key={t.id} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} custom={i}
                className="lux-glass p-6 text-left transition-all group"
                data-testid={`theme-card-${t.id}`}
                style={{ background: `linear-gradient(160deg, ${t.colors.background}10, transparent 70%)` }}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/themes/${t.id}/events`)}
                  className="w-full text-left"
                  data-testid={`theme-card-open-${t.id}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                      {String(t.order).padStart(2, '0')}
                    </span>
                    <div className="flex -space-x-1.5">
                      {t.paletteSwatch.map((c, idx) => (
                        <span key={idx} className="w-5 h-5 rounded-full border" style={{ background: c, borderColor: 'rgba(255,248,220,0.2)' }} />
                      ))}
                    </div>
                  </div>
                  <h3 className="font-display text-2xl mb-1.5" style={{ color: 'var(--lux-text)' }}>{t.name}</h3>
                  <p className="text-xs mb-3" style={{ color: 'var(--lux-text-muted)' }}>{t.culture}</p>
                  <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--lux-text-muted)' }}>
                    {t.description}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/themes/${t.id}/events`)}
                  className="w-full mt-1 mb-2 flex items-center justify-center gap-2 text-[11px] tracking-[0.3em] uppercase py-2.5 rounded-md border transition-all hover:opacity-90"
                  style={{ borderColor: t.colors.accent + '88', color: t.colors.accent, background: t.colors.accent + '12' }}
                  data-testid={`theme-card-choose-${t.id}`}
                >
                  Choose Designs ✦
                </button>
                <div className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase pt-3 border-t" style={{ borderColor: 'var(--lux-border)', color: 'var(--lux-text-muted)' }}>
                  <span>{t.planRequired === 'FREE' ? 'Open to all' : t.planRequired}</span>
                  <span className="text-gold" data-testid={`theme-credits-${t.id}`}>
                    {pricing.themeCost(t.id, t.creditCost)} credit{pricing.themeCost(t.id, t.creditCost) > 1 ? 's' : ''}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      ))}

      <section className="px-6 md:px-16 py-24 max-w-3xl mx-auto text-center">
        <ScrollSection>
          <span className="lux-eyebrow block mb-5">◆ Ready to compose?</span>
          <h2 className="font-display text-[2.2rem] md:text-[3.2rem] leading-[1.05]" style={{ color: 'var(--lux-text)' }}>
            Pick a theme. <span className="text-gold italic font-script">Open studio.</span>
          </h2>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => navigate('/themes/kerala_backwaters/gallery')}
              className="lux-btn"
              data-testid="cta-kerala-gallery"
              style={{ background: 'linear-gradient(135deg, #0B3D45 0%, #0E6070 100%)', color: '#F5ECD7', borderColor: '#D4A24C' }}
            >
              Explore Kerala Backwaters · 18 designs <Heart className="w-4 h-4" />
            </button>
            <button onClick={() => navigate('/studio/login')} className="lux-btn lux-btn-ghost" data-testid="cta-studio-login">
              Photographer Login <Crown className="w-4 h-4" />
            </button>
            <button onClick={() => navigate('/')} className="lux-btn lux-btn-ghost" data-testid="cta-back-landing">
              Back to landing
            </button>
          </div>
        </ScrollSection>
      </section>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────
   ThemeDetail — single-theme cinematic showcase
   ──────────────────────────────────────────────────────────── */

const ThemeDetail = ({ themeId, navigate }) => {
  const theme = getThemeById(themeId);
  // Load this theme's catalogue chunk — resolveDesign()/resolveHeroDesign()
  // read the module cache synchronously, and this re-renders us (and busts the
  // memos below) once the chunk lands.
  const themeDesigns = useResolvedThemeDesigns(themeId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const heroDesign = useMemo(() => resolveHeroDesign(themeId), [themeId, themeDesigns]);
  const pricing = usePricing('normal_user');
  // Theme-specific dummy couple + ceremonies — every theme renders with its
  // own culturally resonant placeholder couple (Lakshmi & Karthik for South
  // Indian, Simran & Arjun for Punjabi, etc.) so visitors see a finished
  // invitation, not a generic skeleton.
  const SAMPLE = useMemo(() => {
    const s = getThemeSampleData(themeId) || {};
    const venueStr = `${s.venue || 'Falaknuma Palace'}${s.city ? ' · ' + s.city.split(',')[0] : ''}`;
    return {
      bride: s.bride || 'Anaya',
      groom: s.groom || 'Rohan',
      date: s.weddingDate || 'Saturday, 14 February 2026',
      venue: venueStr,
      story: s.story || '',
      events: (s.events || []).slice(0, 4).map((e) => ({
        title: e.title,
        date: e.date,
        venue: e.venue,
      })),
    };
  }, [themeId]);

  // Map sample event titles to catalogue events for the new design system
  const titleToEvent = (t = '') => {
    const s = t.toLowerCase();
    if (s.includes('sangeet')) return 'Sangeeth';
    if (s.includes('mehndi') || s.includes('mehendi')) return 'Mehandi';
    if (s.includes('haldi')) return 'Haldi';
    if (s.includes('engage') || s.includes('roka')) return 'Engagement';
    if (s.includes('recept') || s.includes('cocktail')) return 'Reception';
    return 'Marriage';
  };
  const eventDesigns = useMemo(
    () => SAMPLE.events.map((e) => resolveDesign(themeId, titleToEvent(e.title), 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeId, themeDesigns, SAMPLE]
  );

  if (!theme) {
    return (
      <div className="luxe min-h-screen grid place-items-center px-6">
        <div className="lux-glass p-10 max-w-md text-center">
          <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--lux-text)' }}>Theme not found.</h2>
          <button onClick={() => navigate('/themes')} className="lux-btn lux-btn-ghost">Browse all themes</button>
        </div>
      </div>
    );
  }

  return (
    <WaxSealOpening
      monogram={`${SAMPLE.bride[0]} & ${SAMPLE.groom[0]}`}
      subtitle={theme.name}
      ctaLabel="Preview Invitation"
      storageKey={`theme-preview-${themeId}`}
    >
      <div className="luxe min-h-screen relative" data-testid={`theme-detail-${themeId}`}>
        <Header navigate={navigate} />

        {/* Hero — split: design poster (left) + couple text (right) */}
        <section className="relative min-h-[88vh] flex items-center justify-center px-6 md:px-16 py-20 overflow-hidden">
          <div className="lux-orbit" style={{ width: 760, height: 760, top: -180, right: -180 }} />
          <div className="lux-orbit" style={{ width: 1200, height: 1200, bottom: -400, left: -300, opacity: 0.45 }} />

          <ScrollSection className="relative w-full max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 items-center">
              {/* LEFT — new themed invitation poster from the 180-design catalogue */}
              {heroDesign && (
                <div className="max-w-md mx-auto lg:mx-0 w-full" data-testid="theme-detail-featured-design-wrap">
                  <UniversalDesignRenderer
                    design={heroDesign.design}
                    theme={heroDesign.theme}
                    bride={SAMPLE.bride}
                    groom={SAMPLE.groom}
                    date={SAMPLE.date}
                    venue={SAMPLE.venue}
                    testId="theme-detail-featured-design"
                  />
                  <p className="text-center text-[10px] tracking-[0.35em] uppercase mt-3" style={{ color: 'var(--lux-text-muted)' }}>
                    {heroDesign.design.headline}
                  </p>
                </div>
              )}

              {/* RIGHT — couple text + meta */}
              <div className="text-center lg:text-left">
                <div className="flex -space-x-2 justify-center lg:justify-start mb-6">
                  {theme.paletteSwatch.map((c, i) => (
                    <span key={i} className="w-7 h-7 rounded-full border-2"
                      style={{ background: c, borderColor: 'rgba(255,248,220,0.25)' }} />
                  ))}
                </div>
                <span className="lux-eyebrow block mb-4">◆ {theme.culture}</span>
                <h1 className="font-display text-[2.6rem] md:text-[4.4rem] leading-[0.98]" style={{ color: 'var(--lux-text)' }}>
                  {SAMPLE.bride}
                  <span className="block text-gold italic font-script my-3 text-[2rem] md:text-[3rem]">&</span>
                  {SAMPLE.groom}
                </h1>
                <p className="mt-6 text-sm tracking-[0.35em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                  {SAMPLE.date}
                </p>
                <p className="mt-3 text-sm" style={{ color: 'var(--lux-text-muted)' }}>{SAMPLE.venue}</p>

                <div className="mt-8 inline-block px-5 py-2 rounded-full text-[10px] tracking-[0.3em] uppercase"
                  style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid var(--lux-border-strong)', color: '#D4AF37' }}>
                  Theme Preview · No real wedding data
                </div>
              </div>
            </div>
          </ScrollSection>
        </section>

        {/* Featured Design — kept hidden, the hero now displays the poster directly */}
        {false && heroDesign && (
          <ScrollSection className="px-6 md:px-16 py-16 max-w-3xl mx-auto" testid="theme-detail-featured-design-extra">
            <span className="lux-eyebrow block mb-5 text-center">◆ The Invitation</span>
            <h2 className="font-display text-[2rem] md:text-[2.8rem] leading-tight mb-8 text-center" style={{ color: 'var(--lux-text)' }}>
              Our <span className="text-gold italic font-script">card</span>
            </h2>
            <div className="max-w-md mx-auto">
              <UniversalDesignRenderer
                design={heroDesign.design}
                theme={heroDesign.theme}
                bride={SAMPLE.bride}
                groom={SAMPLE.groom}
                date={SAMPLE.date}
                venue={SAMPLE.venue}
                testId="theme-detail-featured-design-extra"
              />
            </div>
          </ScrollSection>
        )}
        <ScrollSection className="px-6 md:px-16 py-20 max-w-3xl mx-auto" testid="theme-detail-description">
          <span className="lux-eyebrow block mb-5">◆ The Mood</span>
          <h2 className="font-display text-[2rem] md:text-[2.8rem] leading-tight mb-6" style={{ color: 'var(--lux-text)' }}>
            {theme.name}
          </h2>
          <p className="font-heading text-[1.1rem] leading-[1.85] mb-8" style={{ color: 'var(--lux-text)' }}>
            {theme.description}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] tracking-[0.25em] uppercase"
            style={{ color: 'var(--lux-text-muted)' }}>
            <Spec label="Plan" value={theme.planRequired} />
            <Spec label="Credits" value={`${pricing.themeCost(theme.id, theme.creditCost)}`} />
            <Spec label="Layout" value={theme.layoutType} />
            <Spec label="Animation" value={theme.defaultAnimationLevel} />
          </div>
        </ScrollSection>

        {/* Story */}
        <ScrollSection className="px-6 md:px-16 py-20 max-w-3xl mx-auto" testid="theme-detail-story">
          <span className="lux-eyebrow block mb-5">◆ Our Story</span>
          <h2 className="font-display text-[2rem] md:text-[2.8rem] leading-tight mb-6" style={{ color: 'var(--lux-text)' }}>
            How <span className="text-gold italic font-script">we</span> met
          </h2>
          <p className="font-heading text-[1.08rem] leading-[1.85]" style={{ color: 'var(--lux-text)' }}>
            {SAMPLE.story}
          </p>
        </ScrollSection>

        {/* Events section removed per requirement */}

        {/* CTA */}
        <ScrollSection className="px-6 md:px-16 py-24 max-w-3xl mx-auto text-center">
          <span className="lux-eyebrow block mb-5">◆ Use this theme</span>
          <h2 className="font-display text-[2rem] md:text-[2.8rem] leading-[1.05] mb-6" style={{ color: 'var(--lux-text)' }}>
            Compose with <span className="text-gold italic font-script">{theme.name}.</span>
          </h2>
          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={() => navigate('/studio/login')} className="lux-btn" data-testid="theme-detail-cta-login">
              Enter Studio <Crown className="w-4 h-4" />
            </button>
            <button onClick={() => navigate('/themes')} className="lux-btn lux-btn-ghost" data-testid="theme-detail-cta-back">
              <ArrowLeft className="w-3.5 h-3.5" /> All themes
            </button>
          </div>
        </ScrollSection>

        <footer className="px-6 md:px-16 py-12 text-center border-t" style={{ borderColor: 'var(--lux-border)' }}>
          <div className="font-script text-3xl text-gold mb-2 italic">{theme.name}</div>
          <div className="text-xs tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
            A sample · MAJA Invites
          </div>
        </footer>
      </div>
    </WaxSealOpening>
  );
};

const Header = ({ navigate }) => (
  <header className="absolute top-0 left-0 right-0 z-20 px-6 md:px-12 py-6 flex items-center justify-between">
    <button onClick={() => navigate('/')} className="flex items-center gap-3 group" data-testid="theme-header-home">
      <div className="w-9 h-9 rounded-full grid place-items-center"
        style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}>
        <Heart className="w-4 h-4" style={{ color: '#16110C' }} strokeWidth={2.4} />
      </div>
      <span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>
        MAJA<span className="text-gold"> </span>Invites
      </span>
    </button>
    <div className="flex items-center gap-4">
      <button onClick={() => navigate('/themes')} className="text-xs tracking-[0.3em] uppercase hidden md:inline"
        style={{ color: 'var(--lux-text)' }} data-testid="theme-header-themes">
        Themes
      </button>
      <button onClick={() => navigate('/studio/login')} className="lux-btn text-xs" data-testid="theme-header-login">
        Photographer Login <ExternalLink className="w-3 h-3" />
      </button>
    </div>
  </header>
);

const Spec = ({ label, value }) => (
  <div>
    <div className="mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
    <div className="font-display text-base normal-case tracking-normal text-gold">{value}</div>
  </div>
);

export default ThemeShowroom;
