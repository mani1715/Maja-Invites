import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import {
  Star, MapPin, Instagram, Facebook, Youtube, Globe, Phone, MessageCircle,
  BadgeCheck, X, ChevronLeft, ChevronRight, Loader2, Camera, Check, Award,
  Cpu, CalendarCheck, Sparkles, Crown, Aperture,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import '@/styles/luxury.css';
import { resolveDesign } from '@/data/portfolioDesigns';
import { getLayout, hasLayout } from '@/portfolioLayouts';
import LoadingFallback from '@/components/LoadingFallback';
import PortfolioSignature from '@/components/PortfolioSignature';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// ---- work media classification -------------------------------------------
// A portfolio "work" is a PHOTO, an uploaded VIDEO, or a YOUTUBE film. They are
// distinguished by fields (WorkIn): a photo has image_url; an uploaded video has
// video_url pointing at our /uploads path; a YouTube film has video_url pointing
// at youtube.com/youtu.be (added via the "YouTube link" button, which also sets
// thumbnail_url to img.youtube.com/...). The public showcase used to render EVERY
// work as <img src=image_url> — so videos & films (no image_url) showed a broken
// image icon with the title floating over it. These helpers fix that.
const ytId = (url) => {
  const m = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
};
const ytEmbed = (url) => {
  const id = ytId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
};
// "photo" | "video" | "film"(youtube)
const workKind = (w) => {
  if (w?.video_url && ytId(w.video_url)) return 'film';
  if (w?.video_url) return 'video';
  return 'photo';
};
// Best still image for a tile, whatever the work type.
const workPoster = (w) =>
  w?.thumbnail_url || w?.image_url ||
  (ytId(w?.video_url) ? `https://img.youtube.com/vi/${ytId(w.video_url)}/hqdefault.jpg` : '');

// #rrggbb → rgba(). Lets every ink shade derive from the design's own ink colour
// instead of being hard-coded light-on-dark.
const rgba = (hex, a) => {
  const h = String(hex || '#000').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * Depth3D — scroll-linked 3D reveal. Content starts pushed back and tipped away
 * in Z, then settles upright as it enters the viewport. Premium designs only
 * (`depth: true`), and always disabled for reduced-motion users.
 */
// True on phones / touch devices, where dozens of scroll-linked 3D transforms
// (one per section + photo) make the page lag. We keep the 3D on desktop and
// drop it here, matching how little of the depth effect is even visible on a
// small screen. Updates on resize/orientation.
function useLiteMotion() {
  const [lite, setLite] = useState(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(max-width: 820px)').matches || window.matchMedia('(pointer: coarse)').matches)
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 820px)');
    const on = () => setLite(mq.matches || window.matchMedia('(pointer: coarse)').matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
  }, []);
  return lite;
}

function Depth3D({ enabled, children, amount = 1, className = '', style }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const lite = useLiteMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 92%', 'center 58%'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [12 * amount, 0]);
  const z = useTransform(scrollYProgress, [0, 1], [-110 * amount, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [34 * amount, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.65], [0, 1]);

  if (!enabled || reduce || lite) {
    return <div ref={ref} className={className} style={style}>{children}</div>;
  }
  return (
    <div ref={ref} className={className} style={{ perspective: 1200, ...style }}>
      <motion.div style={{ rotateX, z, y, opacity, transformStyle: 'preserve-3d', willChange: 'transform' }}>
        {children}
      </motion.div>
    </div>
  );
}

// Relative luminance of a #rrggbb colour → is it a dark background?
const isDarkHex = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
};

/**
 * Tier THEMES — this is what visually separates the tiers. Premium reads as a
 * cinematic luxury microsite; Basic reads as a clean, honest starter card page.
 */
const THEMES = {
  premium: {
    pageBg: 'radial-gradient(1400px 500px at 50% -8%, rgba(212,175,55,0.28), transparent), #0B0805',
    accent: '#E8C97A',
    accentGrad: 'linear-gradient(135deg,#E8C97A,#D4AF37)',
    heroH: 'h-[52vh] md:h-[64vh]',
    nameSize: 'text-[2.4rem] md:text-[4rem]',
    card: 'lux-glass',
    cardBorder: '1px solid rgba(212,175,55,0.35)',
    eyebrowMark: '◆',
    decor: true,
    animate: true,
    label: { text: 'PREMIUM STUDIO', bg: 'linear-gradient(135deg,#E8C97A,#D4AF37)', fg: '#0E0A06', icon: Crown },
    galleryAspect: '4/5',
    font: 'font-display',
  },
  basic: {
    pageBg: '#12100C',
    accent: '#C9C2B4',
    accentGrad: 'rgba(201,194,180,0.18)',
    heroH: 'h-[26vh] md:h-[32vh]',
    nameSize: 'text-[1.7rem] md:text-[2.4rem]',
    card: 'rounded-xl',
    cardBorder: '1px solid rgba(255,255,255,0.10)',
    eyebrowMark: '—',
    decor: false,
    animate: false,
    label: { text: 'BASIC', bg: 'rgba(255,255,255,0.10)', fg: 'rgba(255,248,220,0.85)', icon: null },
    galleryAspect: '1/1',
    font: 'font-heading',
  },
};

function Stars({ value = 0, color = '#E8C97A' }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="w-4 h-4" fill={i < Math.round(value) ? color : 'none'} style={{ color }} />
      ))}
    </span>
  );
}

// tier-aware section wrapper: premium animates in + gold eyebrow; basic is static + plain.
function Section({ T, title, children, id }) {
  const inner = (
    <section id={id} className="space-y-4">
      {title && (
        <span className="block mb-4 text-[11px] tracking-[0.35em] uppercase" style={{ color: T.accent }}>
          {T.eyebrowMark} {title}
        </span>
      )}
      {children}
    </section>
  );
  // Premium (depth) designs get the cinematic 3D lift; others keep the simple fade.
  if (T.depth) return <Depth3D enabled>{inner}</Depth3D>;
  return T.animate ? (
    <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6 }}>{inner}</motion.div>
  ) : inner;
}

