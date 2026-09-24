import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import axios from 'axios';
import { Calendar, MapPin, Send, Heart, MessageCircle, Clock, Sparkles, Lock, Utensils, Image as ImageIcon } from 'lucide-react';
import WaxSealOpening from '@/components/luxury/WaxSealOpening';
import { OpeningOrchestrator, ClosingOrchestrator } from '@/themes/shared/ThemeAnimationOrchestrator';
import PetalConfetti from '@/components/luxury/PetalConfetti';
import AmbientMusicPlayer from '@/components/luxury/AmbientMusicPlayer';
import WatermarkOverlay from '@/components/luxury/WatermarkOverlay';
import MandalaLoader from '@/components/luxury/MandalaLoader';
import ScrollSection from '@/components/luxury/ScrollSection';
import DigitalShagunSection from '@/components/luxury/DigitalShagunSection';
import TravelLinksSection from '@/components/luxury/TravelLinksSection';
import VenuesSection from '@/components/luxury/VenuesSection';
import GiftRegistrySection from '@/components/luxury/GiftRegistrySection';
import LivePhotoWallTeaser from '@/components/luxury/LivePhotoWallTeaser';
import WishesWallSection from '@/components/luxury/WishesWallSection';
import FindMyPhotosModal from '@/components/luxury/FindMyPhotosModal';
import WhatsAppShare from '@/components/luxury/WhatsAppShare';
import FoodDonationSection from '@/components/luxury/FoodDonationSection';
import FindMyRoomSection from '@/components/luxury/FindMyRoomSection';
import PreWeddingSection from '@/components/luxury/PreWeddingSection';
import MajaReferralCTA from '@/components/luxury/MajaReferralCTA';
import PersonalizedWelcome from '@/components/luxury/PersonalizedWelcome';
import HoneymoonFundSection from '@/components/luxury/HoneymoonFundSection';
import AddToCalendarButton from '@/components/luxury/AddToCalendarButton';
import LiveStreamSection from '@/components/luxury/LiveStreamSection';
import LiveTimelineSection from '@/components/luxury/LiveTimelineSection';
import SongRequestSection from '@/components/luxury/SongRequestSection';
import CheckInSection from '@/components/luxury/CheckInSection';
import DressCodeSection from '@/components/luxury/DressCodeSection';
import FaqSection from '@/components/luxury/FaqSection';
import { getThemeById } from '@/themes/masterThemes';
import { resolveDesign, resolveHeroDesign, findDesignById, normaliseEvent, pageBgForDesign, useResolvedThemeDesigns } from '@/themes/themeDesignResolver';
import UniversalDesignRenderer from '@/themes/UniversalDesignRenderer';
import SmartImage from '@/components/perf/SmartImage';
import { classifyMealTime, formatMealTime } from '@/utils/mealTime';
import { featureGate } from '@/utils/featureAccess';
import { InvitePrefetchContext } from '@/context/InvitePrefetchContext';
import '@/styles/luxury.css';
// ---------------------------------------------------------------------------
// PERF — these four were STATIC imports, so every guest downloaded and parsed
// them before the invitation could paint even when they never render:
//
//   Invitation3DScene   pulls in three.js (~600 KB raw). It only renders when a
//                       studio opts into experience_3d, which almost nobody has.
//   CelebrationPublicView  a second 1,766-line public view used ONLY for
//                       non-wedding categories — dead weight on every wedding.
//   ThemeAnimatedBackground / TouchParticles  decorative canvas layers.
//
// Lazy now, so the first paint waits for the invitation itself and nothing else.
// Each is decorative or conditional, so a null fallback is correct — nothing
// pops in late where content should have been.
// ---------------------------------------------------------------------------
const Invitation3DScene = lazy(() => import('@/components/luxury/Invitation3DScene'));
const CelebrationPublicView = lazy(() => import('@/components/luxury/CelebrationPublicView'));
const ThemeAnimatedBackground = lazy(() => import('@/components/ThemeAnimatedBackground'));
const TouchParticles = lazy(() => import('@/components/TouchParticles'));


