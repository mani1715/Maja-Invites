/**
 * DesignFullPreview — Unified Stage layout.
 *
 * One single design-themed look for the ENTIRE page:
 *   • Page background = the design's natural parchment / cream / palette
 *     colour (from `design.bg`), PLUS a soft, low-opacity copy of the
 *     same design image fixed in the background — so the design extends
 *     everywhere (not just at the top).
 *   • Hero card: the design photo shown smaller (max-width 620 px),
 *     centered, sharp, with a soft drop-shadow. Empty space on the
 *     sides shares the same design-themed background, with subtle
 *     ornamental floating motifs.
 *   • All sub-sections (Our Story, Ceremonies, Names, Map, Comments,
 *     etc.) sit on top of the same background with a translucent
 *     parchment-tinted panel — so the design pattern is always visible.
 *
 * Structure (extensible):
 *   <PageStage>
 *     <SoftDesignBackdrop />          fixed, low-opacity design image
 *     <SideOrnaments />               subtle theme accent shapes
 *     <main>
 *       <HeroCard />                  the invitation
 *       <StorySection />
 *       <CeremoniesSection />
 *       <NamesSection (placeholder) />
 *       <MapSection (placeholder) />
 *       <CommentsSection (placeholder) />
 *       <VariantSwitcher />
 *     </main>
 *   </PageStage>
 *
 * Adding a new section later is just: drop a <Panel> child in <main>.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, CalendarPlus, CalendarCheck, Check, Edit3, Image as ImageIcon, Link as LinkIcon, MapPin, MessageSquare, Save, Share2, ShoppingBag, Upload, Users, X } from 'lucide-react';
import { ALL_DESIGNS, useThemeDesigns } from '@/themes/allDesigns';
import { KERALA_COLORS } from '@/themes/kerala_backwaters/kerala.colors';
import { getThemeById } from '@/themes/masterThemes';
import { normaliseEvent, resolveDesign, pageBgForDesign } from '@/themes/themeDesignResolver';
import { AnimationProvider } from '@/components/animations';
import UniversalDesignRenderer from '@/themes/UniversalDesignRenderer';
import { isLight as isLightColor } from '@/themes/textContrast';
import { getThemeSampleData } from '@/themes/sampleData';
import { useCart } from '@/context/CartContext';
import { OpeningOrchestrator, ClosingOrchestrator } from '@/themes/shared/ThemeAnimationOrchestrator';
import DesignImage from '@/components/DesignImage';
import { PhotoLightbox, openLightbox } from '@/components/PhotoLightbox';
import { Heart, Send, Sparkles, Gift, Plane, Hotel, Building2, Camera, Search, Menu, ChevronRight, Home, Navigation } from 'lucide-react';
import { eventPhoto, DEFAULT_COUPLE_PHOTO, DEFAULT_BRIDE_PHOTO, DEFAULT_GROOM_PHOTO } from '@/themes/samplePhotos';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const LS_KEY = 'wedding3.designSelections.v1';
const readSelections = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } };
const writeSelections = (d) => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } };

const DEFAULT_PHOTO = 'https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=400&fit=crop&q=85';

// Build per-theme defaults from THEME_SAMPLE_DATA so each theme preview has
// its own culturally resonant placeholder couple (Lakshmi & Karthik for South
// Indian, Simran & Arjun for Punjabi, etc.).
// `event` (e.g. "haldi", "mehndi") drives the hero photo — Haldi/Mehndi show
// the freshly-generated single-person portraits, every other event shows the
// couple shot.
const buildDefaultText = (themeId, event) => {
  const s = getThemeSampleData(themeId) || {};
  return {
    bride: s.bride || 'Anaya',
    groom: s.groom || 'Vihaan',
    date:  s.weddingDate || '14 February 2026',
    venue: `${s.venue || 'Falaknuma Palace'}${s.city ? ' · ' + s.city.split(',')[0] : ''}`,
    story: s.story || 'Two souls. One promise. A wedding to remember.',
    photo: eventPhoto(event) || DEFAULT_PHOTO,
    bride_about:  s.bride_about  || '',
    groom_about:  s.groom_about  || '',
    couple_about: s.couple_about || s.story || '',
    nakshatram:   s.nakshatram   || '',
    muhurtam:     s.muhurtam     || '',
    wedding_time: s.wedding_time || '11:00 AM',
  };
};

const DEFAULT_CEREMONIES = [
  { key: 'Engagement', date: '10 February 2026', venue: 'Garden Pavilion', time: '6:30 PM' },
  { key: 'Marriage',   date: '14 February 2026', venue: 'The Mandap',       time: '11:00 AM' },
  { key: 'Reception',  date: '15 February 2026', venue: 'Falaknuma Palace', time: '7:00 PM' },
];

const DEFAULT_FAMILY = [
  { side: 'Bride', members: ['Rajesh & Meena Kapoor (Parents)', 'Aarav Kapoor (Brother)'] },
  { side: 'Groom', members: ['Suresh & Lata Mehta (Parents)', 'Riya Mehta (Sister)'] },
];

const DesignFullPreview = () => {
  const { themeId, event: rawEvent, designIndex } = useParams();
  const navigate = useNavigate();
  const { add: addToCart } = useCart();
  const themeMeta = useMemo(() => getThemeById(themeId), [themeId]);
  const event = useMemo(() => normaliseEvent(rawEvent), [rawEvent]);
  const idx = Math.max(0, Math.min(2, parseInt(designIndex || '0', 10)));
  // PHASE 8: lazy-load this specific theme's design config (also keeps cache hot).
  const themeDesigns = useThemeDesigns(themeId);

  const resolved = useMemo(() => resolveDesign(themeId, event, idx), [themeId, event, idx, themeDesigns]);
  const sampleData = useMemo(() => getThemeSampleData(themeId) || {}, [themeId]);
  const tokens = resolved?.theme?.tokens || (themeId === 'kerala_backwaters'
    ? { background: KERALA_COLORS.water, text: KERALA_COLORS.text, accent: KERALA_COLORS.secondary }
    : (themeDesigns?.tokens || ALL_DESIGNS[themeId]?.tokens || { background: '#0a0a0a', text: '#F5ECD7', accent: '#D4AF37' }));

  const [text, setText] = useState(() => {
    const stored = readSelections();
    return { ...buildDefaultText(themeId, event), ...(stored.text || {}) };
  });
  const [saved, setSaved] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // "Get These" — admin-priced design + plans panel
  const [offer, setOffer] = useState(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const openGetThese = useCallback(async () => {
    setOfferOpen(true); setOfferLoading(true);
    try {
      const did = resolved?.design?.id;
      const { data } = await axios.get(`${API_URL}/api/store/design-offer/${encodeURIComponent(did)}`, { params: { theme_id: themeId } });
      setOffer(data);
    } catch (e) {
      setOffer({ price_inr: 2999, price_source: 'default', packages: [], addons: [] });
    } finally { setOfferLoading(false); }
  }, [resolved, themeId]);
  // Hybrid layout: which section popup is open (null = none), and whether the
  // floating "More" menu sheet is showing. Heavy sections only mount on open.
  const [dockSection, setDockSection] = useState(null);
  const [dockMenu, setDockMenu] = useState(false);
  const [coverText, setCoverText] = useState(() => {
    const stored = readSelections();
    return stored.coverText ?? false;
  });

  /* When the event changes (user switches between Haldi/Mehndi/Marriage etc.)
     swap the hero photo to the matching default UNLESS the user has uploaded
     a custom photo (data: URL or non-default URL). */
  useEffect(() => {
    const defaults = buildDefaultText(themeId, event);
    setText((prev) => {
      const isDefault =
        !prev.photo ||
        prev.photo === DEFAULT_PHOTO ||
        prev.photo === DEFAULT_COUPLE_PHOTO ||
        prev.photo === DEFAULT_BRIDE_PHOTO ||
        prev.photo === DEFAULT_GROOM_PHOTO ||
        prev.photo.includes('/uploads/themes/');
      return isDefault ? { ...prev, photo: defaults.photo } : prev;
    });
  }, [themeId, event]);

  /* Per-theme cinematic opening — plays every time the user lands on a
     design preview (no sessionStorage gating).  The user complained that
     once-per-session caching meant the opening "didn't come" when they
     navigated between designs, so every entry replays the full cinematic. */
  const [openingDone, setOpeningDone] = useState(false);
  const markOpeningDone = useCallback(() => { setOpeningDone(true); }, []);
  // Replay the opening every time the user switches to a different design
  // (themeId / event / idx change) so each pick gets its own cinematic intro.
  useEffect(() => { setOpeningDone(false); }, [themeId, event, idx]);

  // SAFETY: never trap users on a blank screen if the opening orchestrator
  // chunk is slow or never reports completion.
  useEffect(() => {
    if (openingDone) return;
    const id = setTimeout(() => setOpeningDone(true), 6000);
    return () => clearTimeout(id);
  }, [openingDone, themeId, event, idx]);
  const footerRef = useRef(null);

  // Use design's own bg colour as the unified page colour
  const pageBg = pageBgForDesign(resolved?.design, { tokens });
  // Pick a readable text colour against the parchment background
  const textOnBg = isLightColor(pageBg) ? '#1A0F08' : '#FFF8DC';
  const mutedText = isLightColor(pageBg) ? 'rgba(40,26,16,0.78)' : 'rgba(255,248,220,0.85)';

  // Inline storytelling sits on the actual design backdrop, which on most
  // themes is LIGHT — so cream theme text vanishes there. Give that block its
  // own guaranteed-readable palette: light cards + near-black ink + a deep
  // gold for labels. Reads cleanly on light AND dark themes (light cards also
  // pop on dark). Independent of the pageBg/textOnBg theme tokens.
  const inkInk     = '#241A12';                 // near-black warm — headings/names
  const inkBody    = 'rgba(36,26,18,0.82)';     // body copy
  const inkLabel   = '#8A6A1A';                 // deep gold — eyebrows/labels (visible on light)
  const inkSurface = 'rgba(255,250,244,0.94)';  // warm near-white card
  const inkBorder  = 'rgba(36,26,18,0.14)';     // hairline
  const inkChipBg  = 'rgba(36,26,18,0.06)';     // chip fill

  // User-requested change (2026-06-06):
  //   The previous backdrop layered a heavy `pageBg` tint + animated particles
  //   over the design artwork, dulling beautiful pieces like the Kerala
  //   backwaters illustration. Keep the page wrapper TRANSPARENT so the
  //   `SoftDesignBackdrop` image (now displayed crisply) is the actual page
  //   background. A readable text colour is still computed against the
  //   original tokens.background palette so headings stay legible.
  useEffect(() => {
    // Remove dark overlays and set LIGHT background
    document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
    document.body.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)';
    return () => { document.body.style.background = ''; };
  }, [pageBg]);

  if (!themeMeta || !resolved) {
    return (
      <div className="min-h-screen grid place-items-center px-6" style={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)', color: '#2F2F2F' }}>
        <div className="text-center">
          <h2 className="font-display text-3xl mb-3">Design not available.</h2>
          <button onClick={() => navigate(`/themes/${themeId}/events`)} className="lux-btn lux-btn-ghost">
            Back to ceremonies
          </button>
        </div>
      </div>
    );
  }

  const accent = tokens.accentGold || tokens.accent;
  const imgUrl = resolved.design.image;
  const headingFont = tokens.heading || '"Cormorant Garamond", serif';

  const handleSave = () => {
    const data = readSelections();
    data.text = text;
    data.coverText = coverText;
    data[`${themeId}__${event}`] = { themeId, event, designIndex: idx, designId: resolved.design.id };
    data.lastPick = { themeId, event, designIndex: idx, designId: resolved.design.id, savedAt: new Date().toISOString() };
    writeSelections(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${themeMeta.name} · ${event}`, url }); return; } catch { /* user cancelled */ }
    }
    try { await navigator.clipboard.writeText(url); setSaved(true); setTimeout(() => setSaved(false), 1800); } catch { /* ignore */ }
  };

  // ── Hybrid layout: the storytelling sections (Our Story, Photos, Family,
  //    Venue & Travel, About MAJA) render INLINE in a compact, mixed
  //    composition below. Only the action items live in the floating dock as
  //    popups. Same component → applies to every theme/design across the site.
  const DOCK_SECTIONS = [
    {
      id: 'rsvp', label: 'RSVP', icon: Send,
      node: (
        <Panel pageBg={pageBg} accent={accent} testId="rsvp-section">
          <Eyebrow accent={accent}>◆ Will you be there?</Eyebrow>
          <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
            Kindly <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>respond.</em>
          </SectionHeading>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="Your name" data-testid="dfp-rsvp-name"
              className="px-3 py-2.5 rounded-md text-sm outline-none"
              style={{ background: `${pageBg}EE`, color: textOnBg, border: `1px solid ${accent}55` }} />
            <input placeholder="Phone (+91)" data-testid="dfp-rsvp-phone"
              className="px-3 py-2.5 rounded-md text-sm outline-none"
              style={{ background: `${pageBg}EE`, color: textOnBg, border: `1px solid ${accent}55` }} />
            <select data-testid="dfp-rsvp-attending"
              className="px-3 py-2.5 rounded-md text-sm outline-none"
              style={{ background: `${pageBg}EE`, color: textOnBg, border: `1px solid ${accent}55` }}>
              <option>Yes, with joy</option>
              <option>Regretfully no</option>
              <option>Trying my best</option>
            </select>
            <input type="number" min={1} max={10} defaultValue={1} placeholder="Guests" data-testid="dfp-rsvp-guests"
              className="px-3 py-2.5 rounded-md text-sm outline-none"
              style={{ background: `${pageBg}EE`, color: textOnBg, border: `1px solid ${accent}55` }} />
          </div>
          <textarea rows={2} placeholder="A message for the couple (optional)"
            className="mt-3 w-full px-3 py-2.5 rounded-md text-sm outline-none"
            style={{ background: `${pageBg}EE`, color: textOnBg, border: `1px solid ${accent}55`, resize: 'vertical' }}
            data-testid="dfp-rsvp-message" />
          <div className="mt-4 text-right">
            <button className="text-[11px] tracking-[0.3em] uppercase px-5 py-2.5 rounded-md inline-flex items-center gap-2"
              style={{ color: pageBg, background: accent }}
              data-testid="dfp-rsvp-submit">
              Send RSVP <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </Panel>
      ),
    },
    {
      id: 'wishes', label: 'Wishes', icon: MessageSquare,
      node: (
        <Panel pageBg={pageBg} accent={accent} testId="comments-section">
          <Eyebrow accent={accent}><MessageSquare className="w-3 h-3 inline-block mr-2 -mt-0.5" /> Wishes</Eyebrow>
          <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
            Leave a <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>blessing.</em>
          </SectionHeading>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {(sampleData?.wishes || []).slice(0, 4).map((w, i) => (
              <div key={i} className="px-4 py-3 rounded-md"
                style={{ background: `${accent}10`, border: `1px solid ${accent}33` }}
                data-testid={`dfp-wish-${i}`}>
                <Heart className="w-3.5 h-3.5 mb-2" style={{ color: accent }} />
                <p className="text-sm italic" style={{ color: textOnBg }}>"{w.text}"</p>
                <div className="text-[10px] tracking-[0.25em] uppercase mt-2" style={{ color: mutedText }}>— {w.from}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 text-center">
            <button className="text-[11px] tracking-[0.25em] uppercase px-4 py-2 rounded-md"
              style={{ color: textOnBg, background: `${accent}15`, border: `1px solid ${accent}66` }}
              data-testid="dfp-wish-cta">
              <MessageSquare className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
              Send your wish
            </button>
          </div>
        </Panel>
      ),
    },
    {
      id: 'gifts', label: 'Gifts & Shagun', icon: Gift,
      node: (
        <>
          {sampleData?.gifts && (
            <Panel pageBg={pageBg} accent={accent} testId="gifts-section">
              <Eyebrow accent={accent}><Gift className="w-3 h-3 inline-block mr-2 -mt-0.5" /> Gifts</Eyebrow>
              <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
                {sampleData.gifts.headline}
              </SectionHeading>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: mutedText }}>
                {sampleData.gifts.message}
              </p>
            </Panel>
          )}
          {sampleData?.shagun && (
            <Panel pageBg={pageBg} accent={accent} testId="shagun-section">
              <Eyebrow accent={accent}>◆ Digital Shagun</Eyebrow>
              <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
                Send your <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>blessings.</em>
              </SectionHeading>
              <p className="mt-3 text-sm" style={{ color: mutedText }}>{sampleData.shagun.msg}</p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="px-4 py-3 rounded-md" style={{ background: `${accent}10`, border: `1px solid ${accent}33` }}>
                  <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: mutedText }}>UPI ID</div>
                  <div className="font-mono text-sm" style={{ color: textOnBg }}>{sampleData.shagun.upi}</div>
                </div>
                <div className="px-4 py-3 rounded-md" style={{ background: `${accent}10`, border: `1px solid ${accent}33` }}>
                  <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: mutedText }}>Payee</div>
                  <div className="text-sm" style={{ color: textOnBg }}>{sampleData.shagun.payee || `${text.bride} & ${text.groom}`}</div>
                </div>
              </div>
            </Panel>
          )}
        </>
      ),
    },
    {
      id: 'live', label: 'Live Wall', icon: Camera,
      node: (
        <Panel pageBg={pageBg} accent={accent} testId="live-photo-wall-section">
          <Eyebrow accent={accent}>◆ Live Photo Wall</Eyebrow>
          <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
            Photos appear <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>live.</em>
          </SectionHeading>
          <p className="mt-3 text-sm" style={{ color: mutedText }}>
            The photographer's hand-picked moments stream here as the wedding unfolds.
          </p>
          <div className="mt-4">
            <button className="text-[11px] tracking-[0.3em] uppercase px-5 py-2.5 rounded-md inline-flex items-center gap-2"
              style={{ color: pageBg, background: accent }}
              data-testid="dfp-live-wall-cta">
              <Camera className="w-3.5 h-3.5" /> View live wall
            </button>
          </div>
        </Panel>
      ),
    },
    {
      id: 'findphotos', label: 'Get Your Photos', icon: Search,
      node: (
        <Panel pageBg={pageBg} accent={accent} testId="find-photos-section">
          <Eyebrow accent={accent}>◆ Your photos</Eyebrow>
          <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
            Get <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>your photos</em> from the wedding.
          </SectionHeading>
          <p className="mt-3 text-sm" style={{ color: mutedText }}>
            Upload one selfie and share your contact — we’ll send you every photo you’re in.
          </p>
          <div className="mt-4">
            <button className="text-[11px] tracking-[0.3em] uppercase px-5 py-2.5 rounded-md inline-flex items-center gap-2"
              style={{ color: pageBg, background: accent }}
              data-testid="dfp-find-photos-cta">
              <Search className="w-3.5 h-3.5" /> Get Your Photos
            </button>
          </div>
        </Panel>
      ),
    },
  ];

  return (
    <AnimationProvider>
      {/* Petal burst on scroll/touch — luxury micro-interaction.
          Pointer-events: none, never blocks UI. */}
      {openingDone && <PetalBurstOverlay accent={accent} />}
      {/* Full-screen photo viewer — any image opens it via openLightbox(src). */}
      <PhotoLightbox />

      {/* Per-theme cinematic opening — fires once per session per theme.
          Until the opening is done the rest of the page stays hidden. */}
      {!openingDone && (
        <OpeningOrchestrator
          themeId={themeId}
          event={event}
          image={resolved?.design?.image}
          bride={text.bride}
          groom={text.groom}
          date={text.date}
          monogram={`${(text.bride || '?')[0]} & ${(text.groom || '?')[0]}`}
          onComplete={markOpeningDone}
        />
      )}
      <div
        className="relative"
        style={{
          // TRANSPARENT wrapper — the design image (via SoftDesignBackdrop)
          // is now the page background. Previously this was `background: pageBg`
          // which painted a solid dark colour over the artwork.
          background: 'transparent',
          color: textOnBg, minHeight: '100vh',
          opacity: openingDone ? 1 : 0,
          pointerEvents: openingDone ? 'auto' : 'none',
          transition: 'opacity 0.55s ease',
        }}
        data-testid={`design-full-preview-${themeId}-${event.toLowerCase()}-${idx}`}
      >
        {/* ── DESIGN IMAGE PAGE BACKGROUND (fixed, edge-to-edge, visible) ─── */}
        <SoftDesignBackdrop image={imgUrl} accent={accent} pageBg={pageBg} />

        {/* ── Top controls ── */}
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 md:px-10 py-4"
          style={{
            background: `linear-gradient(180deg, ${pageBg}DD 0%, ${pageBg}00 100%)`,
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/themes/${themeId}/events/${event}`)}
              className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase px-3 py-2 rounded-md"
              style={{ color: textOnBg, background: `${pageBg}CC`, border: `1px solid ${accent}55` }}
              data-testid="back-to-designs"
            >
              <ArrowLeft className="w-4 h-4" /> Designs
            </button>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase px-3 py-2 rounded-md"
              style={{ color: textOnBg, background: `${pageBg}CC`, border: `1px solid ${accent}55` }}
              data-testid="design-home"
              aria-label="Back to home"
            >
              <Home className="w-4 h-4" /> Home
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openGetThese}
              className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase px-3.5 py-2 rounded-md font-semibold"
              style={{ color: pageBg, background: accent, border: `1px solid ${accent}` }}
              data-testid="dfp-buy-design">
              <ShoppingBag className="w-3.5 h-3.5" /> Get These
            </button>
            <button onClick={handleSave}
              className="hidden sm:inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase px-3 py-2 rounded-md"
              style={{ color: textOnBg, background: `${pageBg}CC`, border: `1px solid ${accent}77` }}
              data-testid="save-selection">
              {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? 'Saved' : 'Save pick'}
            </button>
            <button onClick={handleShare}
              className="hidden sm:inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase px-3 py-2 rounded-md"
              style={{ color: textOnBg, background: `${pageBg}CC`, border: `1px solid ${accent}77` }}
              data-testid="share-design">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
          </div>
        </div>

        {/* ── "GET THESE" — admin-priced design + plans ── */}
        {offerOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)' }} onClick={() => setOfferOpen(false)} data-testid="get-these-modal">
            <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: pageBg, border: `1px solid ${accent}55`, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${accent}22` }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: mutedText }}>{themeMeta?.name || themeId} · {event}</div>
                    <div className="font-display text-xl mt-1" style={{ color: textOnBg }}>{resolved?.design?.title || 'This design'}</div>
                  </div>
                  <button onClick={() => setOfferOpen(false)} aria-label="Close" style={{ color: textOnBg }}><X className="w-5 h-5" /></button>
                </div>
              </div>
              {offerLoading || !offer ? (
                <div className="p-8 text-center text-sm" style={{ color: mutedText }}>Loading price…</div>
              ) : (
                <div className="px-6 py-5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl" style={{ color: accent }}>{inr(offer.price_inr)}</span>
                    <span className="text-xs" style={{ color: mutedText }}>for this design</span>
                  </div>
                  {offer.theme_label && offer.price_source === 'theme' && <div className="text-[11px] mt-1" style={{ color: mutedText }}>{offer.theme_label}</div>}
                  <div className="text-[11px] mt-1" style={{ color: mutedText }}>Done-for-you: our team builds your invitation link. No editing needed.</div>

                  {(offer.packages || []).length > 0 && (
                    <div className="mt-5">
                      <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: mutedText }}>Choose a plan</div>
                      <div className="space-y-2">
                        {(offer.packages || []).map((p) => (
                          <div key={p.key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg" style={{ background: `${accent}10`, border: `1px solid ${p.featured ? accent : accent + '22'}` }} data-testid={`get-these-plan-${p.key}`}>
                            <div>
                              <div className="text-sm font-semibold flex items-center gap-2" style={{ color: textOnBg }}>{p.label}{p.featured && <span className="text-[9px] tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: accent, color: pageBg }}>POPULAR</span>}</div>
                              {p.events != null && <div className="text-[11px]" style={{ color: mutedText }}>{p.events} event{p.events === 1 ? '' : 's'}</div>}
                            </div>
                            <div className="text-sm font-display shrink-0" style={{ color: accent }}>{inr(p.price?.english ?? p.price ?? 0)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      await addToCart({
                        design_id: resolved.design.id,
                        theme_id: themeId,
                        event_type: event,
                        name: resolved.design.title || `${themeMeta?.name || themeId} · ${event}`,
                        price_inr: offer.price_inr,
                      });
                      navigate('/cart');
                    }}
                    className="w-full mt-5 inline-flex items-center justify-center gap-2 text-[12px] tracking-[0.25em] uppercase px-4 py-3 rounded-md font-semibold"
                    style={{ color: pageBg, background: accent }}
                    data-testid="get-these-add-cart">
                    <ShoppingBag className="w-4 h-4" /> Get these — {inr(offer.price_inr)}
                  </button>
                  <div className="text-[10px] text-center mt-2" style={{ color: mutedText }}>Secure checkout · prices set by MAJA Invites</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PAGE CONTENT ── */}
        <main className="relative z-10" style={{ paddingTop: 70 }}>

          {/* HERO — invitation rendered through UniversalDesignRenderer
               so the photographer's clean text card always sits on top of
               (and covers) the poster's baked-in text. */}
          <Panel pageBg={pageBg} accent={accent} variant="hero">
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1.0, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-auto"
              style={{
                maxWidth: 'min(560px, 92vw)',
                width: '100%',
                willChange: 'transform',
                animation: 'card-float 6s ease-in-out infinite',
                filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.30)) drop-shadow(0 10px 24px rgba(0,0,0,0.18))',
              }}
              data-testid="card-text-overlay"
            >
              <UniversalDesignRenderer
                design={resolved.design}
                theme={resolved.theme}
                bride={text.bride}
                groom={text.groom}
                date={text.date}
                venue={text.venue}
                photo={text.photo}
                coverText={coverText}
                testId={`hero-${resolved.design.id}`}
              />
            </motion.div>

            <div className="mt-6 flex items-center justify-center">
              <button
                onClick={() => setCoverText((v) => !v)}
                className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase px-3 py-2 rounded-md"
                style={{
                  color: coverText ? pageBg : textOnBg,
                  background: coverText ? accent : `${accent}22`,
                  border: `1px solid ${accent}66`,
                }}
                data-testid="toggle-cover-text"
                title="Hide any baked-in text on the template"
              >
                {coverText ? '✓ Clean canvas (hides design)' : 'Hide template baked-in text'}
              </button>
            </div>

            {/* Primary actions — RSVP up front; the floating dock holds the
                rest (wishes, gifts, live wall, find-my-photos). */}
            <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={() => setDockSection('rsvp')}
                className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase px-5 py-3 rounded-md"
                style={{ color: '#241A12', background: accent, border: `1px solid ${accent}` }}
                data-testid="hero-rsvp"
              >
                <Send className="w-4 h-4" /> RSVP
              </button>
              <button
                onClick={() => setDockMenu(true)}
                className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase px-5 py-3 rounded-md"
                style={{ color: inkInk, background: inkSurface, border: `1px solid ${inkBorder}` }}
                data-testid="hero-explore"
              >
                <Menu className="w-4 h-4" /> More
              </button>
            </div>
          </Panel>

          {/* ── Inline invitation story — compact, mixed composition. The five
              storytelling sections live here (not behind the dock): a slim
              centred story, a full-bleed photo marquee, a 2-up Family/Venue
              row, and a MAJA credit ribbon. ── */}
          <div
            className="relative z-10 max-w-4xl mx-auto w-full px-6 md:px-10 pt-2 pb-12 space-y-12"
            data-testid="inline-story"
          >
            {/* Our Story — centred passage on a readable light card */}
            <section className="max-w-2xl mx-auto" data-testid="inline-section-story">
              <div className="text-center rounded-2xl px-6 py-7"
                style={{ background: inkSurface, border: `1px solid ${inkBorder}`, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}>
                <div className="text-[10px] tracking-[0.45em] uppercase mb-3" style={{ color: inkLabel }}>◆ Our Story</div>
                <p className="text-[1.05rem] leading-relaxed" style={{ color: inkInk, fontFamily: headingFont }}>{text.story}</p>
                <div className="flex items-center justify-center gap-3 mt-6" aria-hidden>
                  <span style={{ height: 1, width: 48, background: `linear-gradient(90deg, transparent, ${inkLabel})` }} />
                  <span style={{ color: inkLabel, fontSize: 12 }}>◆</span>
                  <span style={{ height: 1, width: 48, background: `linear-gradient(90deg, ${inkLabel}, transparent)` }} />
                </div>
              </div>
            </section>

            {/* Photos — full-bleed continuous marquee (compact) */}
            <PhotoGallerySection
              compact
              pageBg={pageBg} accent={inkLabel} textOnBg={inkInk}
              mutedText={inkBody} headingFont={headingFont} heroPhoto={text.photo}
            />

            {/* Family + Venue — mixed 2-up row */}
            <div className="grid md:grid-cols-2 gap-5" data-testid="inline-family-venue">
              <div className="rounded-xl p-5" style={{ background: inkSurface, border: `1px solid ${inkBorder}` }}>
                <div className="flex items-center gap-2 text-[10px] tracking-[0.35em] uppercase mb-4" style={{ color: inkLabel }}>
                  <Users className="w-3.5 h-3.5" /> Family
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {DEFAULT_FAMILY.map((f) => (
                    <div key={f.side}>
                      <div className="text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: inkLabel }}>{f.side}'s side</div>
                      <ul className="space-y-0.5 text-[13px]" style={{ color: inkBody }}>
                        {f.members.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl p-5 flex flex-col" style={{ background: inkSurface, border: `1px solid ${inkBorder}` }}>
                <div className="flex items-center gap-2 text-[10px] tracking-[0.35em] uppercase mb-4" style={{ color: inkLabel }}>
                  <MapPin className="w-3.5 h-3.5" /> Venue &amp; Travel
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text.venue || '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-display text-xl leading-snug no-underline hover:opacity-90 transition-opacity"
                  style={{ fontFamily: headingFont, color: inkInk }}
                  data-testid="venue-name-maps"
                  title="Open in Google Maps"
                >
                  {text.venue}
                </a>
                <div className="text-[12px] mt-1" style={{ color: inkBody }}>
                  {text.date}{text.wedding_time ? ` · ${text.wedding_time}` : ''}
                </div>
                {Array.isArray(sampleData?.travel) && sampleData.travel.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {sampleData.travel.slice(0, 3).map((v, i) => {
                      const Icon = (v.type || '').toLowerCase().includes('airport') ? Plane
                        : (v.type || '').toLowerCase().includes('stay') ? Hotel : Building2;
                      return (
                        <span key={i} className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full"
                          style={{ color: inkBody, background: inkChipBg, border: `1px solid ${inkBorder}` }}>
                          <Icon className="w-3 h-3" style={{ color: inkLabel }} /> {v.name}
                        </span>
                      );
                    })}
                  </div>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text.venue || '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="mt-auto pt-4 inline-flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase no-underline hover:opacity-90 transition-opacity"
                  style={{ color: inkLabel }}
                  data-testid="open-google-maps"
                >
                  <Navigation className="w-3.5 h-3.5" /> Open in Google Maps
                </a>
              </div>
            </div>

            {/* The Couple — bride & groom, separate photos + bios */}
            <section data-testid="inline-couple">
              <div className="text-center mb-6">
                <div className="inline-block rounded-full px-4 py-1.5" style={{ background: inkSurface, border: `1px solid ${inkBorder}` }}>
                  <span className="text-[10px] tracking-[0.45em] uppercase" style={{ color: inkLabel }}>◆ The Couple</span>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                {[
                  { who: 'The Bride', name: text.bride, bio: text.bride_about, photo: DEFAULT_BRIDE_PHOTO, key: 'bride' },
                  { who: 'The Groom', name: text.groom, bio: text.groom_about, photo: DEFAULT_GROOM_PHOTO, key: 'groom' },
                ].map((p) => (
                  <div key={p.key} className="rounded-xl overflow-hidden flex flex-col"
                    style={{ background: inkSurface, border: `1px solid ${inkBorder}`, boxShadow: '0 10px 26px rgba(0,0,0,0.12)' }}
                    data-testid={`inline-couple-${p.key}`}>
                    <div className="relative" style={{ aspectRatio: '4 / 5', background: 'rgba(36,26,18,0.08)' }}>
                      <img
                        src={p.photo} alt={p.name || p.who} loading="lazy" decoding="async"
                        onClick={() => openLightbox(p.photo)}
                        onError={(e) => { if (e.currentTarget.src !== DEFAULT_COUPLE_PHOTO) e.currentTarget.src = DEFAULT_COUPLE_PHOTO; }}
                        title="Tap to view full photo"
                        className="w-full h-full object-cover" style={{ cursor: 'zoom-in' }}
                      />
                    </div>
                    <div className="p-4">
                      <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: inkLabel }}>{p.who}</div>
                      <div className="font-display text-lg mt-0.5" style={{ fontFamily: headingFont, color: inkInk }}>{p.name}</div>
                      <p className="text-[13px] leading-relaxed mt-2" style={{ color: inkBody }}>
                        {p.bio || `${p.name} carries a quiet warmth and a heart full of dreams — kind, radiant, and ready to begin this beautiful new chapter.`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Our Film — wedding / pre-wedding video (placeholder for now) */}
            <section data-testid="inline-video">
              <div className="text-center mb-5">
                <div className="inline-block rounded-xl px-5 py-2.5" style={{ background: inkSurface, border: `1px solid ${inkBorder}` }}>
                  <div className="text-[10px] tracking-[0.45em] uppercase" style={{ color: inkLabel }}>◆ Our Film</div>
                  <p className="text-[11px] mt-1" style={{ color: inkBody }}>
                    Wedding-invitation / pre-wedding film — sample placeholder.
                  </p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden mx-auto"
                style={{ maxWidth: 720, border: `1px solid ${inkBorder}`, boxShadow: '0 14px 30px rgba(0,0,0,0.25)' }}>
                <video
                  controls playsInline preload="none"
                  poster={text.photo || DEFAULT_COUPLE_PHOTO}
                  className="w-full"
                  style={{ display: 'block', background: '#000', aspectRatio: '16 / 9' }}
                  data-testid="inline-video-player"
                >
                  <source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            </section>

            {/* Countdown to the auspicious date + Add-to-Calendar */}
            <InlineCountdown
              dateStr={text.date}
              timeStr={text.wedding_time}
              title={`${text.bride || ''}${text.bride && text.groom ? ' & ' : ''}${text.groom || ''}`.trim() ? `${text.bride} & ${text.groom} — Wedding` : 'Our Wedding'}
              venue={text.venue}
              ink={{ inkInk, inkBody, inkLabel, inkSurface, inkBorder }}
            />

            {/* About MAJA — slim credit ribbon */}
            <section className="text-center" data-testid="inline-section-about">
              <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.3em] uppercase px-4 py-2 rounded-full"
                style={{ color: inkBody, background: inkSurface, border: `1px solid ${inkBorder}` }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: inkLabel }} />
                Crafted by
                <span style={{ color: inkInk, fontFamily: '"Great Vibes", cursive', fontSize: '1.2em', textTransform: 'none', letterSpacing: 0 }}>MAJA Invites</span>
              </div>
            </section>
          </div>


          {/* VARIANT SWITCHER */}
          <Panel pageBg={pageBg} accent={accent} compact>
            <div className="flex items-baseline justify-between flex-wrap gap-4">
              <div>
                <div className="text-[10px] tracking-[0.5em] uppercase mb-2" style={{ color: accent }}>
                  ◈ {themeMeta.name} · {event} · Design {idx + 1}
                </div>
                <div className="text-xl md:text-2xl" style={{ fontFamily: headingFont, color: textOnBg }}>
                  {resolved.design.title}
                </div>
                <p className="text-sm max-w-xl mt-1.5" style={{ color: mutedText }}>{resolved.design.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map((i) => (
                  <button key={i}
                    onClick={() => navigate(`/themes/${themeId}/events/${event}/design/${i}`)}
                    className="text-[11px] tracking-[0.25em] uppercase px-3 py-2 rounded-md"
                    style={{
                      color: i === idx ? pageBg : textOnBg,
                      background: i === idx ? accent : `${accent}15`,
                      border: `1px solid ${accent}66`,
                    }}
                    data-testid={`switch-design-${i}`}>
                    Design {i + 1}
                  </button>
                ))}
              </div>
            </div>
            {/* Bottom "Get this design" CTA — same buy flow as the top bar
                (add to cart → pick pack → pay → enter details). */}
            <button
              onClick={async () => {
                await addToCart({
                  design_id: resolved.design.id,
                  theme_id: themeId,
                  event_type: event,
                  name: resolved.design.title || `${themeMeta?.name || themeId} · ${event}`,
                  price_inr: 2999,
                });
                navigate('/cart');
              }}
              className="w-full mt-6 inline-flex items-center justify-center gap-2 text-[12px] tracking-[0.28em] uppercase px-5 py-3.5 rounded-lg font-semibold"
              style={{ color: pageBg, background: accent, border: `1px solid ${accent}` }}
              data-testid="dfp-buy-design-bottom">
              <ShoppingBag className="w-4 h-4" /> Get this design
            </button>
          </Panel>
        </main>

        {/* ── Floating "More" dock + section popups (WhatsApp-icon pattern) ── */}
        <MoreDock
          sections={DOCK_SECTIONS}
          activeId={dockSection}
          onActive={setDockSection}
          menuOpen={dockMenu}
          onMenu={setDockMenu}
          accent={accent}
          pageBg={pageBg}
          textOnBg={textOnBg}
          mutedText={mutedText}
          headingFont={headingFont}
        />

        {/* Edit panel */}
        {editMode && (
          <motion.div
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-0 left-0 right-0 z-50 px-5 md:px-10 pb-6 pt-5"
            style={{
              background: `linear-gradient(0deg, ${pageBg}F4 0%, ${pageBg}AA 70%, ${pageBg}00 100%)`,
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            }}
            data-testid="edit-text-panel"
          >
            <div className="max-w-5xl mx-auto space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <EditField label="Bride" value={text.bride} onChange={(v) => setText(s => ({ ...s, bride: v }))} testId="edit-bride" accent={accent} textOnBg={textOnBg} pageBg={pageBg} />
                <EditField label="Groom" value={text.groom} onChange={(v) => setText(s => ({ ...s, groom: v }))} testId="edit-groom" accent={accent} textOnBg={textOnBg} pageBg={pageBg} />
                <EditField label="Date"  value={text.date}  onChange={(v) => setText(s => ({ ...s, date: v }))}  testId="edit-date"  accent={accent} textOnBg={textOnBg} pageBg={pageBg} />
                <EditField label="Venue" value={text.venue} onChange={(v) => setText(s => ({ ...s, venue: v }))} testId="edit-venue" accent={accent} textOnBg={textOnBg} pageBg={pageBg} />
              </div>
              <PhotoEditor
                value={text.photo}
                onChange={(v) => setText((s) => ({ ...s, photo: v }))}
                accent={accent} textOnBg={textOnBg} pageBg={pageBg}
              />
            </div>
          </motion.div>
        )}

        {/* page-level keyframes */}
        <style>{`
          @keyframes card-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
          @keyframes side-orb-drift {
            0%   { transform: translate(0,0)   rotate(0deg); }
            50%  { transform: translate(8px,-12px) rotate(8deg); }
            100% { transform: translate(0,0)   rotate(0deg); }
          }
        `}</style>

        {/* Closing-animation sentinel — when the photographer/customer
            scrolls to this element the per-theme closing fires. */}
        <div ref={footerRef} data-testid="dfp-closing-sentinel" style={{ height: 60 }} />

        {/* Footer with the couple photo as full-bleed background — last
            thing the guest sees before the closing animation. */}
        <PreviewFooter
          couplePhoto={text.photo}
          bride={text.bride}
          groom={text.groom}
          accent={accent}
          headingFont={headingFont}
        />
        {openingDone && (
          <ClosingOrchestrator
            themeId={themeId}
            eventType={event}
            image={resolved?.design?.image}
            bride={text.bride}
            groom={text.groom}
            date={text.date}
          />
        )}
      </div>
    </AnimationProvider>
  );
};

/* ────────────────────────────────────────────────────────────────────
   SoftDesignBackdrop — Renders the SAME design image as a soft, blurred
   full-viewport backdrop so the design extends edge-to-edge of the page
   (instead of just sitting inside a centered card on a flat shade). The
   center hero card still pops because it uses the crisp, un-blurred
   variant via UniversalDesignRenderer + a strong drop-shadow.
   ──────────────────────────────────────────────────────────────────── */
const SoftDesignBackdrop = ({ image, accent, pageBg = '#1A130B' }) => {
  if (!image) {
    // Pure-CSS fallback when no image URL (kept GPU-cheap)
    return (
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: `
            radial-gradient(ellipse at top left, ${accent}1F 0%, transparent 55%),
            radial-gradient(ellipse at bottom right, ${accent}14 0%, transparent 60%),
            ${pageBg}
          `,
        }}
      />
    );
  }
  return (
    <>
      {/* The design image is the page background — full-bleed, crisp, no
          heavy blur or dark tint. User explicitly asked (2026-06-06) for
          the artwork itself (e.g. Kerala palms / brass lamps) to be the
          visible background instead of a teal / black overlay. */}
      <img
        aria-hidden
        src={image}
        alt=""
        draggable={false}
        loading="eager"
        decoding="async"
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          width: '100%', height: '100%', objectFit: 'cover',
          // Very mild softening to avoid hard crop edges on ultra-wide
          // screens. Crisp enough that the artwork stays recognisable.
          filter: 'blur(4px) saturate(1.05)',
          transform: 'scale(1.04)',
          transformOrigin: 'center center',
          opacity: 1,
          willChange: 'transform',
        }}
        data-testid="design-page-background"
      />
      {/* Soft accent orbs — kept from previous design for cinematic feel.
          Heavy `pageBg` tinting wash was REMOVED so the artwork shows. */}
      <div
        aria-hidden
        style={{
          position: 'fixed', left: '4vw', top: '40vh',
          width: 220, height: 220, zIndex: 1, pointerEvents: 'none',
          background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`,
          filter: 'blur(20px)',
          animation: 'side-orb-drift 18s ease-in-out infinite',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed', right: '4vw', top: '60vh',
          width: 260, height: 260, zIndex: 1, pointerEvents: 'none',
          background: `radial-gradient(circle, ${accent}28 0%, transparent 70%)`,
          filter: 'blur(22px)',
          animation: 'side-orb-drift 22s ease-in-out infinite reverse',
        }}
      />
    </>
  );
};

