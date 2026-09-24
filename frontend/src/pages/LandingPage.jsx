import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Seo from '@/components/Seo';
import { motion, useInView, useReducedMotion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import axios from 'axios';
import {
  Sparkles, Camera, Crown, Wallet, ShieldCheck, Layers, ArrowRight,
  Heart, Music, Image as ImageIcon, QrCode, Globe2, MessageCircle, Star, MapPin,
  IndianRupee, ChevronDown, ScanFace, Users, Gift,
  Zap, Lock, Headphones, Send, Smartphone, Menu, ShoppingBag, Megaphone, BadgeCheck,
} from 'lucide-react';
import '../styles/luxury.css';
import HeroMandala3D from '../components/luxury/HeroMandala3D';
import { ScrollCue } from '../components/ScrollFX';
import { EASE, DUR, SPRING, VIEWPORT } from '../motion/presets';
import MagneticButton from '../motion/MagneticButton';
import TiltCard from '../motion/TiltCard';
import Marquee from '../motion/Marquee';
import ScrollProgress from '../motion/ScrollProgress';
import CountUp from '../motion/CountUp';
import MorphBlob from '../motion/MorphBlob';
import useSafeReveal from '../motion/useSafeReveal';
import CursorGlow from '../motion/CursorGlow';
import WhyMaja from '../components/WhyMaja';
import CommunityStrip from '../components/CommunityStrip';
import PortfolioDesignsShowcase from '../components/landing/PortfolioDesignsShowcase';
import { resolveHeroDesign } from '../themes/themeDesignResolver';
import { getThemeById } from '../themes/masterThemes';
import { BROWSE_ROOTS } from '../data/browseTree';
import UserAuthModal from '../components/UserAuthModal';
import { useUserAuth } from '../context/UserAuthContext';
import { getThemeDesignsAsync, useAllDesigns } from '../themes/allDesigns';
import { usePricing } from '../hooks/usePricing';
import HelpTour, { HelpTourTrigger } from '../components/HelpTour';
import { HOMEPAGE_USER_STEPS } from '../data/helpTourSteps';
import CelebrationPreviewModal from '@/components/luxury/CelebrationPreviewModal';
import CategoryPreviewModal from '@/components/luxury/CategoryPreviewModal';
import ThemeToggle from '@/components/ThemeToggle';
// Reusable sections live in components/landing/LandingSections, and Nav/Footer
// in components/PublicShell, so the pages that embed them don't pull this whole
// module (and the theme registry) in. Both are re-exported below the imports
// for backwards compatibility.
import {
  fadeUp, stagger, SectionHeader, Features, Story,
  InvitationOptions, Pricing, FAQSection,
} from '@/components/landing/LandingSections';
import { Nav, Footer } from '@/components/PublicShell';
import NonWeddingDesignCard from '@/components/luxury/NonWeddingDesignCard';
import UniversalDesignRenderer from '../themes/UniversalDesignRenderer';
import { getThemeSampleData } from '../themes/sampleData';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Back-compat: these used to be defined in this file. Kept as re-exports so
// `import { Pricing, Nav } from '@/pages/LandingPage'` still resolves.
export { Features, Story, InvitationOptions, Pricing, FAQSection };
export { Nav, Footer };

/* Default sample photo for every preview tile (the per-theme dummy text
   comes from THEME_SAMPLE_DATA). */
const SAMPLE_PHOTO = 'https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=400&fit=crop&q=85';

const sampleFor = (themeId) => {
  const s = getThemeSampleData(themeId) || {};
  return {
    bride: s.bride || 'Anaya',
    groom: s.groom || 'Vihaan',
    date:  s.weddingDate || '14 February 2026',
    venue: `${s.venue || 'Falaknuma Palace'}${s.city ? ' · ' + s.city.split(',')[0] : ''}`,
    photo: SAMPLE_PHOTO,
  };
};

/* ──────────────────────────────────────────────────────────────
   Premium B2B SaaS Landing for Indian Wedding Photographers
   Palette: Royal Heritage (Crimson + Champagne Gold + Ivory + Charcoal)
   ────────────────────────────────────────────────────────────── */


/* The 10 cinematic master themes (per spec) */
const MASTER_THEMES = [
  { id: 'royal_mughal',         name: 'Royal Mughal',         palette: ['#8B0000', '#D4AF37', '#FFF8DC'], hint: 'Crimson · Gold · Ivory' },
  { id: 'south_indian_temple',  name: 'South Indian Temple',  palette: ['#D4AF37', '#420D09', '#F5E6BE'], hint: 'Gold · Maroon · Parchment' },
  { id: 'modern_minimal',       name: 'Modern Minimal',       palette: ['#DCAE96', '#8A9A5B', '#F5F5DC'], hint: 'Dusty Rose · Sage · Sand' },
  { id: 'beach_destination',    name: 'Beach Destination',    palette: ['#005F69', '#BFA379', '#F2D2BD'], hint: 'Teal · Bronze · Peach' },
  { id: 'punjabi_sangeet',      name: 'Punjabi Sangeet',      palette: ['#4B0082', '#C0C0C0', '#FFFFFF'], hint: 'Imperial Purple · Silver' },
  { id: 'bengali_traditional',  name: 'Bengali Traditional',  palette: ['#8B0000', '#FFFFFF', '#D4AF37'], hint: 'Red · White · Gold' },
  { id: 'christian_elegant',    name: 'Christian Elegant',    palette: ['#3D2B1F', '#F5F5DC', '#DCAE96'], hint: 'Mocha · Sand · Rose' },
  { id: 'muslim_nikah',         name: 'Muslim Nikah',         palette: ['#355E3B', '#D4AF37', '#FFF8DC'], hint: 'Hunter Green · Gold' },
  { id: 'nature_eco_wedding',   name: 'Nature / Eco Wedding', palette: ['#8A9A5B', '#E97451', '#F5F5DC'], hint: 'Sage · Terracotta · Sand' },
  { id: 'kerala_backwaters',     name: 'Kerala Backwaters',    palette: ['#0B3D45', '#D4A24C', '#E85A8A'], hint: 'Teal · Gold · Lotus' },
];


// Honest, verifiable facts only — no fabricated counts. "100% done-for-you"
// (the team builds every invite), "5 celebration types" (weddings + baby &
// birthday + half-saree + ritu kala samskaram + dhoti), "0 apps" (guests need
// none), and the 3 real delivery channels (WhatsApp / Email / SMS).
const STATS = [
  { value: '100%', num: 100, suffix: '%', label: 'Done-for-You' },
  { value: '5',    num: 5,   suffix: '',  label: 'Celebration Types' },
  { value: '0',    num: 0,   suffix: '',  label: 'Apps for Guests' },
  { value: '3',    num: 3,   suffix: '',  label: 'Delivery Channels' },
];


/* Bucket 2 — Floating mandala decoration for the landing hero. Pure CSS keyframe,
   GPU-friendly transform, no scroll listeners. */
// Positioning (top/left/right/bottom/zIndex) lives on the parallax wrapper in
// Hero now, not here — this just renders the floating glyph itself.
const FloatingHeroMandala = ({ size = 120, duration = 16, delay = 0, opacity = 0.3, flip = false }) => (
  <div
    aria-hidden
    style={{
      width: size, height: size,
      // Theme-aware: dark keeps the exact original opacity (--mandala-alpha-scale
      // defaults to 1); light multiplies it up (~1.6x, capped at 0.5) via the
      // token defined in luxury.css so the mandala doesn't wash out on ivory.
      opacity: `min(calc(${opacity} * var(--mandala-alpha-scale, 1)), 0.5)`,
      pointerEvents: 'none',
      transform: flip ? 'scaleX(-1)' : undefined,
      animation: `landing-mandala-float ${duration}s ease-in-out ${delay}s infinite`,
    }}
  >
    <style>{`@keyframes landing-mandala-float {
      0%,100% { transform: translateY(0) rotate(0deg) ${flip ? 'scaleX(-1)' : ''}; }
      50%     { transform: translateY(-18px) rotate(10deg) ${flip ? 'scaleX(-1)' : ''}; }
    }`}</style>
    <svg viewBox="0 0 100 100" width={size} height={size}>
      {[...Array(12)].map((_, i) => (
        <ellipse
          key={i}
          cx="50" cy="22" rx="3.5" ry="14"
          style={{ fill: 'var(--mandala-gold, #D4AF37)' }}
          opacity={0.5 - (i % 3) * 0.1}
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="3.5" fill="#E8C766" />
      <circle cx="50" cy="50" r="18" fill="none" style={{ stroke: 'var(--mandala-gold, #D4AF37)' }} strokeWidth="0.5" opacity="0.6" />
      <circle cx="50" cy="50" r="32" fill="none" style={{ stroke: 'var(--mandala-gold, #D4AF37)' }} strokeWidth="0.3" opacity="0.4" strokeDasharray="2 3" />
    </svg>
  </div>
);

export const Hero = ({ onLogin, user, userProfilesCount = 0 }) => {
  // Removed scroll-tied parallax — useScroll/useTransform was firing every
  // frame and causing mid-page scroll jank. Kept the entry animation only.
  const reduce = useReducedMotion();

  // Layered pointer parallax for the floating mandalas — desktop pointer:fine
  // only, skipped entirely under reduced motion (mandalas aren't even
  // rendered in that case, see below).
  const [pointerFine] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
  );
  const mandalaX = useMotionValue(0);
  const mandalaY = useMotionValue(0);
  const springMandalaX = useSpring(mandalaX, SPRING.gentle);
  const springMandalaY = useSpring(mandalaY, SPRING.gentle);
  const parallax1X = useTransform(springMandalaX, (v) => v * 8);
  const parallax1Y = useTransform(springMandalaY, (v) => v * 8);
  const parallax2X = useTransform(springMandalaX, (v) => v * -14);
  const parallax2Y = useTransform(springMandalaY, (v) => v * 14);
  const parallax3X = useTransform(springMandalaX, (v) => v * 20);
  const parallax3Y = useTransform(springMandalaY, (v) => v * -20);

  const handleHeroPointerMove = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mandalaX.set(((e.clientX - rect.left) / rect.width - 0.5) * 2);
      mandalaY.set(((e.clientY - rect.top) / rect.height - 0.5) * 2);
    },
    [mandalaX, mandalaY]
  );

  const handleHeroPointerLeave = useCallback(() => {
    mandalaX.set(0);
    mandalaY.set(0);
  }, [mandalaX, mandalaY]);

  const parallaxActive = !reduce && pointerFine;

  return (
    <section
      className="relative min-h-screen flex flex-col justify-center pt-24 md:pt-32 pb-16 md:pb-24 px-5 md:px-16 overflow-hidden"
      onPointerMove={parallaxActive ? handleHeroPointerMove : undefined}
      onPointerLeave={parallaxActive ? handleHeroPointerLeave : undefined}
    >
      {/* Sprint 11 — Cinematic 3D rotating gold mandala + dust */}
      <HeroMandala3D />

      {/* Task 7 — Morphing gold blob, ambient depth behind the hero text block */}
      <MorphBlob
        style={{
          top: '8%',
          left: '50%',
          width: 620,
          height: 620,
          marginLeft: -310,
          zIndex: 0,
        }}
      />

      {/* Decorative orbits */}
      <div className="lux-orbit" style={{ width: 720, height: 720, top: -180, right: -180 }} />
      <div className="lux-orbit" style={{ width: 1100, height: 1100, top: -360, right: -360, opacity: 0.5 }} />

      {/* Bucket 2 — Floating mandala decorations (gentle CSS-only float +
          pointer parallax group, each at a different depth factor). */}
      {!reduce && (
        <>
          <motion.div style={{ position: 'absolute', top: '14%', left: '4%', zIndex: 1, x: parallax1X, y: parallax1Y }}>
            <FloatingHeroMandala size={120} duration={14} delay={0} opacity={0.30} />
          </motion.div>
          <motion.div style={{ position: 'absolute', bottom: '18%', left: '10%', zIndex: 1, x: parallax2X, y: parallax2Y }}>
            <FloatingHeroMandala size={150} duration={18} delay={3} opacity={0.22} flip />
          </motion.div>
          <motion.div style={{ position: 'absolute', top: '38%', right: '18%', zIndex: 1, x: parallax3X, y: parallax3Y }}>
            <FloatingHeroMandala size={100} duration={16} delay={1.5} opacity={0.26} />
          </motion.div>
        </>
      )}

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-6xl"
      >
        <motion.span variants={fadeUp} initial={reduce ? 'visible' : 'hidden'} animate="visible" custom={0} className="lux-eyebrow inline-block mb-4 md:mb-6 text-[10px] md:text-xs">
          ◆ Universal Event Invitations · Live Photo Wall · Photographer Community
        </motion.span>

        <h1
          className="font-display leading-[0.98] text-[2.4rem] xs:text-[2.8rem] sm:text-[3.4rem] md:text-[6.6rem] tracking-tight"
          style={{ color: 'var(--lux-text)' }}
        >
          <span style={{ display: 'block', overflow: 'hidden' }}>
            <motion.span
              style={{ display: 'block' }}
              initial={reduce ? false : { y: '110%' }}
              animate={{ y: 0 }}
              transition={{ duration: DUR.slow, ease: EASE.cinema, delay: 0.15 }}
            >
              Cinematic <span className="text-gold italic font-script font-light">invitations</span>
            </motion.span>
          </span>
          <span style={{ display: 'block', overflow: 'hidden' }}>
            <motion.span
              style={{ display: 'block' }}
              initial={reduce ? false : { y: '110%' }}
              animate={{ y: 0 }}
              transition={{ duration: DUR.slow, ease: EASE.cinema, delay: 0.3 }}
            >
              for every <em className="not-italic text-gold">celebration.</em>
            </motion.span>
          </span>
        </h1>

        <motion.p
          variants={fadeUp} initial={reduce ? 'visible' : 'hidden'} animate="visible" custom={2}
          className="mt-5 md:mt-8 max-w-2xl text-[0.95rem] md:text-[1.18rem] leading-[1.6] md:leading-[1.7]"
          style={{ color: 'var(--lux-text-muted)' }}
        >
          <span className="text-gold">Weddings</span> · <span className="text-gold">Baby Birthdays</span> · <span className="text-gold">Half Saree</span> · <span className="text-gold">Puberty</span> · <span className="text-gold">Dhoti Ceremonies</span>
          {' '}— one studio for couples, families and the photographers who serve them.
          Choose a design and share your details; our team builds and delivers your invitation link,
          with RSVP, guest wishes, a live photo gallery and QR check-in built in.
          <span className="block mt-3 text-[0.88rem] md:text-[1rem]" style={{ color: 'var(--lux-text-muted)' }}>
            Done-for-you. You approve; we build.
          </span>
        </motion.p>

        <motion.div variants={fadeUp} initial={reduce ? 'visible' : 'hidden'} animate="visible" custom={3} className="mt-7 md:mt-10 flex flex-wrap items-center gap-3 md:gap-4 safe-bottom">
          <MagneticButton strength={0.3} className="w-full sm:w-auto">
            <button className="lux-btn w-full justify-center" onClick={onLogin} data-testid="hero-cta-login">
              Enter Studio <ArrowRight className="w-4 h-4" />
            </button>
          </MagneticButton>
          <MagneticButton strength={0.3} className="w-full sm:w-auto">
            <a href="#themes" className="lux-btn lux-btn-ghost w-full justify-center" data-testid="hero-cta-themes">
              Explore Themes
            </a>
          </MagneticButton>
        </motion.div>

        <motion.div
          variants={fadeUp} initial={reduce ? 'visible' : 'hidden'} animate="visible" custom={4}
          className="mt-10 md:mt-16 flex items-center gap-4 md:gap-6 text-[10px] md:text-xs tracking-widest uppercase"
          style={{ color: 'var(--lux-text-muted)' }}
        >
          <span className="leading-tight">Done-for-you invitations · Guest RSVP, wishes &amp; live photo gallery · Photographer platform</span>
        </motion.div>

        <motion.div
          variants={fadeUp} initial={reduce ? 'visible' : 'hidden'} animate="visible" custom={5}
          className="mt-12 md:mt-16 hidden sm:flex"
        >
          <ScrollCue targetHref="#themes" label="Scroll" />
        </motion.div>
      </motion.div>
    </section>
  );
};

const CELEBRATION_ITEMS = [
  'Weddings', 'Haldi', 'Mehndi', 'Sangeet', 'Reception', 'Engagement',
  'Baby Birthdays', 'Half Saree', 'Dhoti Ceremony', 'Puberty Function',
  'House Warming', 'Anniversaries',
];

const CelebrationMarquee = () => (
  <div
    className="w-full overflow-hidden"
    style={{
      padding: '1rem 0',
      borderTop: '1px solid var(--lux-border)',
      borderBottom: '1px solid var(--lux-border)',
      background: 'var(--lux-panel)',
    }}
    data-testid="celebration-marquee"
  >
    <Marquee speed={35}>
      {CELEBRATION_ITEMS.map((item) => (
        <React.Fragment key={item}>
          <span
            className="font-display uppercase tracking-[0.25em] text-sm"
            style={{ color: 'var(--lux-text-muted)' }}
          >
            {item}
          </span>
          {/* Trailing (not leading) separator so the loop seam between the
              duplicated marquee copies also gets a diamond. */}
          <span style={{ color: 'var(--lux-gold)' }}>◆</span>
        </React.Fragment>
      ))}
    </Marquee>
  </div>
);


// ============================================================
// 2026 — Invitation Categories Section (landing page)
// Renders the 5 invitation types with their hero images so any
// visitor sees that the studio supports more than weddings.
// ============================================================
const InvitationCategoriesSection = () => {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  // Reveal that cannot strand the grid at opacity 0 if the observer never fires.
  const [catsRef, catsShown] = useSafeReveal({ amount: 0.05 });
  const [cats, setCats] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/event-categories`);
        if (alive) setCats(data.categories || []);
      } catch (e) {
        console.warn('Failed to load categories', e);
      }
    })();
    return () => { alive = false; };
  }, []);
  if (!cats.length) return null;
  return (
    <section id="invitation-types" className="relative px-6 md:px-16 py-28 z-10">
      <SectionHeader
        eyebrow="Universal Invitations"
        title="Not just weddings. Every milestone."
        kicker="Pick the ceremony you're celebrating — each invitation type has its own cultural designs, custom fields and the same luxury flow."
      />
      <motion.div
        ref={catsRef}
        variants={stagger} initial="hidden" animate={catsShown ? 'visible' : 'hidden'}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5"
        data-testid="categories-grid"
      >
        {cats.map((c, i) => (
          <motion.button
            key={c.id}
            variants={fadeUp} custom={i}
            onClick={() => navigate('/studio/login')}
            whileHover={{ y: -6 }}
            className="group text-left rounded-2xl overflow-hidden relative"
            style={{ border: '1px solid rgba(212,175,55,0.18)', background: '#161210' }}
            data-testid={`landing-category-${c.id}`}
          >
            <div className="relative h-44 overflow-hidden">
              <img src={c.cover_preview} alt={c.label}
                loading="lazy" decoding="async"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                onError={(e) => { e.currentTarget.style.opacity = 0; }} />
              <div className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(11,9,8,0.7) 75%, rgba(11,9,8,0.95) 100%)' }} />
              <div className="absolute top-3 left-3 w-10 h-10 rounded-full grid place-items-center text-xl"
                style={{ background: 'rgba(11,9,8,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(212,175,55,0.35)' }}>
                {c.icon}
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-display text-lg mb-1" style={{ color: '#FFF8DC' }}>{c.label}</h3>
              {/* Removed the coloured regional-script subtitle (c.label_traditional) —
                  the red/yellow multilingual text clashed with the UI. */}
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,248,220,0.8)' }}>
                {c.tagline}
              </p>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </section>
  );
};


// Home now leads with the top-level occasion categories (the drill-down entry).
// Clicking a root goes to /browse/<slug> → sub-categories → … → a design.
const ROOT_ICONS = {
  wedding: Heart,
  housewarming: Layers,
  'traditional-ceremonies': Users,
  religious: Sparkles,
  'luxury-collection': Crown,
  'modern-collection': ImageIcon,
  love: Star,
};

export const BrowseRoots = ({ navigate }) => {
  // The occasion grid is the main entry point to the whole catalogue — it must
  // never be left invisible because one IntersectionObserver callback was missed.
  const [rootsRef, rootsShown] = useSafeReveal({ amount: 0.1 });
  return (
  <section id="themes" className="relative px-6 md:px-16 py-24 z-10">
    <SectionHeader
      eyebrow="Browse Invitations"
      title="Pick your occasion."
      kicker="Start with the celebration — then drill into region, style and the exact design. Hundreds of invitations across every Indian tradition."
    />
    <motion.div
      ref={rootsRef}
      variants={stagger} initial="hidden" animate={rootsShown ? 'visible' : 'hidden'}
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5"
      data-testid="browse-roots-grid"
    >
      {BROWSE_ROOTS.map((root, i) => {
        const Icon = ROOT_ICONS[root.slug] || Layers;
        const count = (root.children || []).length;
        return (
          <TiltCard key={root.slug} className="block w-full">
            <motion.button
              variants={fadeUp} custom={i} whileHover={{ y: -5 }}
              onClick={() => navigate(`/browse/${root.slug}`)}
              className="lux-glass p-6 text-left relative overflow-hidden w-full"
              style={{ minHeight: 150 }}
              data-testid={`browse-root-${root.slug}`}
            >
              <div className="w-12 h-12 rounded-xl grid place-items-center mb-4"
                style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(139,0,0,0.18))', border: '1px solid var(--lux-border-strong)' }}>
                <Icon className="w-6 h-6" style={{ color: '#D4AF37' }} />
              </div>
              <h3 className="font-heading text-lg md:text-xl" style={{ color: 'var(--lux-text)' }}>{root.label}</h3>
              <p className="text-[12px] mt-1.5" style={{ color: 'var(--lux-text-muted)' }}>{count} categories</p>
              <ArrowRight className="w-4 h-4 absolute bottom-5 right-5" style={{ color: 'rgba(212,175,55,0.7)' }} />
            </motion.button>
          </TiltCard>
        );
      })}
    </motion.div>
  </section>
  );
};

export const Themes = ({ navigate, requireUserAuth, userSignedIn }) => {
  const [hovered, setHovered] = useState({});
  const pricing = usePricing('normal_user');
  // 2026 — Universal categories: which tab is active
  const [activeCat, setActiveCat] = useState('wedding');
  const [cats, setCats] = useState([]);
  const [catDesigns, setCatDesigns] = useState({}); // {category_id: [...designs]}
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/event-categories`);
        if (alive) setCats(data.categories || []);
      } catch (e) { console.warn('cats load', e); }
    })();
    return () => { alive = false; };
  }, []);
  // Pre-fetch designs for the active non-wedding tab
  useEffect(() => {
    if (activeCat === 'wedding' || catDesigns[activeCat]) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/event-categories/${activeCat}/designs`);
        if (alive) setCatDesigns((m) => ({ ...m, [activeCat]: data.designs || [] }));
      } catch (e) { console.warn('cat designs load', e); }
    })();
    return () => { alive = false; };
  }, [activeCat, catDesigns]);

  // 2026-09 — Click on a non-wedding design card now OPENS A PREVIEW MODAL
  // first (user explicitly asked: "first I want to see the preview, then
  // select theme/design"). The modal's "Use this design" button then takes
  // them to the purchase wizard at /user/buy-celebration/:cat/:designId.
  const [previewState, setPreviewState] = useState({ open: false, category: null, design: null });

  // 2026-09 (follow-up) — Category-level preview (Wedding / Baby Birthday
  // / Half Saree / Puberty / Dhoti). Used by:
  //   • "Preview this invitation type" link under the tab bar
  //   • "Preview" pill on every wedding theme card
  // Mirrors the wedding payment story so the customer can visualize all
  // included features BEFORE committing.
  const [categoryPreview, setCategoryPreview] = useState({ open: false, category: null });
  const openCategoryPreview = (catId) => setCategoryPreview({ open: true, category: catId });
  const closeCategoryPreview = () => setCategoryPreview({ open: false, category: null });

  const handleCategoryBrowseDesigns = (catId) => {
    closeCategoryPreview();
    setActiveCat(catId);
    // Smooth-scroll back to the themes grid so the user lands on the
    // freshly-filtered designs.
    setTimeout(() => {
      try { document.getElementById('themes')?.scrollIntoView({ behavior: 'smooth' }); } catch (_) { /* noop */ }
    }, 50);
  };

  const handleCategorySignIn = (catId) => {
    closeCategoryPreview();
    if (userSignedIn) {
      // Already signed in — jump to user dashboard so they can create.
      navigate('/user/dashboard');
      return;
    }
    if (typeof requireUserAuth === 'function') {
      requireUserAuth('/user/dashboard');
    } else {
      navigate('/?signin=1&return=/user/dashboard');
    }
  };

  // 2026 — Clicking a non-wedding design card (or its "Preview" pill) opens
  // the full cinematic scrollable invitation preview page — mirrors what
  // wedding designs do via /themes/:themeId/events/:event/design/:idx.
  // Route: /preview/celebration/:category/:designId  (CelebrationInvitationPreview)
  const handleNonWeddingDesignClick = (catId, design) => {
    const target = `/preview/celebration/${catId}/${encodeURIComponent(design.design_id)}`;
    try {
      window.open(target, '_blank', 'noopener,noreferrer');
    } catch (_) {
      navigate(target);
    }
  };

  // Direct "Buy / Use this design" path — bypasses the preview and jumps
  // straight to the purchase wizard.
  const handleNonWeddingDesignBuy = (catId, design) => {
    const target = `/user/buy-celebration/${catId}/${encodeURIComponent(design.design_id)}`;
    if (userSignedIn) {
      navigate(target);
    } else if (typeof requireUserAuth === 'function') {
      requireUserAuth(target);
    } else {
      navigate(`/?signin=1&return=${encodeURIComponent(target)}`);
    }
  };

  const handleUseDesignFromPreview = (catId, design) => {
    setPreviewState({ open: false, category: null, design: null });
    handleNonWeddingDesignBuy(catId, design);
  };

  // Subscribe to the global design cache so cards re-render once each
  // theme's chunk lands (Christian/Muslim/Nature/Kerala previously showed
  // empty preview tiles on first paint because their chunks hadn't loaded
  // yet and the page never re-rendered).
  //
  // Gated on proximity: this grid renders a LIVE mini-invitation per theme, so
  // it genuinely needs all 9 catalogue chunks — but it sits well below the fold,
  // and loading them at boot was the homepage's biggest JS cost. The 800px
  // margin starts the fetch before the grid is on screen, so by the time it is
  // scrolled to the previews are already there. `once` keeps it latched.
  const gridRef = useRef(null);
  const gridNear = useInView(gridRef, { once: true, margin: '800px' });
  useAllDesigns(gridNear);
  return (
  <section ref={gridRef} id="themes" className="relative px-6 md:px-16 py-28 z-10">
    <SectionHeader
      eyebrow="Universal Designs Library"
      title="Pick a ceremony. Pick a design. Make it yours."
      kicker="Every invitation type has its own curated design gallery — wedding, baby birthday, half saree, puberty and dhoti. Same locked-luxury experience, same simple flow."
    />

    {/* 2026 — Category tabs. Wedding is the default; clicking any other tab
        replaces the design grid below with that category's gallery. */}
    {cats.length > 0 && (
      <div className="flex flex-col items-center justify-center mb-10 -mt-6 overflow-x-auto"
        data-testid="themes-category-tabs">
        <div className="inline-flex items-center gap-1 p-1 rounded-full"
          style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)' }}>
          {cats.map((c) => {
            const isActive = activeCat === c.id;
            return (
              <button key={c.id} type="button" onClick={() => setActiveCat(c.id)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] tracking-[0.18em] uppercase whitespace-nowrap transition-all"
                style={isActive
                  ? { background: 'linear-gradient(135deg,#D4AF37,#B48C28)', color: '#16110C', fontWeight: 700 }
                  : { color: 'var(--lux-text)' }}
                data-testid={`themes-tab-${c.id}`}>
                <span className="text-base">{c.icon}</span>
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
        {/* 2026-09 — "Preview this invitation type" CTA. Opens a category-level
            modal showing ALL features bundled with this invitation type so the
            customer can visualize the experience before picking a design. */}
        <button
          type="button"
          onClick={() => openCategoryPreview(activeCat)}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] tracking-[0.28em] uppercase transition-all hover:scale-[1.02]"
          style={{
            background: 'rgba(212,175,55,0.08)',
            border: '1px solid rgba(212,175,55,0.32)',
            color: '#E8C766',
          }}
          data-testid={`themes-preview-category-${activeCat}`}
        >
          <Sparkles className="w-3 h-3" />
          Preview this invitation type
        </button>
      </div>
    )}

    {activeCat === 'wedding' && (
    <motion.div
      key="wedding-grid"
      variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.01 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
      data-testid="themes-grid"
    >
      {MASTER_THEMES.map((t, i) => {
        const themeDesign = resolveHeroDesign(t.id);
        const SAMPLE = sampleFor(t.id);
        const masterTheme = getThemeById(t.id);
        // Dynamic credit cost from /api/public/pricing/effective with fallback
        // to the locked masterThemes value if the API hasn't responded yet.
        const themeCredits = pricing.themeCost(t.id, masterTheme?.creditCost ?? 1);
        const themePlan = masterTheme?.planRequired || 'FREE';
        return (
        <motion.div
          role="button"
          tabIndex={0}
          key={t.id} variants={fadeUp} custom={i}
          whileHover={{ scale: 1.01, transition: { duration: 0.25, ease: 'easeOut' } }}
          onMouseEnter={() => {
            try { setHovered((h) => ({ ...h, [t.id]: true })); } catch (_) { /* noop */ }
            // PHASE 9 (perf): warm the theme chunk + first design image on hover so
            // click feels instant. No-op if chunk already cached.
            try { getThemeDesignsAsync(t.id); } catch (_) { /* noop */ }
          }}
          onTouchStart={() => {
            try { setHovered((h) => ({ ...h, [t.id]: true })); } catch (_) { /* noop */ }
            try { getThemeDesignsAsync(t.id); } catch (_) { /* noop */ }
          }}
          onClick={() => navigate(`/themes/${t.id}/events`)}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/themes/${t.id}/events`); }}
          className="lux-glass p-5 group cursor-pointer text-left w-full overflow-hidden relative"
          data-testid={`theme-card-${t.id}`}
          aria-label={`Preview ${t.name}`}
        >
          {/* Credit badge — top-right corner */}
          <div
            className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,55,0.95), rgba(180,140,40,0.9))',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
              border: '1px solid rgba(255,248,220,0.35)',
            }}
            data-testid={`theme-price-badge-${t.id}`}
          >
            <span className="font-display text-xs leading-none" style={{ color: '#16110C', fontWeight: 700 }}>
              From ₹1,499
            </span>
          </div>
          {/* Plan badge — top-left corner */}
          <div
            className="absolute top-3 left-3 z-10 px-2 py-1 rounded-full text-[9px] tracking-[0.2em] uppercase"
            style={{
              background: themePlan === 'FREE' ? 'rgba(138,154,91,0.2)'
                       : themePlan === 'SILVER' ? 'rgba(192,192,192,0.2)'
                       : themePlan === 'GOLD' ? 'rgba(212,175,55,0.2)'
                       : 'rgba(139,0,0,0.25)',
              color: themePlan === 'FREE' ? '#A8C076'
                  : themePlan === 'SILVER' ? '#D8D8D8'
                  : themePlan === 'GOLD' ? '#E8C766'
                  : '#FFB0A0',
              border: '1px solid rgba(255,248,220,0.2)',
            }}
            data-testid={`theme-plan-badge-${t.id}`}
          >
            {themePlan}
          </div>
          {/* Live invitation preview — 2026-07 fix: render eagerly for
              ALL theme cards so Christian/Muslim/Nature/Kerala (positions
              7-10) don't appear blank until hover. The renderer itself
              defers heavy work via its own intersection observer. */}
          {themeDesign?.design && themeDesign?.theme && (
            <div className="relative w-full mb-5 overflow-hidden rounded-md transition-transform duration-300 group-hover:scale-[1.01]">
              <UniversalDesignRenderer
                design={themeDesign.design}
                theme={themeDesign.theme}
                bride={SAMPLE.bride}
                groom={SAMPLE.groom}
                date={SAMPLE.date}
                venue={SAMPLE.venue}
                photo={SAMPLE.photo}
                eager={i < 3}
                testId={`theme-preview-${t.id}`}
              />
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <span className="text-xs tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex -space-x-1.5">
              {t.palette.map((c, idx) => (
                <span key={idx}
                  className="w-5 h-5 rounded-full border"
                  style={{ background: c, borderColor: 'rgba(255,248,220,0.2)' }}
                />
              ))}
            </div>
          </div>
          <h3 className="font-display text-2xl md:text-[1.55rem] leading-tight mb-2" style={{ color: 'var(--lux-text)' }}>
            {t.name}
          </h3>
          <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{t.hint}</p>
          <div className="lux-hairline my-4" />
          <div className="flex items-center justify-between text-xs tracking-widest uppercase"
            style={{ color: 'var(--lux-text-muted)' }}>
            <span>18 designs · 6 events</span>
            <span className="group-hover:text-[var(--lux-gold)] transition-colors flex items-center gap-1">
              Explore <ArrowRight className="w-3 h-3" />
            </span>
          </div>
          {/* July 2026 — Two-CTA footer for wedding theme cards.
              "Preview" opens the category preview modal (full features +
              sample designs) BEFORE the user commits; "Buy theme" goes
              straight to the purchase wizard like before. */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openCategoryPreview('wedding'); }}
              className="px-3 py-2 rounded-full text-[10px] tracking-[0.22em] uppercase inline-flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02]"
              style={{
                background: 'rgba(255,248,220,0.06)',
                border: '1px solid rgba(255,248,220,0.18)',
                color: 'var(--lux-text)',
              }}
              data-testid={`theme-preview-btn-${t.id}`}
            >
              <Sparkles className="w-3 h-3" /> Preview
            </button>
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); navigate(`/user/buy-theme/${t.id}`); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); navigate(`/user/buy-theme/${t.id}`); } }}
              className="lux-btn justify-center !text-[11px]"
              data-testid={`theme-buy-btn-${t.id}`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Choose
            </div>
          </div>
        </motion.div>
        );
      })}
    </motion.div>
    )}

    {/* 2026 — Non-wedding category gallery */}
    {activeCat !== 'wedding' && (() => {
      const designs = catDesigns[activeCat] || [];
      const meta = cats.find((c) => c.id === activeCat);
      // Non-wedding ceremonies are not live yet — show a "coming soon" panel
      // instead of designs. Wedding stays fully shoppable.
      return (
        <motion.div
          key={`soon-${activeCat}`}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          className="lux-glass max-w-2xl mx-auto text-center px-8 py-16"
          data-testid={`category-coming-soon-${activeCat}`}
        >
          <div className="w-14 h-14 mx-auto rounded-full grid place-items-center mb-5" style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}>
            <Sparkles className="w-7 h-7" style={{ color: '#16110C' }} />
          </div>
          <span className="lux-eyebrow block mb-3">◆ {meta?.label || 'This ceremony'}</span>
          <h3 className="font-display text-3xl md:text-4xl mb-3" style={{ color: 'var(--lux-text)' }}>
            Coming <span className="font-script italic text-gold">soon.</span>
          </h3>
          <p className="text-sm md:text-base max-w-md mx-auto" style={{ color: 'var(--lux-text-muted)' }}>
            We're crafting {meta?.label || 'these'} designs with the same locked-luxury care as our
            wedding suite. Meanwhile, explore our wedding designs.
          </p>
          <a href="/themes" className="lux-btn mt-7 inline-flex no-underline" data-testid={`coming-soon-cta-${activeCat}`}>
            <Sparkles className="w-4 h-4" /> See wedding designs
          </a>
        </motion.div>
      );
      // eslint-disable-next-line no-unreachable
      return (
        <motion.div
          key={`grid-${activeCat}`}
          variants={stagger} initial="hidden" animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          data-testid={`category-grid-${activeCat}`}
        >
          {designs.map((d, i) => {
            // Build a 3-swatch palette for the category — mirrors the
            // 3-dot palette swatches on wedding theme cards.
            const catPalette = [
              meta?.primary_color || '#D4AF37',
              meta?.accent_color  || '#8B0000',
              '#FFF8DC',
            ];
            return (
            <motion.div
              key={d.design_id}
              role="button"
              tabIndex={0}
              variants={fadeUp} custom={i}
              whileHover={{ scale: 1.01, transition: { duration: 0.25, ease: 'easeOut' } }}
              onClick={() => handleNonWeddingDesignClick(activeCat, d)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNonWeddingDesignClick(activeCat, d); }}
              className="lux-glass p-5 group cursor-pointer text-left w-full overflow-hidden relative"
              data-testid={`cat-design-card-${d.design_id}`}
              aria-label={`Preview ${d.name}`}
            >
              {/* Credit badge — top-right corner (same as wedding) */}
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, rgba(212,175,55,0.95), rgba(180,140,40,0.9))',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
                  border: '1px solid rgba(255,248,220,0.35)',
                }}
                data-testid={`cat-design-price-badge-${d.design_id}`}
              >
                <span className="font-display text-xs leading-none" style={{ color: '#16110C', fontWeight: 700 }}>
                  From ₹1,499
                </span>
              </div>
              {/* Category badge — top-left corner (mirrors wedding plan badge) */}
              <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full text-[9px] tracking-[0.2em] uppercase flex items-center gap-1"
                style={{
                  background: 'rgba(11,9,8,0.7)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(212,175,55,0.3)',
                  color: meta?.accent_color || '#D4AF37',
                }}
                data-testid={`cat-design-cat-badge-${d.design_id}`}
              >
                <span>{meta?.icon}</span>
                <span>{meta?.label}</span>
              </div>
              {/* Live invitation preview — wedding-card-style overlay with
                  sample celebrant name, date and venue. */}
              <div className="relative w-full mb-5">
                <NonWeddingDesignCard
                  design={d}
                  category={activeCat}
                  index={i}
                />
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-xs tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex -space-x-1.5">
                  {catPalette.map((c, idx) => (
                    <span key={idx}
                      className="w-5 h-5 rounded-full border"
                      style={{ background: c, borderColor: 'rgba(255,248,220,0.2)' }}
                    />
                  ))}
                </div>
              </div>
              <h3 className="font-display text-2xl md:text-[1.55rem] leading-tight mb-2" style={{ color: 'var(--lux-text)' }}>
                {d.name}
              </h3>
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                {meta?.tagline}
              </p>
              <div className="lux-hairline my-4" />
              <div className="flex items-center justify-between text-xs tracking-widest uppercase"
                style={{ color: 'var(--lux-text-muted)' }}>
                <span>{meta?.label} · {designs.length} designs</span>
                <span className="group-hover:text-[var(--lux-gold)] transition-colors flex items-center gap-1">
                  Explore <ArrowRight className="w-3 h-3" />
                </span>
              </div>
              {/* Two-CTA footer — Preview + Buy, mirrors wedding card */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); handleNonWeddingDesignClick(activeCat, d); }}
                  className="px-3 py-2 rounded-full text-[10px] tracking-[0.22em] uppercase inline-flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02]"
                  style={{
                    background: 'rgba(255,248,220,0.06)',
                    border: '1px solid rgba(255,248,220,0.18)',
                    color: 'var(--lux-text)',
                  }}
                  data-testid={`cat-design-preview-${d.design_id}`}
                >
                  <Sparkles className="w-3 h-3" /> Preview
                </button>
                <div role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleNonWeddingDesignBuy(activeCat, d); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleNonWeddingDesignBuy(activeCat, d); } }}
                  className="lux-btn justify-center !text-[11px]"
                  data-testid={`cat-design-buy-${d.design_id}`}>
                  <Sparkles className="w-3.5 h-3.5" /> Choose
                </div>
              </div>
            </motion.div>
            );
          })}
        </motion.div>
      );
    })()}
    <CelebrationPreviewModal
      open={previewState.open}
      category={previewState.category}
      design={previewState.design}
      onClose={() => setPreviewState({ open: false, category: null, design: null })}
      onUseDesign={handleUseDesignFromPreview}
    />
    <CategoryPreviewModal
      open={categoryPreview.open}
      category={categoryPreview.category}
      onClose={closeCategoryPreview}
      onBrowseDesigns={handleCategoryBrowseDesigns}
      onSignIn={handleCategorySignIn}
    />
  </section>
  );
};