const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const LuxuryPublicInvitation = () => {
  // BUG H FIX: the per-event share link is /invite/:slug/:eventType (the QR
  // codes on event invitation cards point here). Previously the component
  // ignored `eventType` entirely, so scanning a Reception-specific QR opened
  // the full wedding invitation with no acknowledgement of the event. We now
  // read the param and, after the invitation finishes loading, scroll the
  // matching event section into view so the guest lands on the right
  // ceremony details. The other sections remain accessible by scrolling so
  // we don't break the full-invitation reading experience.
  const { slug, eventType } = useParams();
  const [searchParams] = useSearchParams();
  const guestToken = searchParams.get('g');
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [requirePasscode, setRequirePasscode] = useState(false);
  const [rsvpDone, setRsvpDone] = useState(false);
  const [wishDone, setWishDone] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState(null);
  const [prefetch, setPrefetch] = useState(null); // batched side-data
  const [findOpen, setFindOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState('');
  const footerRef = useRef(null);

  // Load this invitation's design catalogue chunk. MUST be here, above the
  // early returns (rules of hooks) — `data` is null on the first render and the
  // hook no-ops until the fetch lands. Without it the resolveDesign() calls
  // further down read an empty cache and render no design at all.
  useResolvedThemeDesigns(data?.design_id || data?.design_theme || 'royal_mughal');

  useEffect(() => {
    // Apply light theme for invitation pages - remove dark overlays
    document.body.classList.add('luxe');
    document.body.classList.remove('luxe-grain', 'luxe-vignette');
    // Add light background
    document.body.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)';
    return () => {
      document.body.classList.remove('luxe');
      document.body.style.background = '';
    };
  }, []);

  useEffect(() => { fetchInvite(); /* eslint-disable-next-line */ }, [slug]);

  // NOTE: galleryInfo is now populated by the batched /full endpoint below.
  // We keep this as a fallback in case /full failed (e.g. older backend deploy).
  useEffect(() => {
    if (!slug) return;
    if (galleryInfo !== null) return; // already loaded via /full
    if (prefetch?.slug === slug) return;
    const t = setTimeout(() => {
      axios.get(`${API_URL}/api/public/gallery/${slug}/info`)
        .then((r) => setGalleryInfo(r.data))
        .catch(() => setGalleryInfo(null));
    }, 800); // delay so /full has time to land first
    return () => clearTimeout(t);
  }, [slug, galleryInfo, prefetch]);

  const fetchInvite = async (code = null) => {
    setLoading(true); setError('');
    try {
      // Mobile-perf: prefer the batched /full endpoint — one round trip instead
      // of 8+. Falls back to the legacy /invite/{slug} if /full is unavailable
      // (e.g. older backend deploy, passcode-protected invitation, etc.).
      if (!code) {
        try {
          const full = await axios.get(`${API_URL}/api/invite/${slug}/full`);
          const fd = full.data || {};
          if (fd.invite) {
            setData(fd.invite);
            setGalleryInfo(fd.gallery_info || null);
            setPrefetch({
              slug,
              wishes:        fd.wishes        || [],
              gifts:         fd.gifts         || null,
              blessings:     fd.blessings     || { total_count: 0, recent: [] },
              gallery_info:  fd.gallery_info  || null,
              shagun_enabled: !!fd.shagun_enabled,
              shagun:        fd.shagun        || null,
              venues:        fd.venues        || null,
              travel:        fd.travel        || null,
              referral_code: fd.referral_code || null,
            });
            setRequirePasscode(false);
            return;
          }
        } catch (eFull) {
          if (eFull.response?.status === 401 || eFull.response?.status === 403) {
            setRequirePasscode(true);
            return;
          }
          if (eFull.response?.status === 404) {
            setError('This invitation could not be found.');
            return;
          }
          if (eFull.response?.status === 410) {
            setError('This invitation has expired.');
            return;
          }
          // soft-fail → fall through to legacy single endpoint
        }
      }
      const url = `${API_URL}/api/invite/${slug}${code ? `?passcode=${encodeURIComponent(code)}` : ''}`;
      const res = await axios.get(url);
      setData(res.data);
      setRequirePasscode(false);
    } catch (e) {
      if (e.response?.status === 401 || e.response?.status === 403) {
        setRequirePasscode(true);
      } else if (e.response?.status === 404) {
        setError('This invitation could not be found.');
      } else if (e.response?.status === 410) {
        setError('This invitation has expired.');
      } else {
        setError(e.response?.data?.detail || 'Failed to load invitation.');
      }
    } finally { setLoading(false); }
  };

  // BUG H FIX: when the URL includes /:eventType (per-event QR scan),
  // scroll the matching event card into view a beat after the invitation
  // finishes loading. We look for a section / element marked with either
  // `data-event-type` or the standard `testid="section-event-{type}"`
  // pattern. Fail silently if no match exists (the invitation may not have
  // events that match a stale QR).
  useEffect(() => {
    if (!eventType || !data || loading) return;
    const norm = String(eventType).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const target = setTimeout(() => {
      const el =
        document.querySelector(`[data-event-type="${norm}"]`) ||
        document.querySelector(`[data-testid="section-event-${norm}"]`) ||
        document.querySelector(`[data-testid="event-${norm}"]`) ||
        document.getElementById(`event-${norm}`);
      if (el && typeof el.scrollIntoView === 'function') {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_e) {}
      }
    }, 900); // wait for hero / opening to settle
    return () => clearTimeout(target);
  }, [eventType, data, loading]);

  // Prompt 02 — Cinematic opening hooks (must be called unconditionally)
  // Opening animation is automatically skipped on:
  //   1. ?skip_intro=1 query string (dev/testing)
  //   2. ANY mobile/tablet viewport (<1024 px) — the cinematic Three.js
  //      opening was the #1 cause of "page freezes after open" on phones
  //   3. Users with `prefers-reduced-motion: reduce`
  // On desktop it still plays in full.
  const [openingDone, setOpeningDone] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (searchParams.get('skip_intro') === '1') return true;
    const isMobileLike = window.matchMedia('(max-width: 1023px)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return isMobileLike || reduced;
  });

  // SAFETY: tighter safety net so guests on slow networks aren't trapped
  // behind a frozen splash. Was 6 s — dropped to 3 s.
  useEffect(() => {
    if (openingDone) return;
    const id = setTimeout(() => setOpeningDone(true), 3000);
    return () => clearTimeout(id);
  }, [openingDone]);
  const formattedDate = React.useMemo(() => {
    if (!data?.event_date) return '';
    try {
      return new Date(data.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) { return ''; }
  }, [data?.event_date]);

  if (loading) {
    return <div className="luxe min-h-screen grid place-items-center"><MandalaLoader label="Opening invitation" /></div>;
  }

  if (requirePasscode) {
    return (
      <div className="luxe min-h-screen grid place-items-center px-6">
        <form onSubmit={(e) => { e.preventDefault(); fetchInvite(passcode); }}
          className="px-glass p-10 max-w-md w-full text-center" data-testid="passcode-form">
          <div className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-5"
            style={{ background: 'linear-gradient(135deg, var(--px-secondary), var(--px-primary))' }}>
            <Lock className="w-5 h-5" style={{ color: '#fff' }} />
          </div>
          <span className="px-eyebrow block mb-3">◆ Private Invitation</span>
          <h2 className="px-section-title mb-2" style={{ fontSize: 'clamp(1.6rem, 4vw, 1.9rem)' }}>Passcode required</h2>
          <p className="px-section-sub mb-5">This invitation is locked. Please enter the passcode shared with you.</p>
          <input type="text" value={passcode} onChange={(e) => setPasscode(e.target.value)} required
            placeholder="••••••" className="px-input text-center mb-4"
            style={{ letterSpacing: '0.4em' }} data-testid="passcode-input" />
          <button type="submit" className="px-btn w-full justify-center" data-testid="passcode-submit">Unlock</button>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="luxe min-h-screen grid place-items-center px-6">
        <div className="px-glass p-10 max-w-md text-center" data-testid="invite-error">
          <h2 className="px-section-title mb-3" style={{ fontSize: 'clamp(1.6rem, 4vw, 1.9rem)' }}>Oh dear.</h2>
          <p className="px-section-sub mb-6">{error}</p>
          <button onClick={() => navigate('/')} className="px-btn px-btn-secondary">Back to studio</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // ── 2026 — Universal Invitations: route non-wedding categories to a
  // dedicated, category-aware viewer. The wedding flow below is preserved
  // 100% intact.
  if (data.invitation_category && data.invitation_category !== 'wedding') {
    return (
      <InvitePrefetchContext.Provider value={prefetch}>
        <Suspense fallback={<MandalaLoader />}>
          <CelebrationPublicView data={data} />
        </Suspense>
      </InvitePrefetchContext.Provider>
    );
  }

  // Backend returns FLAT InvitationPublicView (not wrapped in `profile`)
  const themeId = data.design_id || data.design_theme || 'royal_mughal';
  const theme = getThemeById(themeId);
  const bride = data.bride_name || 'Bride';
  const groom = data.groom_name || 'Groom';
  const monogram = `${(bride[0] || 'A').toUpperCase()} & ${(groom[0] || 'B').toUpperCase()}`;
  const weddingDate = data.event_date ? new Date(data.event_date) : null;
  // Feb 2026 — meal_time persisted under custom_text._maja.meal_time
  // (Lunch / Dinner / Snacks chip on hero banner).  Stored as "HH:MM" 24h.
  const mealTime = (data.custom_text?._maja?.meal_time)
    || data.meal_time
    || '';
  // Merge backend-validated events with the form's extended events (which
  // carry the per-event visibility flag, hero photo, etc., persisted under
  // custom_text._maja). Filter out any ceremony explicitly disabled by the
  // photographer so guests never see ceremonies marked off.
  let events = data.events || [];
  try {
    const majaRaw = data.custom_text?._maja?.events_extended;
    if (majaRaw) {
      const ext = typeof majaRaw === 'string' ? JSON.parse(majaRaw) : majaRaw;
      if (Array.isArray(ext) && ext.length > 0) events = ext;
    }
  } catch (_) { /* ignore parse errors, keep backend events */ }
  events = events.filter((e) => e?.visible !== false);
  const greetings = (data.greetings || []).slice(0, 8);
  const planType = data.plan_type || 'FREE';
  // Phase 3 P1 — Public renderer respects admin override + user setting.
  // Backend computes data.requires_watermark via feature_gating; legacy
  // plan-type fallback preserved if the field is absent on older payloads.
  const watermark = (typeof data.requires_watermark === 'boolean')
    ? data.requires_watermark
    : planType === 'FREE';
  const musicUrl = data.background_music?.file_url || data.background_music?.url || '';

  // Unified Pricing Engine — feature-pack visibility. `can(key)` is permissive for
  // legacy / grandfathered links and while new_pricing_enabled is OFF (payload
  // granted_features == null); otherwise it hides packable features not purchased.
  const can = featureGate(data);
  const canLiveGallery = can('qr_live_gallery') || can('enhanced_gallery');
  const canFaceMatch   = can('ai_face_match') || can('selfie_search');

  // ── Multi-language: pull translations + render language picker.
  // `data.translations` is { language_code: { field: translatedText } }.
  // We default to the data's primary language (or the first available
  // translation) and let the user toggle.  Each translated text falls
  // back to the original (English) value when missing.
  const availableLangs = Object.keys(data.translations || {});
  const baseLang = (data.language && data.language[0]) || 'english';
  const allLangs = Array.from(new Set([baseLang, ...availableLangs]));
  const activeLang = selectedLang || baseLang;
  const tr = (fieldName, fallback) => {
    if (activeLang === baseLang) return fallback;
    const t = data.translations?.[activeLang]?.[fieldName];
    return t || fallback;
  };

  const venueText = tr('venue', data.venue || '');
  const venueAddress = tr('city', data.city || '');
  const story = tr('love_story', data.love_story || data.story || '');
  const brideAbout = tr('bride_about', data.bride_about || '');
  const groomAbout = tr('groom_about', data.groom_about || '');
  const guestRooms = Array.isArray(data.guest_rooms) ? data.guest_rooms : [];
  const preWeddingLinks = Array.isArray(data.pre_wedding_links) ? data.pre_wedding_links : [];
  const resolveUrl = (u) => {
    if (!u) return '';
    if (u.startsWith('data:')) return u;
    // Use the universal media-url helper so /uploads/... gets rewritten to
    // /api/uploads/... — without that, the K8s ingress sends the request
    // to the React SPA instead of the FastAPI service and the browser
    // gets back index.html (broken image icon).
    if (u.startsWith('http')) {
      return u.replace(/(https?:\/\/[^/]+)\/uploads\//i, `$1/api/uploads/`);
    }
    const path = u.startsWith('/uploads/') ? `/api${u}` : u;
    return `${API_URL}${path}`;
  };
  // Per-photo enable/disable toggles (Feb 2026). Default true for legacy
  // profiles. When false, the photo isn't rendered even if a URL exists —
  // toggling back on restores the saved URL without a re-upload.
  const showBride  = data.show_bride_photo  !== false;
  const showGroom  = data.show_groom_photo  !== false;
  const showCouple = data.show_couple_photo !== false;
  const bridePhoto  = showBride  ? resolveUrl(data.bride_photo_url || '') : '';
  const groomPhoto  = showGroom  ? resolveUrl(data.groom_photo_url || '') : '';
  const couplePhoto = showCouple ? resolveUrl(
    data.couple_photo_url
      || (data.cover_photo_id ? `/api/media/${data.cover_photo_id}` : '')
      || ''
  ) : '';

  // Resolve the marquee invitation design + per-event designs from the catalogue.
  // design_selections (optional, populated by photographer in profile form) is a
  // map of event → designId (P0 Task 2 will expose this picker in the form).
  const designSelections = data.design_selections || {};
  const heroResolved = resolveHeroDesign(themeId, designSelections);
  const resolvedPerEvent = (events || []).map((evt) => {
    const evtKey = normaliseEvent(evt.event_type || evt.type);
    const sel = designSelections[evtKey];
    if (sel) {
      const found = findDesignById(themeId, sel);
      if (found) return { evt, ...found };
    }
    const r = resolveDesign(themeId, evtKey, 0);
    return r ? { evt, ...r } : { evt, theme: null, design: null, event: evtKey };
  });

  /* Resolve the opening (link-open) background photo with sensible fallbacks.
   * Priority:
   *   1. opening_photo_url (custom upload OR resolved bride/groom/couple URL)
   *   2. couple_photo_url
   *   3. cover photo
   *   4. hero design image (last resort)
   */
  const openingBgUrl = resolveUrl(
    data.opening_photo_url
      || data.couple_photo_url
      || (data.cover_photo_id ? `/api/media/${data.cover_photo_id}` : '')
      || ''
  );

  // Determine primary event type for opening/closing animations
  // (the main public invitation defaults to the wedding "marriage" event;
  // per-event invitation routes can override via ?event= in future)
  const primaryEventType = (() => {
    if (data.primary_event_type) return data.primary_event_type;
    const marriageEvt = (events || []).find((e) => normaliseEvent(e.event_type || e.type) === 'marriage');
    if (marriageEvt) return 'marriage';
    if (events && events[0]) return normaliseEvent(events[0].event_type || events[0].type);
    return 'marriage';
  })();

  return (
    <InvitePrefetchContext.Provider value={prefetch}>
      <>
      {/* 3D Theme-Based Animated Background - ONLY for invitation pages.
          Lazy + null fallback: decorative, so it fades in behind the content
          instead of holding up the first paint. */}
      <Suspense fallback={null}>
        <ThemeAnimatedBackground theme={themeId || 'temple'} />
        <TouchParticles theme={themeId || 'temple'} />
      </Suspense>
      
      {/* Universal opening (Feb 2026) — single 2.5 s zoom-in over the
          couple's chosen opening photo with bride & groom names. Replaces
          all previous per-theme 3D openings. */}
      {!openingDone && (
        <OpeningOrchestrator
          themeId={themeId}
          eventType={primaryEventType}
          image={heroResolved?.design?.image}
          openingImage={openingBgUrl}
          couplePhoto={couplePhoto}
          bride={bride}
          groom={groom}
          date={formattedDate}
          monogram={monogram}
          onComplete={() => setOpeningDone(true)}
        />
      )}

      <div className="luxe min-h-screen relative" data-testid="public-invitation"
        style={{
          opacity: openingDone ? 1 : 0,
          transition: 'opacity 0.55s ease',
          pointerEvents: openingDone ? 'auto' : 'none',
          background: 'transparent',
        }}>
        {/* 2026 — Universal Invitation Category banner.
            Surfaces the invitation type (Baby Birthday / Half Saree / Puberty / Dhoti)
            to guests so they immediately recognise the ceremony. Wedding is the
            default and intentionally hides this banner. */}
        {data.invitation_category && data.invitation_category !== 'wedding' && (() => {
          const ICONS = { baby_birthday: '🎂', half_saree: '👗', puberty: '🌸', dhoti: '👔' };
          const LABELS = {
            baby_birthday: 'Baby Birthday',
            half_saree:    'Half Saree Ceremony',
            puberty:       'Puberty Ceremony',
            dhoti:         'Dhoti Ceremony',
          };
          const ci = data.celebrant_info || {};
          const ordinal = (n) => {
            const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
          };
          const subtitle = (() => {
            if (data.invitation_category === 'baby_birthday' && ci.age_turning) {
              return `${ci.celebrant_name || data.groom_name}'s ${ordinal(ci.age_turning)} Birthday`;
            }
            return `Celebrating ${ci.celebrant_name || data.groom_name}`;
          })();
          return (
            <div className="relative z-30 pointer-events-none w-full px-4 pt-3 sm:pt-5">
              <div className="max-w-3xl mx-auto pointer-events-auto rounded-full flex items-center justify-center gap-2 px-4 py-2"
                style={{ background: 'rgba(11,9,8,0.62)', backdropFilter: 'blur(10px)', border: '1px solid rgba(212,175,55,0.35)' }}
                data-testid="invitation-category-banner">
                <span className="text-lg">{ICONS[data.invitation_category] || '✦'}</span>
                <span className="text-[10px] sm:text-xs tracking-[0.3em] uppercase"
                  style={{ color: '#D4AF37' }}>
                  {LABELS[data.invitation_category] || 'Celebration'}
                </span>
                <span className="hidden sm:inline opacity-50" style={{ color: '#FFF8DC' }}>·</span>
                <span className="hidden sm:inline text-xs" style={{ color: 'rgba(255,248,220,0.85)' }}>
                  {subtitle}
                </span>
              </div>
            </div>
          );
        })()}
        {/* Phase 3A — couple-photo page backdrop.
            iOS Safari note: `background-attachment: fixed` and large CSS
            `filter: blur()` BOTH freeze scroll on iPhone. We use a normal
            absolutely-positioned <img> with `object-cover` instead — same
            premium look, zero scroll cost. The image sits on its own
            compositor layer (`translateZ(0)`) so it never repaints on scroll. */}
        {(() => {
          const bgPhoto = data?.couple_photo_url || data?.bride_photo_url || data?.groom_photo_url;
          if (!bgPhoto) return null;
          return (
            <div
              aria-hidden
              className="absolute inset-0 overflow-hidden"
              style={{ zIndex: 0, pointerEvents: 'none' }}
              data-testid="page-bg-photo"
            >
              <img
                /* resolveUrl, not the raw value: an "/uploads/..." path would
                   otherwise resolve against the SPA origin and 404 (the whole
                   reason resolveUrl rewrites it to /api/uploads/...). */
                src={resolveUrl(bgPhoto)}
                alt=""
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover"
                style={{
                  transform: 'translateZ(0)',  // own GPU layer, no repaints on scroll
                  opacity: 0.55,
                  filter: 'saturate(0.85)',    // tiny, color-only filter — cheap
                }}
              />
              {/* Readability scrim — flat gradient, no blur */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(10,8,5,0.72) 0%, rgba(10,8,5,0.55) 30%, rgba(10,8,5,0.65) 70%, rgba(10,8,5,0.86) 100%)',
                }}
              />
            </div>
          );
        })()}
        {/* Gilded-dusk atmosphere. Both layers are fixed + pointer-events:none
            and live behind the content, so they add depth without joining the
            scroll container (the mobile-scroll trap noted above). */}
        <div className="lux-aurora" aria-hidden="true">
          <span className="a1" /><span className="a2" /><span className="a3" />
        </div>
        <div className="lux-jaali" aria-hidden="true" />

        {/* All real content sits above the backdrop */}
        <div className="relative" style={{ zIndex: 1 }}>
        {/* Feb 2026 — Persistent ambient petal shower for the entire scroll
            experience. Sits below the main content (zIndex: 0 inside the
            absolute container) but above the photo backdrop. */}
        {openingDone && <PetalShower count={18} />}
        {/* Prompt 14 — Personalized welcome (only if ?g=token in URL) */}
        {guestToken && openingDone && <PersonalizedWelcome slug={slug} token={guestToken} />}

        {watermark && <WatermarkOverlay />}

        {/* Language switcher — shown only when the couple uploaded multi-language
            translations to `profile.translations`.  We always include the base
            language so the user can switch back to the original. */}
        {allLangs.length > 1 && (
          <div
            className="px-glass fixed z-40 flex items-center gap-1 px-2 py-1.5"
            style={{ top: 12, right: 12, borderRadius: 'var(--px-r-pill)' }}
            data-testid="lang-switcher"
          >
            {allLangs.map((lng) => {
              const active = activeLang === lng;
              return (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setSelectedLang(lng)}
                  className="text-[10px] tracking-[0.18em] uppercase px-2 py-1 rounded-full"
                  style={{
                    background: active ? 'var(--px-primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--px-muted)',
                  }}
                  data-testid={`lang-pick-${lng}`}
                >
                  {lng}
                </button>
              );
            })}
          </div>
        )}

        {/* Hero */}
        <HeroCover bride={bride} groom={groom} date={weddingDate} theme={theme} mealTime={mealTime} experience3d={data.experience_3d} />

        {/* Auspicious details & blessing — nakshatram, muhurtam, gotram, poem.
            Each is optional and individually toggleable (custom_text._maja.show_*).
            The whole block hides when nothing is present/enabled, so e.g. a
            Christian wedding shows none of it and link generation is unaffected. */}
        {(() => {
          const maja = data.custom_text?._maja || {};
          const muh = (maja.show_muhurtam !== false) ? (data.muhurtam || maja.muhurtam || '') : '';
          const nak = (maja.show_nakshatram !== false) ? (data.nakshatram || maja.nakshatram || '') : '';
          const got = (maja.show_gotra !== false) ? (maja.gotra || '') : '';
          const poem = (maja.show_poem !== false) ? (maja.wedding_poem || '') : '';
          if (!muh && !nak && !got && !poem) return null;
          const Item = ({ label, value }) => (
            <div>
              <p className="lux-eyebrow mb-1">{label}</p>
              <p className="font-display text-lg md:text-xl" style={{ color: '#FFF8DC' }}>{value}</p>
            </div>
          );
          return (
            <ScrollSection className="px-6 md:px-16 py-20 max-w-3xl mx-auto text-center" testid="section-wedding-details">
              <span className="lux-eyebrow block mb-6">◆ Auspicious details</span>
              {(muh || nak || got) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
                  {muh && <Item label="Muhurtam" value={muh} />}
                  {nak && <Item label="Nakshatram" value={nak} />}
                  {got && <Item label="Gotram" value={got} />}
                </div>
              )}
              {poem && (
                <p className="font-script italic text-[1.15rem] md:text-[1.45rem] leading-relaxed mx-auto max-w-2xl"
                   style={{ color: 'rgba(255,248,220,0.85)', whiteSpace: 'pre-line' }}>
                  {poem}
                </p>
              )}
            </ScrollSection>
          );
        })()}

        {/* Featured invitation design — uses the user's selected theme to render
            an animated 3D-overlay design from the master 180-design catalogue. */}
        {heroResolved && (
          <ScrollSection className="px-6 md:px-16 py-16 max-w-3xl mx-auto" testid="section-featured-design">
            <span className="lux-eyebrow block mb-4 text-center">◆ The Invitation</span>
            <h2 className="font-display text-[2rem] md:text-[2.8rem] leading-[1.05] mb-8 text-center" style={{ color: '#FFF8DC' }}>
              Our <span className="text-gold italic font-script">card.</span>
            </h2>
            {/* The card is the hero object of the page — give it depth and let
                it answer the pointer instead of sitting flat. */}
            <TiltCard
              className="rounded-2xl"
              style={{ maxWidth: 540, margin: '0 auto', borderRadius: '1rem' }}
              testId="featured-design-tilt"
            >
              <UniversalDesignRenderer
                design={heroResolved.design}
                theme={heroResolved.theme}
                bride={bride}
                groom={groom}
                date={weddingDate ? weddingDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                venue={venueText}
                photo={couplePhoto}
                testId="featured-design"
              />
            </TiltCard>
          </ScrollSection>
        )}

        {/* Full-screen photo viewer (no-crop, full-res). Mounted once; any
            photo on the page opens it via the maja:lightbox window event. */}
        <PhotoLightbox />

        {/* Bride / Groom / Couple showcase — photo + bio, asymmetric layout */}
        <BrideGroomCoupleShowcase
          bride={bride}
          groom={groom}
          bridePhoto={bridePhoto}
          groomPhoto={groomPhoto}
          couplePhoto={couplePhoto}
          brideAbout={brideAbout}
          groomAbout={groomAbout}
          loveStory={story}
          eventType={primaryEventType}
          showBride={showBride}
          showGroom={showGroom}
          showCouple={showCouple}
        />

        {/* July 2026 — Families & blessings section. Only shown if the
            photographer entered at least one parent's name in the wizard.
            All four slots are independent; partial info renders gracefully. */}
        {(() => {
          const maja = data.custom_text?._maja || {};
          const bf = maja.bride_father || '';
          const bm = maja.bride_mother || '';
          const gf = maja.groom_father || '';
          const gm = maja.groom_mother || '';
          if (!bf && !bm && !gf && !gm) return null;
          return (
            <ScrollSection className="px-6 md:px-16 py-20 max-w-4xl mx-auto" testid="section-families">
              <span className="lux-eyebrow block mb-5">◆ With the blessings of</span>
              <h2 className="font-display text-[2.2rem] md:text-[2.8rem] leading-[1.05] mb-10" style={{ color: '#FFF8DC' }}>
                Our <span className="text-gold italic font-script">families.</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {(bf || bm) && (
                  <div className="lux-glass p-6 text-center">
                    <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: '#D4AF37' }}>
                      Bride's parents
                    </div>
                    {bf && <p className="font-display text-xl mb-1" style={{ color: '#FFF8DC' }}>{bf}</p>}
                    {(bf && bm) && <p className="text-xs my-1.5" style={{ color: 'rgba(255,248,220,0.7)' }}>&amp;</p>}
                    {bm && <p className="font-display text-xl" style={{ color: '#FFF8DC' }}>{bm}</p>}
                  </div>
                )}
                {(gf || gm) && (
                  <div className="lux-glass p-6 text-center">
                    <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: '#D4AF37' }}>
                      Groom's parents
                    </div>
                    {gf && <p className="font-display text-xl mb-1" style={{ color: '#FFF8DC' }}>{gf}</p>}
                    {(gf && gm) && <p className="text-xs my-1.5" style={{ color: 'rgba(255,248,220,0.7)' }}>&amp;</p>}
                    {gm && <p className="font-display text-xl" style={{ color: '#FFF8DC' }}>{gm}</p>}
                  </div>
                )}
              </div>
            </ScrollSection>
          );
        })()}

        {/* Infinite portrait rails — the people whose day this is, moving.
            Built from the principals first (bride / groom / couple) so the
            rail is always about THEM, then padded with any extra photos the
            photographer uploaded. */}
        {(() => {
          if (data?.sections_enabled?.photos === false) return null;
          const maja = data.custom_text?._maja || {};
          const extras = Array.isArray(maja.couple_photos) ? maja.couple_photos.filter(Boolean) : [];
          const rail = [
            bridePhoto && { url: bridePhoto, caption: bride },
            groomPhoto && { url: groomPhoto, caption: groom },
            couplePhoto && { url: couplePhoto, caption: `${bride} & ${groom}` },
            ...extras.map((u) => ({ url: resolveUrl(u), caption: '' })),
          ].filter(Boolean);
          return (
            <PhotoMarquee
              photos={rail}
              title={<>The <span className="text-gold italic font-script">two of them.</span></>}
            />
          );
        })()}

        {/* July 2026 — Additional couple-photo carousel.  Renders only
            when the photographer added extras via the wizard's MultiPhoto
            uploader. The primary couple photo is already shown in the
            BrideGroomCoupleShowcase above. */}
        {(() => {
          const maja = data.custom_text?._maja || {};
          const extras = Array.isArray(maja.couple_photos) ? maja.couple_photos.filter(Boolean) : [];
          if (extras.length === 0) return null;
          // BUG F FIX: respect sections_enabled.photos toggle — default
          // "show" (existing invitations without the field continue to
          // display their gallery).
          if (data?.sections_enabled?.photos === false) return null;
          return (
            <ScrollSection className="px-6 md:px-16 py-16 max-w-5xl mx-auto" testid="section-couple-extra-photos">
              <span className="lux-eyebrow block mb-4 text-center">◆ Moments</span>
              <h2 className="font-display text-[2rem] md:text-[2.6rem] leading-[1.05] mb-8 text-center" style={{ color: '#FFF8DC' }}>
                A few more <span className="text-gold italic font-script">memories.</span>
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
                {extras.map((url, i) => (
                  <div
                    key={i}
                    className="snap-center rounded-xl overflow-hidden flex-shrink-0"
                    style={{ width: 280, height: 360, border: '1px solid rgba(212,175,55,0.3)', background: 'rgba(8,5,3,0.6)' }}
                  >
                    <img
                      src={resolveUrl(url)}
                      alt={`Couple memory ${i + 1}`}
                      onClick={() => openLightbox(resolveUrl(url))}
                      title="Tap to view the full photo"
                      className="w-full h-full object-cover"
                      style={{ cursor: 'zoom-in' }}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </ScrollSection>
          );
        })()}

        {/* Story */}
        {story && (
          <ScrollSection className="px-6 md:px-16 py-24 max-w-4xl mx-auto" testid="section-story">
            <span className="lux-eyebrow block mb-5">◆ Our Story</span>
            <h2 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-8" style={{ color: '#FFF8DC' }}>
              How <span className="text-gold italic font-script">we</span> met
            </h2>
            <p className="font-heading text-[1.1rem] md:text-[1.25rem] leading-[1.85] whitespace-pre-wrap"
              style={{ color: 'rgba(255,248,220,0.9)' }}>
              {story}
            </p>
          </ScrollSection>
        )}

        {/* Events section removed per requirement — Haldi/Mehendi/Sangeet/Engagement etc. no longer shown */}

        {/* Bucket 1A — Live event timeline (Now / Next / Done) */}
        {(data?.sections_enabled?.live_timeline ?? false) && (
          <LiveTimelineSection events={events} slug={slug} />
        )}

        {/* Bucket 1A — Dress Code carousel */}
        <DressCodeSection settings={data.dress_code_settings} />

        {/* Guest FAQ accordion (P3). Studio maps buyer order info.extra.faq → faq_settings. */}
        <FaqSection settings={data.faq_settings} />

        {/* Bucket 1A — Live Stream link / embed. July 2026: also accept
            the simpler `youtube_live_url` field saved by the photographer
            wizard's Stay & Video step. */}
        <LiveStreamSection
          liveStream={
            (data.live_stream && data.live_stream.enabled)
              ? data.live_stream
              : (data.custom_text?._maja?.youtube_live_url
                  ? { enabled: true, url: data.custom_text._maja.youtube_live_url, embed_enabled: true, message: 'Watch our wedding live from anywhere.' }
                  : null)
          }
        />

        {/* Bucket 1A — Add to Calendar prominent CTA strip */}
        <ScrollSection className="px-6 md:px-16 py-10" testid="section-add-to-calendar">
          <div className="max-w-3xl mx-auto text-center">
            <span className="lux-eyebrow inline-block mb-4">◆ Save the dates</span>
            <h3 className="font-display text-[1.6rem] md:text-[2rem] mb-5" style={{ color: '#FFF8DC' }}>
              One tap. <span className="text-gold italic font-script">All events.</span>
            </h3>
            <AddToCalendarButton slug={slug} />
          </div>
        </ScrollSection>

        {/* Venue / map */}
        {venueText && (
          <ScrollSection className="px-6 md:px-16 py-24 max-w-4xl mx-auto" testid="section-venue">
            <span className="lux-eyebrow block mb-5">◆ Venue</span>
            <h2 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-6" style={{ color: '#FFF8DC' }}>
              The <span className="text-gold italic font-script">where.</span>
            </h2>
            <p className="text-[1.05rem] leading-relaxed mb-2" style={{ color: 'rgba(255,248,220,0.8)' }}>{venueText}</p>
            {venueAddress && <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(255,248,220,0.8)' }}>{venueAddress}</p>}
            <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/${encodeURIComponent([venueText, venueAddress].filter(Boolean).join(', '))}`} className="px-btn">
              Open in Maps <MapPin className="w-3.5 h-3.5" />
            </a>
          </ScrollSection>
        )}

        {/* Parking — rendered only when the couple has enabled it.
            `profile.parking.enabled === true` toggles this section.  We
            show the parking note + an optional Maps deep-link. */}
        {data.parking?.enabled && (
          <ScrollSection className="px-6 md:px-16 py-20 max-w-4xl mx-auto" testid="section-parking">
            <span className="lux-eyebrow block mb-5">◆ Parking &amp; Travel</span>
            <h2 className="font-display text-[2rem] md:text-[2.6rem] leading-[1.05] mb-6" style={{ color: '#FFF8DC' }}>
              How to <span className="text-gold italic font-script">park.</span>
            </h2>
            {data.parking?.note && (
              <p className="text-[1rem] leading-relaxed mb-3" style={{ color: 'rgba(255,248,220,0.8)' }} data-testid="parking-note">
                {tr('parking_note', data.parking.note)}
              </p>
            )}
            {data.parking?.address && (
              <p className="text-sm mb-4" style={{ color: 'rgba(255,248,220,0.8)' }} data-testid="parking-address">
                {data.parking.address}
              </p>
            )}
            {(data.parking?.map_link || data.parking?.address || data.parking?.note) && (
              <a
                target="_blank"
                rel="noreferrer"
                href={
                  data.parking?.map_link
                    || `https://www.google.com/maps/search/${encodeURIComponent([data.parking?.address || '', venueText].filter(Boolean).join(', '))}`
                }
                className="px-btn"
                data-testid="parking-map-link"
              >
                Open parking map <MapPin className="w-3.5 h-3.5" />
              </a>
            )}
          </ScrollSection>
        )}

        {/* Countdown */}
        {/* BUG B FIX: honour sections_enabled.countdown — default "show". */}
        {weddingDate && (data?.sections_enabled?.countdown !== false) && <Countdown date={weddingDate} />}

        {/* Pre-wedding shoot (Google Drive / YouTube / Vimeo embed) */}
        <PreWeddingSection preWeddingLinks={preWeddingLinks} />

        {/* Find My Room — guest accommodation lookup (popup-style trigger) */}
        <FindMyRoomSection slug={slug} hasRooms={guestRooms.length > 0} variant="popup" />

        {/* RSVP */}
        {/* BUG 27 FIX: respect the sections_enabled.rsvp toggle. Default to
            "shown" when the field is missing (existing invitations created
            before the toggle existed must keep working). */}
        {(data?.sections_enabled?.rsvp !== false) && (
          <ScrollSection className="px-6 md:px-16 py-24" testid="section-rsvp">
            <div className="max-w-2xl mx-auto">
              <span className="lux-eyebrow block mb-5">◆ Will you be there?</span>
              <h2 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-8" style={{ color: '#FFF8DC' }}>
                Kindly <span className="text-gold italic font-script">respond.</span>
              </h2>
              <RSVPForm slug={slug} rsvpSettings={data.rsvp_settings} onSuccess={() => setRsvpDone(true)} />
            </div>
          </ScrollSection>
        )}

        {/* Phase 1H — Honeymoon Fund (UPI / QR) — shown only when couple has enabled it */}
        <HoneymoonFundSection fund={data.honeymoon_fund} couple={`${bride} & ${groom}`} />

        {/* Bucket 1A — Guest Check-In */}
        <CheckInSection
          slug={slug}
          enabled={data?.sections_enabled?.check_in ?? false}
          events={events}
        />

        {/* Bucket 1A — Song Requests (build the playlist) */}
        <SongRequestSection slug={slug} settings={data.song_requests_settings} />

        {/* Wishes — Prompt 07: moderated wishes wall with featured spotlight */}
        {/* BUG D FIX: honour sections_enabled.greetings — default "show". */}
        {(data?.sections_enabled?.greetings !== false) && <WishesWallSection slug={slug} />}

        {/* Live Photo Wall — now access-gated: password-QR to the full gallery
            + a selfie upload (opens the FindMyPhotosModal via onSelfie).
            Feature-pack gated: gallery card = qr_live_gallery / enhanced_gallery,
            selfie card = ai_face_match / selfie_search. */}
        {(canLiveGallery || canFaceMatch) && (
          <LivePhotoWallTeaser
            slug={slug}
            showGallery={canLiveGallery}
            showSelfie={canFaceMatch}
            onSelfie={() => setFindOpen(true)}
          />
        )}

        {/* Sprint 10 — Find My Photos CTA (AI face match) */}
        {galleryInfo?.enabled && (canLiveGallery || canFaceMatch) && (
          <section className="px-6 md:px-12 py-12 md:py-16 text-center" data-testid="find-photos-cta">
            <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.7 }} className="max-w-2xl mx-auto">
              <span className="lux-eyebrow inline-block mb-3">◆ AI-powered photo search</span>
              <h2 className="font-display text-[1.9rem] md:text-[2.6rem] mb-3" style={{ color: '#FFF8DC' }}>
                Get <span className="font-script italic text-gold">your photos</span> from the wedding
              </h2>
              <p className="text-sm md:text-base mb-6" style={{ color: 'rgba(255,248,220,0.85)' }}>
                Upload one selfie and share your contact — we’ll send you every photo you’re in. Or open the full gallery to see all {galleryInfo.total_photos || ''} photos from the wedding.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {/* AI selfie search — Royal-pack feature (ai_face_match / selfie_search) */}
                {canFaceMatch && (
                <button onClick={() => setFindOpen(true)} className="px-btn inline-flex items-center gap-2"
                  data-testid="open-find-photos">
                  <Sparkles className="w-4 h-4" /> Get Your Photos
                </button>
                )}
                {/* #7 — "Get all photos": a tappable link so a guest who is alone
                    (no one to scan their QR) can open the full gallery themselves.
                    The gallery page handles any passcode gate. Gated on the live
                    gallery pack (qr_live_gallery / enhanced_gallery). */}
                {canLiveGallery && (
                <a
                  href={`/invite/${slug}/live-gallery`}
                  className="px-btn px-btn-secondary inline-flex items-center gap-2"
                  data-testid="open-all-photos"
                >
                  <ImageIcon className="w-4 h-4" /> Get all photos
                </a>
                )}
              </div>
            </motion.div>
          </section>
        )}

        {/* Sprint 8 — Multi-venue travel section */}
        <VenuesSection slug={slug} />

        {/* Sprint 9 — Optional gift registry / "no gifts please" note */}
        <GiftRegistrySection slug={slug} />

        {/* Digital Shagun (UPI live blessing counter) */}
        <DigitalShagunSection slug={slug} couple={`${bride} & ${groom}`} />

        {/* Viral photographer-referral CTA */}
        <MajaReferralCTA slug={slug} />

        {/* Inline thematic closing motif — sits above the footer */}
        {openingDone && (
          <ClosingOrchestrator
            themeId={themeId}
            eventType={primaryEventType}
            image={heroResolved?.design?.image}
            bride={bride}
            groom={groom}
            date={formattedDate}
          />
        )}

        {/* Food-donation — reduce waste, help nearby homes */}
        {(data?.sections_enabled?.food_donation !== false) && (
          <FoodDonationSection city={data?.city || ''} />
        )}

        {/* Footer */}
        <footer ref={footerRef} className="px-6 md:px-16 py-14 text-center border-t" style={{ borderColor: 'var(--lux-border)' }} data-testid="invitation-footer">
          <div className="font-script text-3xl text-gold mb-2 italic">{bride} & {groom}</div>

          {/* "Managed by <Studio>" — only present for a PREMIUM studio with a
              published portfolio (server gates managed_by). Tapping the studio
              name opens their portfolio, so every invitation they build sends
              guests back to their work. */}
          {data?.managed_by?.studio_name && data?.managed_by?.portfolio_url && (
            <div className="mb-3" data-testid="footer-managed-by">
              <span className="text-[10px] tracking-[0.28em] uppercase" style={{ color: 'rgba(255,248,220,0.5)' }}>
                Photos &amp; invitation managed by
              </span>
              <a href={data.managed_by.portfolio_url} target="_blank" rel="noreferrer"
                className="block mt-1 font-display text-lg hover:text-gold transition-colors"
                style={{ color: '#E8C97A', textDecoration: 'none' }}
                data-testid="footer-studio-link">
                {data.managed_by.studio_name}
              </a>
            </div>
          )}

          <a href="/" className="text-xs tracking-[0.3em] uppercase inline-block hover:text-gold transition-colors"
            style={{ color: 'rgba(255,248,220,0.78)', textDecoration: 'none' }} data-testid="footer-maja-link">
            Made by MAJA Invites
          </a>
        </footer>

        {/* BUG E FIX: respect background_music.enabled (and the legacy
            sections_enabled.music alias) — photographers who disabled music
            in the Features panel were still getting it played to guests. */}
        {musicUrl && (data?.background_music?.enabled !== false) && (data?.sections_enabled?.music !== false) && (
          <AmbientMusicPlayer src={musicUrl} defaultVolume={0.35} />
        )}
        <PetalConfetti trigger={rsvpDone ? Date.now() : false} count={42} duration={5200} />
        <PetalConfetti trigger={wishDone ? Date.now() : false} count={26} duration={4200} />
        {canFaceMatch && <FindMyPhotosModal slug={slug} open={findOpen} onClose={() => setFindOpen(false)} />}
        <WhatsAppShare bride={bride} groom={groom} />

        {/* "Share your photo" floating button removed per owner request. Guests
            find their own photos via the Live Photo Wall QR + selfie flow below. */}
        </div>{/* /relative content wrapper (Phase 3A) */}
      </div>
      </>
    </InvitePrefetchContext.Provider>
  );
};