/* ────────────────────────────────────────────────────────────────────
   Panel — a translucent parchment-tinted container used by every
   section so the design backdrop is always visible underneath.
   ──────────────────────────────────────────────────────────────────── */
const Panel = ({ pageBg, accent, children, variant, compact, testId }) => {
  const isHero = variant === 'hero';
  return (
    <section
      data-testid={testId}
      className="relative px-6 md:px-16"
      style={{
        paddingTop:    isHero ? '3rem' : (compact ? '2.6rem' : '4.5rem'),
        paddingBottom: isHero ? '4rem' : (compact ? '2.6rem' : '4.5rem'),
      }}
    >
      <div
        className="max-w-3xl mx-auto rounded-2xl px-6 md:px-10 py-8 md:py-10"
        style={{
          background: isHero ? 'transparent' : `${pageBg}CC`,
          backdropFilter: isHero ? 'none' : 'blur(8px)',
          WebkitBackdropFilter: isHero ? 'none' : 'blur(8px)',
          border: isHero ? 'none' : `1px solid ${accent}44`,
          boxShadow: isHero ? 'none' : '0 16px 50px rgba(0,0,0,0.10)',
        }}
      >
        {children}
      </div>
    </section>
  );
};

const Eyebrow = ({ accent, children }) => (
  <div className="text-[10px] tracking-[0.4em] uppercase mb-3" style={{ color: accent }}>{children}</div>
);

