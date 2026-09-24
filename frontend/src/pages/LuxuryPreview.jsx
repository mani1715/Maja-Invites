import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Heart, Calendar, MapPin, Sparkles, Users, Gift,
  Music, Camera, Plane, IndianRupee, MessageCircle, Send, Share2, Quote,
} from 'lucide-react';
import WaxSealOpening from '@/components/luxury/WaxSealOpening';
import PetalConfetti from '@/components/luxury/PetalConfetti';
import AmbientMusicPlayer from '@/components/luxury/AmbientMusicPlayer';
import ScrollSection from '@/components/luxury/ScrollSection';
import DigitalShagunSection from '@/components/luxury/DigitalShagunSection';
import TravelLinksSection from '@/components/luxury/TravelLinksSection';
import VenuesSection from '@/components/luxury/VenuesSection';
import GiftRegistrySection from '@/components/luxury/GiftRegistrySection';
import WishesWallSection from '@/components/luxury/WishesWallSection';
import LivePhotoWallTeaser from '@/components/luxury/LivePhotoWallTeaser';
import FindMyPhotosModal from '@/components/luxury/FindMyPhotosModal';
import { OpeningOrchestrator } from '@/themes/shared/ThemeAnimationOrchestrator';
import MughalBackground from '@/themes/mughal/MughalBackground';
import { mughalStyle } from '@/themes/mughal/mughal.colors';
import TempleBackground from '@/themes/temple/TempleBackground';
import { templeStyle } from '@/themes/temple/temple.colors';
import PunjabiBackground from '@/themes/punjabi/PunjabiBackground';
import { punjabiStyle } from '@/themes/punjabi/punjabi.colors';
import BengaliBackground from '@/themes/bengali/BengaliBackground';
import { bengaliStyle } from '@/themes/bengali/bengali.colors';
import MinimalBackground from '@/themes/minimal/MinimalBackground';
import { minimalStyle } from '@/themes/minimal/minimal.colors';
import BeachBackground from '@/themes/beach/BeachBackground';
import { beachStyle } from '@/themes/beach/beach.colors';
import NatureBackground from '@/themes/nature/NatureBackground';
import { natureStyle } from '@/themes/nature/nature.colors';
import ChristianBackground from '@/themes/christian/ChristianBackground';
import { christianStyle } from '@/themes/christian/christian.colors';
import MuslimBackground from '@/themes/muslim/MuslimBackground';
import { muslimStyle } from '@/themes/muslim/muslim.colors';
import BollywoodBackground from '@/themes/bollywood/BollywoodBackground';
import { bollywoodStyle } from '@/themes/bollywood/bollywood.colors';
import KeralaBackground from '@/themes/kerala_backwaters/KeralaBackground';
import { keralaStyle } from '@/themes/kerala_backwaters/kerala.colors';
import {
  RevealWords, RevealLetters, Reveal, StickyHero, ScrollProgressRing,
} from '@/themes/Reveal';
import { getThemeById, MASTER_THEMES } from '@/themes/masterThemes';
import { getThemeSampleData } from '@/themes/sampleData';
import { resolveDesign, resolveHeroDesign, normaliseEvent, useResolvedThemeDesigns } from '@/themes/themeDesignResolver';
import UniversalDesignRenderer from '@/themes/UniversalDesignRenderer';
import TouchParticles from '@/components/TouchParticles';
import ThemeAnimatedBackground from '@/components/ThemeAnimatedBackground';
import '@/styles/luxury.css';

/**
 * Themed Preview Page (route: /preview/luxe?theme=<id>)
 *
 * Renders a COMPLETE customer-facing invitation experience with:
 *  - The selected theme's colours, fonts and accent
 *  - Realistic sample data per culture (Tara & Kabir, Aisha & Zayn, etc.)
 *  - Every section a real customer would see:
 *      Opening → Hero → Story → Events → Venue+Map →
 *      Countdown → RSVP → Wishes → Live Photos teaser →
 *      Find My Photos → Travel → Gift Registry → Digital Shagun →
 *      Referral CTA → Footer
 *  - Ambient music + petal confetti
 *
 * NOTE: This is a *preview*, so the RSVP form, Find-My-Photos and
 *       Shagun UPI links don't actually submit — they show a friendly
 *       toast/petal burst confirmation instead.
 */

/* ── Small utility ──────────────────────────────────────────────────── */
const useCountdown = (targetIso) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const target = new Date(targetIso).getTime();
  let diff = Math.max(0, target - now);
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000);  diff -= h * 3600000;
  const m = Math.floor(diff / 60000);    diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  return { d, h, m, s };
};

const Eyebrow = ({ children, color }) => (
  <span className="lux-eyebrow block mb-3" style={color ? { color } : undefined}>{children}</span>
);