// ── Full-screen photo lightbox ────────────────────────────────────────────
// Opened via a window CustomEvent so any photo on the page can trigger it
// without prop-drilling. Shows the COMPLETE image (object-contain → no crop)
// at full resolution — the fix for "photos get cut / lose quality on open".
const openLightbox = (src) => {
  if (!src) return;
  try { window.dispatchEvent(new CustomEvent('maja:lightbox', { detail: { src } })); } catch (_e) {}
};

const PhotoLightbox = () => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const onOpen = (e) => setSrc(e?.detail?.src || null);
    const onKey = (e) => { if (e.key === 'Escape') setSrc(null); };
    window.addEventListener('maja:lightbox', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('maja:lightbox', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  if (!src) return null;
  return (
    <div
      onClick={() => setSrc(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,4,2,0.94)',
        backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center',
        padding: '1.5rem', cursor: 'zoom-out',
      }}
      data-testid="photo-lightbox"
    >
      <img
        src={src} alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
          borderRadius: 4, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', cursor: 'default',
        }}
      />
      <button
        onClick={(e) => { e.stopPropagation(); setSrc(null); }}
        aria-label="Close"
        style={{
          position: 'absolute', top: 18, right: 18, width: 44, height: 44, borderRadius: 'var(--px-r-pill)',
          background: 'rgba(255,255,255,0.12)', color: '#fff',
          border: '1px solid rgba(196,181,253,0.4)', fontSize: 22, lineHeight: 1, cursor: 'pointer',
        }}
      >×</button>
    </div>
  );
};