const SectionHeading = ({ children, font, color }) => (
  <h2
    className="leading-tight"
    style={{ fontFamily: font, color, fontSize: 'clamp(1.6rem, 3.2vw, 2.5rem)' }}
  >
    {children}
  </h2>
);

const EditField = ({ label, value, onChange, testId, accent, textOnBg, pageBg }) => (
  <label className="block">
    <span
      className="text-[10px] tracking-[0.3em] uppercase block mb-1.5 font-semibold"
      style={{ color: textOnBg, opacity: 0.85 }}
    >
      {label}
    </span>
    <input value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-md text-[15px] outline-none"
      style={{ background: `${pageBg}EE`, color: textOnBg, border: `1px solid ${accent}77`, fontFamily: '"Cormorant Garamond", serif' }}
      data-testid={testId} />
  </label>
);

/* ────────────────────────────────────────────────────────────────────
   PhotoEditor — drag-and-drop file upload + click to upload + URL paste
   ──────────────────────────────────────────────────────────────────── */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

const PhotoEditor = ({ value, onChange, accent, textOnBg, pageBg }) => {
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const ingestFile = useCallback((file) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please drop an image file (jpg / png / webp).');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Image is larger than 5 MB. Pick a smaller photo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target.result);
    reader.onerror = () => setError('Could not read the file.');
    reader.readAsDataURL(file);
  }, [onChange]);

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) ingestFile(file);
  };
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); setDragOver(false); };
  const onFilePick = (e) => { const f = e.target.files?.[0]; if (f) ingestFile(f); };
  const onUrlApply = () => {
    if (!urlInput.trim()) return;
    setError('');
    onChange(urlInput.trim());
    setUrlInput('');
  };

  return (
    <div className="rounded-md p-3" style={{ background: `${pageBg}EE`, border: `1px solid ${accent}55` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: accent }}>Couple Photo</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] tracking-[0.2em] uppercase inline-flex items-center gap-1 opacity-75 hover:opacity-100"
            style={{ color: textOnBg }}
            data-testid="clear-photo"
          >
            <X className="w-3 h-3" /> Remove
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-stretch gap-3">
        {/* Drop / upload zone */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileRef.current?.click()}
          className="flex-1 rounded-md cursor-pointer transition-colors"
          style={{
            border: `2px dashed ${dragOver ? accent : accent + '66'}`,
            background: dragOver ? `${accent}18` : 'transparent',
            padding: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
          data-testid="photo-dropzone"
        >
          {value ? (
            <img
              src={value}
              alt="Couple"
              style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${accent}`, flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `${accent}18`, flexShrink: 0 }}>
              <ImageIcon className="w-6 h-6" style={{ color: accent }} />
            </div>
          )}
          <div className="text-left">
            <div className="text-[12px] font-medium inline-flex items-center gap-1.5" style={{ color: textOnBg }}>
              <Upload className="w-3.5 h-3.5" /> Drag &amp; drop or click to upload
            </div>
            <div className="text-[10px] mt-0.5 opacity-75" style={{ color: textOnBg }}>
              JPG / PNG / WEBP, up to 5&nbsp;MB
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFilePick} className="hidden" data-testid="photo-file-input" />
        </div>

        {/* URL input */}
        <div className="flex-1 rounded-md flex items-stretch gap-2" style={{ border: `1px solid ${accent}55`, padding: 6 }}>
          <span className="grid place-items-center px-2" style={{ color: accent }}><LinkIcon className="w-4 h-4" /></span>
          <input
            type="url"
            value={urlInput}
            placeholder="…or paste an image URL"
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onUrlApply(); } }}
            className="flex-1 px-2 py-2 rounded-md text-[13px] outline-none"
            style={{ background: 'transparent', color: textOnBg, border: 'none' }}
            data-testid="photo-url-input"
          />
          <button
            type="button"
            onClick={onUrlApply}
            className="px-3 text-[10px] tracking-[0.25em] uppercase rounded-md"
            style={{ background: accent, color: pageBg, border: `1px solid ${accent}` }}
            data-testid="photo-url-apply"
          >
            Use
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] mt-2" style={{ color: '#B83A2C' }} data-testid="photo-error">{error}</div>
      )}
    </div>
  );
};

/* Quick brightness check on a #RRGGBB string — true if light (need dark text) */
function isLightHex(hex) {
  return isLightColor(hex);
}

/* ────────────────────────────────────────────────────────────────────
   SectionPopup — themed modal that hosts one invitation section.
   Renders into <body> via portal. Closes on Esc / backdrop click.
   The section's content only mounts while the popup is open, so the
   heavy sections never cost anything on the first (essentials) view.
   ──────────────────────────────────────────────────────────────────── */
const SectionPopup = ({ title, icon: Icon, accent, pageBg, textOnBg, mutedText, headingFont, onClose, children }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center p-3 sm:p-5"
      style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
      data-testid="section-popup-backdrop"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
        style={{ background: pageBg, border: `1px solid ${accent}55`, maxHeight: '88vh', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}
        data-testid={`section-popup`}
      >
        <header
          className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${accent}33`, background: `${accent}12` }}
        >
          <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.28em] uppercase" style={{ color: textOnBg, fontFamily: headingFont }}>
            {Icon && <Icon className="w-4 h-4" style={{ color: accent }} />}
            {title}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full grid place-items-center transition-transform active:scale-90"
            style={{ background: `${accent}22`, color: textOnBg, border: `1px solid ${accent}55` }}
            data-testid="section-popup-close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="overflow-y-auto" style={{ color: textOnBg }}>
          {children}
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

/* ────────────────────────────────────────────────────────────────────
   MoreDock — the floating round button (WhatsApp-chatbot pattern) that
   opens a menu of every non-essential section. Picking one opens it as a
   SectionPopup. Same component on every theme → site-wide consistency.
   ──────────────────────────────────────────────────────────────────── */
const MoreDock = ({ sections, activeId, onActive, menuOpen, onMenu, accent, pageBg, textOnBg, mutedText, headingFont }) => {
  const active = sections.find((s) => s.id === activeId) || null;

  return createPortal(
    <>
      {/* Floating button — bottom-right, mirrors the chatbot launcher. */}
      <button
        onClick={() => onMenu(!menuOpen)}
        aria-label={menuOpen ? 'Close menu' : 'Open invitation menu'}
        className="fixed z-[110] rounded-full grid place-items-center transition-transform active:scale-90"
        style={{
          right: 'max(1rem, env(safe-area-inset-right))',
          bottom: 'max(1.25rem, env(safe-area-inset-bottom))',
          width: 58, height: 58,
          background: accent, color: pageBg,
          boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
          border: `1px solid ${accent}`,
        }}
        data-testid="more-dock-button"
      >
        {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Menu sheet */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[105]"
          onClick={() => onMenu(false)}
          style={{ background: 'rgba(0,0,0,0.35)' }}
          data-testid="more-dock-overlay"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="fixed rounded-2xl overflow-hidden w-[min(20rem,calc(100vw-2rem))]"
            style={{
              right: 'max(1rem, env(safe-area-inset-right))',
              bottom: 'calc(max(1.25rem, env(safe-area-inset-bottom)) + 70px)',
              background: pageBg, border: `1px solid ${accent}55`,
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)', maxHeight: '70vh',
            }}
            data-testid="more-dock-menu"
          >
            <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${accent}33`, background: `${accent}12` }}>
              <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: accent }}>More</div>
            </div>
            <div className="py-1 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 48px)' }}>
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { onActive(id); onMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{ color: textOnBg }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = `${accent}14`)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  data-testid={`more-dock-item-${id}`}
                >
                  <span className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0" style={{ background: `${accent}22`, color: accent }}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 text-[13px] tracking-wide" style={{ fontFamily: headingFont }}>{label}</span>
                  <ChevronRight className="w-3.5 h-3.5" style={{ color: `${accent}99` }} />
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Active section popup */}
      {active && (
        <SectionPopup
          title={active.label}
          icon={active.icon}
          accent={accent}
          pageBg={pageBg}
          textOnBg={textOnBg}
          mutedText={mutedText}
          headingFont={headingFont}
          onClose={() => onActive(null)}
        >
          {active.node}
        </SectionPopup>
      )}
    </>,
    document.body
  );
};

/* ────────────────────────────────────────────────────────────────────
   PhotoGallerySection — continuous infinite photo marquee.

   The previous setInterval "pause-and-step" scroller felt laggy/janky.
   Replaced with one GPU-cheap CSS transform animation:
   - Two identical photo copies in a single track; animate translateX
     0 → -50% (linear, infinite) so it loops seamlessly with no jump.
   - Pure `transform` on the GPU — no setInterval, no per-tile 3D — so it
     holds 60fps on mid-range phones.
   - Pauses on hover/touch (`:hover` / `:active`) so a guest can read a frame.
   - Every tile opens the full-screen lightbox via `openLightbox(src)`.
   - Honours prefers-reduced-motion (falls back to a manual scroll strip).
   ──────────────────────────────────────────────────────────────────── */
const GALLERY_PHOTOS = [
  'https://images.unsplash.com/photo-1604017011826-d3b4c23f8914?w=1200&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=1200&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1601471075416-8c19a6a565c5?w=1200&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1606800052052-a08af7148866?w=1200&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1591604466107-ec97de577aff?w=1200&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200&q=82&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1529636798458-92182e662485?w=1200&q=82&auto=format&fit=crop',
];

/* ────────────────────────────────────────────────────────────────────
   InlineCountdown — live ticker to the auspicious date + Add-to-Calendar.
   Readable on light themes (ink palette passed in). Calendar offers Google
   Calendar (link) and a downloadable .ics (Apple/Outlook). Renders nothing if
   the date can't be parsed.
   ──────────────────────────────────────────────────────────────────── */
const _pad2 = (n) => String(n).padStart(2, '0');
function _parseWhen(dateStr, timeStr) {
  const raw = `${dateStr || ''} ${timeStr || ''}`.trim();
  if (!raw) return null;
  let t = new Date(raw);
  if (isNaN(t.getTime())) t = new Date(dateStr || '');
  return isNaN(t.getTime()) ? null : t;
}
function _icsStamp(d) {
  return `${d.getFullYear()}${_pad2(d.getMonth() + 1)}${_pad2(d.getDate())}T${_pad2(d.getHours())}${_pad2(d.getMinutes())}00`;
}

const InlineCountdown = ({ dateStr, timeStr, title, venue, ink }) => {
  const target = React.useMemo(() => _parseWhen(dateStr, timeStr), [dateStr, timeStr]);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!target) return null;

  const diff = target.getTime() - now;
  const passed = diff <= 0;
  const abs = Math.max(0, diff);
  const units = [
    { label: 'Days', value: Math.floor(abs / 86400000) },
    { label: 'Hours', value: Math.floor(abs / 3600000) % 24 },
    { label: 'Mins', value: Math.floor(abs / 60000) % 60 },
    { label: 'Secs', value: Math.floor(abs / 1000) % 60 },
  ];

  const start = _icsStamp(target);
  const end = _icsStamp(new Date(target.getTime() + 3 * 3600000));
  const safeTitle = title || 'Our Wedding';
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE`
    + `&text=${encodeURIComponent(safeTitle)}`
    + `&dates=${start}/${end}`
    + `&location=${encodeURIComponent(venue || '')}`
    + `&details=${encodeURIComponent('Save the date — ' + safeTitle + ' 💍')}`;

  const downloadIcs = () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MAJA Invites//Invitation//EN',
      'BEGIN:VEVENT', `UID:${start}-maja@maja`, `DTSTAMP:${start}`,
      `DTSTART:${start}`, `DTEND:${end}`,
      `SUMMARY:${safeTitle}`, `LOCATION:${(venue || '').replace(/,/g, '\\,')}`,
      `DESCRIPTION:Save the date — ${safeTitle}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'maja-save-the-date.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const btn = {
    color: ink.inkInk, background: ink.inkSurface, border: `1px solid ${ink.inkBorder}`,
  };

  return (
    <section className="text-center" data-testid="inline-countdown">
      <div className="rounded-2xl px-5 py-7 max-w-2xl mx-auto"
        style={{ background: ink.inkSurface, border: `1px solid ${ink.inkBorder}`, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}>
        <div className="text-[10px] tracking-[0.45em] uppercase mb-4" style={{ color: ink.inkLabel }}>
          {passed ? '◆ The big day is here' : '◆ Counting down to the big day'}
        </div>
        {passed ? (
          <div className="font-display text-2xl mb-1" style={{ color: ink.inkInk }}>It's time! 🎉</div>
        ) : (
          <div className="flex items-stretch justify-center gap-2.5 mb-5">
            {units.map((u) => (
              <div key={u.label} className="rounded-xl px-3 py-2.5 min-w-[64px]"
                style={{ background: 'rgba(36,26,18,0.05)', border: `1px solid ${ink.inkBorder}` }}>
                <div className="font-display text-2xl md:text-3xl leading-none tabular-nums" style={{ color: ink.inkInk }}>
                  {_pad2(u.value)}
                </div>
                <div className="text-[9px] tracking-[0.2em] uppercase mt-1.5" style={{ color: ink.inkLabel }}>{u.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Add to calendar — Google + .ics */}
        <div className="flex items-center justify-center gap-2.5 flex-wrap">
          <a href={gcal} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase px-4 py-2.5 rounded-md no-underline"
            style={btn} data-testid="countdown-gcal">
            <CalendarPlus className="w-4 h-4" style={{ color: ink.inkLabel }} /> Google Calendar
          </a>
          <button onClick={downloadIcs}
            className="inline-flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase px-4 py-2.5 rounded-md"
            style={btn} data-testid="countdown-ics">
            <CalendarCheck className="w-4 h-4" style={{ color: ink.inkLabel }} /> Apple / Outlook
          </button>
        </div>
        <div className="text-[11px] mt-3" style={{ color: ink.inkBody }}>
          Add the auspicious date so you never forget it.
        </div>
      </div>
    </section>
  );
};

const PhotoGallerySection = ({ pageBg, accent, textOnBg, mutedText, headingFont, heroPhoto, compact = false }) => {
  const photos = React.useMemo(() => {
    const list = heroPhoto ? [heroPhoto, ...GALLERY_PHOTOS] : GALLERY_PHOTOS;
    // dedupe while preserving order
    return Array.from(new Set(list));
  }, [heroPhoto]);

  // Continuous marquee: one GPU-cheap transform animation, never stops.
  // The track holds TWO identical copies; translating it -50% lands exactly on
  // the start of the second copy → a seamless, jump-free infinite loop. Pure
  // CSS transform (no setInterval, no per-tile 3D) so it stays 60fps on phones.
  const loop = React.useMemo(() => [...photos, ...photos], [photos]);
  // ~5s of travel per photo keeps the pace gentle regardless of count.
  const duration = Math.max(photos.length, 4) * 5;

  const Tile = ({ src, i }) => (
    <figure
      className="relative rounded-xl overflow-hidden"
      style={{
        flex: '0 0 auto',
        width: compact ? 'min(56vw, 220px)' : 'min(72vw, 320px)',
        aspectRatio: '4 / 5',
        marginRight: compact ? 12 : 16,
        background: `${accent}18`,
        border: `1px solid ${accent}44`,
        boxShadow: '0 14px 30px rgba(0,0,0,0.18)',
      }}
      data-testid={`gallery-tile-${i}`}
    >
      <img
        src={src}
        alt={`Memory ${(i % photos.length) + 1}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        onClick={() => openLightbox(src)}
        onError={(e) => { if (e.currentTarget.src !== DEFAULT_COUPLE_PHOTO) e.currentTarget.src = DEFAULT_COUPLE_PHOTO; }}
        title="Tap to view full photo"
        className="w-full h-full object-cover"
        style={{ cursor: 'zoom-in' }}
      />
    </figure>
  );

  return (
    <section
      className="relative"
      data-testid="gallery-section"
      style={compact ? { paddingTop: 0, paddingBottom: 0 } : { paddingTop: '4.5rem', paddingBottom: '4.5rem' }}
    >
      {compact ? (
        <div className="text-center mb-4" data-testid="gallery-heading-compact">
          <div className="text-[10px] tracking-[0.45em] uppercase" style={{ color: accent }}>◆ Memories</div>
          <p className="mt-1.5 text-[11px]" style={{ color: mutedText }}>Tap any photo to view it full-screen.</p>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-6 md:px-16 mb-5">
          <Eyebrow accent={accent}>◆ Memories</Eyebrow>
          <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
            A few <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>frozen frames.</em>
          </SectionHeading>
          <p className="mt-2 text-sm" style={{ color: mutedText }}>
            Tap any photo to view it full-screen. Your wedding gallery will live here.
          </p>
        </div>
      )}

      {/* Marquee viewport — overflow hidden; the inner track slides forever. */}
      <div className="maja-marquee" style={{ overflow: 'hidden', width: '100%' }} data-testid="gallery-scroller">
        <div
          className="maja-marquee-track flex"
          style={{
            width: 'max-content',
            willChange: 'transform',
            animation: `maja-marquee ${duration}s linear infinite`,
          }}
        >
          {loop.map((src, i) => (
            <Tile key={`${src}-${i}`} src={src} i={i} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes maja-marquee {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        /* Pause when the guest hovers / touches so they can read a frame. */
        .maja-marquee:hover .maja-marquee-track,
        .maja-marquee:active .maja-marquee-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .maja-marquee-track { animation: none !important; }
          .maja-marquee { overflow-x: auto; }
        }
      `}</style>
    </section>
  );
};

/* ────────────────────────────────────────────────────────────────────
   CountdownSection — live D-H-M-S ticker until the wedding moment.
   Parses `weddingDate` flexibly ("14 February 2026", ISO, etc.). When
   the date is in the past or unparseable, the section renders a
   graceful "Just married" badge instead.
   ──────────────────────────────────────────────────────────────────── */
const parseWeddingDate = (s) => {
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  // "14 February 2026" style
  const m = String(s).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const mi = months.indexOf(m[2].toLowerCase());
    if (mi >= 0) return new Date(Number(m[3]), mi, Number(m[1]));
  }
  return null;
};

const CountdownSection = ({ pageBg, accent, textOnBg, mutedText, headingFont, weddingDate }) => {
  const target = React.useMemo(() => parseWeddingDate(weddingDate), [weddingDate]);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!target) return null;
  const diff = target.getTime() - now;
  const past = diff <= 0;
  const total = Math.max(0, diff);
  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const mins = Math.floor((total % 3_600_000) / 60_000);
  const secs = Math.floor((total % 60_000) / 1_000);
  const cells = [
    { v: days,  k: 'Days'    },
    { v: hours, k: 'Hours'   },
    { v: mins,  k: 'Minutes' },
    { v: secs,  k: 'Seconds' },
  ];
  return (
    <section
      className="relative"
      data-testid="countdown-section"
      style={{ paddingTop: '4rem', paddingBottom: '4rem' }}
    >
      <div className="max-w-3xl mx-auto px-6 md:px-16 text-center">
        <Eyebrow accent={accent}>◆ Countdown</Eyebrow>
        <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
          {past ? (
            <>Just <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>married.</em></>
          ) : (
            <>Until <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>we say I do.</em></>
          )}
        </SectionHeading>
        {!past && (
          <div className="mt-6 grid grid-cols-4 gap-3 md:gap-5">
            {cells.map((c) => (
              <div
                key={c.k}
                className="rounded-xl py-4 md:py-5 px-1 transition-transform"
                style={{
                  background: `${accent}14`,
                  border: `1px solid ${accent}44`,
                  color: textOnBg,
                  boxShadow: `0 8px 26px rgba(0,0,0,0.25), inset 0 0 0 1px ${accent}22`,
                }}
                data-testid={`countdown-${c.k.toLowerCase()}`}
              >
                <div className="font-display text-3xl md:text-5xl" style={{ color: accent }}>
                  {String(c.v).padStart(2, '0')}
                </div>
                <div className="mt-1 text-[10px] tracking-[0.3em] uppercase" style={{ color: mutedText }}>
                  {c.k}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};


/* ────────────────────────────────────────────────────────────────────
   SequentialPhotoReveal — NEW FLOW (Feb 2026 user spec):
     • Slide 1: Groom photo enters from the LEFT, bio text on the RIGHT
     • Slide 2: Bride photo enters from the RIGHT, bio text on the LEFT
     • Slide 3: Couple photo centered with couple-story text below
     • Slide 4: "Wedding Details" panel — date, time, nakshatram, muhurtam, venue

   Each slide animates in via IntersectionObserver as the user scrolls.
   The couple shot is also rendered as a soft blurred background behind
   slide 3 so the moment of "Together" feels cinematic.
   ──────────────────────────────────────────────────────────────────── */
const REVEAL_SHOTS = {
  groom: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=1200&q=82&auto=format&fit=crop',
  bride: 'https://images.unsplash.com/photo-1591604466107-ec97de577aff?w=1200&q=82&auto=format&fit=crop',
};

const SideRevealSlide = ({
  side,           // 'left' | 'right'  — which side the PHOTO enters from
  label,
  name,
  bio,
  photo,
  accent,
  textOnBg,
  mutedText,
  headingFont,
  testid,
}) => {
  const ref = React.useRef(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const photoEnter  = visible ? 'translateX(0)' : (side === 'left' ? 'translateX(-80px)' : 'translateX(80px)');
  const textEnter   = visible ? 'translateX(0)' : (side === 'left' ? 'translateX(60px)'  : 'translateX(-60px)');
  return (
    <div
      ref={ref}
      className={`relative grid grid-cols-1 md:grid-cols-2 items-center gap-6 md:gap-12 px-6 md:px-16 py-14 ${
        side === 'right' ? 'md:[direction:rtl]' : ''
      }`}
      data-testid={testid}
    >
      {/* Photo column */}
      <div
        className="relative rounded-2xl overflow-hidden transition-all duration-[1100ms] ease-out md:[direction:ltr]"
        style={{
          width: '100%',
          maxWidth: 460,
          aspectRatio: '4/5',
          background: `${accent}18`,
          border: `1px solid ${accent}55`,
          boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
          opacity: visible ? 1 : 0,
          transform: photoEnter,
          justifySelf: side === 'right' ? 'end' : 'start',
        }}
      >
        <img
          src={photo}
          alt={`${label} portrait`}
          loading="lazy"
          decoding="async"
          onClick={() => openLightbox(photo)}
          onError={(e) => { if (e.currentTarget.src !== DEFAULT_COUPLE_PHOTO) e.currentTarget.src = DEFAULT_COUPLE_PHOTO; }}
          title="Tap to view full photo"
          className="w-full h-full object-cover"
          style={{ cursor: 'zoom-in' }}
        />
        <div
          className="absolute inset-0 flex flex-col justify-end p-5 md:[direction:ltr]"
          style={{ background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.7) 100%)' }}
        >
          <div className="text-[10px] tracking-[0.4em] uppercase" style={{ color: '#FFF8DC' }}>{label}</div>
          <div className="font-display text-2xl mt-1" style={{ color: '#FFF8DC', fontFamily: `${headingFont}, serif` }}>{name}</div>
        </div>
      </div>

      {/* Text column */}
      <div
        className="md:[direction:ltr] transition-all duration-[1100ms] ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: textEnter,
          transitionDelay: '180ms',
        }}
      >
        <div className="text-[10px] tracking-[0.4em] uppercase mb-2" style={{ color: accent }}>{label}</div>
        <div className="font-display text-3xl md:text-4xl mb-3" style={{ color: textOnBg, fontFamily: `${headingFont}, serif` }}>
          {name}
        </div>
        <p className="text-[15px] leading-relaxed" style={{ color: mutedText }}>
          {bio || `${name} carries a quiet warmth and a heart full of dreams — kind, radiant, and ready to begin this beautiful new chapter.`}
        </p>
      </div>
    </div>
  );
};

const CoupleTogetherSlide = ({ bride, groom, photo, story, accent, textOnBg, mutedText, headingFont }) => {
  const ref = React.useRef(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="relative grid place-items-center min-h-[90vh] py-16"
      data-testid="reveal-slide-couple"
    >
      {photo && (
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: 0.2 }}>
          <img src={photo} alt="" className="w-full h-full object-cover blur-lg scale-110" />
        </div>
      )}
      <div
        className="relative text-center max-w-2xl px-6 md:px-16 transition-all duration-[1200ms] ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(40px)',
        }}
      >
        <div
          className="relative mx-auto mb-6 rounded-2xl overflow-hidden"
          style={{
            width: 'min(72vw, 380px)',
            aspectRatio: '4/5',
            background: `${accent}18`,
            border: `1px solid ${accent}55`,
            boxShadow: '0 35px 70px rgba(0,0,0,0.55)',
          }}
        >
          <img src={photo} alt="Couple" loading="lazy" decoding="async" onClick={() => openLightbox(photo)} onError={(e) => { if (e.currentTarget.src !== DEFAULT_COUPLE_PHOTO) e.currentTarget.src = DEFAULT_COUPLE_PHOTO; }} title="Tap to view full photo" className="w-full h-full object-cover" style={{ cursor: 'zoom-in' }} />
        </div>
        <div className="text-[10px] tracking-[0.4em] uppercase mb-2" style={{ color: accent }}>Together</div>
        <div
          className="font-display text-4xl md:text-5xl mb-3"
          style={{ color: textOnBg, fontFamily: `${headingFont}, serif` }}
        >
          {groom} <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>&amp;</em> {bride}
        </div>
        <p className="text-[15px] leading-relaxed" style={{ color: mutedText }}>
          {story || `Their story will be filled in by the photographer in the Couple step — the joint paragraph of how they met, fell in love, and decided to spend forever together.`}
        </p>
      </div>
    </div>
  );
};

const WeddingDetailsSlide = ({ date, time, nakshatram, muhurtam, venue, accent, textOnBg, mutedText, headingFont }) => {
  const rows = [
    { label: 'Date',       value: date,       testid: 'detail-date' },
    { label: 'Time',       value: time,       testid: 'detail-time' },
    { label: 'Muhurtam',   value: muhurtam,   testid: 'detail-muhurtam' },
    { label: 'Nakshatram', value: nakshatram, testid: 'detail-nakshatram' },
    { label: 'Venue',      value: venue,      testid: 'detail-venue' },
  ].filter((r) => r.value);
  if (rows.length === 0) return null;
  return (
    <section
      className="relative max-w-3xl mx-auto px-6 md:px-16 py-16"
      data-testid="wedding-details-panel"
    >
      <Eyebrow accent={accent}>◆ Wedding details</Eyebrow>
      <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
        Save the <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>moment.</em>
      </SectionHeading>
      <dl
        className="mt-6 rounded-2xl divide-y"
        style={{
          background: `${accent}10`,
          border: `1px solid ${accent}33`,
        }}
      >
        {rows.map((r) => (
          <div
            key={r.testid}
            className="flex items-baseline justify-between gap-6 py-3 px-5"
            style={{ borderColor: `${accent}22` }}
            data-testid={r.testid}
          >
            <dt className="text-[11px] tracking-[0.3em] uppercase" style={{ color: mutedText }}>{r.label}</dt>
            <dd className="font-display text-lg text-right" style={{ color: textOnBg }}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const SequentialPhotoReveal = ({
  pageBg, accent, textOnBg, mutedText, headingFont,
  bride, groom, heroPhoto,
  brideBio, groomBio, coupleStory,
  weddingDate, weddingTime, venue, nakshatram, muhurtam,
}) => (
  <section
    className="relative"
    data-testid="sequential-photo-reveal"
    style={{ paddingTop: '2rem', paddingBottom: '2rem', background: pageBg }}
  >
    <div className="max-w-3xl mx-auto px-6 md:px-16 text-center mb-6">
      <Eyebrow accent={accent}>◆ Meet the couple</Eyebrow>
      <SectionHeading font={headingFont} color={textOnBg} accent={accent}>
        Two stories <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>one love.</em>
      </SectionHeading>
      <p className="mt-2 text-sm" style={{ color: mutedText }}>
        Scroll to meet {groom}, then {bride}, then the two of them together.
      </p>
    </div>

    <SideRevealSlide
      side="left"
      label="The Groom"
      name={groom}
      bio={groomBio}
      photo={REVEAL_SHOTS.groom}
      accent={accent}
      textOnBg={textOnBg}
      mutedText={mutedText}
      headingFont={headingFont}
      testid="reveal-slide-groom"
    />
    <SideRevealSlide
      side="right"
      label="The Bride"
      name={bride}
      bio={brideBio}
      photo={REVEAL_SHOTS.bride}
      accent={accent}
      textOnBg={textOnBg}
      mutedText={mutedText}
      headingFont={headingFont}
      testid="reveal-slide-bride"
    />
    <CoupleTogetherSlide
      bride={bride}
      groom={groom}
      photo={heroPhoto}
      story={coupleStory}
      accent={accent}
      textOnBg={textOnBg}
      mutedText={mutedText}
      headingFont={headingFont}
    />
    <WeddingDetailsSlide
      date={weddingDate}
      time={weddingTime}
      venue={venue}
      nakshatram={nakshatram}
      muhurtam={muhurtam}
      accent={accent}
      textOnBg={textOnBg}
      mutedText={mutedText}
      headingFont={headingFont}
    />
  </section>
);


/* ────────────────────────────────────────────────────────────────────
   PetalBurstOverlay — petal-shower bursts on scroll / touch.
   Listens to wheel + touchmove and emits a short-lived cluster of
   animated petals from the cursor / touch point. Uses requestAnimationFrame
   for 60fps, and removes finished petals via a state cleanup so we never
   leak DOM nodes.
   ──────────────────────────────────────────────────────────────────── */
// DISABLED 2026-06: this spawned petals from the cursor/touch on every
// pointermove/wheel/touchmove — distracting and heavy. Stubbed to a no-op so
// no cursor-driven effect runs anywhere. Dead legacy body kept below.
const PetalBurstOverlay = () => null;
// eslint-disable-next-line no-unused-vars
const _PetalBurstOverlayLegacy = ({ accent = '#D4AF37' }) => {
  const [petals, setPetals] = React.useState([]);
  const lastEmit = React.useRef(0);

  React.useEffect(() => {
    const emit = (x, y) => {
      const now = Date.now();
      if (now - lastEmit.current < 150) return; // throttle
      lastEmit.current = now;
      const burst = Array.from({ length: 5 }).map((_, i) => ({
        id: `${now}-${i}`,
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 20,
        dx: (Math.random() - 0.5) * 140,
        dy: 120 + Math.random() * 200,
        rot: (Math.random() - 0.5) * 540,
        size: 10 + Math.random() * 14,
        hue: ['#F5C2D6', '#FCE0A6', accent, '#FFB0C5', '#FFD8A8'][Math.floor(Math.random() * 5)],
        born: now,
      }));
      setPetals((p) => [...p, ...burst].slice(-80));
    };

    const onWheel = (e) => emit(e.clientX || window.innerWidth / 2, e.clientY || 120);
    const onTouchMove = (e) => {
      const t = e.touches?.[0];
      if (t) emit(t.clientX, t.clientY);
    };
    let lastPointerEmit = 0;
    const onPointerMove = (e) => {
      // Pointer-move can fire 100+ times/sec — throttle stricter than scroll.
      const now = Date.now();
      if (now - lastPointerEmit < 250) return;
      lastPointerEmit = now;
      emit(e.clientX, e.clientY);
    };
    window.addEventListener('wheel',       onWheel,       { passive: true });
    window.addEventListener('touchmove',   onTouchMove,   { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const sweep = setInterval(() => {
      const cutoff = Date.now() - 2200;
      setPetals((p) => p.filter((x) => x.born > cutoff));
    }, 600);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointermove', onPointerMove);
      clearInterval(sweep);
    };
  }, [accent]);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 30,
        overflow: 'hidden',
      }}
      data-testid="petal-burst-overlay"
    >
      {petals.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size * 1.4,
            borderRadius: '40% 60% 60% 40% / 60% 30% 70% 40%',
            background: `linear-gradient(180deg, ${p.hue}cc, ${p.hue}99)`,
            boxShadow: `0 0 12px ${p.hue}66`,
            transform: 'translate3d(0,0,0)',
            animation: 'maja-petal-fall 2.1s ease-out forwards',
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--rot': `${p.rot}deg`,
          }}
        />
      ))}
      <style>{`
        @keyframes maja-petal-fall {
          0%   { opacity: 0;  transform: translate3d(0, -10px, 0) rotate(0deg); }
          15%  { opacity: 1; }
          100% { opacity: 0;  transform: translate3d(var(--dx, 0), var(--dy, 100px), 0) rotate(var(--rot, 180deg)); }
        }
      `}</style>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────
   PreviewFooter — the very last thing the guest scrolls into.
   Renders the couple photo as a full-bleed background (zoomed slow),
   with the bride+groom names overlaid in a glassy card. Caps the rich
   preview with a "matched bookend" to the opening banner.
   ──────────────────────────────────────────────────────────────────── */
const PreviewFooter = ({ couplePhoto, bride, groom, accent, headingFont }) => {
  const ref = React.useRef(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section
      ref={ref}
      className="relative overflow-hidden"
      style={{ minHeight: '70vh' }}
      data-testid="preview-footer"
    >
      {/* Couple-photo bg — zoomed and slow-panned via CSS keyframes */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        {couplePhoto && (
          <img
            src={couplePhoto}
            alt=""
            className="w-full h-full object-cover"
            style={{
              transform: visible ? 'scale(1.05)' : 'scale(1.15)',
              transition: 'transform 6s ease-out',
              opacity: 0.45,
            }}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(8,5,3,0.4) 0%, rgba(8,5,3,0.85) 100%)',
          }}
        />
      </div>

      <div
        className="relative grid place-items-center text-center px-6 md:px-16"
        style={{ minHeight: '70vh' }}
      >
        <div
          className="rounded-2xl px-8 py-10 max-w-xl"
          style={{
            background: 'rgba(8,5,3,0.4)',
            border: `1px solid ${accent}55`,
            backdropFilter: 'blur(8px)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(40px)',
            transition: 'opacity 1.2s ease-out, transform 1.2s ease-out',
          }}
          data-testid="preview-footer-card"
        >
          <div className="text-[10px] tracking-[0.4em] uppercase mb-3" style={{ color: accent }}>
            ◆ With love
          </div>
          <div
            className="font-display text-4xl md:text-5xl mb-3"
            style={{ color: '#FFF8DC', fontFamily: `${headingFont}, serif` }}
          >
            {groom} <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>&amp;</em> {bride}
          </div>
          <div className="text-sm tracking-[0.2em] uppercase" style={{ color: 'rgba(255,248,220,0.85)' }}>
            Thank you for being part of our forever
          </div>
        </div>
      </div>
    </section>
  );
};

export default DesignFullPreview;