function WorkViewer({ studioId, work, onClose, onNav }) {
  const [detail, setDetail] = useState({ work, related: [] });
  useEffect(() => {
    let alive = true;
    if (String(work.id).startsWith('demo_')) { setDetail({ work, related: [] }); return; }
    axios.get(`${API_URL}/api/public/photographer/${studioId}/works/${work.id}`)
      .then(({ data }) => { if (alive) setDetail(data); }).catch(() => setDetail({ work, related: [] }));
    return () => { alive = false; };
  }, [studioId, work]);
  const w = detail.work || work;
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(6,4,2,0.94)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} data-testid="work-viewer">
      <button className="absolute top-5 right-5 z-10" onClick={onClose}><X className="w-6 h-6" style={{ color: '#FFF8DC' }} /></button>
      <button className="absolute left-4 top-1/2 -translate-y-1/2 z-10" onClick={(e) => { e.stopPropagation(); onNav(-1); }}><ChevronLeft className="w-8 h-8" style={{ color: 'rgba(255,248,220,0.7)' }} /></button>
      <button className="absolute right-4 top-1/2 -translate-y-1/2 z-10" onClick={(e) => { e.stopPropagation(); onNav(1); }}><ChevronRight className="w-8 h-8" style={{ color: 'rgba(255,248,220,0.7)' }} /></button>
      <div className="max-w-5xl w-full grid md:grid-cols-[1.4fr_1fr] gap-6" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl overflow-hidden" style={{ background: '#000' }}>
          {ytEmbed(w.video_url)
            ? <div className="w-full" style={{ aspectRatio: '16/9' }}>
                <iframe src={`${ytEmbed(w.video_url)}?rel=0`} title={w.title || 'Film'}
                  className="w-full h-full" style={{ border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen />
              </div>
            : w.video_url
              ? <video src={w.video_url} controls poster={w.thumbnail_url} className="w-full max-h-[80vh]" />
              : <img src={w.image_url} alt={w.title} className="w-full max-h-[80vh] object-contain" />}
        </div>
        <div className="text-sm space-y-3" style={{ color: 'rgba(255,248,220,0.9)' }}>
          <h2 className="font-display text-2xl" style={{ color: '#FFF8DC' }}>{w.title}</h2>
          {w.event_category && <span className="text-xs uppercase tracking-widest" style={{ color: '#E8C97A' }}>{w.event_category}</span>}
          {w.description && <p>{w.description}</p>}
          <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'rgba(255,248,220,0.7)' }}>
            {w.date && <div><b>Date</b><br />{w.date}</div>}
            {w.venue && <div><b>Venue</b><br />{w.venue}</div>}
            {w.location && <div><b>Location</b><br />{w.location}</div>}
            {w.camera && <div><b>Camera</b><br />{w.camera}</div>}
            {w.lens && <div><b>Lens</b><br />{w.lens}</div>}
            {w.settings && <div><b>Settings</b><br />{w.settings}</div>}
          </div>
          {w.story && <p className="italic">{w.story}</p>}
          {detail.related?.length > 0 && (
            <div>
              <span className="text-xs uppercase tracking-widest block mb-2 mt-4" style={{ color: '#E8C97A' }}>Related work</span>
              <div className="grid grid-cols-3 gap-2">
                {detail.related.map((r) => (
                  <img key={r.id} src={r.image_url} alt={r.title} loading="lazy" className="rounded-lg object-cover cursor-pointer" style={{ aspectRatio: '1' }} onClick={() => onNav(0, r)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function PublicPhotographerProfile() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [viewer, setViewer] = useState(null);
  const lite = useLiteMotion();   // phones: skip heavy ambient/scroll motion — must run before any early return (rules of hooks)

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await axios.get(`${API_URL}/api/public/photographer/${id}/portfolio`)).data); }
    catch (e) { setErr(true); }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Per-profile SEO: title / description / OpenGraph so studios are indexable + shareable.
  useEffect(() => {
    if (!data) return;
    const st = data.studio || {};
    const p = data.profile || {};
    const loc = p.location || {};
    const place = [loc.city, loc.state].filter(Boolean).join(', ');
    const name = st.name || 'Photographer';
    const title = `${name}${place ? ` · ${place}` : ''} — Wedding Photography Portfolio`;
    const desc = (p.cover_description || p.about || p.tagline
      || `${name}'s wedding photography portfolio${place ? ` in ${place}` : ''}. View work, reviews and book on MAJA Invites.`).slice(0, 160);
    const img = p.hero_image || p.avatar || (data.featured?.[0]?.image_url) || '';
    document.title = title;
    const setMeta = (sel, attr, val) => {
      if (!val) return;
      let m = document.head.querySelector(sel);
      if (!m) { m = document.createElement('meta'); const [a, v] = attr; m.setAttribute(a, v); document.head.appendChild(m); }
      m.setAttribute('content', val);
    };
    setMeta('meta[name="description"]', ['name', 'description'], desc);
    setMeta('meta[property="og:title"]', ['property', 'og:title'], title);
    setMeta('meta[property="og:description"]', ['property', 'og:description'], desc);
    setMeta('meta[property="og:type"]', ['property', 'og:type'], 'profile');
    setMeta('meta[property="og:url"]', ['property', 'og:url'], window.location.href);
    if (img) setMeta('meta[property="og:image"]', ['property', 'og:image'], img);
    setMeta('meta[name="twitter:card"]', ['name', 'twitter:card'], img ? 'summary_large_image' : 'summary');
    // Analytics: record a portfolio view (fire-and-forget, no auth needed)
    axios.post(`${API_URL}/api/track`, { type: 'portfolio_view', target_type: 'portfolio', target_id: st.slug || id }).catch(() => {});
    return () => { document.title = 'MAJA Invites'; };
  }, [data, id]);

  if (loading) return <div className="min-h-screen grid place-items-center" style={{ background: '#0B0805' }}><Loader2 className="w-8 h-8 animate-spin" style={{ color: '#E8C97A' }} /></div>;
  if (err || !data) return <div className="min-h-screen grid place-items-center" style={{ background: '#0B0805', color: '#FFF8DC' }}>Photographer not found.</div>;

  const { studio, profile, seo, works, featured, testimonials, rating, review_count, by_category, tier, sections, design_id, white_label: wl } = data;
  // Every colour now comes from the design's own token set — the renderer no
  // longer guesses. resolveDesign() always returns a complete design (falling
  // back to the right default for the studio's plan), so a light template is
  // rendered light with dark ink instead of being forced onto a black page.
  const design = resolveDesign(design_id, tier);

  // LAYOUT designs render the whole page themselves and never reach the token
  // renderer below. Everything after this point paints from bg/ink/accent/…,
  // which cannot express a design whose layout IS the design (asymmetric grid,
  // films, reels, availability calendar). Lazy so each layout stays its own
  // chunk — importing them all statically would repeat the theme-chunk mistake
  // of shipping nine unused designs to every visitor.
  if (design.layout && hasLayout(design.layout)) {
    const Layout = getLayout(design.layout);
    return (
      <React.Suspense fallback={<LoadingFallback />}>
        <Layout
          profile={{ ...profile, ...studio, is_demo: profile?.is_demo || studio?.is_demo }}
          works={works || []}
          testimonials={testimonials || []}
        />
      </React.Suspense>
    );
  }

  const light = !isDarkHex(design.bg);
  // `lux` = the grand premium treatment (big hero, masonry gallery, ambient
  // glow, wider spacing). Driven by the design's depth flag so it works on a
  // LIGHT ground — the old code keyed it off darkness, which light designs never
  // satisfy, so premium silently lost its grandeur.
  const lux = !!design.depth;
  const accent = wl?.accent_color || design.accent;   // white-label wins
  const baseT = THEMES[tier === 'premium' ? 'premium' : 'basic'];
  const T = {
    ...baseT,
    accent,
    accentGrad: `linear-gradient(135deg, ${accent}, ${accent})`,
    pageBg: `radial-gradient(1400px 520px at 50% -8%, ${accent}1F, transparent), ${design.bg}`,
    card: 'rounded-xl',
    cardBorder: `1px solid ${design.line}`,
    decor: !light && tier === 'premium',
    depth: !!design.depth,          // 3D scroll motion (premium designs)
  };
  const ink   = design.ink;
  const ink90 = rgba(design.ink, 0.92);
  const ink85 = rgba(design.ink, 0.86);
  const ink80 = rgba(design.ink, 0.80);
  const ink70 = rgba(design.ink, 0.68);
  const ink55 = rgba(design.ink, 0.55);
  const ink40 = rgba(design.ink, 0.42);
  const heroFade = design.bg;
  const cardPanel = design.surface;
  const has = (s) => (sections || []).includes(s);
  // Individual (freelance) layout vs the original studio layout. Same design,
  // 3D and tier gates — a different section set.
  const isIndividual = (profile?.portfolio_type || 'studio') === 'individual';
  const social = profile?.social || {};
  const loc = profile?.location || {};
  const stats = profile?.statistics || {};
  const LabelIcon = T.label.icon;
  const openViewer = (workId) => { const i = works.findIndex((w) => w.id === workId); if (i >= 0) setViewer(i); };
  const navViewer = (dir, explicit) => {
    if (explicit) { const i = works.findIndex((w) => w.id === explicit.id); if (i >= 0) setViewer(i); return; }
    setViewer((v) => (v == null ? v : (v + dir + works.length) % works.length));
  };
  const card = (extra = '') => T.card + ' ' + extra;
  // Premium cards sit on a soft elevated shadow tinted with the accent — the
  // little detail that reads as "luxury" on a light ground.
  const cardStyle = {
    border: T.cardBorder,
    ...(cardPanel ? { background: cardPanel } : {}),
    ...(lux ? { boxShadow: `0 20px 44px -26px ${rgba(accent, 0.45)}, 0 2px 6px -2px ${rgba(design.ink, 0.06)}` } : {}),
  };

  return (
    // NOTE: intentionally NOT using the `min-h-screen` class — a global
    // `.luxe .min-h-screen { background: transparent !important; color: var(--lux-ivory) !important }`
    // rule overrides this design's light background + dark ink and forces the
    // dark app shell to show through (the long-standing "black body" bug).
    // Inline min-height avoids that selector entirely.
    <div className="relative" data-pf data-tier={tier}
      style={{ minHeight: '100vh', background: T.pageBg, fontFamily: design.body, color: ink }}>

      {/* SEO — what Google reads. Present only for a PREMIUM studio (the backend
          returns `seo` for premium only). Title + description + Open Graph make
          the search snippet; the JSON-LD LocalBusiness block is the structured
          data Google uses for a local-business result. */}
      {seo && (
        <Helmet>
          <title>{seo.title}</title>
          <meta name="description" content={seo.description} />
          {seo.keywords?.length > 0 && <meta name="keywords" content={seo.keywords.join(', ')} />}
          {seo.canonical && <link rel="canonical" href={seo.canonical} />}
          <meta property="og:type" content="website" />
          <meta property="og:title" content={seo.title} />
          <meta property="og:description" content={seo.description} />
          {seo.canonical && <meta property="og:url" content={seo.canonical} />}
          {seo.og_image && <meta property="og:image" content={seo.og_image} />}
          <meta name="twitter:card" content="summary_large_image" />
          {seo.json_ld && <script type="application/ld+json">{JSON.stringify(seo.json_ld)}</script>}
        </Helmet>
      )}

      {/* The chosen design owns the typography, not the global lux theme. */}
      <style>{`[data-pf] .font-display,[data-pf] .font-heading,[data-pf] h1,[data-pf] h2,[data-pf] h3{font-family:${design.heading};}`}</style>
      {/* The design's signature background motif (sunlight / grain / horizon /
          gallery dust-motes / filmstrip rails / glass tints / aurora field). */}
      <PortfolioSignature signature={design.signature} accent={accent} dark={!!design.dark} lite={lite} />

      {/* HERO */}
      <div className="relative">
        <div className={`${T.heroH} w-full overflow-hidden`}>
          {profile?.hero_image ? <img src={profile.hero_image} alt="" className="w-full h-full object-cover" style={{ opacity: light ? 0.9 : 0.7 }} />
            : <div className="w-full h-full" style={{ background: `radial-gradient(1200px 460px at 50% -10%, ${rgba(design.accent, 0.22)}, transparent 62%), ${design.bg}` }} />}
          <div className="absolute inset-0" style={{ background: `linear-gradient(transparent, ${heroFade})` }} />
        </div>
        <div className={`max-w-[1100px] mx-auto px-6 relative z-10 pb-8 ${lux ? '-mt-28' : '-mt-14'}`}>
          <div className="flex flex-wrap items-end gap-6">
            <div className={`${lux ? 'w-32 h-32' : 'w-20 h-20'} rounded-2xl overflow-hidden shrink-0`} style={{ border: `2px solid ${rgba(accent, 0.5)}`, background: design.surface }}>
              {profile?.avatar ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center"><Camera className="w-7 h-7 opacity-40" /></div>}
            </div>
            <div className="flex-1 min-w-[240px]">
              {/* tier badge — the loud visual signal */}
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] px-2.5 py-1 rounded-full mb-2"
                style={{ background: T.label.bg, color: T.label.fg }} data-testid="tier-badge">
                {LabelIcon && <LabelIcon className="w-3 h-3" />} {T.label.text}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={`${T.font} ${T.nameSize}`} style={{ color: ink }}>{studio?.name}</h1>
                {(studio?.verified || studio?.verified_level > 0) && (() => {
                  const vc = { 1: '#4FA3FF', 2: '#3ECf8E', 3: '#E8C97A', 4: '#C08CFF' };
                  const vl = { 1: 'Verified Photographer', 2: 'Verified Studio', 3: 'Premium Studio', 4: 'Elite Pixora Professional' };
                  const lv = studio?.verified_level || 0;
                  return (
                    <span className="inline-flex items-center gap-1" title={vl[lv] || 'Verified'}>
                      <BadgeCheck className="w-6 h-6" style={{ color: vc[lv] || '#4FA3FF' }} />
                      {lv > 0 && <span className="text-[11px]" style={{ color: vc[lv] }}>{vl[lv]}</span>}
                    </span>
                  );
                })()}
              </div>
              {isIndividual && profile?.professional_title && (
                <p className="mt-1 text-sm font-medium tracking-wide" style={{ color: ink90 }}>{profile.professional_title}</p>
              )}
              {studio?.slug && (
                <a href={`/p/${studio.slug}`} data-testid="link-pixora-profile"
                  className="inline-block mt-1 text-xs underline" style={{ color: ink90 }}>
                  View Pixora community profile →
                </a>
              )}
              {profile?.tagline && <p className={`mt-1 ${lux ? 'text-base italic font-script' : 'text-sm'}`} style={{ color: T.accent }}>{profile.tagline}</p>}
              {/* premium: a short gilded rule under the name/tagline */}
              {lux && <div className="mt-3 mb-1" style={{ width: 96, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${accent}, ${rgba(accent, 0)})` }} />}
              <div className="flex items-center gap-4 mt-2 text-sm flex-wrap" style={{ color: ink80 }}>
                {(loc.city || loc.state) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[loc.city, loc.state].filter(Boolean).join(', ')}</span>}
                {profile?.experience_years ? <span>{profile.experience_years}+ yrs</span> : null}
                {isIndividual && profile?.travel_availability && <span>· {profile.travel_availability}</span>}
                {rating != null && <span className="flex items-center gap-1"><Stars value={rating} color={T.accent} /> {rating} ({review_count})</span>}
              </div>
            </div>
            <a href={social.whatsapp || '#contact'} target={social.whatsapp ? '_blank' : undefined} rel="noreferrer"
              className="px-5 py-2.5 rounded-full text-sm font-medium flex items-center gap-2"
              style={{ background: T.accentGrad, color: design.accentInk || '#FFFFFF' }}>
              <MessageCircle className="w-4 h-4" /> Book now
            </a>
          </div>
          {profile?.cover_description && <p className="mt-5 max-w-2xl text-sm" style={{ color: ink80 }}>{profile.cover_description}</p>}
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 pb-24 relative z-10" style={{ display: 'flex', flexDirection: 'column', gap: lux ? '3.5rem' : '2rem' }}>
        {has('about') && profile?.about && <Section T={T} title={isIndividual ? 'About Me' : 'About Our Studio'}><p className="max-w-2xl" style={{ color: ink85 }}>{profile.about}</p></Section>}
        {has('journey') && profile?.journey && <Section T={T} title={isIndividual ? 'My Photography Journey' : 'Our Journey'}><p className="max-w-2xl" style={{ color: ink85 }}>{profile.journey}</p></Section>}

        {/* Past Works — the studio's curated best (up to 5), near the top. */}
        {(profile?.past_works || []).filter((w) => w?.image).length > 0 && (
          <Section T={T} title="Past Works" id="past-works">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="public-past-works">
              {profile.past_works.filter((w) => w?.image).slice(0, 5).map((w, i) => (
                <figure key={i} className="rounded-xl overflow-hidden" style={{ background: cardPanel, border: T.cardBorder }}
                  data-testid={`public-past-work-${i}`}>
                  <img src={w.image} alt={w.title || `Past work ${i + 1}`} loading="lazy"
                    className="w-full object-cover" style={{ aspectRatio: '4 / 3' }} />
                  {(w.title || w.caption) && (
                    <figcaption className="p-3">
                      {w.title && <div className="text-sm font-medium" style={{ color: ink90 }}>{w.title}</div>}
                      {w.caption && <div className="text-xs mt-0.5" style={{ color: ink80 }}>{w.caption}</div>}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </Section>
        )}

        {/* ─────────── Individual-photographer sections (freelance layout) ─────────── */}
        {isIndividual && (profile?.skills || []).length > 0 && (
          <Section T={T} title="Skills & Expertise">
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s) => (
                <span key={s} className="px-3 py-1.5 rounded-full text-xs" style={{ background: `${T.accent}1f`, color: T.accent }}>{s}</span>
              ))}
            </div>
          </Section>
        )}
        {isIndividual && (profile?.styles || []).length > 0 && (
          <Section T={T} title="Featured Style Tags">
            <div className="flex flex-wrap gap-2">
              {profile.styles.map((s) => (
                <span key={s} className="px-3 py-1.5 rounded-full text-xs" style={{ background: cardPanel, border: T.cardBorder, color: ink85 }}>{s}</span>
              ))}
            </div>
          </Section>
        )}
        {/* Gear collections — Premium (gated like studio equipment) */}
        {isIndividual && has('equipment') && (
          (profile?.camera_gear || []).length + (profile?.lens_gear || []).length +
          (profile?.drone_gear || []).length + (profile?.editing_software || []).length > 0
        ) && (
          <Section T={T} title="Equipment & Gear">
            <div className="grid sm:grid-cols-2 gap-4">
              {[['Camera Collection', profile.camera_gear, Camera], ['Lens Collection', profile.lens_gear, Aperture],
                ['Drone Equipment', profile.drone_gear, Cpu], ['Editing Software', profile.editing_software, Cpu]]
                .filter(([, arr]) => (arr || []).length > 0)
                .map(([label, arr, Icon]) => (
                  <div key={label} className={card('p-4')} style={cardStyle}>
                    <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wide" style={{ color: T.accent }}>
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {arr.map((g) => <span key={g} className="text-xs px-2 py-1 rounded-md" style={{ background: `${T.accent}14`, color: ink85 }}>{g}</span>)}
                    </div>
                  </div>
                ))}
            </div>
          </Section>
        )}
        {/* Certifications — Premium (gated like awards) */}
        {isIndividual && has('awards') && (profile?.certifications || []).length > 0 && (
          <Section T={T} title="Certifications">
            <div className="grid sm:grid-cols-2 gap-3">
              {profile.certifications.map((c) => (
                <div key={c} className={card('p-4 flex items-center gap-2 text-sm')} style={cardStyle}>
                  <BadgeCheck className="w-4 h-4" style={{ color: T.accent }} /><span style={{ color: ink85 }}>{c}</span>
                </div>
              ))}
            </div>
          </Section>
        )}
        {/* Before & After editing showcase — Premium */}
        {isIndividual && has('equipment') && (profile?.before_after || []).length > 0 && (
          <Section T={T} title="Before & After Editing">
            <div className="grid sm:grid-cols-2 gap-4">
              {profile.before_after.map((ba, i) => (
                <Depth3D key={i} enabled={T.depth} amount={i % 2 ? 1.2 : 0.8}>
                  <div className={card('overflow-hidden')} style={cardStyle}>
                    <div className="grid grid-cols-2">
                      <div className="relative aspect-[4/5]"><img src={ba.before} alt="Before" loading="lazy" className="w-full h-full object-cover" /><span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>Before</span></div>
                      <div className="relative aspect-[4/5]"><img src={ba.after} alt="After" loading="lazy" className="w-full h-full object-cover" /><span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full" style={{ background: T.accent, color: light ? '#241a10' : '#0E0A06' }}>After</span></div>
                    </div>
                    {ba.label && <div className="px-3 py-2 text-xs" style={{ color: ink80 }}>{ba.label}</div>}
                  </div>
                </Depth3D>
              ))}
            </div>
          </Section>
        )}

        {!isIndividual && has('statistics') && (
          <Section T={T} title="Our Achievements">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[['Events Covered', stats.events_covered], ['Happy Clients', stats.happy_clients], ['Photos Delivered', stats.photos_delivered], ['Years Experience', stats.years_experience]].map(([l, v]) => (
                <div key={l} className={card('p-5 text-center')} style={cardStyle}>
                  <div className="font-display text-3xl" style={{ color: T.accent }}>{Number(v || 0).toLocaleString('en-IN')}+</div>
                  <div className="text-xs mt-1 tracking-wide uppercase" style={{ color: ink70 }}>{l}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {has('services') && (profile?.services || []).length > 0 && (
          <Section T={T} title="Services">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {profile.services.map((s) => (
                <div key={s} className="flex items-center gap-2 text-sm" style={{ color: ink85 }}>
                  <Check className="w-4 h-4" style={{ color: T.accent }} /> {s}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Booking details — the answers a couple would otherwise have to phone for.
            Rendered whenever the studio has filled at least one of them, so an
            older profile that has none simply doesn't show the block. */}
        {(() => {
          const facts = [
            ['Team on a shoot', profile?.team_size ? `${profile.team_size} people` : ''],
            ['Photos delivered in', profile?.delivery_days ? `${profile.delivery_days} days` : ''],
            ['Booking advance', profile?.advance_percent ? `${profile.advance_percent}%` : ''],
            ['Working since', profile?.working_since || ''],
            ['Travel', profile?.travel_policy || ''],
            ['Invoicing', profile?.gst_registered ? 'GST registered' : ''],
          ].filter(([, v]) => v !== '' && v != null);
          const lists = [
            ['Shoot types', profile?.shoot_types],
            ['Ceremonies covered', profile?.religions_covered],
            ['Add-ons offered', profile?.add_ons],
            ['Payments accepted', profile?.payment_modes],
          ].filter(([, v]) => (v || []).length > 0);
          if (!facts.length && !lists.length && !profile?.cancellation_policy) return null;
          return (
            <Section T={T} title="Booking Details" id="booking">
              {facts.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {facts.map(([l, v]) => (
                    <div key={l} className={card('p-4')} style={cardStyle}>
                      <div className="text-[11px] tracking-wide uppercase" style={{ color: ink70 }}>{l}</div>
                      <div className="text-base mt-1" style={{ color: ink85 }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
              {lists.map(([l, vals]) => (
                <div key={l} className="mt-4">
                  <div className="text-[11px] tracking-wide uppercase mb-2" style={{ color: ink70 }}>{l}</div>
                  <div className="flex flex-wrap gap-2">
                    {vals.map((v) => (
                      <span key={v} className="px-3 py-1.5 rounded-full text-xs"
                        style={{ color: ink85, border: `1px solid ${rgba(design.ink, 0.18)}` }}>{v}</span>
                    ))}
                  </div>
                </div>
              ))}
              {profile?.cancellation_policy && (
                <div className="mt-4">
                  <div className="text-[11px] tracking-wide uppercase mb-1" style={{ color: ink70 }}>
                    Cancellation &amp; reschedule
                  </div>
                  <p className="max-w-2xl text-sm" style={{ color: ink85 }}>{profile.cancellation_policy}</p>
                </div>
              )}
            </Section>
          );
        })()}

        {has('featured_work') && featured?.length > 0 && (() => {
          // Group the showcase by media type so the page reads: Photographs,
          // then Films & Reels (uploaded videos + YouTube). Each work renders
          // with the CORRECT element — a video/film is no longer forced through
          // <img> (which broke as a missing-image icon).
          const photos = featured.filter((w) => workKind(w) === 'photo');
          const films = featured.filter((w) => workKind(w) !== 'photo');

          // One tile — a still (photo poster / video thumbnail / YouTube thumb)
          // with a play badge for anything playable. Click opens the viewer.
          const Tile = ({ w, wide }) => {
            const kind = workKind(w);
            const poster = workPoster(w);
            return (
              <button onClick={() => openViewer(w.id)}
                className="relative rounded-xl overflow-hidden group w-full h-full block"
                style={{ aspectRatio: T.galleryAspect || '4/5' }}>
                {poster
                  ? <img src={poster} alt={w.title} loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  : <video src={w.video_url} muted playsInline preload="metadata"
                      className="w-full h-full object-cover" />}
                {kind !== 'photo' && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="w-14 h-14 rounded-full grid place-items-center"
                      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
                      <span style={{ marginLeft: 3, borderStyle: 'solid',
                        borderWidth: '10px 0 10px 16px',
                        borderColor: 'transparent transparent transparent #FFF8DC' }} />
                    </span>
                  </span>
                )}
                {kind === 'film' && (
                  <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#FFF8DC' }}>
                    <Youtube className="w-3 h-3" /> Film
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 p-3 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'linear-gradient(transparent,rgba(0,0,0,0.8))', color: '#FFF8DC' }}>{w.title}</div>
                {w.is_placeholder && <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.5)', color: T.accent }}>SAMPLE</span>}
              </button>
            );
          };

          // Horizontal, scroll-snap strip: photos "slide" sideways, each tile
          // rising out of Z (Depth3D) on premium designs for the 3D-slide feel.
          const Strip = ({ items, label }) => (
            items.length === 0 ? null : (
              <div className="mb-8">
                <div className="lux-eyebrow mb-3" style={{ color: T.accent }}>◆ {label}</div>
                <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory"
                  style={{ scrollbarWidth: 'thin' }}>
                  {items.map((w, i) => (
                    <div key={w.id} className="snap-start shrink-0 w-[240px] md:w-[300px]">
                      <Depth3D enabled={T.depth} amount={i % 2 ? 1.15 : 0.7}>
                        <Tile w={w} />
                      </Depth3D>
                    </div>
                  ))}
                </div>
              </div>
            )
          );

          return (
            <Section T={T} title="Portfolio Showcase">
              <Strip items={photos} label="Photographs" />
              <Strip items={films} label="Films &amp; Reels" />
            </Section>
          );
        })()}

        {has('featured_work') && Object.entries(by_category || {}).filter(([, arr]) => arr.length > 0).map(([cat, arr]) => (
          <Section T={T} title={cat} key={cat}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {arr.map((w) => {
                const poster = workPoster(w);
                return (
                  <button key={w.id} onClick={() => openViewer(w.id)} className="relative rounded-xl overflow-hidden group" style={{ aspectRatio: '3/4' }}>
                    {poster
                      ? <img src={poster} alt={w.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      : <video src={w.video_url} muted playsInline preload="metadata" className="w-full h-full object-cover" />}
                    {workKind(w) !== 'photo' && (
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="w-12 h-12 rounded-full grid place-items-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
                          <span style={{ marginLeft: 3, borderStyle: 'solid', borderWidth: '8px 0 8px 13px', borderColor: 'transparent transparent transparent #FFF8DC' }} />
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        ))}

        {!isIndividual && has('why_choose_us') && (profile?.why_choose_us || []).length > 0 && (
          <Section T={T} title="Why Clients Choose Us">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {profile.why_choose_us.map((p) => (
                <div key={p} className={card('p-4 flex items-center gap-2 text-sm')} style={cardStyle}>
                  <Check className="w-4 h-4 shrink-0" style={{ color: T.accent }} /> <span style={{ color: ink85 }}>{p}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {has('testimonials') && testimonials?.length > 0 && (
          <Section T={T} title="What Our Clients Say">
            <div className="grid md:grid-cols-2 gap-4">
              {testimonials.map((t) => (
                <div key={t.id} className={card('p-5')} style={cardStyle}>
                  <Stars value={t.rating} color={T.accent} />
                  <p className="mt-3 text-sm" style={{ color: ink90 }}>“{t.text}”</p>
                  <p className="mt-2 text-xs" style={{ color: T.accent }}>— {t.author}{t.is_placeholder ? ' (sample)' : ''}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {!isIndividual && has('equipment') && (profile?.equipment || []).length > 0 && (
          <Section T={T} title="Professional Equipment">
            <div className="flex flex-wrap gap-2">
              {profile.equipment.map((e) => <span key={e} className="px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5" style={{ background: `${T.accent}1f`, color: T.accent }}><Cpu className="w-3 h-3" />{e}</span>)}
            </div>
          </Section>
        )}

        {has('awards') && (profile?.awards || []).length > 0 && (
          <Section T={T} title="Achievements & Recognition">
            <div className="grid md:grid-cols-3 gap-3">
              {profile.awards.map((a) => <div key={a} className={card('p-4 flex items-center gap-2 text-sm')} style={cardStyle}><Award className="w-4 h-4" style={{ color: T.accent }} /><span style={{ color: ink85 }}>{a}</span></div>)}
            </div>
          </Section>
        )}

        {!isIndividual && has('booking_process') && (profile?.booking_process || []).length > 0 && (
          <Section T={T} title="How To Book">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {profile.booking_process.map((step, i) => (
                <div key={step} className={card('p-4 text-center')} style={cardStyle}>
                  <div className="font-display text-2xl" style={{ color: T.accent }}>{i + 1}</div>
                  <div className="text-xs mt-1" style={{ color: ink85 }}>{step}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {has('availability') && (
          <Section T={T} title="Availability">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm" style={{ background: 'rgba(67,209,122,0.14)', color: '#7fe0a3' }}>
              <CalendarCheck className="w-4 h-4" /> {profile?.availability_status || 'Available'}
            </span>
          </Section>
        )}

        {!isIndividual && has('special_feature') && profile?.special_feature?.content && (
          <div className={card('p-8 text-center')} style={cardStyle}>
            <Sparkles className="w-6 h-6 mx-auto mb-3" style={{ color: T.accent }} />
            <h3 className="font-display text-2xl" style={{ color: ink }}>{profile.special_feature.heading}</h3>
            <p className="max-w-2xl mx-auto mt-3 text-sm" style={{ color: ink80 }}>{profile.special_feature.content}</p>
            <p className="mt-4 font-script text-xl italic" style={{ color: T.accent }}>{profile.special_feature.cta}</p>
          </div>
        )}

        {tier === 'premium' && (profile?.team_members || []).length > 0 && (
          <Section T={T} title="Our Team">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {profile.team_members.map((m, i) => (
                <div key={i} className={card('p-4')} style={cardStyle} data-testid={`team-member-${i}`}>
                  <div className="font-heading text-base" style={{ color: ink }}>{m.name}</div>
                  {m.role && <div className="text-xs mt-0.5" style={{ color: T.accent }}>{m.role}</div>}
                  {m.portfolio_link && (
                    <a href={m.portfolio_link} target="_blank" rel="noreferrer"
                      className="text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: ink70 }}>
                      View portfolio →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Studio Photos — the space / behind the scenes. */}
        {(profile?.studio_photos || []).filter((p) => p?.image).length > 0 && (
          <Section T={T} title="Our Studio" id="studio-photos">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="public-studio-photos">
              {profile.studio_photos.filter((p) => p?.image).slice(0, 12).map((p, i) => (
                <figure key={i} className="rounded-xl overflow-hidden" style={{ background: cardPanel, border: T.cardBorder }}>
                  <img src={p.image} alt={p.caption || `Studio ${i + 1}`} loading="lazy"
                    className="w-full object-cover" style={{ aspectRatio: '1 / 1' }} />
                  {p.caption && <figcaption className="p-2 text-[11px]" style={{ color: ink80 }}>{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </Section>
        )}

        {/* FAQ — the questions couples search for (also good for SEO). */}
        {(profile?.faqs || []).filter((f) => f?.q).length > 0 && (
          <Section T={T} title="Frequently Asked Questions" id="faq">
            <div className="space-y-3 max-w-3xl" data-testid="public-faqs">
              {profile.faqs.filter((f) => f?.q).slice(0, 15).map((f, i) => (
                <div key={i} className="rounded-xl p-4" style={{ background: cardPanel, border: T.cardBorder }}>
                  <div className="text-sm font-medium" style={{ color: ink90 }}>{f.q}</div>
                  {f.a && <div className="text-sm mt-1.5" style={{ color: ink80 }}>{f.a}</div>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Address + Get Directions — local trust + a one-tap Google Maps route. */}
        {(() => {
          const a = profile?.address || {};
          const loc = profile?.location || {};
          const line = [a.full_address, a.landmark, a.city || loc.city, a.district, a.state || loc.state, a.pincode]
            .filter(Boolean).join(', ');
          const dir = seo?.directions_url || a.maps_url || loc.maps_url;
          if (!line && !dir) return null;
          return (
            <Section T={T} title="Visit Us" id="address">
              {line && <p className="text-sm max-w-2xl" style={{ color: ink85 }} data-testid="public-address">{line}</p>}
              {profile?.business_hours && (
                <p className="text-xs mt-1" style={{ color: ink80 }} data-testid="public-hours">{profile.business_hours}</p>
              )}
              {dir && (
                <a href={dir} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full text-sm"
                  style={{ background: T.accent, color: light ? '#fff' : '#16110C', textDecoration: 'none', fontWeight: 600 }}
                  data-testid="public-get-directions">
                  <MapPin className="w-4 h-4" /> Get Directions
                </a>
              )}
            </Section>
          );
        })()}

        {has('contact') && (
          <Section T={T} title="Get In Touch" id="contact">
            <div className="grid md:grid-cols-2 gap-6 items-start">
              <div className="flex flex-col gap-3">
                <p className="text-sm max-w-md" style={{ color: ink80 }}>
                  Send an enquiry and {isIndividual ? 'I’ll' : 'we’ll'} get back to you. It lands straight in the studio’s enquiries — no third party.
                </p>
                <div className="flex flex-wrap gap-4 items-center">
                  {profile?.contact?.phone && <a href={`tel:${profile.contact.phone}`} className="flex items-center gap-2 text-sm" style={{ color: ink85 }}><Phone className="w-4 h-4" style={{ color: T.accent }} /> {profile.contact.phone}</a>}
                  {social.whatsapp && <a href={social.whatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm" style={{ color: ink85 }}><MessageCircle className="w-4 h-4" style={{ color: T.accent }} /> WhatsApp</a>}
                  {social.instagram && <a href={social.instagram} target="_blank" rel="noreferrer"><Instagram className="w-5 h-5" style={{ color: T.accent }} /></a>}
                  {social.facebook && <a href={social.facebook} target="_blank" rel="noreferrer"><Facebook className="w-5 h-5" style={{ color: T.accent }} /></a>}
                  {social.youtube && <a href={social.youtube} target="_blank" rel="noreferrer"><Youtube className="w-5 h-5" style={{ color: T.accent }} /></a>}
                  {social.website && <a href={social.website} target="_blank" rel="noreferrer"><Globe className="w-5 h-5" style={{ color: T.accent }} /></a>}
                </div>
              </div>
              <EnquiryForm studioId={id} accent={T.accent} accentGrad={T.accentGrad}
                accentInk={design.accentInk || '#0E0A06'} ink85={ink85} ink55={ink55}
                cardPanel={cardPanel} cardBorder={T.cardBorder} />
            </div>
          </Section>
        )}

        {/* Discover More — crawlable internal links from this portfolio into the
            directory + the studio's city/category discovery pages, completing the
            SEO link mesh (portfolio → discovery → other portfolios). */}
        {(() => {
          const a = profile?.address || {};
          const loc2 = profile?.location || {};
          const cityRaw = a.city || loc2.city || (profile?.coverage_areas || [])[0] || '';
          const citySlug = String(cityRaw).trim().toLowerCase().replace(/\s+/g, '-');
          const links = [];
          if (citySlug) {
            links.push([`/photographers/${citySlug}`, `Photographers in ${cityRaw}`]);
            links.push([`/photographers/${citySlug}/wedding`, `Wedding photographers in ${cityRaw}`]);
          }
          links.push(['/photographers/wedding', 'Wedding photographers']);
          links.push(['/photographers', 'Browse all photographers']);
          return (
            <Section T={T} title="Discover More Photographers" id="discover-more">
              <div className="flex flex-wrap gap-2" data-testid="portfolio-discovery-links">
                {links.map(([href, label]) => (
                  <a key={href} href={href} className="px-3 py-1.5 rounded-full text-xs"
                    style={{ color: ink85, border: `1px solid ${rgba(design.ink, 0.18)}`, textDecoration: 'none' }}>
                    {label}
                  </a>
                ))}
              </div>
            </Section>
          );
        })()}

        {/* Basic footer nudge — makes the tier gap obvious to viewers */}
        {tier !== 'premium' && (
          <div className="rounded-xl p-5 text-center text-xs" style={{ border: light ? `1px dashed ${design.accent}40` : '1px dashed rgba(255,255,255,0.14)', color: ink55 }}>
            This is a Basic portfolio. Premium studios unlock a cinematic profile with journey, achievements, testimonials, awards, equipment & the exclusive digital experience.
          </div>
        )}

        {/* MAJA credit, removed for entitled white-label studios */}
        {!wl?.hide_maja_branding && (
          <div className="text-center text-[11px] tracking-[0.25em] uppercase pt-2" style={{ color: ink40 }}>
            Member of Pixora · Powered by{' '}
            <a href="/" style={{ color: T.accent, textDecoration: 'none', fontWeight: 600 }}
              data-testid="footer-maja-link">MAJA INVITES</a>
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewer != null && works[viewer] && (
          <WorkViewer studioId={id} work={works[viewer]} onClose={() => setViewer(null)} onNav={navViewer} />
        )}
      </AnimatePresence>
    </div>
  );
}

// EnquiryForm — captures a public enquiry and posts it straight into the studio's
// CRM (POST /api/public/photographer/:id/enquiry → a real "lead"). Reused styling
// tokens keep it on-brand with whatever portfolio design is active.
function EnquiryForm({ studioId, accent, accentGrad, accentInk, ink85, ink55, cardPanel, cardBorder }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', event_type: '', event_date: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.name.trim()) { setErr('Please add your name.'); return; }
    if (!f.phone.trim() && !f.email.trim()) { setErr('Add a phone or email so they can reply.'); return; }
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/public/photographer/${studioId}/enquiry`, f);
      setDone(true);
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not send — please try again.');
    }
    setBusy(false);
  };

  const inputStyle = { background: cardPanel, border: cardBorder, color: ink85 };
  const cls = 'w-full rounded-lg px-3 py-2 text-sm outline-none';

  if (done) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ background: cardPanel, border: cardBorder }}>
        <Check className="w-8 h-8 mx-auto mb-2" style={{ color: accent }} />
        <div className="text-sm font-medium" style={{ color: ink85 }}>Enquiry sent!</div>
        <div className="text-xs mt-1" style={{ color: ink55 }}>The studio has your details and will be in touch.</div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl p-4 flex flex-col gap-2.5" style={{ background: cardPanel, border: cardBorder }} data-testid="enquiry-form">
      <input className={cls} style={inputStyle} placeholder="Your name*" value={f.name} onChange={set('name')} data-testid="enquiry-name" />
      <div className="grid grid-cols-2 gap-2.5">
        <input className={cls} style={inputStyle} placeholder="Phone" value={f.phone} onChange={set('phone')} data-testid="enquiry-phone" />
        <input className={cls} style={inputStyle} placeholder="Email" value={f.email} onChange={set('email')} data-testid="enquiry-email" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <input className={cls} style={inputStyle} placeholder="Event (e.g. Wedding)" value={f.event_type} onChange={set('event_type')} />
        <input className={cls} style={inputStyle} placeholder="Event date" value={f.event_date} onChange={set('event_date')} type="text" onFocus={(e) => (e.target.type = 'date')} onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }} />
      </div>
      <textarea className={cls} style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} placeholder="Tell them about your event…" value={f.message} onChange={set('message')} />
      {err && <div className="text-xs" style={{ color: '#ff9a9a' }} data-testid="enquiry-error">{err}</div>}
      <button type="submit" disabled={busy} className="mt-1 px-5 py-2.5 rounded-full text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ background: accentGrad, color: accentInk }} data-testid="enquiry-submit">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Send enquiry
      </button>
    </form>
  );
}