const PortraitPanel = ({ photo, fallbackInitial, accentSide = 'left', direction = 'left' }) => {
  // Feb 2026 — Strong 3D entrance (12° tilt + 200 px slide + depth fade, 800 ms)
  // Photo enters from `direction` side with perspective rotateY so it feels
  // like the page is physically tilting toward the viewer. Reduced-motion users
  // still get a clean fade.
  const reduce = useReducedMotion();
  const xDelta = direction === 'right' ? 200 : -200;
  const rotY   = direction === 'right' ? -12 : 12;
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: xDelta, rotateY: rotY, scale: 0.92, filter: 'blur(8px)' }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, x: 0, rotateY: 0, scale: 1, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-10%', amount: 0.15 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full"
      style={{ maxWidth: 460, aspectRatio: '4 / 5', perspective: 1200, transformStyle: 'preserve-3d' }}
      data-testid={`portrait-panel-${direction}`}
    >
      <div
        className="absolute inset-0 rounded-[3px]"
        style={{
          background: 'linear-gradient(135deg, rgba(212,175,55,0.45) 0%, rgba(212,175,55,0.08) 60%, transparent 100%)',
          padding: 2,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 12px 30px rgba(0,0,0,0.35)',
        }}
      >
        <div className="w-full h-full overflow-hidden rounded-[2px]" style={{ background: '#1A130B' }}>
          {photo ? (
            <img
              src={photo} alt="" loading="lazy"
              onClick={() => openLightbox(photo)}
              title="Tap to view the full photo"
              className="w-full h-full object-contain"
              style={{ filter: 'saturate(1.05) contrast(1.04)', cursor: 'zoom-in' }}
            />
          ) : (
            <div
              className="w-full h-full grid place-items-center font-script"
              style={{
                background: 'radial-gradient(circle at 30% 25%, rgba(212,175,55,0.22), transparent 65%)',
                color: '#D4AF37',
                fontSize: 'clamp(7rem, 18vw, 14rem)',
                lineHeight: 1, fontStyle: 'italic',
              }}
            >
              {(fallbackInitial || '?').toUpperCase()}
            </div>
          )}
        </div>
      </div>
      <div
        aria-hidden className="absolute pointer-events-none"
        style={{
          [accentSide]: -14, top: -14, width: 56, height: 56,
          borderTop: '1px solid rgba(212,175,55,0.55)',
          [`border${accentSide === 'left' ? 'Left' : 'Right'}`]: '1px solid rgba(212,175,55,0.55)',
        }}
      />
      <div
        aria-hidden className="absolute pointer-events-none"
        style={{
          [accentSide === 'left' ? 'right' : 'left']: -14, bottom: -14, width: 56, height: 56,
          borderBottom: '1px solid rgba(212,175,55,0.55)',
          [`border${accentSide === 'left' ? 'Right' : 'Left'}`]: '1px solid rgba(212,175,55,0.55)',
        }}
      />
    </motion.div>
  );
};