export const Stats = () => (
  <section className="px-6 md:px-16 py-20 z-10 relative">
    <div className="lux-hairline mb-16" />
    <motion.div
      variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.5 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-8"
    >
      {STATS.map((s, i) => (
        <motion.div key={i} variants={fadeUp} custom={i} className="text-center md:text-left">
          <div className="font-display text-5xl md:text-6xl text-gold mb-2">
            <CountUp value={s.num} suffix={s.suffix} />
          </div>
          <div className="text-xs tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>{s.label}</div>
        </motion.div>
      ))}
    </motion.div>
    <div className="lux-hairline mt-16" />
  </section>
);


// MapPin/IndianRupee are imported below



export const PhotographerAdvantages = ({ onPhotographer }) => {
  // Pull live photographer tier configuration from the super-admin pricing hub.
  // Each tier has { key, label, min_paid_links, discount_pct, bonus_pct }.
  const photographerPricing = usePricing('photographer');
  const rawTiers = photographerPricing?.photographer_tiers?.tiers || [];
  // Filter out the starter (0 link) tier — only milestones that actually
  // unlock a reward are worth showcasing on the public homepage.
  const milestoneTiers = rawTiers.filter((t) => (t.min_paid_links || 0) > 0);
  const firstMilestone = milestoneTiers[0];
  // Public stats — total published weddings + photographers active. The
  // endpoint is read-only and cheap (uses count_documents).
  const [stats, setStats] = useState({ published_total: null, photographers_total: null, bonus_credits_granted: null });
  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/api/public/photographer-stats`)
      .then((r) => { if (!cancelled) setStats(r.data || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const advantages = [
    { icon: Layers,      title: 'Unlimited Drafts',         copy: 'Build every couple\'s wedding link in the panel. Drafts are free — pay only when you publish.' },
    { icon: Crown,       title: 'Studio Branding',          copy: 'Co-branded invitation footer that carries your studio name across every link you publish.' },
    { icon: ShieldCheck, title: 'RBAC + Audit Trails',      copy: 'Add team members with role-based access. Every action is logged — perfect for large studios.' },
    { icon: Wallet,      title: 'Bulk Discounts',    copy: 'Publish more, save more — higher tiers unlock bigger discounts on every link you publish.' },
    {
      icon: Sparkles,
      title: 'Loyalty Offers',
      copy: milestoneTiers.length
        ? `Cross ${milestoneTiers[0].min_paid_links} paid links to unlock the ${milestoneTiers[0].label} tier — ${milestoneTiers[0].discount_pct}% off every tier + ${milestoneTiers[0].bonus_pct}% bonus rewards on top.`
        : 'After every milestone you publish, you unlock a richer offer — bonus rewards and a lower price per published link.',
    },
    {
      icon: Star,
      title: 'Elite & Partner Tiers',
      copy: milestoneTiers.length >= 3
        ? `${milestoneTiers[1].label} (${milestoneTiers[1].min_paid_links}+ links): ${milestoneTiers[1].discount_pct}% off & ${milestoneTiers[1].bonus_pct}% bonus. ${milestoneTiers[2].label} (${milestoneTiers[2].min_paid_links}+ links): ${milestoneTiers[2].discount_pct}% off & ${milestoneTiers[2].bonus_pct}% bonus rewards — the top tier.`
        : 'Higher tiers unlock bigger discounts and bigger bonus-reward percentages on every tier purchase.',
    },
  ];

  return (
    <section id="photographer-advantages" className="relative px-6 md:px-16 py-28 z-10" data-testid="photographer-advantages">
      <SectionHeader
        eyebrow="Photographer Panel · Advantages"
        title="Built for studios. Rewards that grow with you."
        kicker="Photographers who manage couples through MAJA unlock a separate luxury panel with bulk tools, branding controls and loyalty-based rewards."
      />

      {/* Live counters — populated from /api/public/photographer-stats */}
      {(stats.published_total != null || stats.photographers_total != null) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10"
          data-testid="photographer-live-stats"
        >
          {[
            { label: 'Weddings Published', value: stats.published_total },
            { label: 'Active Photographers', value: stats.photographers_total },
            { label: 'Loyalty Points', value: stats.bonus_credits_granted },
          ].map((s) => (
            <div key={s.label} className="lux-glass px-5 py-4 flex items-baseline gap-3" data-testid={`photographer-stat-${s.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <span className="font-display text-3xl text-gold">{s.value ?? '—'}</span>
              <span className="text-[11px] tracking-[0.2em] uppercase" style={{ color: 'var(--lux-text)' }}>{s.label}</span>
            </div>
          ))}
        </motion.div>
      )}

      <motion.div
        variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        data-testid="photographer-advantages-grid"
      >
        {advantages.map(({ icon: Icon, title, copy }, i) => (
          <motion.div
            key={title} variants={fadeUp} custom={i}
            className="lux-glass p-7 flex flex-col"
            whileHover={{ y: -6 }}
            data-testid={`photographer-advantage-${i}`}
          >
            <Icon className="w-7 h-7 text-gold mb-4" />
            <h3 className="font-display text-xl mb-2" style={{ color: 'var(--lux-text)' }}>{title}</h3>
            <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--lux-text)' }}>
              {copy}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* Real-tier loyalty banner — driven by live super-admin tier config */}
      <motion.div
        initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: [0.22,1,0.36,1] }}
        className="lux-glass mt-10 p-7 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5"
        style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(139,0,0,0.12))' }}
        data-testid="photographer-offer-banner"
      >
        <div className="flex-1">
          <div className="lux-eyebrow mb-2">◆ Loyalty Reward</div>
          {firstMilestone ? (
            <>
              <h3 className="font-display text-2xl md:text-3xl mb-2" style={{ color: 'var(--lux-text)' }}>
                Publish <span className="text-gold italic font-script">{firstMilestone.min_paid_links} {firstMilestone.min_paid_links === 1 ? 'invitation' : 'invitations'}</span>, unlock the <span className="text-gold">{firstMilestone.label}</span> tier.
              </h3>
              <p className="text-sm md:text-base mb-3" style={{ color: 'var(--lux-text)' }}>
                {milestoneTiers.length > 1 ? (
                  <>The Photographer Panel tracks every published link. Each milestone (
                    {milestoneTiers.map((t) => t.min_paid_links).join(' → ')}
                    ) unlocks a richer offer — bonus rewards, lower prices and exclusive themes.</>
                ) : (
                  <>The Photographer Panel tracks every published link. Crossing this milestone enables bonus rewards on every pack and a permanent discount.</>
                )}
              </p>
              <div className="flex flex-wrap gap-2 mt-2" data-testid="photographer-tier-chips">
                {milestoneTiers.map((t) => (
                  <span
                    key={t.key}
                    className="text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 rounded-full inline-flex items-center gap-2"
                    style={{
                      background: 'rgba(212,175,55,0.18)',
                      color: '#FFE38A',
                      border: '1px solid rgba(212,175,55,0.45)',
                    }}
                    data-testid={`photographer-tier-chip-${t.key}`}
                  >
                    {t.label} · {t.min_paid_links}+ links · {t.discount_pct}% off · +{t.bonus_pct}% bonus
                  </span>
                ))}
              </div>
            </>
          ) : (
            <h3 className="font-display text-2xl md:text-3xl mb-2" style={{ color: 'var(--lux-text)' }}>
              Loyalty tiers configured by your admin — sign in to see your status.
            </h3>
          )}
        </div>
        <button onClick={onPhotographer} className="lux-btn shrink-0" data-testid="photographer-panel-cta">
          Photographer Panel <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────
   FAQ — Frequently Asked Questions
   Clarifies the most common doubts: how the done-for-you build works,
   what's free vs paid, the photographer platform, multi-language,
   digital shagun, privacy and support.
   ────────────────────────────────────────────────────────────── */