const Section = ({ id, children, className = '', 'data-testid': testid }) => (
  <section id={id} data-testid={testid} className={`relative px-6 md:px-16 py-20 max-w-6xl mx-auto z-10 ${className}`}>
    {children}
  </section>
);

const ThemedPreview = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const themeId = searchParams.get('theme') || 'royal_mughal';
  // Load this theme's catalogue chunk — resolveDesign() reads the cache
  // synchronously and this re-renders us (and busts the memos below) when the
  // chunk lands.
  const themeDesigns = useResolvedThemeDesigns(themeId);

  const theme  = useMemo(() => getThemeById(themeId) || getThemeById('royal_mughal'), [themeId]);
  const sample = useMemo(() => getThemeSampleData(themeId), [themeId]);
  const cd = useCountdown(sample.weddingDateISO);

  // Resolve the new 180-design catalogue for this theme.
  // Hero = the marriage marquee design; per-event = the catalogue design that
  // matches each sample event's title (Sangeet→Sangeeth, Mehndi→Mehandi, etc.).
  const titleToEvent = (title = '') => {
    const t = String(title).toLowerCase();
    if (t.includes('sangeet'))  return 'Sangeeth';
    if (t.includes('mehndi') || t.includes('mehendi') || t.includes('mehandi')) return 'Mehandi';
    if (t.includes('haldi') || t.includes('manjha') || t.includes('holud') || t.includes('gaye'))  return 'Haldi';
    if (t.includes('engage') || t.includes('roka') || t.includes('ashirbad')) return 'Engagement';
    if (t.includes('recept') || t.includes('walima') || t.includes('bou bhat') || t.includes('cocktail') || t.includes('brunch')) return 'Reception';
    return 'Marriage'; // wedding / muhurtham / pheras / nikah / anand karaj
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const heroDesign = useMemo(() => resolveHeroDesign(themeId), [themeId, themeDesigns]);
  const eventDesigns = useMemo(
    () => (sample.events || []).map((evt) => resolveDesign(themeId, titleToEvent(evt.title), 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeId, sample.events, themeDesigns]
  );

  const [petalTrigger, setPetalTrigger] = useState(0);
  const [rsvp, setRsvp] = useState({ name: '', status: 'yes', count: 1, message: '' });
  const [rsvpDone, setRsvpDone] = useState(false);
  // sampleData wishes are {from, text}; the wall renders {guest_name, message}
  // and keys the list on `id`, so give each sample wish a stable one.
  const previewWishes = useMemo(
    () => (sample.wishes || []).map((w, i) => ({
      id: `sample-wish-${i}`, guest_name: w.from, message: w.text,
    })),
    [sample.wishes]
  );
  const [toast, setToast] = useState('');
  // Action popup for "Send RSVP / View Live Wall / Find My Photos / Know Your Room"
  // Renders a small in-page modal so guests see exactly what these CTAs do in
  // the published link without leaving the preview.
  const [actionPopup, setActionPopup] = useState(null); // 'rsvp' | 'livewall' | 'findphotos' | 'room' | null
  const [roomLookup, setRoomLookup] = useState({ name: '', result: null });

  useEffect(() => {
    // Apply light theme for preview - remove dark overlays
    document.body.classList.add('luxe');
    document.body.classList.remove('luxe-grain', 'luxe-vignette');
    document.body.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)';
    return () => {
      document.body.classList.remove('luxe');
      document.body.style.background = '';
    };
  }, []);

  // Refresh state when theme switches (user opens a different preview)
  useEffect(() => {
    setRsvp({ name: '', status: 'yes', count: 1, message: '' });
    setRsvpDone(false);
  }, [themeId, sample]);

  /* Map theme into CSS variables so accent/text colors echo the palette */
  const themeStyle = {
    '--lux-gold':      theme.colors?.accent      || '#D4AF37',
    '--lux-primary':   theme.colors?.primary     || '#8B0000',
    '--lux-bg-tint':   theme.colors?.background  || '#FFF8DC',
    '--theme-heading': theme.typography?.heading || '"DM Serif Display", serif',
    '--theme-body':    theme.typography?.body    || '"Cormorant Garamond", serif',
    '--theme-accent':  theme.typography?.accent  || '"Cinzel", serif',
  };

  const fireToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  const submitRsvp = (e) => {
    e.preventDefault();
    setRsvpDone(true);
    setPetalTrigger(Date.now());
    fireToast(`Thank you ${rsvp.name || 'friend'}! Your RSVP is recorded (preview only).`);
  };

  const upiHref = `upi://pay?pa=${encodeURIComponent(sample.shagun.upi)}&pn=${encodeURIComponent(sample.shagun.payee)}&cu=INR`;

  // ── Theme-specific opening + background + color enforcement ────────
  // Themes with full Three.js opening + custom background
  const ORCHESTRATED_THEMES = new Set([
    'royal_mughal', 'south_indian_temple', 'punjabi_sangeet', 'bengali_traditional',
    'modern_minimal', 'beach_destination', 'nature_eco_wedding',
    'christian_elegant', 'muslim_nikah', 'bollywood_luxury', 'kerala_backwaters',
  ]);
  const useOrchestrator = ORCHESTRATED_THEMES.has(themeId);
  const skipIntro = searchParams.get('skip_intro') === '1';
  const [openingDone, setOpeningDone] = useState(() => skipIntro);

  // Reset opening state when theme switches (but respect ?skip_intro=1)
  useEffect(() => { setOpeningDone(skipIntro); }, [themeId, skipIntro]);

  // SAFETY: if the opening orchestrator never reports completion (slow
  // network, chunk failure, animation throw) we force it done after 6 s so
  // the user is never trapped behind a frozen splash with body scroll locked.
  useEffect(() => {
    if (openingDone) return;
    const id = setTimeout(() => setOpeningDone(true), 6000);
    return () => clearTimeout(id);
  }, [openingDone, themeId]);

  // Scroll to top when the opening finishes (so the invitation always starts from the hero)
  useEffect(() => {
    if (openingDone) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [openingDone]);

  // Lock body scroll while the opening is playing (so the user can't pre-scroll)
  useEffect(() => {
    if (!useOrchestrator) return;
    if (!openingDone) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return () => { document.body.style.overflow = prev; };
    }
  }, [useOrchestrator, openingDone]);

  // Per-theme style overrides — built-out themes get their full token system
  const themeOverrideStyle = (() => {
    switch (themeId) {
      case 'royal_mughal':        return mughalStyle();
      case 'south_indian_temple': return templeStyle();
      case 'punjabi_sangeet':     return punjabiStyle();
      case 'bengali_traditional': return bengaliStyle();
      case 'modern_minimal':      return minimalStyle();
      case 'beach_destination':   return beachStyle();
      case 'nature_eco_wedding':  return natureStyle();
      case 'christian_elegant':   return christianStyle();
      case 'muslim_nikah':        return muslimStyle();
      case 'bollywood_luxury':    return bollywoodStyle();
      case 'kerala_backwaters':   return keralaStyle();
      default:                    return {};
    }
  })();

  const rootStyle = useOrchestrator ? { ...themeStyle, ...themeOverrideStyle } : themeStyle;

  // Per-theme persistent background
  const ThemeBackground = (() => {
    switch (themeId) {
      case 'royal_mughal':        return <MughalBackground />;
      case 'south_indian_temple': return <TempleBackground />;
      case 'punjabi_sangeet':     return <PunjabiBackground />;
      case 'bengali_traditional': return <BengaliBackground />;
      case 'modern_minimal':      return <MinimalBackground />;
      case 'beach_destination':   return <BeachBackground />;
      case 'nature_eco_wedding':  return <NatureBackground />;
      case 'christian_elegant':   return <ChristianBackground />;
      case 'muslim_nikah':        return <MuslimBackground />;
      case 'bollywood_luxury':    return <BollywoodBackground />;
      case 'kerala_backwaters':   return <KeralaBackground />;
      default:                    return null;
    }
  })();

  // Orchestrated themes use the new orchestrator; others keep the original wax-seal opening
  const InvitationBody = (
    <div
      className="luxe relative"
      style={{ ...rootStyle, minHeight: '100vh', overflow: 'visible' }}
      data-testid="themed-preview"
      data-theme={themeId}
    >
      {/* 3D Theme-Based Animated Background */}
      <ThemeAnimatedBackground theme={themeId} />
      
      {useOrchestrator && ThemeBackground}
      
      {/* TOUCH PARTICLES - Interactive theme-based effects - ALWAYS ENABLED */}
      <TouchParticles 
        theme={themeId?.split('_')[0] || 'default'} 
        enabled={true}
      />
      
      {/* Top toolbar (preview only) */}
        <div className="sticky top-0 z-30 backdrop-blur-md border-b"
          style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(255,248,220,0.1)' }}>
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between text-xs tracking-[0.25em] uppercase"
            style={{ color: 'rgba(255,248,220,0.85)' }}>
            <button onClick={() => navigate('/themes')} className="flex items-center gap-2 hover:text-[var(--lux-gold)]" data-testid="preview-back-themes">
              <ArrowLeft className="w-4 h-4" /> Back to Themes
            </button>
            <span className="hidden md:inline">◆ Preview · {theme.name}</span>
            <select
              value={themeId}
              onChange={(e) => navigate(`/preview/luxe?theme=${e.target.value}`)}
              className="bg-transparent border rounded-full px-3 py-1.5 text-[10px]"
              style={{ borderColor: 'rgba(255,248,220,0.25)', color: '#FFF8DC' }}
              data-testid="preview-theme-switcher"
            >
              {Object.values(MASTER_THEMES).map((t) => (
                <option key={t.id} value={t.id} style={{ background: '#1a0c0c', color: '#FFF8DC' }}>
                  {String(t.order).padStart(2,'0')} · {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* HERO — split: invitation design poster (left) + couple text (right) */}
        <Section className="!pt-28 !pb-16">
          <StickyHero>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 items-center" data-testid="hero-grid">
            {/* LEFT — the new themed invitation design poster (the marquee design from the 180-design catalogue) */}
            {heroDesign && (
              <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: [0.22,1,0.36,1] }}
                className="max-w-md mx-auto lg:mx-0 w-full"
                data-testid="hero-featured-design">
                <UniversalDesignRenderer
                  design={heroDesign.design}
                  theme={heroDesign.theme}
                  bride={sample.bride}
                  groom={sample.groom}
                  date={sample.weddingDate}
                  venue={sample.venue}
                  testId="featured-design"
                />
                <p className="text-center text-[10px] tracking-[0.35em] uppercase mt-3" style={{ color: 'rgba(255,248,220,0.78)' }}>
                  {heroDesign.design.headline}
                </p>
              </motion.div>
            )}

            {/* RIGHT — couple text + meta */}
            <div>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }}
                className="flex -space-x-2 mb-6">
                {(theme.paletteSwatch || []).map((c, i) => (
                  <span key={i} className="w-7 h-7 rounded-full border-2"
                    style={{ background: c, borderColor: 'rgba(255,248,220,0.25)' }} />
                ))}
              </motion.div>
              <Eyebrow color="var(--lux-gold)">◆ {theme.culture}</Eyebrow>
              <h1
                className="leading-[0.98] tracking-tight text-[2.6rem] md:text-[4.4rem]"
                style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}
                data-testid="hero-couple-names">
                <RevealLetters text={sample.bride} themeId={themeId} />
                <span className="italic mx-2 md:mx-3" style={{ color: 'var(--lux-gold)', fontFamily: 'var(--font-script, "Great Vibes", cursive)' }}>&amp;</span>
                <RevealLetters text={sample.groom} themeId={themeId} perLetter={0.045} />
              </h1>
              <motion.p
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 1 }}
                className="mt-6 max-w-xl text-[1.02rem] leading-relaxed"
                style={{ color: 'rgba(255,248,220,0.88)', fontFamily: 'var(--theme-body)' }}>
                <strong style={{ color: '#FFF8DC' }}>{theme.name}</strong> — {theme.description}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 1 }}
                className="mt-8 flex flex-wrap items-center gap-5 text-xs tracking-[0.25em] uppercase"
                style={{ color: 'rgba(255,248,220,0.88)' }}>
                <span className="inline-flex items-center gap-2"><Calendar className="w-4 h-4" style={{ color: 'var(--lux-gold)' }} /> {sample.weddingDate}</span>
                <span className="inline-flex items-center gap-2"><MapPin   className="w-4 h-4" style={{ color: 'var(--lux-gold)' }} /> {sample.venue}, {sample.city}</span>
              </motion.div>
            </div>
          </div>
          </StickyHero>
        </Section>

        {/* FEATURED INVITATION DESIGN — full-bleed showcase of the same design (kept for guests who scroll) */}
        {false && heroDesign && (
          <Section className="!pt-6 !pb-16" data-testid="section-featured-design">
            <Eyebrow color="var(--lux-gold)">◆ The Invitation</Eyebrow>
            <h2 className="text-[2rem] md:text-[3rem] mb-10" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>
              <RevealWords text="Our card" themeId={themeId} />
            </h2>
            <div className="max-w-xl mx-auto">
              <UniversalDesignRenderer
                design={heroDesign.design}
                theme={heroDesign.theme}
                bride={sample.bride}
                groom={sample.groom}
                date={sample.weddingDate}
                venue={sample.venue}
                testId="featured-design-hidden"
              />
            </div>
          </Section>
        )}

        {/* COUNTDOWN ──────────────────────────────────────────────────── */}
        <Section className="!py-12">
          <div className="grid grid-cols-4 gap-3 md:gap-6 max-w-2xl mx-auto" data-testid="countdown-grid">
            {[
              { label: 'Days',    value: cd.d },
              { label: 'Hours',   value: cd.h },
              { label: 'Minutes', value: cd.m },
              { label: 'Seconds', value: cd.s },
            ].map((x) => (
              <div key={x.label} className="lux-glass text-center py-5 md:py-7">
                <div className="font-display text-3xl md:text-5xl" style={{ color: 'var(--lux-gold)', fontFamily: 'var(--theme-heading)' }}>
                  {String(x.value).padStart(2, '0')}
                </div>
                <div className="text-[10px] md:text-xs tracking-[0.3em] uppercase mt-1.5" style={{ color: 'rgba(255,248,220,0.78)' }}>
                  {x.label}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* OUR STORY ──────────────────────────────────────────────────── */}
        <Section>
          <Eyebrow color="var(--lux-gold)">◆ Our Story</Eyebrow>
          <h2 className="text-[2rem] md:text-[3rem] mb-6" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>
            <RevealWords text="How we met" themeId={themeId} />
          </h2>
          <Reveal kind="fade" themeId={themeId}>
            <p className="text-[1.05rem] md:text-[1.18rem] leading-[1.85] max-w-3xl"
              style={{ color: 'rgba(255,248,220,0.8)', fontFamily: 'var(--theme-body)' }}>
              {sample.story}
            </p>
          </Reveal>
        </Section>

        {/* VENUE with full VenuesSection component (shows map, directions, etc.) */}
        <VenuesSection invitation={sample} />

        {/* RSVP ───────────────────────────────────────────────────────── */}
        <Section>
          <Eyebrow color="var(--lux-gold)">◆ RSVP</Eyebrow>
          <h2 className="text-[2rem] md:text-[3rem] mb-8" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>
            <RevealWords text="Will you join us?" themeId={themeId} />
          </h2>
          {rsvpDone ? (
            <div className="lux-glass p-6 max-w-xl flex items-center gap-3" data-testid="rsvp-success">
              <Heart className="w-5 h-5" style={{ color: 'var(--lux-gold)' }} />
              <p style={{ color: 'rgba(255,248,220,0.85)' }}>
                Thank you{rsvp.name ? `, ${rsvp.name}` : ''}! Your blessing is on its way to the couple.
              </p>
            </div>
          ) : (
            <form onSubmit={submitRsvp} className="lux-glass p-6 md:p-7 max-w-2xl space-y-4" data-testid="rsvp-form">
              <input
                required value={rsvp.name} onChange={(e) => setRsvp({ ...rsvp, name: e.target.value })}
                placeholder="Your name" className="w-full bg-transparent border-b py-2 px-1 focus:outline-none"
                style={{ borderColor: 'rgba(255,248,220,0.25)', color: '#FFF8DC' }}
                data-testid="rsvp-name"
              />
              <div className="flex gap-2 flex-wrap">
                {['yes', 'no', 'maybe'].map((s) => (
                  <button type="button" key={s}
                    onClick={() => setRsvp({ ...rsvp, status: s })}
                    className="px-4 py-2 rounded-full text-xs tracking-[0.2em] uppercase border transition-all"
                    style={{
                      borderColor: rsvp.status === s ? 'var(--lux-gold)' : 'rgba(255,248,220,0.2)',
                      color:       rsvp.status === s ? '#1a0c0c' : 'rgba(255,248,220,0.85)',
                      background:  rsvp.status === s ? 'var(--lux-gold)' : 'transparent',
                    }}
                    data-testid={`rsvp-status-${s}`}
                  >
                    {s === 'yes' ? 'I’ll be there' : s === 'no' ? 'Sending love' : 'Maybe'}
                  </button>
                ))}
              </div>
              <input type="number" min="1" max="20"
                value={rsvp.count} onChange={(e) => setRsvp({ ...rsvp, count: Number(e.target.value) || 1 })}
                placeholder="Number of guests" className="w-full bg-transparent border-b py-2 px-1 focus:outline-none"
                style={{ borderColor: 'rgba(255,248,220,0.25)', color: '#FFF8DC' }}
                data-testid="rsvp-count"
              />
              <textarea rows={2}
                value={rsvp.message} onChange={(e) => setRsvp({ ...rsvp, message: e.target.value })}
                placeholder="A note for the couple (optional)"
                className="w-full bg-transparent border-b py-2 px-1 focus:outline-none resize-none"
                style={{ borderColor: 'rgba(255,248,220,0.25)', color: '#FFF8DC' }}
                data-testid="rsvp-message"
              />
              <button type="submit" className="lux-btn" style={{ background: 'var(--lux-gold)', color: '#1a0c0c' }} data-testid="rsvp-submit">
                <Send className="w-4 h-4" /> Send blessing
              </button>
            </form>
          )}
        </Section>

        {/* WISHES WALL with full WishesWallSection component ────────────── */}
        <WishesWallSection seedWishes={previewWishes} />

        {/* LIVE PHOTO WALL TEASER ─────────────────────────────────────── */}
        <Section>
          <Eyebrow color="var(--lux-gold)">◆ Live Photo Wall</Eyebrow>
          <div className="lux-glass p-7 md:p-10 flex flex-col md:flex-row md:items-center gap-6">
            <Camera className="w-10 h-10" style={{ color: 'var(--lux-gold)' }} />
            <div className="flex-1">
              <h3 className="text-2xl md:text-3xl mb-2" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>
                Photos appear in real-time
              </h3>
              <p className="text-sm" style={{ color: 'rgba(255,248,220,0.82)', fontFamily: 'var(--theme-body)' }}>
                Guests scan a QR at the venue. Pictures stream into this wall during the ceremony — pure magic.
              </p>
            </div>
            <button onClick={() => setActionPopup('livewall')}
              className="lux-btn lux-btn-ghost text-xs" data-testid="live-wall-cta">
              <Sparkles className="w-4 h-4" /> See it Live
            </button>
          </div>
        </Section>

        {/* FIND MY PHOTOS ─────────────────────────────────────────────── */}
        <Section>
          <Eyebrow color="var(--lux-gold)">◆ Get Your Photos</Eyebrow>
          <div className="lux-glass p-7 md:p-10 flex flex-col md:flex-row md:items-center gap-6">
            <Users className="w-10 h-10" style={{ color: 'var(--lux-gold)' }} />
            <div className="flex-1">
              <h3 className="text-2xl md:text-3xl mb-2" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>
                Get every photo of you
              </h3>
              <p className="text-sm" style={{ color: 'rgba(255,248,220,0.82)', fontFamily: 'var(--theme-body)' }}>
                Upload a single selfie. Our AI face-match finds every frame you’re in — across all four days.
              </p>
            </div>
            <button onClick={() => setActionPopup('findphotos')}
              className="lux-btn" style={{ background: 'var(--lux-gold)', color: '#1a0c0c' }} data-testid="find-photos-cta">
              <Camera className="w-4 h-4" /> Upload Selfie
            </button>
          </div>
        </Section>

        {/* KNOW YOUR ROOM ─────────────────────────────────────────────── */}
        <Section>
          <Eyebrow color="var(--lux-gold)">◆ Travel & Stay</Eyebrow>
          <div className="lux-glass p-7 md:p-10 flex flex-col md:flex-row md:items-center gap-6" data-testid="know-your-room-card">
            <Plane className="w-10 h-10" style={{ color: 'var(--lux-gold)' }} />
            <div className="flex-1">
              <h3 className="text-2xl md:text-3xl mb-2" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>
                Know your room
              </h3>
              <p className="text-sm" style={{ color: 'rgba(255,248,220,0.82)', fontFamily: 'var(--theme-body)' }}>
                Search your name to see the hotel & room the family has reserved for you. No more WhatsApp chains.
              </p>
            </div>
            <button onClick={() => { setActionPopup('room'); setRoomLookup({ name: '', result: null }); }}
              className="lux-btn lux-btn-ghost text-xs" data-testid="know-room-cta">
              <Users className="w-4 h-4" /> Find My Room
            </button>
          </div>
        </Section>

        {/* GIFT REGISTRY ──────────────────────────────────────────────── */}
        <Section>
          <Eyebrow color="var(--lux-gold)">◆ Gifts</Eyebrow>
          <div className="lux-glass p-7 md:p-10">
            <Gift className="w-10 h-10 mb-4" style={{ color: 'var(--lux-gold)' }} />
            <h3 className="text-2xl md:text-3xl mb-3" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>
              {sample.gifts.headline}
            </h3>
            <p className="text-sm md:text-base leading-relaxed max-w-2xl" style={{ color: 'rgba(255,248,220,0.88)', fontFamily: 'var(--theme-body)' }}>
              {sample.gifts.message}
            </p>
          </div>
        </Section>

        {/* DIGITAL SHAGUN ─────────────────────────────────────────────── */}
        <Section>
          <Eyebrow color="var(--lux-gold)">◆ Digital Shagun</Eyebrow>
          <div className="lux-glass p-7 md:p-10">
            <div className="flex items-center gap-3 mb-4">
              <IndianRupee className="w-7 h-7" style={{ color: 'var(--lux-gold)' }} />
              <h3 className="text-2xl md:text-3xl" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>
                Send blessings via UPI
              </h3>
            </div>
            <p className="text-sm md:text-base mb-6 max-w-2xl" style={{ color: 'rgba(255,248,220,0.88)', fontFamily: 'var(--theme-body)' }}>
              {sample.shagun.msg}
            </p>
            <div className="flex flex-wrap gap-3 mb-5">
              {[501, 1100, 2100, 5100, 11000].map((amt) => (
                <a key={amt}
                  href={`${upiHref}&am=${amt}`}
                  onClick={() => fireToast(`Opening UPI for ₹${amt.toLocaleString('en-IN')} (preview only).`)}
                  className="lux-btn lux-btn-ghost text-xs"
                  data-testid={`shagun-amount-${amt}`}>
                  ₹{amt.toLocaleString('en-IN')}
                </a>
              ))}
            </div>
            <div className="text-[11px] tracking-[0.2em] uppercase" style={{ color: 'rgba(255,248,220,0.7)' }}>
              UPI · {sample.shagun.upi} · {sample.shagun.payee}
            </div>
          </div>
        </Section>

        {/* REFERRAL / SHARE ──────────────────────────────────────────── */}
        <Section>
          <Eyebrow color="var(--lux-gold)">◆ Share the Joy</Eyebrow>
          <div className="lux-glass p-7 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <h3 className="text-2xl md:text-3xl mb-2" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>
                Like this invitation?
              </h3>
              <p className="text-sm" style={{ color: 'rgba(255,248,220,0.82)', fontFamily: 'var(--theme-body)' }}>
                Crafted on MAJA Invites — for photographers who want to wow every couple.
              </p>
            </div>
            <button onClick={() => fireToast('Link copied (preview only).')}
              className="lux-btn shrink-0" style={{ background: 'var(--lux-gold)', color: '#1a0c0c' }} data-testid="share-cta">
              <Share2 className="w-4 h-4" /> Share Invitation
            </button>
          </div>
        </Section>

        {/* FOOTER ─────────────────────────────────────────────────────── */}
        <footer className="px-6 md:px-16 py-16 text-center border-t" style={{ borderColor: 'var(--lux-border)' }}>
          <div className="font-script italic text-3xl mb-1" style={{ color: 'var(--lux-gold)' }}>
            {sample.bride} &amp; {sample.groom}
          </div>
          <div className="text-xs tracking-[0.3em] uppercase mb-4" style={{ color: 'rgba(255,248,220,0.78)' }}>
            {theme.planRequired === 'FREE' ? 'Open to all plans' : `${theme.planRequired} plan & above`}
            {' · '}
            {theme.creditCost} credit{theme.creditCost > 1 ? 's' : ''} to publish
          </div>
          <div className="text-[11px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.4)' }}>
            <Music className="inline w-3 h-3 mr-1" /> Ambient music playing — bottom right
          </div>
        </footer>

        {/* TOAST ──────────────────────────────────────────────────────── */}
        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 lux-glass px-5 py-3 text-xs tracking-[0.15em] uppercase max-w-sm text-center"
            style={{ color: '#FFF8DC', borderColor: 'var(--lux-gold)' }}
            data-testid="toast">
            {toast}
          </div>
        )}

        {/* ACTION POPUP — Send RSVP / Live wall / Find photos / Know Room */}
        {actionPopup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(8,6,4,0.78)', backdropFilter: 'blur(8px)' }}
            onClick={() => setActionPopup(null)}
            data-testid="preview-action-popup"
          >
            <div onClick={(e) => e.stopPropagation()}
              className="lux-glass p-6 md:p-8 w-full max-w-md relative"
              style={{ borderColor: 'var(--lux-gold)' }}
            >
              <button onClick={() => setActionPopup(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-lg"
                style={{ background: 'rgba(0,0,0,0.4)', color: '#FFF8DC' }}
                data-testid="preview-action-popup-close"
              >×</button>

              {actionPopup === 'rsvp' && (
                <>
                  <Send className="w-7 h-7 mb-3" style={{ color: 'var(--lux-gold)' }} />
                  <h3 className="text-xl mb-2" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>Send your RSVP</h3>
                  <p className="text-sm mb-4" style={{ color: 'rgba(255,248,220,0.88)' }}>
                    A small RSVP card opens with your name, attendance status and guest count. The couple sees it instantly in their studio.
                  </p>
                  <button onClick={() => { setActionPopup(null); document.querySelector('[data-testid="rsvp-form"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                    className="lux-btn w-full justify-center" style={{ background: 'var(--lux-gold)', color: '#1a0c0c' }} data-testid="popup-rsvp-open">
                    Open RSVP form
                  </button>
                </>
              )}

              {actionPopup === 'livewall' && (
                <>
                  <Sparkles className="w-7 h-7 mb-3" style={{ color: 'var(--lux-gold)' }} />
                  <h3 className="text-xl mb-2" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>View Live Wall</h3>
                  <p className="text-sm mb-4" style={{ color: 'rgba(255,248,220,0.88)' }}>
                    Photos guests upload during the ceremony stream into this wall in real-time. In the published link, this opens a full-screen photo wall with auto-refresh.
                  </p>
                  <div className="grid grid-cols-3 gap-1.5 mb-4">
                    {[1,2,3,4,5,6].map((i) => (
                      <div key={i} className="aspect-square rounded"
                        style={{ background: `linear-gradient(135deg, rgba(212,175,55,${0.18 + i*0.04}), rgba(139,0,0,0.12))` }} />
                    ))}
                  </div>
                  <p className="text-[10px] tracking-[0.25em] uppercase text-center" style={{ color: 'rgba(255,248,220,0.78)' }}>
                    Goes live on the wedding day
                  </p>
                </>
              )}

              {actionPopup === 'findphotos' && (
                <>
                  <Camera className="w-7 h-7 mb-3" style={{ color: 'var(--lux-gold)' }} />
                  <h3 className="text-xl mb-2" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>Get Your Photos</h3>
                  <p className="text-sm mb-4" style={{ color: 'rgba(255,248,220,0.88)' }}>
                    Upload one selfie and share your contact — the studio will send you every photo you’re in.
                  </p>
                  <label className="block lux-glass p-5 rounded text-center cursor-pointer mb-3" style={{ borderStyle: 'dashed', borderColor: 'var(--lux-gold)' }}>
                    <input type="file" accept="image/*" className="hidden" onChange={() => fireToast('Selfie received — the studio will send your photos.')} />
                    <Users className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--lux-gold)' }} />
                    <span className="text-xs tracking-[0.2em] uppercase" style={{ color: 'rgba(255,248,220,0.88)' }}>
                      Tap to upload a selfie
                    </span>
                  </label>
                </>
              )}

              {actionPopup === 'room' && (
                <>
                  <Plane className="w-7 h-7 mb-3" style={{ color: 'var(--lux-gold)' }} />
                  <h3 className="text-xl mb-2" style={{ color: '#FFF8DC', fontFamily: 'var(--theme-heading)' }}>Know your room</h3>
                  <p className="text-sm mb-4" style={{ color: 'rgba(255,248,220,0.88)' }}>
                    Type your name as it appears on the invitation. We'll show the hotel & room reserved for you.
                  </p>
                  <input
                    value={roomLookup.name}
                    onChange={(e) => setRoomLookup({ ...roomLookup, name: e.target.value, result: null })}
                    placeholder="Your full name"
                    className="w-full bg-transparent border-b py-2 px-1 focus:outline-none mb-4"
                    style={{ borderColor: 'rgba(255,248,220,0.25)', color: '#FFF8DC' }}
                    data-testid="room-lookup-name"
                  />
                  <button
                    onClick={() => {
                      const n = roomLookup.name.trim();
                      if (!n) return;
                      // Sample lookup result — in the real link this calls a roomings endpoint.
                      setRoomLookup({
                        name: n,
                        result: { hotel: 'Taj Falaknuma Palace', room: '214 · Garden Suite', checkin: 'Fri 4 PM', checkout: 'Sun 11 AM' },
                      });
                    }}
                    className="lux-btn w-full justify-center mb-3" style={{ background: 'var(--lux-gold)', color: '#1a0c0c' }}
                    data-testid="room-lookup-submit"
                  >
                    Search my room
                  </button>
                  {roomLookup.result && (
                    <div className="lux-glass p-4 text-sm" style={{ color: '#FFF8DC' }} data-testid="room-lookup-result">
                      <div className="lux-eyebrow mb-1" style={{ color: 'var(--lux-gold)' }}>Reserved for {roomLookup.name}</div>
                      <div className="mb-1"><strong>Hotel:</strong> {roomLookup.result.hotel}</div>
                      <div className="mb-1"><strong>Room:</strong> {roomLookup.result.room}</div>
                      <div className="text-xs" style={{ color: 'rgba(255,248,220,0.82)' }}>
                        Check-in: {roomLookup.result.checkin} · Check-out: {roomLookup.result.checkout}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] tracking-[0.25em] uppercase mt-3 text-center" style={{ color: 'rgba(255,248,220,0.62)' }}>
                    Sample data shown in preview
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <PetalConfetti trigger={petalTrigger} count={40} duration={5000} />
        {useOrchestrator && <ScrollProgressRing themeId={themeId} />}
        <AmbientMusicPlayer
          src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
          defaultVolume={0.35}
        />
      </div>
  );

  return useOrchestrator ? (
    <>
      {!openingDone && (
        <OpeningOrchestrator
          themeId={themeId}
          eventType={searchParams.get('event') || 'marriage'}
          bride={sample.bride}
          groom={sample.groom}
          date={sample.weddingDate}
          monogram={`${sample.bride_initial} & ${sample.groom_initial}`}
          onComplete={() => setOpeningDone(true)}
        />
      )}
      {InvitationBody}
    </>
  ) : (
    <WaxSealOpening
      monogram={`${sample.bride_initial} & ${sample.groom_initial}`}
      subtitle={`${theme.name} · ${theme.culture}`}
      ctaLabel="Open Invitation"
      storageKey={`luxe-preview-${themeId}`}
    >
      {InvitationBody}
    </WaxSealOpening>
  );
};

export default ThemedPreview;