const BridePanelText = ({ name, about, eyebrow, side }) => {
  // Feb 2026 — Words feel like they're flying in from "somewhere" with a
  // strong 3D word-reveal (per-line stagger + small perspective rotateX).
  const reduce = useReducedMotion();
  const xDelta = side === 'right' ? 200 : -200;
  return (
  <motion.div
    initial={reduce ? { opacity: 0 } : { opacity: 0, x: xDelta, rotateY: side === 'right' ? -12 : 12, filter: 'blur(6px)' }}
    whileInView={reduce ? { opacity: 1 } : { opacity: 1, x: 0, rotateY: 0, filter: 'blur(0px)' }}
    viewport={{ once: true, margin: '-10%', amount: 0.15 }}
    transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
    className="w-full"
    style={{ perspective: 1200 }}
  >
    <motion.span
      initial={{ opacity: 0, rotateX: -25, y: 14 }}
      whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.45 }}
      className="lux-eyebrow block mb-4">◆ {eyebrow}</motion.span>
    <motion.h3
      initial={{ opacity: 0, rotateX: -25, y: 18 }}
      whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, delay: 0.55 }}
      className="font-display leading-[1.05] mb-5"
      style={{ color: '#FFF8DC', fontSize: 'clamp(2.4rem, 5vw, 4.2rem)' }}>
      {name}
    </motion.h3>
    <div className="h-px w-16 mb-5"
         style={{ background: 'linear-gradient(90deg, #D4AF37 0%, transparent 100%)' }} />
    {about ? (
      <p className="font-heading whitespace-pre-wrap"
         style={{ color: 'rgba(255,248,220,0.9)', fontSize: 'clamp(1rem, 1.3vw, 1.15rem)', lineHeight: 1.85 }}>
        {about}
      </p>
    ) : (
      <p className="text-sm italic" style={{ color: 'rgba(255,248,220,0.62)' }}>
        A short bio will appear here.
      </p>
    )}
  </motion.div>
  );
};