export const CTA = ({ onLogin }) => (
  <section className="relative px-6 md:px-16 py-32 z-10">
    <motion.div
      initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      className="lux-glass relative overflow-hidden p-12 md:p-20 text-center"
      style={{ background: 'linear-gradient(135deg, rgba(139,0,0,0.25), rgba(212,175,55,0.08))', borderColor: 'var(--lux-border-strong)' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(600px 300px at 50% 0%, rgba(212,175,55,0.18), transparent 70%)' }} />
      <span className="lux-eyebrow block mb-4">◆ Begin Your Studio</span>
      <h2 className="font-display text-[2.6rem] md:text-[4.2rem] leading-[1.05] mb-6" style={{ color: 'var(--lux-text)' }}>
        Your next celebration deserves <span className="text-gold italic font-script">a masterpiece.</span>
      </h2>
      <p className="max-w-xl mx-auto text-[1.05rem] mb-9" style={{ color: 'var(--lux-text)' }}>
        Choose a design and share your details — our team builds and delivers your
        invitation link. Then send it on WhatsApp, email or SMS, and let the RSVPs,
        wishes and photos come to you.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <button onClick={onLogin} className="lux-btn" data-testid="footer-cta-login">
          Enter Studio <ArrowRight className="w-4 h-4" />
        </button>
        <a href="#themes" className="lux-btn lux-btn-ghost" data-testid="footer-cta-themes">View Themes</a>
      </div>

      {/* Homepage → discovery: crawlable internal links into the photographer
          directory + top category landing pages (SEO link mesh entry point). */}
      <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--lux-border)' }}>
        <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--lux-text-muted)' }}>
          Find a photographer
        </div>
        <div className="flex flex-wrap justify-center gap-2" data-testid="home-discovery-links">
          {[
            ['/photographers', 'All photographers'],
            ['/photographers/wedding', 'Wedding'],
            ['/photographers/candid', 'Candid'],
            ['/photographers/pre-wedding', 'Pre-wedding'],
            ['/photographers/videographer', 'Videographers'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="px-3 py-1.5 rounded-full text-xs no-underline"
              style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}>{label}</a>
          ))}
        </div>
      </div>
    </motion.div>
  </section>
);