/* ---------------------------------------------------------------------------
   TiltCard — the opening card tracks the pointer in 3D.
   Rotation is written straight to the node's style inside a rAF instead of
   through React state: this fires on every pointermove, and a setState per
   move would re-render the whole invitation on each frame.
   Pointer-only (`pointer: fine`) so touch scrolling is never intercepted.
------------------------------------------------------------------------- */
export const TiltCard = ({ children, max = 9, className = '', style, testId = 'tilt-card' }) => {
  const ref = React.useRef(null);
  const frame = React.useRef(0);
  const reduce = useReducedMotion();
  const enabled = !reduce
    && typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: fine)').matches;

  const onMove = (e) => {
    if (!enabled || !ref.current) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.transform =
        `perspective(1100px) rotateX(${(0.5 - py) * max * 2}deg) rotateY(${(px - 0.5) * max * 2}deg)`;
      el.style.setProperty('--mx', `${px * 100}%`);
      el.style.setProperty('--my', `${py * 100}%`);
    });
  };

  const reset = () => {
    cancelAnimationFrame(frame.current);
    if (ref.current) ref.current.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg)';
  };

  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div
      ref={ref}
      className={`lux-tilt ${className}`}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={reset}
      data-testid={testId}
    >
      <div className="lux-tilt__inner">{children}</div>
      <span className="lux-tilt__sheen" aria-hidden="true" />
      <span className="lux-tilt__rim" aria-hidden="true" />
    </div>
  );
};

/* ---------------------------------------------------------------------------
   PhotoRail / PhotoMarquee — the infinite scrollers.
   Each rail renders its photo list TWICE; the CSS translates the track by
   exactly -50%, which lands on the duplicate, so the loop never visibly jumps.
   The two rails run in opposite directions at different speeds so the section
   reads as woven motion rather than a single conveyor belt.
------------------------------------------------------------------------- */
const PhotoRail = ({ photos, dir = 'l', speed, testId }) => {
  if (!photos.length) return null;
  const loop = [...photos, ...photos];
  return (
    <div className="lux-marquee" data-testid={testId}>
      <div
        className={`lux-marquee__track lux-marquee__track--${dir}`}
        style={speed ? { '--rail-speed': speed } : undefined}
      >
        {loop.map((p, i) => (
          <figure
            key={`${p.url}-${i}`}
            className="lux-rail-card"
            onClick={() => openLightbox(p.url)}
            /* duplicated half is decorative — keep it out of the a11y tree */
            aria-hidden={i >= photos.length ? 'true' : undefined}
          >
            <img src={p.url} alt={p.caption || ''} loading="lazy" decoding="async" />
            {p.caption && <figcaption className="lux-rail-card__cap">{p.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  );
};

export const PhotoMarquee = ({ photos = [], title = 'Moments', eyebrow = '◆ The people of the day' }) => {
  const clean = (photos || []).filter((p) => p && p.url);
  if (clean.length < 2) return null;          // one photo can't read as a rail
  // Both rails carry the SAME sequence. Rotating the second one by a midpoint
  // slice looked ragged with a small photo set — the rows shared no visual
  // relationship. Same order + same speed, opposite directions, reads as one
  // woven motion instead of two unrelated belts.
  const top = clean;
  const bottom = clean;
  return (
    <section className="relative py-16 md:py-24 overflow-hidden" data-testid="section-photo-marquee">
      <div className="text-center px-6 mb-10">
        <span className="lux-eyebrow block mb-4">{eyebrow}</span>
        <h2 className="font-display leading-[1.05]"
            style={{ color: '#FFF8DC', fontSize: 'clamp(2rem, 4.4vw, 3.4rem)' }}>
          {title}
        </h2>
      </div>
      <div className="flex flex-col gap-5">
        <PhotoRail photos={top} dir="l" speed="50s" testId="photo-rail-top" />
        {clean.length > 2 && (
          <PhotoRail photos={bottom} dir="r" speed="50s" testId="photo-rail-bottom" />
        )}
      </div>
    </section>
  );
};

export const BrideGroomCoupleShowcase = ({
  bride, groom,
  bridePhoto, groomPhoto, couplePhoto,
  brideAbout, groomAbout, loveStory,
  eventType,           // Feb 2026 — for single-photo events (haldi/mehendi)
  // Feb 2026 — per-slot enable flags. When false, the slot is fully hidden
  // (section + divider removed from the DOM, not just the photo blanked).
  // Defaults preserve old behavior for callers that don't pass them.
  showBride = true, showGroom = true, showCouple = true,
}) => {
  // Effective slot visibility = (toggle ON) AND (something to show)
  const brideSlot  = showBride  && (bridePhoto  || brideAbout);
  const groomSlot  = showGroom  && (groomPhoto  || groomAbout);
  const coupleSlot = showCouple && (couplePhoto || loveStory);
  const hasAny = brideSlot || groomSlot || coupleSlot;
  if (!hasAny) return null;

  // Feb 2026 — Haldi & Mehendi feature only ONE person (typically the bride).
  // Skip the bride+groom split layout for those events; show the single photo
  // as a centered cinematic hero so the page stays balanced.
  const evt = (eventType || '').toLowerCase();
  const isSinglePhoto = evt === 'haldi' || evt === 'mehendi' || evt === 'mehndi';

  if (isSinglePhoto) {
    const featuredPhoto = bridePhoto || groomPhoto || couplePhoto;
    const featuredName  = bridePhoto ? bride : (groomPhoto ? groom : `${bride} & ${groom}`);
    const featuredAbout = bridePhoto ? brideAbout : (groomPhoto ? groomAbout : loveStory);
    const eyebrow = evt === 'haldi' ? 'Haldi Ceremony' : 'Mehendi Ceremony';
    return (
      <section className="relative py-20 md:py-28 overflow-hidden" data-testid={`section-single-${evt}`}>
        <PetalShower testId="petal-shower-section" />
        <ScrollSection className="px-6 md:px-16 max-w-4xl mx-auto" testid={`section-single-${evt}-inner`}>
          <div className="text-center mb-10">
            <span className="lux-eyebrow block mb-4">◆ {eyebrow}</span>
            <h3 className="font-display leading-[1.05]"
                style={{ color: '#FFF8DC', fontSize: 'clamp(2.4rem, 5vw, 4.2rem)' }}>
              {featuredName}
            </h3>
          </div>
          <div className="flex justify-center">
            <PortraitPanel photo={featuredPhoto} fallbackInitial={(featuredName || '?')[0]} accentSide="left" direction="left" />
          </div>
          {featuredAbout && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.9, delay: 0.2 }}
              className="font-heading text-center mt-10 max-w-2xl mx-auto whitespace-pre-wrap italic"
              style={{ color: 'rgba(255,248,220,0.9)', fontSize: 'clamp(1rem, 1.3vw, 1.18rem)', lineHeight: 1.85 }}
            >
              {featuredAbout}
            </motion.p>
          )}
        </ScrollSection>
      </section>
    );
  }

  return (
    <section className="relative py-20 md:py-28 overflow-hidden" data-testid="section-bride-groom-couple">
      {/* Feb 2026 — Petal shower decoration throughout (option a) */}
      <PetalShower testId="petal-shower-section" />
      {brideSlot && (
        <ScrollSection className="px-6 md:px-16 max-w-6xl mx-auto" testid="section-bride">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
            <PortraitPanel photo={bridePhoto} fallbackInitial={bride[0]} accentSide="left" direction="left" />
            <BridePanelText name={bride} about={brideAbout} eyebrow="The Bride" side="right" />
          </div>
        </ScrollSection>
      )}
      {brideSlot && groomSlot && (
        <div className="flex justify-center my-16 md:my-24" aria-hidden>
          <div className="flex items-center gap-4" style={{ color: '#D4AF37' }}>
            <div style={{ width: 64, height: 1, background: 'linear-gradient(90deg, transparent, #D4AF37)' }} />
            <Sparkles className="w-4 h-4" />
            <div style={{ width: 64, height: 1, background: 'linear-gradient(90deg, #D4AF37, transparent)' }} />
          </div>
        </div>
      )}
      {groomSlot && (
        <ScrollSection className="px-6 md:px-16 max-w-6xl mx-auto" testid="section-groom">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
            <BridePanelText name={groom} about={groomAbout} eyebrow="The Groom" side="left" />
            <div className="md:order-last flex justify-end">
              <PortraitPanel photo={groomPhoto} fallbackInitial={groom[0]} accentSide="right" direction="right" />
            </div>
          </div>
        </ScrollSection>
      )}
      {coupleSlot && (
        <ScrollSection className="px-6 md:px-16 max-w-4xl mx-auto mt-16 md:mt-24" testid="section-couple-meet">
          <div className="text-center mb-8">
            <span className="lux-eyebrow block mb-4">◆ Together</span>
            <h3 className="font-display leading-[1.05]"
                style={{ color: '#FFF8DC', fontSize: 'clamp(2.2rem, 4.8vw, 3.8rem)' }}>
              {bride} <span className="text-gold italic font-script">&amp;</span> {groom}
            </h3>
          </div>
          {couplePhoto && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: '-15%', amount: 0.1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => openLightbox(couplePhoto)}
              title="Tap to view the full photo"
              className="relative mx-auto w-full overflow-hidden"
              style={{
                maxWidth: 720, borderRadius: 4,
                border: '1px solid rgba(212,175,55,0.35)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.4), 0 8px 20px rgba(0,0,0,0.25)',
                background: '#1A130B',
                cursor: 'zoom-in',
              }}
            >
              <SmartImage
                src={couplePhoto}
                alt=""
                priority={true}
                className="w-full"
                /* Show the WHOLE couple photo — the frame hugs the image's natural
                   ratio (no zoom / crop) so the couple is always fully visible. */
                style={{ width: '100%', display: 'block' }}
                imgStyle={{ height: 'auto', objectFit: 'contain' }}
              />
            </motion.div>
          )}
          {loveStory && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.9, delay: 0.2 }}
              className="font-heading text-center mt-8 max-w-2xl mx-auto whitespace-pre-wrap italic"
              style={{ color: 'rgba(255,248,220,0.9)', fontSize: 'clamp(1rem, 1.3vw, 1.18rem)', lineHeight: 1.85 }}
            >
              {loveStory}
            </motion.p>
          )}
        </ScrollSection>
      )}
    </section>
  );
};