const LandingPage = () => {
  const navigate = useNavigate();
  const { user, loading, logout, refresh } = useUserAuth();
  const [authModal, setAuthModal] = useState({ open: false, mode: 'login' });
  const [tourOpen, setTourOpen] = useState(false);
  const [userProfilesCount, setUserProfilesCount] = useState(0);
  // Honour `?signin=1&return=/user/buy-theme/<id>` so the "Buy this theme"
  // button on each card can ask unauthenticated users to sign in and then
  // bounce them straight to the purchase wizard.
  const [returnAfterLogin, setReturnAfterLogin] = useState(null);

  // "/" is the marketing LANDING before login and the product HOME after login.
  // We ONLY redirect a couple whose session is server-validated (UserAuthContext
  // resolves the httpOnly cookie). We deliberately do NOT redirect on a leftover
  // `admin_token` in localStorage: a stale/expired token was dumping every visitor
  // straight into the photographer panel. Photographers reach their panel from the
  // header ("Photographer") instead. A pending `return` (sign-in-then-buy) is left
  // alone so that flow still works.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('return')) return;
    if (!loading && user) navigate('/user/dashboard', { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  // Fetch the signed-in user's invitations count for the Studio Pulse card.
  useEffect(() => {
    if (!user) { setUserProfilesCount(0); return; }
    let cancelled = false;
    axios.get(`${API_URL}/api/users/profiles`, { withCredentials: true })
      .then((r) => { if (!cancelled) setUserProfilesCount((r.data?.profiles || []).length); })
      .catch(() => { if (!cancelled) setUserProfilesCount(0); });
    return () => { cancelled = true; };
  }, [user]);

  // On mount: if the URL is /?signin=1&return=..., open the auth modal.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('signin') === '1') {
      const ret = params.get('return') || '';
      // Same-origin guard: only honour relative paths.
      if (ret.startsWith('/') && !ret.startsWith('//')) setReturnAfterLogin(ret);
      setAuthModal({ open: true, mode: 'login' });
      // Clean the URL so refreshes don't keep re-opening the modal.
      const url = new URL(window.location.href);
      url.searchParams.delete('signin');
      url.searchParams.delete('return');
      window.history.replaceState({}, '', url.pathname + (url.search ? `?${url.searchParams}` : '') + url.hash);
    }
  }, []);

  // Once the user is signed in and a return path was captured, ship them there.
  useEffect(() => {
    if (user && returnAfterLogin) {
      const target = returnAfterLogin;
      setReturnAfterLogin(null);
      setAuthModal({ open: false, mode: 'login' });
      navigate(target);
    }
  }, [user, returnAfterLogin, navigate]);

  /**
   * Hero & CTA "Enter Studio" — open the NORMAL USER studio.
   *   - If user is signed in → go straight to /user/dashboard
   *   - Otherwise → open the user auth modal and remember to bounce to
   *     /user/dashboard right after sign-in.
   */
  const enterUserStudio = () => {
    if (user) { navigate('/user/dashboard'); return; }
    setReturnAfterLogin('/user/dashboard');
    setAuthModal({ open: true, mode: 'login' });
  };

  // Opens the auth modal for a non-wedding design click, remembering the
  // destination so the user lands on the celebration form after sign-in.
  const requireUserAuth = (returnPath) => {
    if (user) { navigate(returnPath); return; }
    setReturnAfterLogin(returnPath);
    setAuthModal({ open: true, mode: 'signup' });
  };

  return (
    <div className="luxe relative" style={{ minHeight: '100vh', overflow: 'visible' }} data-testid="landing-page">
      <Seo
        title="MAJA Invites — Done-for-You Digital Wedding & Celebration Invitations"
        description="Order a designed digital invitation for your wedding or celebration — with RSVP, guest wishes, a live photo gallery and QR check-in. Built for you and delivered as a link. Photographers welcome."
        path="/"
      />
      <Nav
        onLogin={() => navigate('/studio/login')}
        user={user}
        onOpenAuth={() => setAuthModal({ open: true, mode: 'login' })}
        onLogout={logout}
        onUserDashboard={() => navigate('/user/dashboard')}
      />
      <main id="main-content" tabIndex={-1}>
        <Hero onLogin={enterUserStudio} user={user} userProfilesCount={userProfilesCount} />
        <CelebrationMarquee />
        <BrowseRoots navigate={navigate} />
        {/* Photographers + their latest work. Renders nothing until studios post. */}
        <CommunityStrip />
        {/* The portfolio designs, on the page where the pitch actually happens.
            They were only reachable from a nav link before, so showing them in a
            live demo depended on the presenter remembering it was there. */}
        <PortfolioDesignsShowcase />
        <WhyMaja />
        <Stats />
        <CTA onLogin={enterUserStudio} />
      </main>
      <Footer onSuperAdmin={() => navigate('/super-admin/login')} />

      <UserAuthModal
        open={authModal.open}
        initialMode={authModal.mode}
        onClose={() => setAuthModal({ ...authModal, open: false })}
      />

      {/* Legacy credit-purchase modal removed — couples buy via design → cart now. */}

      <ScrollProgress />
      <CursorGlow />

      {/* Floating "How to create your link" help button — fixed bottom-right */}
      <div className="fixed bottom-5 right-5 z-40">
        <HelpTourTrigger
          onClick={() => setTourOpen(true)}
          label="How to create link"
          testId="homepage-help-tour-trigger"
        />
      </div>
      <HelpTour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        steps={HOMEPAGE_USER_STEPS}
        title="How to create your wedding link"
      />
    </div>
  );
};

export default LandingPage;