export const HeroCover = ({ bride, groom, date, theme, mealTime, experience3d }) => {
  // Bucket 2 — Bride slides in from LEFT, Groom from RIGHT.
  // Mobile devices respect `useReducedMotion` so users with motion-reduction
  // preferences still get a clean fade.
  const reduce = useReducedMotion();
  const slideX = (dir) => reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, x: dir === 'left' ? -80 : 80, filter: 'blur(8px)' },
        animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
      };

  // Feb 2026 — Lunch / Dinner chip auto-classified from meal_time
  const mealLabel = mealTime ? classifyMealTime(mealTime) : null;
  const mealDisplay = mealTime ? formatMealTime(mealTime) : '';

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 md:px-16 overflow-hidden" data-testid="section-hero">
      {/* Phase 9 — opt-in WebGL cinematic backdrop (studio enables via experience_3d) */}
      {experience3d?.enabled && !reduce && (
        <Suspense fallback={null}>
          <Invitation3DScene accent={experience3d.accent || '#D4AF37'} density={experience3d.density || 1} />
        </Suspense>
      )}
      <div className="lux-orbit" style={{ width: 760, height: 760, top: -180, right: -180 }} />
      <div className="lux-orbit" style={{ width: 1100, height: 1100, top: -360, right: -360, opacity: 0.5 }} />

      {/* Floating mandala decorations — pure CSS, decorative, no scroll cost */}
      {!reduce && (
        <>
          <FloatingMandala size={140} top="12%" left="6%" duration={14} delay={0} opacity={0.35} />
          <FloatingMandala size={170} top="22%" right="8%" duration={18} delay={2} opacity={0.28} flip />
          <FloatingMandala size={110} bottom="14%" left="12%" duration={16} delay={3.5} opacity={0.32} />
          <FloatingMandala size={130} bottom="22%" right="14%" duration={20} delay={5} opacity={0.26} flip />
        </>
      )}

      <motion.div className="text-center relative z-10 max-w-4xl"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 1 }}
          className="lux-eyebrow block mb-6">◆ {theme.culture} · {theme.name}</motion.span>
        {/* Fluid type. The old `text-[3.2rem] md:text-[7rem]` stepped straight
            from 51px to 112px at the 768px breakpoint — and because that
            breakpoint only looks at WIDTH, a landscape phone (844x390) got the
            full 112px in a 390px-tall window and the hero overflowed the
            screen. Clamping on min(vw, vh) keeps the name large on a desktop
            while letting a short viewport rule when height is what's scarce. */}
        <h1 className="font-display leading-[0.95] tracking-tight"
            style={{ color: '#FFF8DC', fontSize: 'clamp(2.9rem, min(11vw, 13vh), 7rem)' }}>
          <motion.span
            {...slideX('left')}
            transition={{ delay: 0.45, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.97 }}
            className="inline-block"
            data-testid="hero-bride"
          >
            {bride}
          </motion.span>
          <motion.span
            initial={{ opacity: 0, scale: 0.6, rotate: -15 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.75, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="block text-gold italic font-script font-light my-2 md:my-4"
            style={{ fontSize: 'clamp(1.8rem, min(5.6vw, 8vh), 4.5rem)' }}
          >
            &amp;
          </motion.span>
          <motion.span
            {...slideX('right')}
            transition={{ delay: 0.95, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.97 }}
            className="inline-block"
            data-testid="hero-groom"
          >
            {groom}
          </motion.span>
        </h1>
        {date && (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: 1 }}
            className="mt-10 inline-flex items-center gap-4 text-sm tracking-[0.3em] uppercase"
            style={{ color: 'rgba(255,248,220,0.85)' }}>
            <Calendar className="w-4 h-4" style={{ color: '#D4AF37' }} />
            <span>{date.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </motion.div>
        )}
        {mealLabel && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.7, duration: 0.9 }}
            className="mt-5 flex items-center justify-center"
            data-testid="hero-meal-chip"
          >
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs tracking-[0.25em] uppercase"
              style={{
                background: 'rgba(212,175,55,0.12)',
                border: '1px solid rgba(212,175,55,0.45)',
                color: '#FFE9A8',
              }}
            >
              <Utensils className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
              {mealLabel} served at {mealDisplay}
            </span>
          </motion.div>
        )}
      </motion.div>
    </section>
  );
};

/* Feb 2026 — PetalShower: ambient marigold-petal decoration that drifts down
   the section. Pure CSS-keyframe driven, no scroll listeners, zero JS cost.
   Twelve petals at varied speeds + horizontal offsets so the motion never
   feels mechanical. Pointer-events disabled. */
const PetalShower = ({ count = 12, testId = 'petal-shower' }) => {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const petals = Array.from({ length: count }, (_, i) => i);
  return (
    <div
      aria-hidden
      data-testid={testId}
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        pointerEvents: 'none', zIndex: 0,
      }}
    >
      {petals.map((i) => {
        const left = ((i * 8.3) % 100);
        const dur  = 14 + ((i * 1.7) % 10);     // 14–24 s
        const dly  = (i * 0.9) % 12;
        const size = 14 + ((i * 3) % 14);       // 14–28 px
        const sway = 30 + ((i * 7) % 50);
        const hue  = i % 2 === 0 ? '#E8A87C' : '#D4AF37'; // marigold / gold
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: '-32px',
              left: `${left}%`,
              width: size, height: size,
              borderRadius: '50% 0 50% 0',
              background: `radial-gradient(circle at 30% 30%, ${hue}, transparent 70%)`,
              opacity: 0.55,
              animation: `petal-fall ${dur}s linear ${dly}s infinite, petal-sway ${dur / 2}s ease-in-out ${dly}s infinite alternate`,
              ['--sway']: `${sway}px`,
              transform: `rotate(${i * 23}deg)`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes petal-fall { 0%{transform:translateY(-8vh) rotate(0)} 100%{transform:translateY(110vh) rotate(720deg)} }
        @keyframes petal-sway { 0%{margin-left:0} 100%{margin-left:var(--sway)} }
      `}</style>
    </div>
  );
};


/* Floating mandala — pure CSS animation, no scroll listeners, near-zero cost.
   Used by HeroCover to add gentle ambient decoration around the names. */
const FloatingMandala = ({ size = 120, top, left, right, bottom, duration = 16, delay = 0, opacity = 0.3, flip = false }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute',
      top, left, right, bottom,
      width: size, height: size,
      opacity,
      pointerEvents: 'none',
      transform: flip ? 'scaleX(-1)' : undefined,
      animation: `float-mandala ${duration}s ease-in-out ${delay}s infinite`,
      zIndex: 1,
    }}
  >
    <style>{`@keyframes float-mandala {
      0%,100% { transform: translateY(0) rotate(0deg) ${flip ? 'scaleX(-1)' : ''}; }
      50%     { transform: translateY(-16px) rotate(8deg) ${flip ? 'scaleX(-1)' : ''}; }
    }`}</style>
    <svg viewBox="0 0 100 100" width={size} height={size}>
      {[...Array(12)].map((_, i) => (
        <ellipse
          key={i}
          cx="50" cy="22" rx="3.5" ry="14"
          fill="#D4AF37"
          opacity={0.5 - (i % 3) * 0.1}
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="3.5" fill="#E8C766" />
      <circle cx="50" cy="50" r="18" fill="none" stroke="#D4AF37" strokeWidth="0.5" opacity="0.6" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="#D4AF37" strokeWidth="0.3" opacity="0.4" strokeDasharray="2 3" />
    </svg>
  </div>
);

export const Countdown = ({ date }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = Math.max(date.getTime() - now, 0);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <ScrollSection className="px-6 md:px-16 py-20 max-w-4xl mx-auto" testid="section-countdown">
      <span className="lux-eyebrow block mb-5 text-center">◆ Until the moment</span>
      <div className="grid grid-cols-4 gap-3 md:gap-6">
        {[{ v: d, l: 'Days' }, { v: h, l: 'Hours' }, { v: m, l: 'Min' }, { v: s, l: 'Sec' }].map((u) => (
          <div key={u.l} className="lux-glass p-5 text-center">
            <div className="font-display text-4xl md:text-6xl text-gold leading-none">{String(u.v).padStart(2, '0')}</div>
            <div className="mt-2 text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.8)' }}>{u.l}</div>
          </div>
        ))}
      </div>
    </ScrollSection>
  );
};

export const RSVPForm = ({ slug, rsvpSettings, onSuccess }) => {
  const settings = rsvpSettings || {};
  const [form, setForm] = useState({
    guest_name: '',
    email: '',
    guest_phone: '+91',
    status: 'yes',
    guest_count: 1,
    message: '',
    dietary_preference: '',
    allergies: '',
    plus_one: false,
    kids_count: 0,
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(false);

  const dietaryOptions = [
    { v: 'veg',     label: 'Vegetarian',    show: settings.dietary_show_veg !== false },
    { v: 'nonveg',  label: 'Non-Vegetarian', show: settings.dietary_show_nonveg !== false },
    { v: 'vegan',   label: 'Vegan',         show: settings.dietary_show_vegan !== false },
    { v: 'jain',    label: 'Jain',          show: settings.dietary_show_jain !== false },
  ].filter((o) => o.show);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      // Only send fields the couple has actually enabled
      const payload = {
        guest_name:  form.guest_name,
        guest_phone: form.guest_phone,
        status:      form.status,
        guest_count: parseInt(form.guest_count, 10) || 1,
        message:     form.message || undefined,
      };
      if (settings.dietary_enabled && form.dietary_preference) payload.dietary_preference = form.dietary_preference;
      if (settings.allergies_enabled && form.allergies)        payload.allergies = form.allergies;
      if (settings.plus_one_enabled)                            payload.plus_one  = !!form.plus_one;
      if (settings.kids_enabled)                                payload.kids_count = parseInt(form.kids_count, 10) || 0;

      await axios.post(
        `${API_URL}/api/rsvp?slug=${encodeURIComponent(slug)}`,
        payload
      );
      setDone(true); onSuccess?.();
    } catch (e) {
      const d = e.response?.data?.detail;
      const msg = Array.isArray(d) ? d.map((x) => `${(x.loc || []).slice(-1)[0]}: ${x.msg}`).join(' · ') : (d || 'RSVP failed.');
      setErr(msg);
    }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="px-glass p-8 text-center" data-testid="rsvp-success">
      <Sparkles className="w-5 h-5 mx-auto mb-3" style={{ color: 'var(--px-primary)' }} />
      <h3 className="px-section-title mb-2" style={{ fontSize: '1.5rem' }}>Thank you.</h3>
      <p className="px-section-sub">Your response has been received with love.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="px-glass p-7 space-y-4" data-testid="rsvp-form">
      <Row>
        <LField label="Your Name"><input required type="text" value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} className="px-input" data-testid="rsvp-name" /></LField>
        <LField label="Phone (with +91)"><input required type="tel" value={form.guest_phone} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} placeholder="+919876543210" className="px-input" data-testid="rsvp-phone" /></LField>
      </Row>
      <Row>
        <LField label="Attending"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="px-input" style={{ cursor: 'pointer' }} data-testid="rsvp-attending">
          <option value="yes">Yes, with joy</option>
          <option value="no">Regretfully no</option>
          <option value="maybe">Trying my best</option>
        </select></LField>
        <LField label="Guests"><input type="number" min={1} max={10} value={form.guest_count} onChange={(e) => setForm({ ...form, guest_count: e.target.value })} className="px-input" data-testid="rsvp-guests" /></LField>
      </Row>

      {/* Phase 1C — Dietary preference (only when couple enabled it) */}
      {settings.dietary_enabled && dietaryOptions.length > 0 && (
        <LField label="Dietary preference">
          <select
            value={form.dietary_preference}
            onChange={(e) => setForm({ ...form, dietary_preference: e.target.value })}
            className="px-input"
            style={{ cursor: 'pointer' }}
            data-testid="rsvp-dietary"
          >
            <option value="">— Select —</option>
            {dietaryOptions.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
        </LField>
      )}

      {/* Phase 1C — Allergies note */}
      {settings.allergies_enabled && (
        <LField label="Allergies (optional, max 250 chars)">
          <textarea
            rows={2}
            maxLength={250}
            value={form.allergies}
            onChange={(e) => setForm({ ...form, allergies: e.target.value })}
            placeholder="e.g. peanuts, dairy, gluten…"
            className="px-input"
            style={{ resize: 'vertical' }}
            data-testid="rsvp-allergies"
          />
        </LField>
      )}

      {/* Phase 1C — Plus-one + Kids */}
      {(settings.plus_one_enabled || settings.kids_enabled) && (
        <Row>
          {settings.plus_one_enabled && (
            <LField label="Bringing a plus-one?">
              <label className="flex items-center gap-3 py-2 cursor-pointer" data-testid="rsvp-plusone-wrap">
                <input
                  type="checkbox"
                  checked={!!form.plus_one}
                  onChange={(e) => setForm({ ...form, plus_one: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: 'var(--px-primary)' }}
                  data-testid="rsvp-plusone"
                />
                <span className="text-sm" style={{ color: 'var(--px-ink)' }}>Yes, with my partner</span>
              </label>
            </LField>
          )}
          {settings.kids_enabled && (
            <LField label="Kids attending">
              <input
                type="number"
                min={0}
                max={20}
                value={form.kids_count}
                onChange={(e) => setForm({ ...form, kids_count: e.target.value })}
                className="px-input"
                data-testid="rsvp-kids"
              />
            </LField>
          )}
        </Row>
      )}

      <LField label="Message (optional)"><textarea rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="px-input" style={{ resize: 'vertical' }} data-testid="rsvp-message" /></LField>
      {err && <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'rgba(239,68,68,.08)', color: 'var(--px-error)', border: '1px solid rgba(239,68,68,.3)' }}>{err}</div>}
      <button type="submit" disabled={busy} className="px-btn w-full justify-center" data-testid="rsvp-submit">
        {busy ? 'Sending…' : 'Send RSVP'} <Send className="w-3.5 h-3.5" />
      </button>
    </form>
  );
};

export const WishForm = ({ slug, onSuccess }) => {
  const [form, setForm] = useState({ guest_name: '', message: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await axios.post(`${API_URL}/api/invite/${slug}/greetings`, {
        guest_name: form.guest_name,
        message: form.message,
      });
      setDone(true); setForm({ guest_name: '', message: '' }); onSuccess?.();
    } catch (e) {
      const d = e.response?.data?.detail;
      const msg = Array.isArray(d) ? d.map((x) => `${(x.loc || []).slice(-1)[0]}: ${x.msg}`).join(' · ') : (d || 'Could not send wish.');
      setErr(msg);
    }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="px-glass p-7 space-y-4" data-testid="wish-form">
      <Row>
        <LField label="Your Name"><input required type="text" value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} className="px-input" data-testid="wish-name" /></LField>
      </Row>
      <LField label="Your Wish (250 chars max)"><textarea required maxLength={250} rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="A blessing for the couple…" className="px-input" style={{ resize: 'vertical' }} data-testid="wish-message" /></LField>
      {done && <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'var(--px-violet-100)', color: 'var(--px-primary-hover)' }}>Wish recorded. Thank you.</div>}
      {err && <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'rgba(239,68,68,.08)', color: 'var(--px-error)', border: '1px solid rgba(239,68,68,.3)' }}>{err}</div>}
      <button type="submit" disabled={busy} className="px-btn px-btn-secondary" data-testid="wish-submit">
        {busy ? 'Sending…' : 'Send Wish'} <MessageCircle className="w-3.5 h-3.5" />
      </button>
    </form>
  );
};

const Row = ({ children }) => <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;

const LField = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--px-muted)' }}>{label}</span>
    {children}
  </label>
);

export default React.memo(LuxuryPublicInvitation);
