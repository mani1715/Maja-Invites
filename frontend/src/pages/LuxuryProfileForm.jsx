import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  ChevronLeft, ChevronRight, Save, ExternalLink, Sparkles, Check,
  Palette as PaletteIcon, Calendar, MapPin, Music, ToggleLeft, Gift, BedDouble,
} from 'lucide-react';
import LuxuryShell from '@/components/luxury/LuxuryShell';
import MandalaLoader from '@/components/luxury/MandalaLoader';
import FeatureFlagsPanel from '@/components/luxury/FeatureFlagsPanel';
import SectionsSwitchboard from '@/components/luxury/SectionsSwitchboard';
import PhotoUploadField from '@/components/luxury/PhotoUploadField';
import MultiPhotoUploader from '@/components/luxury/MultiPhotoUploader';
import AmPmTimePicker from '@/components/luxury/AmPmTimePicker';
import MusicPresetPicker from '@/components/luxury/MusicPresetPicker';
import ThemePreviewModal from '@/components/luxury/ThemePreviewModal';
import ThemeDesignWizard from '@/components/luxury/ThemeDesignWizard';
import GuestRoomsEditor from '@/components/luxury/GuestRoomsEditor';
import PreWeddingLinksEditor from '@/components/luxury/PreWeddingLinksEditor';
import GalleryPrivacyEditor, { validatePrivacy } from '@/components/luxury/GalleryPrivacyEditor';
import { getAllThemes, getThemeById } from '@/themes/masterThemes';
import { useAuth } from '@/context/AuthContext';
import { usePricing } from '@/hooks/usePricing';
import { classifyMealTime, formatMealTime } from '@/utils/mealTime';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const STEPS = [
  { id: 'event',   label: 'Event',    icon: Sparkles }, // Feb 2026 — must be first
  { id: 'couple',  label: 'Couple',   icon: Sparkles },
  { id: 'theme',   label: 'Theme',    icon: PaletteIcon },
  { id: 'story',   label: 'Story',    icon: Sparkles },
  { id: 'venue',   label: 'Venue',    icon: MapPin },
  { id: 'media',   label: 'Media',    icon: Music },
  { id: 'stay',    label: 'Stay & Video', icon: BedDouble },
  { id: 'gifts',   label: 'Gifts',    icon: Gift },
  { id: 'flags',   label: 'Features', icon: ToggleLeft },
  { id: 'publish', label: 'Publish',  icon: Check },
];

/* Feb 2026 — Events that traditionally feature ONE person (the bride),
   so we auto-hide the groom + couple photo slots when picked.
   Match is case-insensitive against `primary_event`. */
const SINGLE_PERSON_EVENTS = ['haldi', 'mehendi', 'mehndi'];
const isSinglePersonEvent = (evt) => SINGLE_PERSON_EVENTS.includes((evt || '').toLowerCase().trim());

const ALL_EVENTS = [
  { id: 'Marriage',   label: 'Marriage',   hint: 'Wedding ceremony' },
  { id: 'Engagement', label: 'Engagement', hint: 'Ring ceremony' },
  { id: 'Reception',  label: 'Reception',  hint: 'Post-wedding celebration' },
  { id: 'Sangeeth',   label: 'Sangeet',    hint: 'Music & dance night' },
  { id: 'Haldi',      label: 'Haldi',      hint: 'Single-person ceremony — groom/couple photos auto-hidden' },
  { id: 'Mehendi',    label: 'Mehendi',    hint: 'Single-person ceremony — groom/couple photos auto-hidden' },
];


const DEFAULT_FORM = {
  bride_name: '', groom_name: '', wedding_date: '', wedding_time: '',
  meal_time: '',                 // Feb 2026 — auto-classifies into Lunch / Dinner / etc. on the public banner
  design_theme: 'royal_mughal',
  design_id: '',                 // specific design within (theme, event)
  primary_event: 'Marriage',     // auto-set from theme wizard event pick
  story: '',
  venue: '', venue_address: '',
  venue_google_map_link: '',
  // Parking (optional, photographer-toggleable)
  parking: {
    enabled: false,
    text: '',
    google_map_link: '',
  },
  background_music_url: '',
  events: [],
  feature_flags: {
    show_rsvp: true,
    show_wishes: true,
    show_live_gallery: false,
    show_countdown: true,
    show_music: true,
    show_ai_story: true,
    show_digital_shagun: false,
    show_translations: false,
    show_ai_curation: false,    // Gemini Nano Banana auto-picks best gallery photos
    show_guest_upload: false,   // guests upload photos before the event starts
  },
  // Feb 2026 — Comprehensive section enable/disable toggles. One key per
  // backend SectionsEnabled field. Defaults mirror backend defaults.
  sections_enabled: {
    opening: true, welcome: true, couple: true,
    about: false, family: false, love_story: false,
    photos: true, video: false, events: true,
    rsvp: false, greetings: true, footer: true,
    contact: false, calendar: false, countdown: false, qr: false,
    decorative_effects: true, guest_rooms: true, pre_wedding: true,
    live_stream: false, live_timeline: false, song_requests: false,
    dress_code: false, check_in: false,
  },
  language: 'English',
  // List of additional languages the invitation should be translatable into.
  // The "main language" sits in `language` and is the one guests first see.
  languages: [],
  // Publish expiry tier (key from credit_durations admin config; days resolved server-side)
  expiry_tier: '6_months',
  passcode: '',
  is_published: false,
  // Photos
  bride_photo_url: '',
  groom_photo_url: '',
  couple_photo_url: '',
  // Bride/Groom mini-bios shown on the public invitation
  bride_about: '',
  groom_about: '',
  couple_about: '',     // joint story shown on the "Together" slide of the rich preview
  nakshatram: '',       // bride/groom nakshatram, displayed in the wedding-details panel
  muhurtam: '',         // muhurtam window text (e.g. "11:23 AM – 12:08 PM")
  gotra: '',            // gotram (optional, culture-specific)
  wedding_poem: '',     // short poem / blessing shown on the invitation
  // Per-field show/hide toggles (default ON). Let couples turn off culture-
  // specific items that don't apply to them (e.g. a Christian wedding).
  show_nakshatram: true,
  show_muhurtam: true,
  show_gotra: true,
  show_poem: true,
  // QR / invitation background customization
  use_couple_photo_as_qr_bg: true,
  use_couple_photo_as_invitation_bg: true,
  qr_bg_source: 'couple',          // 'couple' | 'bride' | 'groom' | 'custom'
  invitation_bg_source: 'couple',  // 'couple' | 'bride' | 'groom' | 'custom'
  qr_background_photo_url: '',
  invitation_background_photo_url: '',
  // Opening (link-open) animation background — Feb 2026
  use_couple_photo_as_opening_bg: true,
  opening_bg_source: 'couple',     // 'couple' | 'bride' | 'groom' | 'custom'
  opening_photo_url: '',
  // Feb 2026 — per-photo enable/disable toggles. Critical for haldi/mehendi
  // links which usually feature only one person (the bride).
  show_couple_photo: true,
  show_bride_photo: true,
  show_groom_photo: true,
  // Gifts & Digital Shagun
  shagun: {
    enabled: false,
    upi_id: '',
    payee_name: '',
    gpay_handle: '',
    phonepe_handle: '',
    paytm_handle: '',
    blessing_message: 'Your blessings mean more than any gift.',
    suggested_amounts: [501, 1100, 2100, 5100, 11000],
  },
  gifts: {
    enabled: false,
    show_disabled_note: true,
    headline: 'With love, not gifts',
    message: 'Your presence at our wedding is the most precious gift we could ask for.',
  },
  // Find My Room — guest accommodation directory (publicly searchable by name)
  guest_rooms: [],
  // Pre-wedding shoot links (Google Drive / YouTube / Vimeo)
  pre_wedding_links: [],
  // Phase 1C — RSVP form toggles
  rsvp_settings: {
    dietary_enabled: false,
    dietary_show_veg: true,
    dietary_show_nonveg: true,
    dietary_show_vegan: true,
    dietary_show_jain: true,
    allergies_enabled: false,
    plus_one_enabled: false,
    kids_enabled: false,
  },
  // Phase 1H — Honeymoon fund (UPI / QR display only)
  honeymoon_fund: {
    enabled: false,
    title: 'Honeymoon Fund',
    message: 'If you wish to bless our new beginnings, you may contribute below.',
    upi_id: '',
    payee_name: '',
    qr_image_url: '',
    show_progress: false,
    goal_amount: '',
    raised_amount: 0,
  },
  // Photo Privacy Settings (saved separately via /admin/profiles/{id}/gallery/privacy)
  gallery_privacy: null,
  // ──────────────────────────────────────────────────────────────────
  // July 2026 — Photographer panel revamp additions:
  // ──────────────────────────────────────────────────────────────────
  // Additional couple photos (carousel) — the primary photo lives in
  // couple_photo_url for backward-compatibility, this array stores
  // *extra* photos that appear after it in the couple-section carousel.
  couple_photos: [],
  // Family / parents' names — shown in the welcome line + dedicated
  // "With the blessings of our families" section on the public link.
  bride_father: '',
  bride_mother: '',
  groom_father: '',
  groom_mother: '',
  // QR background — explicit enable toggle so the photographer can
  // skip QR background customisation entirely. When false, the QR
  // simply uses the couple photo (the original default).
  qr_bg_enabled: false,
  // Stay & Video — YouTube / live-stream link guests can open during
  // the ceremony.  Stored under custom_text._maja.youtube_live_url.
  youtube_live_url: '',
  // Rooms — moved out of Features in July 2026.  Now a credit-gated
  // toggle in the Stay & Video step.  When false the GuestRoomsEditor
  // is hidden and `guest_rooms` is not exposed on the public link.
  rooms_enabled: false,
};

const LuxuryProfileForm = () => {
  const navigate = useNavigate();
  const { profileId, weddingId } = useParams();
  const [searchParams] = useSearchParams();
  const onBehalfOf = searchParams.get('on_behalf_of'); // super-admin impersonation
  const id = profileId || weddingId || null;
  const { admin, loading: authLoading } = useAuth();
  const isNew = !id;

  const [step, setStep] = useState(0);
  const activeStepRef = useRef(null);
  useEffect(() => {
    activeStepRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [step]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(!isNew);

  // ── DRAFT AUTOSAVE TO localStorage ───────────────────────────────────
  // Bug fix: hitting reload mid-form used to wipe everything. We now keep
  // a per-user, per-new-profile working draft so the user can recover from
  // a reload / accidental tab close. Only active for NEW profiles (when
  // `id` is null) so editing an existing wedding always shows server data.
  const draftKey = React.useMemo(
    () => `wedding_draft:${onBehalfOf || 'self'}`,
    [onBehalfOf]
  );
  const draftHydratedRef = useRef(false);
  useEffect(() => {
    if (id) return;
    if (draftHydratedRef.current) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') setForm((f) => ({ ...f, ...saved }));
      }
    } catch (_) { /* corrupt JSON / privacy mode — ignore */ }
    draftHydratedRef.current = true;
  }, [draftKey, id]);
  useEffect(() => {
    if (id) return;
    if (!draftHydratedRef.current) return;
    try { window.localStorage.setItem(draftKey, JSON.stringify(form)); }
    catch (_) { /* quota / privacy mode — ignore */ }
  }, [form, draftKey, id]);
  const clearWeddingDraft = React.useCallback(() => {
    try { window.localStorage.removeItem(draftKey); } catch (_) { /* ignore */ }
  }, [draftKey]);
  // ─────────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [published, setPublished] = useState(false);
  const [shareLink, setShareLink] = useState('');
  // Dynamic pricing — photographer audience (admin panel surface).
  const pricing = usePricing('photographer');

  // BUG 6 FIX: load expiry tier credit costs from /api/admin/expiry-tiers
  // and pass them through to computeTotalPublishCost + PublishCostBreakdown.
  // Previously both used a HARDCODED { '1_month': 1, ..., 'lifetime': 10 }
  // map, so any super-admin override in the Pricing Hub was ignored in the
  // preview (backend would still charge the real cost, leading to confusing
  // "you said 1 credit but charged 3" reports). Now the preview matches the
  // backend exactly.
  const [expiryCreditsMap, setExpiryCreditsMap] = useState({
    '1_month':  1,
    '3_months': 2,
    '6_months': 3,
    '1_year':   5,
    'lifetime': 10,
  });
  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/api/admin/expiry-tiers`).then((res) => {
      if (cancelled) return;
      const tiers = Array.isArray(res.data?.tiers) ? res.data.tiers : [];
      if (tiers.length === 0) return;
      const map = {};
      tiers.forEach((t) => {
        if (t?.id != null) map[t.id] = Number(t.credits ?? 0);
      });
      setExpiryCreditsMap((prev) => ({ ...prev, ...map }));
    }).catch(() => { /* keep static fallback */ });
    return () => { cancelled = true; };
  }, []);

  const [previewTheme, setPreviewTheme] = useState(null); // theme preview modal

  useEffect(() => {
    if (authLoading) return; // wait for auth to hydrate
    if (!admin) { navigate('/studio/login'); return; }
    // 2026 — Universal categories: if a non-wedding category was requested,
    // redirect to the dedicated celebration form. This keeps the wedding
    // codepath in this file fully isolated and untouched.
    const cat = searchParams.get('category');
    if (cat && cat !== 'wedding') {
      navigate(`/studio/celebration/new?category=${cat}`, { replace: true });
      return;
    }
    if (!isNew) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, authLoading]);

  /* Feb 2026 — When the photographer flips `primary_event` to a single-person
     ceremony (Haldi / Mehendi), auto-hide the groom + couple photo slots and
     turn off any events-list extras that don't belong on a single-person
     invite. The user can still flip them back on manually. Triggered ONLY
     when the event changes — never overrides explicit user toggles. */
  const lastEventRef = useRef(form.primary_event);
  useEffect(() => {
    if (lastEventRef.current === form.primary_event) return;
    lastEventRef.current = form.primary_event;
    if (isSinglePersonEvent(form.primary_event)) {
      setForm((f) => ({
        ...f,
        show_groom_photo: false,
        show_couple_photo: false,
        show_bride_photo: true,
      }));
    } else {
      // Going back to a couple event re-enables all three slots so the user
      // doesn't end up with phantom-off toggles from a previous Haldi/Mehendi pick.
      setForm((f) => ({
        ...f,
        show_groom_photo: true,
        show_couple_photo: true,
        show_bride_photo: true,
      }));
    }
  }, [form.primary_event]);


  const load = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/profiles/${id}`);
      const d = res.data || {};
      // Read MAJA-extended fields stored under custom_text._maja
      const maja = (d.custom_text && d.custom_text._maja) || {};
      let extendedEvents = [];
      try { extendedEvents = maja.events_extended ? JSON.parse(maja.events_extended) : []; } catch {}

      // Load gifts + shagun + privacy in parallel (best-effort; ignore failures)
      let shagunData = {}; let giftsData = {}; let privacyData = null;
      try {
        const [sg, gf, pv] = await Promise.all([
          axios.get(`${API_URL}/api/admin/profiles/${id}/shagun`).catch(() => ({ data: {} })),
          axios.get(`${API_URL}/api/admin/profiles/${id}/gifts`).catch(() => ({ data: {} })),
          axios.get(`${API_URL}/api/admin/profiles/${id}/gallery/privacy`).catch(() => ({ data: null })),
        ]);
        shagunData = sg.data || {};
        giftsData  = gf.data || {};
        privacyData = pv.data || null;
      } catch (_) {}

      setForm({
        ...DEFAULT_FORM,
        bride_name: d.bride_name || '',
        groom_name: d.groom_name || '',
        wedding_date: d.event_date ? new Date(d.event_date).toISOString().slice(0, 10) : '',
        design_theme: d.design_id || d.design_theme || 'royal_mughal',
        venue: d.venue || '',
        venue_address: d.city || d.venue_address || '',
        story: d.love_story || d.story || '',
        background_music_url: d.background_music?.url || '',
        language: Array.isArray(d.language) ? (d.language[0] || 'English').replace(/^\w/, (c) => c.toUpperCase()) : (d.language || 'English'),
        events: extendedEvents.length > 0
          ? extendedEvents.map((e) => ({ ...e, visible: e.visible !== false }))
          : (d.events || []).map((e) => ({
          id: e.id || e.event_id, event_type: e.event_type || 'Wedding', title: e.title || e.name || '',
          event_date: e.event_date || e.date || '',
          start_time: e.start_time || e.wedding_time || '',
          venue: e.venue || e.venue_name || '',
          venue_address: e.venue_address || '',
          description: e.description || '',
          google_map_link: e.google_map_link || e.map_link || '',
          dress_code: e.dress_code || '',
          hero_photo_url: e.hero_photo_url || '',
          visible: e.visible !== false,
        })),
        // BUG 26 FIX (load side): the backend persists `sections_enabled.rsvp`
        // / `sections_enabled.greetings` / `sections_enabled.countdown`, but
        // the Features panel UI reads from `feature_flags.show_rsvp` /
        // `show_wishes` / `show_countdown`. Translate the backend keys into
        // their UI counterparts on load so toggles render the saved state.
        // `show_music` mirrors `background_music.enabled` (separate field).
        feature_flags: (() => {
          const se = d.sections_enabled || {};
          const bgm = d.background_music || {};
          const merged = { ...DEFAULT_FORM.feature_flags, ...se };
          if (typeof se.rsvp === 'boolean')      merged.show_rsvp = se.rsvp;
          if (typeof se.greetings === 'boolean') merged.show_wishes = se.greetings;
          if (typeof se.countdown === 'boolean') merged.show_countdown = se.countdown;
          if (typeof bgm.enabled === 'boolean')  merged.show_music = bgm.enabled;
          return merged;
        })(),
        sections_enabled: { ...DEFAULT_FORM.sections_enabled, ...(d.sections_enabled || {}) },
        passcode: d.passcode || '',
        // Photos + extras (from custom_text._maja or top-level)
        bride_photo_url:        maja.bride_photo_url        || d.bride_photo_url        || '',
        groom_photo_url:        maja.groom_photo_url        || d.groom_photo_url        || '',
        couple_photo_url:       maja.couple_photo_url       || d.couple_photo_url       || '',
        bride_about:            d.bride_about               || maja.bride_about         || '',
        groom_about:            d.groom_about               || maja.groom_about         || '',
        couple_about:           d.couple_about              || maja.couple_about        || '',
        nakshatram:             d.nakshatram                || maja.nakshatram           || '',
        muhurtam:               d.muhurtam                  || maja.muhurtam             || '',
        gotra:                  maja.gotra                  || '',
        wedding_poem:           maja.wedding_poem           || '',
        show_nakshatram:        maja.show_nakshatram        !== false,
        show_muhurtam:          maja.show_muhurtam          !== false,
        show_gotra:             maja.show_gotra             !== false,
        show_poem:              maja.show_poem              !== false,
        // QR / invitation background customization
        use_couple_photo_as_qr_bg:         d.use_couple_photo_as_qr_bg         !== false,
        use_couple_photo_as_invitation_bg: d.use_couple_photo_as_invitation_bg !== false,
        qr_bg_source:         d.qr_bg_source         || maja.qr_bg_source         || (d.use_couple_photo_as_qr_bg         !== false ? 'couple' : 'custom'),
        invitation_bg_source: d.invitation_bg_source || maja.invitation_bg_source || (d.use_couple_photo_as_invitation_bg !== false ? 'couple' : 'custom'),
        qr_background_photo_url:           maja.qr_background_photo_url        || '',
        invitation_background_photo_url:   maja.invitation_background_photo_url|| '',
        // Opening animation background
        use_couple_photo_as_opening_bg: d.use_couple_photo_as_opening_bg !== false,
        opening_bg_source: d.opening_bg_source || maja.opening_bg_source || (d.use_couple_photo_as_opening_bg !== false ? 'couple' : 'custom'),
        opening_photo_url: maja.opening_photo_url || d.opening_photo_url || '',
        // Per-photo enable/disable toggles
        show_couple_photo: d.show_couple_photo !== false,
        show_bride_photo: d.show_bride_photo !== false,
        show_groom_photo: d.show_groom_photo !== false,
        venue_google_map_link:  maja.venue_google_map_link  || d.map_settings?.map_link || '',
        parking: {
          enabled: !!(maja.parking?.enabled || d.parking?.enabled),
          text: maja.parking?.text || d.parking?.text || '',
          google_map_link: maja.parking?.google_map_link || d.parking?.google_map_link || '',
        },
        languages: Array.isArray(maja.languages) ? maja.languages : (Array.isArray(d.languages) ? d.languages : []),
        expiry_tier: maja.expiry_tier || d.expiry_tier || '6_months',
        design_id:    maja.design_id    || d.design_id_specific || '',
        primary_event: maja.primary_event || d.primary_event || 'Marriage',
        shagun: { ...DEFAULT_FORM.shagun, ...shagunData },
        gifts:  { ...DEFAULT_FORM.gifts,  ...giftsData },
        guest_rooms: Array.isArray(d.guest_rooms) ? d.guest_rooms : [],
        pre_wedding_links: Array.isArray(d.pre_wedding_links) ? d.pre_wedding_links : [],
        rsvp_settings: { ...DEFAULT_FORM.rsvp_settings, ...(d.rsvp_settings || {}) },
        honeymoon_fund: { ...DEFAULT_FORM.honeymoon_fund, ...(d.honeymoon_fund || {}) },
        gallery_privacy: privacyData ? { ...privacyData, code: '', confirm_code: '' } : null,
        // July 2026 — new photographer-panel fields stored under _maja
        couple_photos: Array.isArray(maja.couple_photos) ? maja.couple_photos : [],
        bride_father:  maja.bride_father  || '',
        bride_mother:  maja.bride_mother  || '',
        groom_father:  maja.groom_father  || '',
        groom_mother:  maja.groom_mother  || '',
        qr_bg_enabled: maja.qr_bg_enabled === true,
        youtube_live_url: maja.youtube_live_url || '',
        rooms_enabled: maja.rooms_enabled === true || (Array.isArray(d.guest_rooms) && d.guest_rooms.length > 0),
        wedding_time: d.wedding_time || maja.wedding_time || '',
        meal_time: maja.meal_time || d.meal_time || '',
      });
      setShareLink(d.share_link || d.slug || '');
      setPublished(!!d.is_enabled || !!d.is_published);
    } catch (e) { setError(e.response?.data?.detail || 'Failed to load wedding.'); }
    finally { setLoading(false); }
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFlag = (k, v) => setForm((f) => ({ ...f, feature_flags: { ...f.feature_flags, [k]: v } }));
  const setShagun = (k, v) => setForm((f) => ({ ...f, shagun: { ...f.shagun, [k]: v } }));
  const setGifts  = (k, v) => setForm((f) => ({ ...f, gifts:  { ...f.gifts,  [k]: v } }));
  const setRsvpSetting = (k, v) => setForm((f) => ({ ...f, rsvp_settings: { ...f.rsvp_settings, [k]: v } }));
  const setHoneymoon   = (k, v) => setForm((f) => ({ ...f, honeymoon_fund: { ...f.honeymoon_fund, [k]: v } }));

  const save = async (opts = {}) => {
    setSaving(true); setError('');
    // Privacy validation first
    if (form.gallery_privacy?.enabled) {
      const pvErr = validatePrivacy(form.gallery_privacy);
      if (pvErr) {
        setError(pvErr);
        setSaving(false);
        return;
      }
    }
    try {
      // Resolve the actual URL based on the chosen source (couple/bride/groom/custom)
      const qrBgSrc = form.qr_bg_source || (form.use_couple_photo_as_qr_bg ? 'couple' : 'custom');
      const invBgSrc = form.invitation_bg_source || (form.use_couple_photo_as_invitation_bg ? 'couple' : 'custom');
      const openBgSrc = form.opening_bg_source || (form.use_couple_photo_as_opening_bg ? 'couple' : 'custom');
      const resolveBgUrl = (src) => ({
        couple: form.couple_photo_url || '',
        bride:  form.bride_photo_url  || '',
        groom:  form.groom_photo_url  || '',
      }[src] || '');
      const qrBgResolved  = qrBgSrc === 'custom' ? (form.qr_background_photo_url || '') : resolveBgUrl(qrBgSrc);
      const invBgResolved = invBgSrc === 'custom' ? (form.invitation_background_photo_url || '') : resolveBgUrl(invBgSrc);
      const openBgResolved = openBgSrc === 'custom' ? (form.opening_photo_url || '') : resolveBgUrl(openBgSrc);

      const body = {
        bride_name: form.bride_name,
        groom_name: form.groom_name,
        event_type: 'marriage',
        event_date: form.wedding_date ? new Date(form.wedding_date).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
        venue:      form.venue || 'TBA',
        city:       form.venue_address || '',
        design_id:  form.design_theme || 'royal_mughal',
        language:   [(form.language || 'English').toLowerCase()],
        enabled_languages: ([form.language, ...(form.languages || [])]
          .filter(Boolean)
          .map((l) => String(l).toLowerCase())),
        love_story: form.story || '',
        events:     [],   // strict per-event validation skipped; we persist extended events under custom_text._maja
        background_music: (() => {
          // BUG 26 FIX: also honour the show_music toggle from the Features
          // panel. Previously the music section was always on whenever a URL
          // existed — even if the photographer flipped show_music off.
          const wantMusic = form.feature_flags?.show_music !== false;
          if (!wantMusic) return { enabled: false, url: form.background_music_url || '', autoplay: false };
          if (form.background_music_url) return { enabled: true, url: form.background_music_url, autoplay: false };
          return { enabled: false, url: '', autoplay: false };
        })(),
        // BUG 26 FIX: the Features step writes to `form.feature_flags`
        // (show_rsvp, show_wishes, show_countdown, …) but the backend
        // persists toggles under `sections_enabled` with different key names
        // (rsvp, greetings, countdown, …). Previously only
        // `form.sections_enabled` was sent, so every flag the photographer
        // flipped in the Features panel was silently lost after a page
        // refresh — and used solely to compute the publish cost. Map the
        // overlapping flags here so the database now actually reflects what
        // the photographer chose. (background_music is handled above; the
        // remaining feature_flags — show_live_gallery, show_ai_story,
        // show_digital_shagun, show_translations, … — have their own
        // dedicated endpoints/fields and don't live on SectionsEnabled.)
        sections_enabled: (() => {
          const base = { ...(form.sections_enabled || {}) };
          const ff = form.feature_flags || {};
          if (typeof ff.show_rsvp === 'boolean')      base.rsvp = ff.show_rsvp;
          if (typeof ff.show_wishes === 'boolean')    base.greetings = ff.show_wishes;
          if (typeof ff.show_countdown === 'boolean') base.countdown = ff.show_countdown;
          return base;
        })(),
        map_settings: form.venue_google_map_link ? { embed_enabled: true, map_link: form.venue_google_map_link } : { embed_enabled: false },
        link_expiry_type: 'permanent',
        // Find My Room + Pre-wedding shoot links
        guest_rooms: form.rooms_enabled
          ? (form.guest_rooms || []).filter((r) => (r.guest_name || '').trim()).map((r) => ({
              id: r.id && !String(r.id).startsWith('tmp-') ? r.id : undefined,
              guest_name: (r.guest_name || '').trim(),
              phone: r.phone || null,
              room_number: r.room_number || null,
              building: r.building || null,
              floor: r.floor || null,
              address: r.address || null,
              map_link: r.map_link || null,
              check_in: r.check_in || null,
              check_out: r.check_out || null,
              notes: r.notes || null,
            }))
          : [],
        pre_wedding_links: (form.pre_wedding_links || []).filter((l) => (l.url || '').trim()).map((l) => ({
          id: l.id && !String(l.id).startsWith('tmp-') ? l.id : undefined,
          label: (l.label || 'Pre-wedding').trim(),
          url: (l.url || '').trim(),
          kind: l.kind || 'auto',
        })),
        // QR / invitation background settings
        use_couple_photo_as_qr_bg: qrBgSrc === 'couple',
        use_couple_photo_as_invitation_bg: invBgSrc === 'couple',
        qr_bg_source: qrBgSrc,
        invitation_bg_source: invBgSrc,
        // Opening animation background settings
        use_couple_photo_as_opening_bg: openBgSrc === 'couple',
        opening_bg_source: openBgSrc,
        opening_photo_url: openBgResolved,
        // Per-photo enable/disable
        show_couple_photo: !!form.show_couple_photo,
        show_bride_photo: !!form.show_bride_photo,
        show_groom_photo: !!form.show_groom_photo,
        // Bride/groom/couple photos & bios (top-level fields)
        bride_photo_url: form.bride_photo_url || '',
        groom_photo_url: form.groom_photo_url || '',
        couple_photo_url: form.couple_photo_url || '',
        bride_about: form.bride_about || '',
        groom_about: form.groom_about || '',
        couple_about: form.couple_about || '',
        nakshatram: form.nakshatram || '',
        muhurtam: form.muhurtam || '',
        // Phase 1C — RSVP toggles
        rsvp_settings: { ...form.rsvp_settings },
        // Phase 1H — Honeymoon fund
        honeymoon_fund: {
          ...form.honeymoon_fund,
          goal_amount: form.honeymoon_fund.goal_amount === '' || form.honeymoon_fund.goal_amount === null
            ? null
            : parseInt(form.honeymoon_fund.goal_amount, 10) || null,
          raised_amount: parseInt(form.honeymoon_fund.raised_amount, 10) || 0,
        },
        // Photos + per-event details persisted via custom_text (free-form dict)
        custom_text: {
          _maja: {
            bride_photo_url: form.bride_photo_url || '',
            groom_photo_url: form.groom_photo_url || '',
            couple_photo_url: form.couple_photo_url || '',
            qr_background_photo_url: qrBgResolved,
            invitation_background_photo_url: invBgResolved,
            qr_bg_source: qrBgSrc,
            invitation_bg_source: invBgSrc,
            opening_bg_source: openBgSrc,
            opening_photo_url: openBgResolved,
            venue_google_map_link: form.venue_google_map_link || '',
            events_extended: JSON.stringify(form.events || []),
            parking: form.parking || {},
            languages: form.languages || [],
            expiry_tier: form.expiry_tier || '6_months',
            design_id: form.design_id || '',
            primary_event: form.primary_event || 'Marriage',
            // July 2026 photographer-panel additions
            couple_photos: Array.isArray(form.couple_photos) ? form.couple_photos.filter(Boolean) : [],
            bride_father: form.bride_father || '',
            bride_mother: form.bride_mother || '',
            groom_father: form.groom_father || '',
            groom_mother: form.groom_mother || '',
            qr_bg_enabled: !!form.qr_bg_enabled,
            youtube_live_url: form.youtube_live_url || '',
            rooms_enabled: !!form.rooms_enabled,
            wedding_time: form.wedding_time || '',
            meal_time: form.meal_time || '',  // Feb 2026 — Lunch/Dinner chip on banner
            // Culture-specific details + per-field show/hide toggles.
            nakshatram: form.nakshatram || '',
            muhurtam: form.muhurtam || '',
            gotra: form.gotra || '',
            wedding_poem: form.wedding_poem || '',
            show_nakshatram: form.show_nakshatram !== false,
            show_muhurtam: form.show_muhurtam !== false,
            show_gotra: form.show_gotra !== false,
            show_poem: form.show_poem !== false,
          },
        },
      };
      let res;
      if (isNew) {
        const createUrl = onBehalfOf
          ? `${API_URL}/api/admin/profiles?on_behalf_of=${encodeURIComponent(onBehalfOf)}`
          : `${API_URL}/api/admin/profiles`;
        res = await axios.post(createUrl, body);
      } else {
        res = await axios.put(`${API_URL}/api/admin/profiles/${id}`, body);
      }
      setShareLink(res.data.share_link || res.data.slug || '');
      // Server is now source of truth — drop the localStorage draft so it
      // doesn't shadow future fresh loads.
      if (isNew) clearWeddingDraft();

      // Save Digital Shagun + Gifts settings (best-effort, after profile id exists)
      const profileId = res.data.id || id;
      if (profileId) {
        try {
          await axios.put(`${API_URL}/api/admin/profiles/${profileId}/shagun`, form.shagun);
        } catch (_) { /* non-fatal */ }
        try {
          await axios.put(`${API_URL}/api/admin/profiles/${profileId}/gifts`, form.gifts);
        } catch (_) { /* non-fatal */ }
        // Save Photo Privacy settings (only when the editor is initialised)
        if (form.gallery_privacy) {
          try {
            const pv = form.gallery_privacy;
            const payload = {
              enabled: !!pv.enabled,
              public_highlights_enabled: !!pv.public_highlights_enabled,
              private_full_gallery_enabled: !!pv.private_full_gallery_enabled,
              ai_face_match_enabled: !!pv.ai_face_match_enabled,
              allow_downloads: !!pv.allow_downloads,
              allow_share: !!pv.allow_share,
              remember_days: pv.remember_days || 30,
              expires_at: pv.expires_at || null,
              ...(pv.code ? { code: pv.code, confirm_code: pv.confirm_code } : {}),
            };
            const r = await axios.put(`${API_URL}/api/admin/profiles/${profileId}/gallery/privacy`, payload);
            // refresh has_password flag so subsequent saves don't demand a new code
            setForm((f) => ({ ...f, gallery_privacy: { ...(r.data || {}), code: '', confirm_code: '' } }));
          } catch (_) { /* non-fatal */ }
        }
        // Regenerate QR codes so the couple-photo background change takes effect immediately
        try {
          await axios.post(`${API_URL}/api/admin/profiles/${profileId}/regenerate-all-qrs`);
        } catch (_) { /* non-fatal */ }
      }

      if (opts.publish) {
        const weddingId = res.data.id || id;
        try {
          // PROPER publish — atomically deducts credits, marks the wedding
          // PUBLISHED in the lifecycle service AND increments the
          // photographer's paid_links_count for the loyalty tier. Falls
          // back to the legacy /enable toggle if the lifecycle endpoint
          // is unavailable.
          let pubData;
          try {
            const pubRes = await axios.post(`${API_URL}/api/weddings/${weddingId}/publish`);
            pubData = pubRes.data;
          } catch (pubErr) {
            const detail = pubErr.response?.data?.detail || pubErr.message || '';
            if (pubErr.response?.status === 400) {
              setError(detail || 'Cannot publish — please review the details.');
              return null;
            }
            // Any other error — fall back to legacy /enable so older
            // weddings without the lifecycle metadata still flip live.
            const enableRes = await axios.put(`${API_URL}/api/admin/profiles/${weddingId}/enable`);
            pubData = enableRes.data;
          }
          setPublished(true);
          setShareLink(
            pubData?.share_link
            || pubData?.slug
            || res.data.share_link
            || res.data.slug
            || ''
          );
        } catch (_) { setPublished(true); }
      }
      if (isNew && res.data.id) {
        const suffix = onBehalfOf ? `?on_behalf_of=${encodeURIComponent(onBehalfOf)}` : '';
        navigate(`/studio/profile/${res.data.id}/edit${suffix}`, { replace: true });
      }
      return res.data;
    } catch (e) {
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map((x) => `${x.loc?.join('.')}: ${x.msg}`).join('; ') : (detail || 'Save failed.');
      setError(msg);
      return null;
    } finally { setSaving(false); }
  };

  const next = async () => {
    if (step < STEPS.length - 1) {
      // auto-save quietly between steps when editing existing
      if (!isNew && form.bride_name && form.groom_name) await save();
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const prev = () => { setStep((s) => Math.max(s - 1, 0)); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  if (loading) {
    return <LuxuryShell title="Loading"><div className="grid place-items-center py-32"><MandalaLoader /></div></LuxuryShell>;
  }

  return (
    <LuxuryShell
      eyebrow={onBehalfOf ? '◆ Wedding Editor · On behalf of photographer' : '◆ Wedding Editor'}
      title={isNew ? 'New Wedding' : `${form.bride_name} & ${form.groom_name}`}
      showBack
      onBack={() => navigate(onBehalfOf ? `/super-admin/photographers/${onBehalfOf}` : '/studio/dashboard')}
      actions={
        <button onClick={() => save()} disabled={saving} className="lux-btn lux-btn-ghost text-xs" data-testid="save-btn">
          {saving ? <Sparkles className="w-3.5 h-3.5 animate-pulse" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
      }
      testid="luxury-profile-form"
    >
      <div className="px-6 md:px-10 py-10 max-w-5xl mx-auto">
        {onBehalfOf && (
          <div className="mb-6 px-5 py-4 rounded-xl flex items-start gap-3 text-sm"
            style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.35)', color: 'var(--lux-text)' }}
            data-testid="on-behalf-banner"
          >
            <Sparkles className="w-4 h-4 mt-0.5 text-gold shrink-0" />
            <div>
              <div className="font-medium" style={{ color: '#D4AF37' }}>Creating invitation on behalf of a photographer</div>
              <div className="text-xs mt-1" style={{ color: 'var(--lux-text)' }}>
                This invitation will be saved under photographer ID <span className="font-mono">{onBehalfOf.slice(0, 8)}…</span> and appear in their dashboard.
              </div>
            </div>
          </div>
        )}        {/* Stepper */}
        <div className="lux-glass p-4 mb-8 overflow-x-auto no-scrollbar" style={{ scrollSnapType: 'x proximity' }}>
          <div className="flex items-center gap-2 min-w-max">
            {STEPS.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <button key={s.id} onClick={() => setStep(i)} data-testid={`step-${s.id}`}
                  ref={active ? activeStepRef : null}
                  className="flex items-center gap-2 px-3 py-2 rounded-full transition-all whitespace-nowrap"
                  style={Object.assign(
                    { scrollSnapAlign: 'center' },
                    active
                      ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                      : { background: 'transparent', color: done ? '#D4AF37' : 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }
                  )}>
                  <span className="text-[10px] tracking-[0.2em] uppercase">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-xs uppercase tracking-widest">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg text-sm"
            style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(139,0,0,0.5)', color: '#FFD7C9' }}>
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={STEPS[step].id}
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="lux-glass p-8 md:p-10"
          >
            {STEPS[step].id === 'event' && (
              <Step
                title="What's the event?"
                subtitle="Pick the ceremony first — the rest of the form will adapt automatically (e.g. Haldi & Mehendi auto-hide groom & couple photo slots since those are single-person ceremonies)."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="event-picker-grid">
                  {ALL_EVENTS.map((e) => {
                    const active = (form.primary_event || '').toLowerCase() === e.id.toLowerCase();
                    const single = isSinglePersonEvent(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setField('primary_event', e.id)}
                        data-testid={`event-pick-${e.id.toLowerCase()}`}
                        className="text-left p-4 rounded-lg transition-all relative"
                        style={{
                          background: active ? 'rgba(212,175,55,0.15)' : 'var(--lux-panel)',
                          border: `1px solid ${active ? 'rgba(212,175,55,0.65)' : 'var(--lux-border)'}`,
                        }}
                      >
                        {active && (
                          <span
                            aria-hidden
                            style={{
                              position: 'absolute', top: 8, right: 8,
                              width: 18, height: 18, borderRadius: '50%',
                              background: '#D4AF37', color: '#16110C',
                              display: 'grid', placeItems: 'center',
                              fontSize: 11, fontWeight: 700,
                            }}
                            data-testid={`event-pick-${e.id.toLowerCase()}-check`}
                          >✓</span>
                        )}
                        <div className="font-display text-xl mb-1" style={{ color: active ? '#E8C766' : 'var(--lux-text)' }}>
                          {e.label}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                          {e.hint}
                        </div>
                        {single && (
                          <span
                            className="mt-2 inline-block text-[9px] tracking-[0.22em] uppercase px-2 py-1 rounded"
                            style={{
                              background: 'rgba(212,175,55,0.12)',
                              color: '#E8C766',
                              border: '1px solid rgba(212,175,55,0.4)',
                            }}
                          >
                            Single-person
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {isSinglePersonEvent(form.primary_event) && (
                  <div
                    className="mt-6 p-4 rounded-lg"
                    style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.3)' }}
                    data-testid="single-event-notice"
                  >
                    <div className="lux-eyebrow mb-2" style={{ color: '#E8C766' }}>◆ Auto-adjusted</div>
                    <ul className="text-sm space-y-1" style={{ color: 'var(--lux-text)' }}>
                      <li>• Groom photo slot — <span className="text-gold">hidden</span></li>
                      <li>• Couple photo slot — <span className="text-gold">hidden</span></li>
                      <li>• Bride photo slot — <span className="text-gold">visible</span></li>
                    </ul>
                    <p className="text-[11px] mt-3" style={{ color: 'var(--lux-text-muted)' }}>
                      You can flip any of these back on in the Couple step → Photos section.
                    </p>
                  </div>
                )}
              </Step>
            )}

            {STEPS[step].id === 'couple' && (
              <Step title="The Couple" subtitle="Names will appear in the hero of every invitation. (Customer-visible: Hero cover, monogram, footer)">
                <Row>
                  <Field label="Bride Name"><Input value={form.bride_name} onChange={(v) => setField('bride_name', v)} testid="field-bride" /></Field>
                  <Field label="Groom Name"><Input value={form.groom_name} onChange={(v) => setField('groom_name', v)} testid="field-groom" /></Field>
                </Row>
                <Row>
                  <Field label="Wedding Date"><Input type="date" value={form.wedding_date?.slice(0, 10) || ''} onChange={(v) => setField('wedding_date', v)} testid="field-date" /></Field>
                  <Field label="Wedding Time (AM / PM)">
                    <AmPmTimePicker value={form.wedding_time} onChange={(v) => setField('wedding_time', v)} testid="field-time" />
                  </Field>
                </Row>
                <Field label="Meal Time (auto-detects Lunch / Dinner — shown as a chip on the invitation banner)">
                  <MealTimeField
                    value={form.meal_time || ''}
                    onChange={(v) => setField('meal_time', v)}
                    testid="field-meal-time"
                  />
                </Field>
                <Field label="Main Language (default language guests see)">
                  <Select value={form.language} onChange={(v) => setField('language', v)} options={['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Punjabi', 'Hinglish', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam']} testid="field-language" />
                </Field>
                <p className="text-[11px] -mt-2" style={{ color: 'var(--lux-text-muted)' }}>
                  Tip: This is the <strong className="text-gold">main</strong> language — the one guests will see when they first open your link. They can switch languages from the link header if Multi-language is enabled in Features.
                </p>

                {/* Photos */}
                <div className="mt-8 pt-6 border-t" style={{ borderColor: 'rgba(212,175,55,0.12)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="lux-eyebrow">◆ Photos · Hero & 3D animation</div>
                    <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                      Tip — turn off slots you don't need (haldi · mehendi)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <PhotoSlotToggle
                      enabled={form.show_bride_photo}
                      onToggle={(v) => setField('show_bride_photo', v)}
                      testid="toggle-show-bride-photo"
                    >
                      <PhotoUploadField label="Bride Solo" value={form.bride_photo_url} onChange={(v) => setField('bride_photo_url', v)} profileId={id} testid="upload-bride" />
                    </PhotoSlotToggle>
                    <PhotoSlotToggle
                      enabled={form.show_groom_photo}
                      onToggle={(v) => setField('show_groom_photo', v)}
                      testid="toggle-show-groom-photo"
                    >
                      <PhotoUploadField label="Groom Solo" value={form.groom_photo_url} onChange={(v) => setField('groom_photo_url', v)} profileId={id} testid="upload-couple-solo" />
                    </PhotoSlotToggle>
                    <PhotoSlotToggle
                      enabled={form.show_couple_photo}
                      onToggle={(v) => setField('show_couple_photo', v)}
                      testid="toggle-show-couple-photo"
                    >
                      <div>
                        <div className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>Couple Photo (Main)</div>
                        <PhotoUploadField label="Couple" value={form.couple_photo_url} onChange={(v) => setField('couple_photo_url', v)} profileId={id} testid="upload-couple" />
                      </div>
                    </PhotoSlotToggle>
                  </div>

                  {/* July 2026 — Multiple couple photos. Photographer can
                      upload several couple shots; first becomes the main
                      `couple_photo_url`, the rest live in `couple_photos`
                      and appear as a carousel in the public link. */}
                  {form.show_couple_photo && (
                    <div className="mt-6 rounded-lg p-4" style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }} data-testid="couple-photos-section">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm" style={{ color: 'var(--lux-text)' }}>
                          <strong className="text-gold">More couple photos</strong> — appears as a carousel after the main photo
                        </span>
                        <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                          Up to 8 photos
                        </span>
                      </div>
                      <MultiPhotoUploader
                        primary={form.couple_photo_url}
                        onPrimary={(v) => setField('couple_photo_url', v)}
                        extras={form.couple_photos}
                        onExtras={(arr) => setField('couple_photos', arr)}
                        profileId={id}
                        max={8}
                        testid="upload-couple-multi"
                      />
                    </div>
                  )}

                  {/* Bride & Groom mini-bios — shown next to their photos on the public invitation */}
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="About the Bride">
                      <textarea
                        value={form.bride_about || ''}
                        onChange={(e) => setField('bride_about', e.target.value)}
                        rows={4}
                        maxLength={500}
                        placeholder="A short note about the bride — her work, hobbies, the way she lights up a room…"
                        className="w-full px-3 py-2.5 rounded-md text-[14px] outline-none resize-y"
                        style={{ background: 'var(--lux-panel)', color: 'var(--lux-text)', border: '1px solid var(--lux-border)', fontFamily: '"Cormorant Garamond", serif' }}
                        data-testid="field-bride-about"
                      />
                    </Field>
                    <Field label="About the Groom">
                      <textarea
                        value={form.groom_about || ''}
                        onChange={(e) => setField('groom_about', e.target.value)}
                        rows={4}
                        maxLength={500}
                        placeholder="A short note about the groom — his passions, what makes him laugh, why he chose her…"
                        className="w-full px-3 py-2.5 rounded-md text-[14px] outline-none resize-y"
                        style={{ background: 'var(--lux-panel)', color: 'var(--lux-text)', border: '1px solid var(--lux-border)', fontFamily: '"Cormorant Garamond", serif' }}
                        data-testid="field-groom-about"
                      />
                    </Field>
                  </div>

                  {/* Couple-level details — used by the rich preview's
                      "Together" slide and the wedding-details panel.
                      Added Feb 2026 per user spec. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <Field label="Couple Story (joint)">
                      <textarea
                        value={form.couple_about || ''}
                        onChange={(e) => setField('couple_about', e.target.value)}
                        rows={3}
                        maxLength={400}
                        placeholder="One-paragraph story of how you both met, fell in love, and decided to spend forever together."
                        className="w-full px-3 py-2.5 rounded-md text-[14px] outline-none resize-y"
                        style={{ background: 'var(--lux-panel)', color: 'var(--lux-text)', border: '1px solid var(--lux-border)', fontFamily: '"Cormorant Garamond", serif' }}
                        data-testid="field-couple-about"
                      />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Field label="Nakshatram">
                          <Input
                            value={form.nakshatram || ''}
                            onChange={(v) => setField('nakshatram', v)}
                            placeholder="e.g. Anuradha & Rohini"
                            testid="field-nakshatram"
                          />
                        </Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 4, color: 'var(--lux-text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={form.show_nakshatram !== false} onChange={(e) => setField('show_nakshatram', e.target.checked)} data-testid="toggle-nakshatram" />
                          Show on invitation
                        </label>
                      </div>
                      <div>
                        <Field label="Muhurtam Window">
                          <Input
                            value={form.muhurtam || ''}
                            onChange={(v) => setField('muhurtam', v)}
                            placeholder="e.g. 11:23 AM – 12:08 PM"
                            testid="field-muhurtam"
                          />
                        </Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 4, color: 'var(--lux-text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={form.show_muhurtam !== false} onChange={(e) => setField('show_muhurtam', e.target.checked)} data-testid="toggle-muhurtam" />
                          Show on invitation
                        </label>
                      </div>
                      <div>
                        <Field label="Gotram">
                          <Input
                            value={form.gotra || ''}
                            onChange={(v) => setField('gotra', v)}
                            placeholder="Optional"
                            testid="field-gotra"
                          />
                        </Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 4, color: 'var(--lux-text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={form.show_gotra !== false} onChange={(e) => setField('show_gotra', e.target.checked)} data-testid="toggle-gotra" />
                          Show on invitation
                        </label>
                      </div>
                    </div>
                    <Field label="Poem / Blessing (optional)">
                      <textarea
                        value={form.wedding_poem || ''}
                        onChange={(e) => setField('wedding_poem', e.target.value)}
                        rows={3}
                        placeholder="A short poem or blessing shown on the invitation"
                        data-testid="field-wedding-poem"
                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--lux-border)', borderRadius: 8, color: 'var(--lux-text)', padding: '10px 12px', fontSize: 14, resize: 'vertical' }}
                      />
                    </Field>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 4, color: 'var(--lux-text-muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.show_poem !== false} onChange={(e) => setField('show_poem', e.target.checked)} data-testid="toggle-poem" />
                      Show poem on invitation
                    </label>
                  </div>

                  {/* QR + invitation background customization */}
                  <div className="mt-8 lux-glass p-5" data-testid="qr-bg-card">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.35)' }}>
                        <span style={{ color: '#D4AF37', fontSize: '0.9rem' }}>◆</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-display text-lg leading-tight" style={{ color: 'var(--lux-text)' }}>
                          QR code background photo
                        </h3>
                        <p className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                          Optional — enable this to pick which photo sits behind the QR code that guests scan. When off, the QR code stays simple (no background).
                        </p>
                      </div>
                      {/* Enable / disable toggle */}
                      <label className="flex items-center gap-2 cursor-pointer shrink-0" data-testid="qr-bg-enable-toggle">
                        <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text)' }}>
                          {form.qr_bg_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span
                          role="switch"
                          aria-checked={form.qr_bg_enabled}
                          onClick={() => setField('qr_bg_enabled', !form.qr_bg_enabled)}
                          className="relative inline-block w-11 h-6 rounded-full transition-all"
                          style={{
                            background: form.qr_bg_enabled ? 'rgba(212,175,55,0.6)' : 'var(--lux-border)',
                            border: '1px solid var(--lux-border)',
                          }}
                        >
                          <span
                            className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                            style={{
                              left: form.qr_bg_enabled ? '22px' : '4px',
                              background: form.qr_bg_enabled ? '#16110C' : 'var(--lux-text)',
                            }}
                          />
                        </span>
                      </label>
                    </div>

                    {form.qr_bg_enabled && (
                    <>
                    {/* QR background — choose source */}
                    <div className="rounded-lg p-4 mb-3" style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                      <div className="mb-3">
                        <span className="text-sm" style={{ color: 'var(--lux-text)' }}>
                          <strong className="text-gold">QR code background</strong> — pick which photo to use
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {[
                          { key: 'couple', label: 'Couple' },
                          { key: 'bride',  label: 'Bride'  },
                          { key: 'groom',  label: 'Groom'  },
                          { key: 'custom', label: 'Custom' },
                        ].map((opt) => {
                          const active = (form.qr_bg_source || 'couple') === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => {
                                setField('qr_bg_source', opt.key);
                                setField('use_couple_photo_as_qr_bg', opt.key === 'couple');
                              }}
                              className="px-2 py-2 rounded text-xs tracking-[0.15em] uppercase transition-all"
                              style={{
                                background: active ? 'rgba(212,175,55,0.18)' : 'var(--lux-panel)',
                                border: `1px solid ${active ? 'rgba(212,175,55,0.7)' : 'var(--lux-border)'}`,
                                color: active ? '#E8C766' : 'var(--lux-text)',
                              }}
                              data-testid={`qr-bg-source-${opt.key}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {form.qr_bg_source === 'custom' && (
                        <div className="mt-3">
                          <p className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>
                            Custom QR background image
                          </p>
                          <PhotoUploadField
                            label="QR Background"
                            value={form.qr_background_photo_url}
                            onChange={(v) => setField('qr_background_photo_url', v)}
                            profileId={id}
                            testid="upload-qr-background"
                          />
                        </div>
                      )}
                    </div>

                    {/* Invitation page background — choose source */}
                    <div className="rounded-lg p-4" style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                      <div className="mb-3">
                        <span className="text-sm" style={{ color: 'var(--lux-text)' }}>
                          <strong className="text-gold">Invitation page background</strong> — pick which photo to use
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {[
                          { key: 'couple', label: 'Couple' },
                          { key: 'bride',  label: 'Bride'  },
                          { key: 'groom',  label: 'Groom'  },
                          { key: 'custom', label: 'Custom' },
                        ].map((opt) => {
                          const active = (form.invitation_bg_source || 'couple') === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => {
                                setField('invitation_bg_source', opt.key);
                                setField('use_couple_photo_as_invitation_bg', opt.key === 'couple');
                              }}
                              className="px-2 py-2 rounded text-xs tracking-[0.15em] uppercase transition-all"
                              style={{
                                background: active ? 'rgba(212,175,55,0.18)' : 'var(--lux-panel)',
                                border: `1px solid ${active ? 'rgba(212,175,55,0.7)' : 'var(--lux-border)'}`,
                                color: active ? '#E8C766' : 'var(--lux-text)',
                              }}
                              data-testid={`invite-bg-source-${opt.key}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {form.invitation_bg_source === 'custom' && (
                        <div className="mt-3">
                          <p className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>
                            Custom invitation page background image
                          </p>
                          <PhotoUploadField
                            label="Invitation Background"
                            value={form.invitation_background_photo_url}
                            onChange={(v) => setField('invitation_background_photo_url', v)}
                            profileId={id}
                            testid="upload-invitation-background"
                          />
                        </div>
                      )}
                    </div>
                    </>
                    )}

                  </div>

                  {/* Opening (link-open) animation background — re-added per
                      product spec. The wax-seal opening animation can render
                      with the couple / bride / groom photo as backdrop, or a
                      custom upload. Mirrors the QR background card. */}
                  <div className="mt-8 lux-glass p-5" data-testid="opening-bg-card">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.35)' }}>
                        <span style={{ color: '#D4AF37', fontSize: '0.9rem' }}>◆</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-display text-lg leading-tight" style={{ color: 'var(--lux-text)' }}>
                          Opening (link-open) animation background
                        </h3>
                        <p className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                          Pick the photo that sits behind the wax-seal opening animation when guests first open your link. Defaults to the couple photo.
                        </p>
                      </div>
                      {/* Enable / disable toggle */}
                      <label className="flex items-center gap-2 cursor-pointer shrink-0" data-testid="opening-bg-enable-toggle">
                        <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text)' }}>
                          {(form.opening_bg_source && form.opening_bg_source !== 'none') ? 'Enabled' : 'Disabled'}
                        </span>
                        <span
                          role="switch"
                          aria-checked={(form.opening_bg_source && form.opening_bg_source !== 'none')}
                          onClick={() => {
                            const isOn = form.opening_bg_source && form.opening_bg_source !== 'none';
                            if (isOn) {
                              setField('opening_bg_source', 'none');
                              setField('use_couple_photo_as_opening_bg', false);
                            } else {
                              setField('opening_bg_source', 'couple');
                              setField('use_couple_photo_as_opening_bg', true);
                            }
                          }}
                          className="relative inline-block w-11 h-6 rounded-full transition-all"
                          style={{
                            background: (form.opening_bg_source && form.opening_bg_source !== 'none') ? 'rgba(212,175,55,0.6)' : 'var(--lux-border)',
                            border: '1px solid var(--lux-border)',
                          }}
                        >
                          <span
                            className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                            style={{
                              left: (form.opening_bg_source && form.opening_bg_source !== 'none') ? '22px' : '4px',
                              background: (form.opening_bg_source && form.opening_bg_source !== 'none') ? '#16110C' : 'var(--lux-text)',
                            }}
                          />
                        </span>
                      </label>
                    </div>

                    {(form.opening_bg_source && form.opening_bg_source !== 'none') && (
                      <div className="rounded-lg p-4" style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                        <div className="mb-3">
                          <span className="text-sm" style={{ color: 'var(--lux-text)' }}>
                            <strong className="text-gold">Source photo</strong> — choose which image powers the opening animation
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {[
                            { key: 'couple', label: 'Couple' },
                            { key: 'bride',  label: 'Bride'  },
                            { key: 'groom',  label: 'Groom'  },
                            { key: 'custom', label: 'Custom' },
                          ].map((opt) => {
                            const active = (form.opening_bg_source || 'couple') === opt.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => {
                                  setField('opening_bg_source', opt.key);
                                  setField('use_couple_photo_as_opening_bg', opt.key === 'couple');
                                }}
                                className="px-2 py-2 rounded text-xs tracking-[0.15em] uppercase transition-all"
                                style={{
                                  background: active ? 'rgba(212,175,55,0.18)' : 'var(--lux-panel)',
                                  border: `1px solid ${active ? 'rgba(212,175,55,0.7)' : 'var(--lux-border)'}`,
                                  color: active ? '#E8C766' : 'var(--lux-text)',
                                }}
                                data-testid={`opening-bg-source-${opt.key}`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        {form.opening_bg_source === 'custom' && (
                          <div className="mt-3">
                            <p className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>
                              Custom opening animation background
                            </p>
                            <PhotoUploadField
                              label="Opening Background"
                              value={form.opening_photo_url}
                              onChange={(v) => setField('opening_photo_url', v)}
                              profileId={id}
                              testid="upload-opening-background"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Families & blessings — added July 2026 so the public
                      invitation can render "With the blessings of …" with
                      both sets of parents named explicitly. */}
                  <div className="mt-8 lux-glass p-5" data-testid="families-card">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.35)' }}>
                        <span style={{ color: '#D4AF37', fontSize: '0.9rem' }}>◆</span>
                      </div>
                      <div>
                        <h3 className="font-display text-lg leading-tight" style={{ color: 'var(--lux-text)' }}>
                          With the blessings of our families
                        </h3>
                        <p className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                          Parents' names shown in the welcome line and the families section of the invitation. Leave blank to skip.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="rounded-lg p-4" style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                        <div className="lux-eyebrow mb-3">◆ Bride's parents</div>
                        <Field label="Father's name">
                          <Input
                            value={form.bride_father}
                            onChange={(v) => setField('bride_father', v)}
                            placeholder="Mr. Anand Sharma"
                            testid="field-bride-father"
                          />
                        </Field>
                        <Field label="Mother's name">
                          <Input
                            value={form.bride_mother}
                            onChange={(v) => setField('bride_mother', v)}
                            placeholder="Mrs. Rekha Sharma"
                            testid="field-bride-mother"
                          />
                        </Field>
                      </div>
                      <div className="rounded-lg p-4" style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                        <div className="lux-eyebrow mb-3">◆ Groom's parents</div>
                        <Field label="Father's name">
                          <Input
                            value={form.groom_father}
                            onChange={(v) => setField('groom_father', v)}
                            placeholder="Mr. Vikram Kapoor"
                            testid="field-groom-father"
                          />
                        </Field>
                        <Field label="Mother's name">
                          <Input
                            value={form.groom_mother}
                            onChange={(v) => setField('groom_mother', v)}
                            placeholder="Mrs. Meera Kapoor"
                            testid="field-groom-mother"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                </div>
              </Step>
            )}

            {STEPS[step].id === 'theme' && (
              <Step title="Choose a Design" subtitle="Pick a theme, then a ceremony, then the exact design. Click Preview at any step to see the live invitation.">
                <ThemeDesignWizard
                  value={{
                    theme_id: form.design_theme,
                    event: form.primary_event,
                    design_id: form.design_id,
                  }}
                  onChange={(v) => {
                    if (v.theme_id) setField('design_theme', v.theme_id);
                    if (v.event) setField('primary_event', v.event);
                    if (v.design_id) setField('design_id', v.design_id);
                  }}
                  coupleData={{
                    bride_name: form.bride_name,
                    groom_name: form.groom_name,
                    wedding_date: form.wedding_date,
                    venue: form.venue,
                    story: form.story,
                    couple_photo_url: form.couple_photo_url,
                    bride_photo_url: form.bride_photo_url,
                    groom_photo_url: form.groom_photo_url,
                    background_music_url: form.background_music_url,
                  }}
                />
              </Step>
            )}

            {STEPS[step].id === 'story' && (
              <Step title="Your Love Story" subtitle="Where you met, how it began. (Customer-visible: 'Our Story' section)">
                <Field label="Story"><Textarea rows={8} value={form.story} onChange={(v) => setField('story', v)} testid="field-story" /></Field>
              </Step>
            )}

            {STEPS[step].id === 'venue' && (
              <Step title="The Venue" subtitle="Primary venue + Google Maps link for one-tap navigation. (Customer-visible: 'Venue' section + 'Open in Maps' button)">
                <Field label="Venue Name"><Input value={form.venue} onChange={(v) => setField('venue', v)} placeholder="The Leela Palace" testid="field-venue" /></Field>
                <Field label="Full Address"><Textarea rows={3} value={form.venue_address} onChange={(v) => setField('venue_address', v)} placeholder="Lake Pichola, Udaipur, Rajasthan 313001" testid="field-venue-address" /></Field>
                <Field label="Google Maps Link">
                  <Input
                    value={form.venue_google_map_link}
                    onChange={(v) => setField('venue_google_map_link', v)}
                    placeholder="https://maps.google.com/?q=The+Leela+Palace+Udaipur"
                    testid="field-venue-map"
                  />
                </Field>
                <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                  Open Google Maps → search the venue → tap "Share" → "Copy link" → paste here. Guests tap the "Open in Maps" button on the invitation to get instant turn-by-turn directions.
                </p>
                {form.venue_google_map_link && (
                  <a href={form.venue_google_map_link} target="_blank" rel="noreferrer"
                    className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-2 mt-2"
                    data-testid="venue-map-test-link"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Test this Maps link
                  </a>
                )}

                {/* Parking — optional, toggleable */}
                <div className="mt-6 lux-glass p-5" data-testid="parking-card">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="lux-eyebrow mb-1">◆ Parking Info <span className="text-[10px] opacity-60">(optional)</span></div>
                      <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                        When the parking is at a different spot than the venue, give your guests a clear note + map link.
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => setField('parking', { ...form.parking, enabled: !form.parking?.enabled })}
                      className="w-11 h-6 rounded-full relative transition-colors shrink-0"
                      style={{ background: form.parking?.enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
                      data-testid="parking-enabled-toggle">
                      <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                        style={{ background: 'var(--lux-text)', left: form.parking?.enabled ? 'calc(100% - 22px)' : '2px' }} />
                    </button>
                  </div>
                  {form.parking?.enabled && (
                    <div className="space-y-3">
                      <Field label="Parking instructions (shown above the Map link)">
                        <Textarea rows={3} value={form.parking?.text || ''}
                          onChange={(v) => setField('parking', { ...form.parking, text: v })}
                          testid="parking-text" />
                      </Field>
                      <Field label="Parking Google Maps Link (optional)">
                        <Input value={form.parking?.google_map_link || ''}
                          onChange={(v) => setField('parking', { ...form.parking, google_map_link: v })}
                          placeholder="https://maps.google.com/?q=Parking+Lot"
                          testid="parking-map-link" />
                      </Field>
                      <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                        Example: "You can park in the underground lot of XYZ Mandapam — entry from Gate 2." Add a Google Maps link if the spot is far from the venue.
                      </p>
                    </div>
                  )}
                </div>
              </Step>
            )}

            {STEPS[step].id === 'media' && (
              <Step title="Music" subtitle="Pick from 20 curated tracks or paste your own URL. (Customer-visible: persistent bottom-right ambient player)">
                <MusicPresetPicker
                  value={form.background_music_url}
                  onChange={(v) => setField('background_music_url', v)}
                />
              </Step>
            )}

            {STEPS[step].id === 'stay' && (
              <Step
                title="Stay & Video"
                subtitle="Pre-wedding film, live-stream link, and a name-searchable room directory for out-of-town guests."
              >
                <div className="lux-glass p-5">
                  <div className="lux-eyebrow mb-2">◆ Pre-wedding Video / Drive Link</div>
                  <p className="text-xs mb-4" style={{ color: 'var(--lux-text-muted)' }}>
                    Paste a Google Drive (recommended), YouTube, or Vimeo link. Drive files must be shared as
                    <span className="text-gold"> "Anyone with the link · Viewer"</span> so guests can play without signing in.
                  </p>
                  <PreWeddingLinksEditor
                    links={form.pre_wedding_links || []}
                    onChange={(links) => setField('pre_wedding_links', links)}
                  />
                </div>

                {/* July 2026 — YouTube live-stream link. Lets guests
                    watch the marriage/event live from anywhere. */}
                <div className="lux-glass p-5 mt-4" data-testid="youtube-live-card">
                  <div className="lux-eyebrow mb-2">◆ Live stream (YouTube) — watch the wedding live</div>
                  <p className="text-xs mb-4" style={{ color: 'var(--lux-text-muted)' }}>
                    Paste a YouTube live-stream URL so guests who cannot attend in person can watch the
                    <span className="text-gold"> muhurtam, pheras, varmala &amp; reception</span> in real time. The link appears on the public invitation only while it is set.
                  </p>
                  <Field label="YouTube live URL">
                    <Input
                      value={form.youtube_live_url}
                      onChange={(v) => setField('youtube_live_url', v)}
                      placeholder="https://www.youtube.com/watch?v=… or https://youtu.be/…"
                      testid="field-youtube-live-url"
                    />
                  </Field>
                  {form.youtube_live_url && (
                    <p className="text-[10px] tracking-[0.2em] uppercase mt-2" style={{ color: 'rgba(232,199,102,0.85)' }}>
                      ✓ Live-stream link will be visible on the invitation. Make sure the stream is set to <em>Public</em> or <em>Unlisted</em>.
                    </p>
                  )}
                </div>

                {/* July 2026 — Rooms enable/disable, moved out of Features.
                    Photographer flips this ON to expose the room directory
                    on the public link. */}
                <div className="lux-glass p-5 mt-4" data-testid="rooms-card">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-1">
                      <div className="lux-eyebrow mb-1">◆ Find My Room · Guest accommodation directory</div>
                      <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                        Add one row per guest (or family). Out-of-town guests type their name on the invitation to
                        instantly see their room number, building, an embedded map, and check-in instructions.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer shrink-0" data-testid="rooms-enable-toggle">
                      <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text)' }}>
                        {form.rooms_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <span
                        role="switch"
                        aria-checked={form.rooms_enabled}
                        onClick={() => setField('rooms_enabled', !form.rooms_enabled)}
                        className="relative inline-block w-11 h-6 rounded-full transition-all"
                        style={{
                          background: form.rooms_enabled ? 'rgba(212,175,55,0.6)' : 'var(--lux-border)',
                          border: '1px solid var(--lux-border)',
                        }}
                      >
                        <span
                          className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                          style={{
                            left: form.rooms_enabled ? '22px' : '4px',
                            background: form.rooms_enabled ? '#16110C' : 'var(--lux-text)',
                          }}
                        />
                      </span>
                    </label>
                  </div>

                  {form.rooms_enabled ? (
                    <GuestRoomsEditor
                      rooms={form.guest_rooms || []}
                      onChange={(rooms) => setField('guest_rooms', rooms)}
                    />
                  ) : (
                    <div className="rounded-lg p-4 text-center text-xs" style={{ background: 'var(--lux-panel)', border: '1px dashed var(--lux-border)', color: 'var(--lux-text-muted)' }}>
                      Rooms directory is disabled. Turn the switch above ON to start adding guest rooms.
                    </div>
                  )}
                </div>
              </Step>
            )}

            {STEPS[step].id === 'gifts' && (
              <Step
                title="Gifts & Digital Shagun"
                subtitle={isNew
                  ? 'Save the draft once to enable Gifts & Shagun (they sync per invitation).'
                  : 'Configure how guests can offer blessings. UPI deep links — one tap, no fees.'}
              >
                {/* Digital Shagun */}
                <div className="lux-glass p-5 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="lux-eyebrow mb-1">◆ Digital Shagun (UPI)</div>
                      <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                        Guests see suggested amounts and tap to pay via Google Pay / PhonePe / Paytm / any UPI app.
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => setShagun('enabled', !form.shagun.enabled)}
                      className="w-11 h-6 rounded-full relative transition-colors shrink-0"
                      style={{ background: form.shagun.enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
                      data-testid="shagun-enabled-toggle"
                    >
                      <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                        style={{ background: 'var(--lux-text)', left: form.shagun.enabled ? 'calc(100% - 22px)' : '2px' }} />
                    </button>
                  </div>

                  {form.shagun.enabled && (
                    <div className="space-y-3">
                      <Row>
                        <Field label="UPI ID (required)"><Input value={form.shagun.upi_id} onChange={(v) => setShagun('upi_id', v)} placeholder="yourname@okhdfcbank" testid="shagun-upi-id" /></Field>
                        <Field label="Payee Name"><Input value={form.shagun.payee_name} onChange={(v) => setShagun('payee_name', v)} placeholder={`${form.bride_name || 'Bride'} & ${form.groom_name || 'Groom'}`} testid="shagun-payee-name" /></Field>
                      </Row>
                      <Row>
                        <Field label="Google Pay handle (optional)"><Input value={form.shagun.gpay_handle} onChange={(v) => setShagun('gpay_handle', v)} placeholder="@okgpay" testid="shagun-gpay" /></Field>
                        <Field label="PhonePe handle (optional)"><Input value={form.shagun.phonepe_handle} onChange={(v) => setShagun('phonepe_handle', v)} placeholder="@ybl" testid="shagun-phonepe" /></Field>
                      </Row>
                      <Field label="Paytm handle (optional)"><Input value={form.shagun.paytm_handle} onChange={(v) => setShagun('paytm_handle', v)} placeholder="@paytm" testid="shagun-paytm" /></Field>
                      <Field label="Blessing Message"><Textarea rows={2} value={form.shagun.blessing_message} onChange={(v) => setShagun('blessing_message', v)} testid="shagun-message" /></Field>
                      <Field label="Suggested Amounts (₹, comma-separated)">
                        <Input
                          value={(form.shagun.suggested_amounts || []).join(', ')}
                          onChange={(v) => setShagun('suggested_amounts', v.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x) && x > 0))}
                          placeholder="501, 1100, 2100, 5100, 11000"
                          testid="shagun-amounts"
                        />
                      </Field>
                    </div>
                  )}
                </div>

                {/* Gift Registry */}
                <div className="lux-glass p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="lux-eyebrow mb-1">◆ Gift Registry</div>
                      <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                        Toggle ON to show gift suggestions. Toggle OFF for a polite "no gifts please" note.
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => setGifts('enabled', !form.gifts.enabled)}
                      className="w-11 h-6 rounded-full relative transition-colors shrink-0"
                      style={{ background: form.gifts.enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
                      data-testid="gifts-enabled-toggle"
                    >
                      <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                        style={{ background: 'var(--lux-text)', left: form.gifts.enabled ? 'calc(100% - 22px)' : '2px' }} />
                    </button>
                  </div>

                  <Field label="Headline">
                    <Input
                      value={form.gifts.headline}
                      onChange={(v) => setGifts('headline', v)}
                      placeholder={form.gifts.enabled ? 'With grace, a few gift ideas' : 'With love, not gifts'}
                      testid="gifts-headline"
                    />
                  </Field>
                  <Field label="Message to Guests">
                    <Textarea
                      rows={3}
                      value={form.gifts.message}
                      onChange={(v) => setGifts('message', v)}
                      testid="gifts-message"
                    />
                  </Field>
                  {!form.gifts.enabled && (
                    <label className="flex items-center gap-2 mt-3 text-sm" style={{ color: 'var(--lux-text)' }}>
                      <input type="checkbox" checked={!!form.gifts.show_disabled_note}
                        onChange={(e) => setGifts('show_disabled_note', e.target.checked)}
                        data-testid="gifts-show-note" />
                      Still show a polite "no gifts" note on the invitation
                    </label>
                  )}
                  {!isNew && (
                    <p className="text-[11px] mt-3" style={{ color: 'var(--lux-text-muted)' }}>
                      For detailed gift suggestions (items, links, presets), open the dedicated
                      {' '}<a href={`/studio/profile/${id}/gifts`} className="text-gold underline">Gift Registry editor</a>.
                    </p>
                  )}
                </div>

                {/* Phase 1H — Honeymoon Fund */}
                <div className="lux-glass p-5 mt-4" data-testid="admin-honeymoon-card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="lux-eyebrow mb-1">◆ Honeymoon Fund</div>
                      <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                        Simple UPI / QR display for honeymoon contributions. No platform fees. You receive directly.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHoneymoon('enabled', !form.honeymoon_fund.enabled)}
                      className="w-11 h-6 rounded-full relative transition-colors shrink-0"
                      style={{ background: form.honeymoon_fund.enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
                      data-testid="honeymoon-enabled-toggle"
                    >
                      <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                        style={{ background: 'var(--lux-text)', left: form.honeymoon_fund.enabled ? 'calc(100% - 22px)' : '2px' }} />
                    </button>
                  </div>

                  {form.honeymoon_fund.enabled && (
                    <div className="space-y-3">
                      <Row>
                        <Field label="Section Title">
                          <Input value={form.honeymoon_fund.title} onChange={(v) => setHoneymoon('title', v)} placeholder="Honeymoon Fund" testid="honeymoon-title" />
                        </Field>
                        <Field label="Payee Name (shown in UPI app)">
                          <Input value={form.honeymoon_fund.payee_name} onChange={(v) => setHoneymoon('payee_name', v)} placeholder={`${form.bride_name || 'Bride'} & ${form.groom_name || 'Groom'}`} testid="honeymoon-payee" />
                        </Field>
                      </Row>
                      <Field label="UPI ID (e.g. couple@okhdfcbank)">
                        <Input value={form.honeymoon_fund.upi_id} onChange={(v) => setHoneymoon('upi_id', v)} placeholder="yourname@okhdfcbank" testid="honeymoon-upi-id" />
                      </Field>
                      <Field label="QR Image URL (optional — host a custom QR, or upload via Media tab)">
                        <Input value={form.honeymoon_fund.qr_image_url} onChange={(v) => setHoneymoon('qr_image_url', v)} placeholder="https://… (leave blank to only show UPI ID)" testid="honeymoon-qr-url" />
                      </Field>
                      <Field label="Message to Guests">
                        <Textarea rows={2} value={form.honeymoon_fund.message} onChange={(v) => setHoneymoon('message', v)} testid="honeymoon-message" />
                      </Field>

                      <div className="pt-2 border-t" style={{ borderColor: 'rgba(212,175,55,0.18)' }}>
                        <label className="flex items-center gap-3 cursor-pointer mb-3" data-testid="honeymoon-progress-wrap">
                          <input
                            type="checkbox"
                            checked={!!form.honeymoon_fund.show_progress}
                            onChange={(e) => setHoneymoon('show_progress', e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: '#D4AF37' }}
                            data-testid="honeymoon-show-progress"
                          />
                          <span className="text-sm" style={{ color: 'var(--lux-text)' }}>Show a progress bar (optional)</span>
                        </label>
                        {form.honeymoon_fund.show_progress && (
                          <Row>
                            <Field label="Goal Amount (₹)">
                              <Input
                                type="number"
                                value={form.honeymoon_fund.goal_amount}
                                onChange={(v) => setHoneymoon('goal_amount', v)}
                                placeholder="100000"
                                testid="honeymoon-goal"
                              />
                            </Field>
                            <Field label="Raised So Far (₹) — update manually">
                              <Input
                                type="number"
                                value={form.honeymoon_fund.raised_amount}
                                onChange={(v) => setHoneymoon('raised_amount', v)}
                                placeholder="0"
                                testid="honeymoon-raised"
                              />
                            </Field>
                          </Row>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Phase 1C — RSVP Form Fields */}
                <div className="lux-glass p-5 mt-4" data-testid="admin-rsvp-settings-card">
                  <div className="lux-eyebrow mb-1">◆ RSVP Form Fields</div>
                  <p className="text-xs mb-4" style={{ color: 'var(--lux-text-muted)' }}>
                    Choose which extra fields appear on the public RSVP form. Each toggle is independent.
                  </p>

                  <div className="space-y-3">
                    {/* Dietary */}
                    <div className="flex items-start justify-between gap-4 py-2 border-b" style={{ borderColor: 'rgba(212,175,55,0.12)' }}>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>Dietary Preference</div>
                        <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Guests pick: Veg / Non-veg / Vegan / Jain</div>
                      </div>
                      <button type="button"
                        onClick={() => setRsvpSetting('dietary_enabled', !form.rsvp_settings.dietary_enabled)}
                        className="w-11 h-6 rounded-full relative transition-colors shrink-0"
                        style={{ background: form.rsvp_settings.dietary_enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
                        data-testid="rsvp-dietary-toggle"
                      >
                        <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                          style={{ background: 'var(--lux-text)', left: form.rsvp_settings.dietary_enabled ? 'calc(100% - 22px)' : '2px' }} />
                      </button>
                    </div>
                    {form.rsvp_settings.dietary_enabled && (
                      <div className="pl-4 grid grid-cols-2 gap-2 pb-3" data-testid="rsvp-dietary-options">
                        {[
                          { k: 'dietary_show_veg',    label: 'Vegetarian' },
                          { k: 'dietary_show_nonveg', label: 'Non-Vegetarian' },
                          { k: 'dietary_show_vegan',  label: 'Vegan' },
                          { k: 'dietary_show_jain',   label: 'Jain' },
                        ].map((o) => (
                          <label key={o.k} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--lux-text)' }}>
                            <input
                              type="checkbox"
                              checked={!!form.rsvp_settings[o.k]}
                              onChange={(e) => setRsvpSetting(o.k, e.target.checked)}
                              style={{ width: 14, height: 14, accentColor: '#D4AF37' }}
                              data-testid={`rsvp-opt-${o.k}`}
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Allergies */}
                    <div className="flex items-start justify-between gap-4 py-2 border-b" style={{ borderColor: 'rgba(212,175,55,0.12)' }}>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>Allergies Note</div>
                        <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Free-text field, up to 250 characters</div>
                      </div>
                      <button type="button"
                        onClick={() => setRsvpSetting('allergies_enabled', !form.rsvp_settings.allergies_enabled)}
                        className="w-11 h-6 rounded-full relative transition-colors shrink-0"
                        style={{ background: form.rsvp_settings.allergies_enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
                        data-testid="rsvp-allergies-toggle"
                      >
                        <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                          style={{ background: 'var(--lux-text)', left: form.rsvp_settings.allergies_enabled ? 'calc(100% - 22px)' : '2px' }} />
                      </button>
                    </div>

                    {/* Plus-one */}
                    <div className="flex items-start justify-between gap-4 py-2 border-b" style={{ borderColor: 'rgba(212,175,55,0.12)' }}>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>Plus-One</div>
                        <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Guest can indicate they're bringing a partner</div>
                      </div>
                      <button type="button"
                        onClick={() => setRsvpSetting('plus_one_enabled', !form.rsvp_settings.plus_one_enabled)}
                        className="w-11 h-6 rounded-full relative transition-colors shrink-0"
                        style={{ background: form.rsvp_settings.plus_one_enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
                        data-testid="rsvp-plusone-toggle"
                      >
                        <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                          style={{ background: 'var(--lux-text)', left: form.rsvp_settings.plus_one_enabled ? 'calc(100% - 22px)' : '2px' }} />
                      </button>
                    </div>

                    {/* Kids */}
                    <div className="flex items-start justify-between gap-4 py-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>Kids Attending</div>
                        <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Number of kids the guest will bring</div>
                      </div>
                      <button type="button"
                        onClick={() => setRsvpSetting('kids_enabled', !form.rsvp_settings.kids_enabled)}
                        className="w-11 h-6 rounded-full relative transition-colors shrink-0"
                        style={{ background: form.rsvp_settings.kids_enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
                        data-testid="rsvp-kids-toggle"
                      >
                        <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                          style={{ background: 'var(--lux-text)', left: form.rsvp_settings.kids_enabled ? 'calc(100% - 22px)' : '2px' }} />
                      </button>
                    </div>
                  </div>
                </div>
              </Step>
            )}

            {STEPS[step].id === 'flags' && (
              <Step title="Features & Sections" subtitle="Turn every section on or off. The page on the right adapts in real time — disabled sections never render on the public invitation.">
                {/* The photo password lives on the QR page (and under Stay &
                    Video in this form). Photographers look for guest-facing
                    controls HERE, so point at it rather than leaving them to
                    hunt — this is the "there is no option for the password"
                    report: the control existed, in a place nobody would look. */}
                {/* The password guests type after scanning the QR to collect
                    their photos. It lives HERE, with the other guest-facing
                    controls. It used to sit inside the "Stay & Video" step,
                    behind pre-wedding films and room directories — which is why
                    it was reported as "there is no option for the password":
                    the control existed, somewhere nobody would look. */}
                <div className="lux-glass p-5 mb-5" data-testid="flags-photo-privacy">
                  <div className="lux-eyebrow mb-2">◆ Photo password · what guests enter after scanning the QR</div>
                  <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--lux-text-muted)' }}>
                    Guests scan the QR to collect their photos. Set an access code and they must
                    enter it first, so the photos stay private even if the link or QR is forwarded.
                    They get a lock screen and can “Remember this device” to enter it only once.
                  </p>
                  <GalleryPrivacyEditor
                    value={form.gallery_privacy || { enabled: false }}
                    onChange={(v) => setField('gallery_privacy', v)}
                  />
                  {profileId && (
                    <button type="button"
                      onClick={() => window.open(`/studio/profile/${profileId}/qr-codes`, '_blank')}
                      className="lux-btn lux-btn-ghost text-[11px] mt-4"
                      data-testid="flags-open-qr-password">
                      Open the QR codes page
                    </button>
                  )}
                </div>

                {/* Feb 2026 — Comprehensive section switchboard.
                    Grouped into 4 categories for scannability. Each toggle
                    maps 1:1 to a backend SectionsEnabled field. */}
                <SectionsSwitchboard
                  value={form.sections_enabled}
                  onChange={(key, v) => setField('sections_enabled', { ...form.sections_enabled, [key]: v })}
                />

                <div className="mt-10 pt-8 border-t" style={{ borderColor: 'rgba(212,175,55,0.18)' }}>
                  <div className="lux-eyebrow mb-3">◆ Premium add-ons</div>
                  <FeatureFlagsPanel
                    flags={[
                      { key: 'show_rsvp',          label: 'RSVP',                description: 'Collect guest responses with attendance count.',              enabled: form.feature_flags.show_rsvp, free: pricing.optionIsFree('rsvp_basic', true), creditCost: pricing.optionCredits('rsvp_basic', 0) },
                      { key: 'show_wishes',        label: 'Guest Wishes',        description: 'Public guest book on the invitation.',                          enabled: form.feature_flags.show_wishes, free: pricing.optionIsFree('guest_messages', true), creditCost: pricing.optionCredits('guest_messages', 0) },
                      { key: 'show_countdown',     label: 'Countdown',           description: 'Live ticker until the wedding moment.',                         enabled: form.feature_flags.show_countdown, free: pricing.optionIsFree('countdown_timer', true), creditCost: pricing.optionCredits('countdown_timer', 0) },
                      { key: 'show_music',         label: 'Ambient Music',       description: 'Persistent background score with crossfade.',                   enabled: form.feature_flags.show_music, free: pricing.optionIsFree('background_music', true), creditCost: pricing.optionCredits('background_music', 0) },
                      { key: 'show_live_gallery',  label: 'Live Photo Gallery',  description: 'Stream the wedding photos in real-time.',                       enabled: form.feature_flags.show_live_gallery, free: pricing.optionIsFree('live_gallery', false), creditCost: pricing.optionCredits('live_gallery', 3) },
                      { key: 'show_ai_story',      label: 'AI Story Composer',   description: 'Gemini-powered cinematic prose generation.',                    enabled: form.feature_flags.show_ai_story, free: pricing.optionIsFree('ai_story', false), creditCost: pricing.optionCredits('ai_story', 1) },
                      { key: 'show_digital_shagun',label: 'Digital Shagun',      description: 'Accept gifts via UPI / QR / Razorpay.',                         enabled: form.feature_flags.show_digital_shagun, free: pricing.optionIsFree('gift_registry', false), creditCost: pricing.optionCredits('gift_registry', 2) },
                      {
                        key: 'show_translations',  label: 'Multi-language',      description: 'Translate content to additional languages. Guests can switch from the link header.',
                        enabled: form.feature_flags.show_translations,
                        free: pricing.optionIsFree('multi_language', false),
                        creditCost: pricing.optionCredits('multi_language', 2),
                        extra: (
                          <MultiLangPicker
                            mainLanguage={form.language}
                            languages={form.languages || []}
                            onChange={(langs) => setField('languages', langs)}
                            profileId={id}
                          />
                        ),
                      },
                      {
                        key: 'show_ai_curation',
                        label: 'AI Photo Curation',
                        description: 'Gemini Nano Banana auto-picks the best gallery shots. Charged once at publish time.',
                        enabled: form.feature_flags.show_ai_curation,
                        free: pricing.optionIsFree('ai_photo_curation', false),
                        creditCost: pricing.optionCredits('ai_photo_curation', 3),
                      },
                      {
                        key: 'show_guest_upload',
                        label: 'Guest Pre-event Photo Upload',
                        description: 'Guests can send photos before the wedding starts; QR auto-activates after the event begins.',
                        enabled: form.feature_flags.show_guest_upload,
                        free: pricing.optionIsFree('guest_photo_upload', false),
                        creditCost: pricing.optionCredits('guest_photo_upload', 2),
                      },
                    ]}
                    onChange={setFlag}
                  />
                </div>
              </Step>
            )}

            {STEPS[step].id === 'publish' && (
              <Step title="Publish" subtitle={published ? 'This wedding is live.' : 'Drafts are free. Publish whenever you are ready.'}>
                <div className="space-y-4">
                  <Field label="Privacy Passcode (optional)">
                    <Input value={form.passcode} onChange={(v) => setField('passcode', v)} placeholder="Leave blank for public invite" testid="field-passcode" />
                  </Field>

                  <ExpiryTierSelector
                    value={form.expiry_tier}
                    onChange={(v) => setField('expiry_tier', v)}
                  />

                  {published && shareLink && (
                    <div className="lux-glass p-6">
                      <div className="lux-eyebrow mb-2">◆ Share Link</div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <code className="font-mono text-xs sm:text-sm break-all w-full sm:w-auto" style={{ color: 'var(--lux-text)' }} data-testid="published-share-link">{window.location.origin}/invite/{shareLink}</code>
                        <a href={`/invite/${shareLink}`} target="_blank" rel="noreferrer" className="lux-btn lux-btn-ghost text-xs w-full sm:w-auto justify-center" data-testid="open-invite-link">
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      const result = await save({ publish: true });
                      if (result) setPublished(true);
                    }}
                    disabled={saving}
                    className="lux-btn w-full justify-center"
                    data-testid="publish-btn"
                  >
                    {saving ? 'Publishing…' : published ? 'Re-publish' : 'Publish Now'}
                    <Check className="w-4 h-4" />
                  </button>

                  {/* Mini live preview thumbnail — the photographer can SEE
                      the exact link they're about to mint before they spend
                      the credit. Clicking opens the full preview in a new tab. */}
                  <PublishMiniPreview
                    themeId={form.design_theme}
                    event={form.primary_event}
                    designId={form.design_id}
                    bride={form.bride_name}
                    groom={form.groom_name}
                    photo={form.couple_photo_url || form.bride_photo_url || form.groom_photo_url}
                  />
                </div>
              </Step>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button onClick={prev} disabled={step === 0} className="lux-btn lux-btn-ghost text-xs disabled:opacity-40" data-testid="step-prev">
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
          <span className="text-xs tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
            Step {step + 1} of {STEPS.length}
          </span>
          <button onClick={next} disabled={step === STEPS.length - 1} className="lux-btn text-xs disabled:opacity-40" data-testid="step-next">
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <ThemePreviewModal
        open={!!previewTheme}
        theme={previewTheme}
        onClose={() => setPreviewTheme(null)}
        onUse={(themeId) => setField('design_theme', themeId)}
      />

    </LuxuryShell>
  );
};

/* ── Helpers ─────────────────────────────────────────────── */

/* Feb 2026 — PhotoSlotToggle: a thin wrapper around a PhotoUploadField that
   exposes an on/off switch so users can opt out of a photo slot entirely
   (critical for haldi/mehendi where typically only one person is featured).
   When OFF, the upload field is rendered with reduced opacity + a soft
   "Disabled — won't appear on invitation" hint, AND the underlying photo URL
   is preserved so toggling back on restores it without a re-upload. */
const PhotoSlotToggle = ({ enabled, onToggle, testid, children }) => (
  <div
    className="rounded-lg p-3"
    style={{
      background: enabled ? 'rgba(212,175,55,0.05)' : 'var(--lux-panel)',
      border: `1px solid ${enabled ? 'rgba(212,175,55,0.25)' : 'var(--lux-panel)'}`,
      transition: 'background 0.25s, border-color 0.25s',
    }}
  >
    <label className="flex items-center gap-2 cursor-pointer mb-2 select-none">
      <input
        type="checkbox"
        checked={!!enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="sr-only"
        data-testid={testid}
      />
      <span
        role="switch"
        aria-checked={!!enabled}
        className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors shrink-0"
        style={{ background: enabled ? '#D4AF37' : 'var(--lux-border)' }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ left: 2, transform: enabled ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </span>
      {/* Always-visible tick when enabled (user-requested Feb 2026) */}
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 transition-all"
        style={{
          background: enabled ? '#D4AF37' : 'transparent',
          border: enabled ? '1px solid #D4AF37' : '1px solid var(--lux-border)',
          color: enabled ? '#16110C' : 'var(--lux-border)',
        }}
        data-testid={`${testid}-tick`}
      >
        <Check className="w-3 h-3" />
      </span>
      <span className="text-[10px] tracking-[0.22em] uppercase" style={{ color: enabled ? '#E8C766' : 'var(--lux-text-muted)' }}>
        {enabled ? 'Enabled' : 'Disabled · hidden on invitation'}
      </span>
    </label>
    <div style={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
      {children}
    </div>
  </div>
);


const Step = ({ title, subtitle, children }) => (
  <div>
    <h2 className="font-display text-3xl md:text-[2.4rem] leading-tight mb-2" style={{ color: 'var(--lux-text)' }}>{title}</h2>
    {subtitle && <p className="text-sm mb-7" style={{ color: 'var(--lux-text-muted)' }}>{subtitle}</p>}
    <div className="space-y-4">{children}</div>
  </div>
);

const Row = ({ children }) => <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
    {children}
  </label>
);

const baseInput = {
  width: '100%', padding: '0.85rem 1rem', background: 'transparent', color: 'var(--lux-text)',
  border: '1px solid var(--lux-border)', borderRadius: '0.5rem', outline: 'none',
  fontFamily: 'Manrope, sans-serif', fontSize: '0.92rem', caretColor: '#D4AF37',
};
const Input = ({ value, onChange, type = 'text', placeholder, testid }) => (
  <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={baseInput} data-testid={testid} />
);
const Textarea = ({ value, onChange, rows = 4, testid }) => (
  <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
    style={{ ...baseInput, resize: 'vertical', minHeight: 80 }} data-testid={testid} />
);
const Select = ({ value, onChange, options, testid }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}
    style={{ ...baseInput, cursor: 'pointer', appearance: 'none' }} data-testid={testid}>
    {options.map((o) => <option key={o} value={o} style={{ background: '#1A130B', color: '#FFF8DC' }}>{o}</option>)}
  </select>
);

/* ── Multi-language sub-picker (used inside Features step) ──── */
const ALL_LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Punjabi', 'Hinglish', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Urdu', 'Odia', 'Assamese'];
const MultiLangPicker = ({ mainLanguage, languages, onChange, profileId }) => {
  const [translating, setTranslating] = React.useState(false);
  const [translateMsg, setTranslateMsg] = React.useState('');
  const toggle = (l) => {
    if (l === mainLanguage) return;
    if (languages.includes(l)) onChange(languages.filter((x) => x !== l));
    else onChange([...languages, l]);
  };
  const runTranslate = async () => {
    if (!profileId) {
      setTranslateMsg('Save the draft once before translating.');
      return;
    }
    if (!languages || languages.length === 0) {
      setTranslateMsg('Pick at least one additional language first.');
      return;
    }
    setTranslating(true);
    setTranslateMsg('');
    try {
      const res = await axios.post(`${API_URL}/api/admin/profiles/${profileId}/translate`);
      const langs = Object.keys(res.data?.translations || {});
      if (res.data?.skipped) {
        setTranslateMsg(res.data?.reason || 'Nothing to translate.');
      } else {
        setTranslateMsg(`Translated into ${langs.length} language${langs.length === 1 ? '' : 's'}: ${langs.join(', ')}`);
      }
    } catch (e) {
      setTranslateMsg(e.response?.data?.detail || 'Translate failed');
    } finally {
      setTranslating(false);
    }
  };
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--lux-panel)', border: '1px solid rgba(212,175,55,0.2)' }}
         data-testid="multi-lang-picker">
      <div className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>
        Pick additional languages
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL_LANGUAGES.map((l) => {
          const isMain = l === mainLanguage;
          const active = isMain || languages.includes(l);
          return (
            <button key={l} type="button" onClick={() => toggle(l)} disabled={isMain}
              className="px-3 py-1.5 rounded-full text-[10px] tracking-[0.15em] uppercase transition-all"
              style={{
                background: active ? 'rgba(212,175,55,0.2)' : 'var(--lux-panel)',
                border: `1px solid ${active ? '#D4AF37' : 'var(--lux-border)'}`,
                color: active ? '#E8C766' : 'var(--lux-text)',
                cursor: isMain ? 'not-allowed' : 'pointer',
                opacity: isMain ? 0.7 : 1,
              }}
              data-testid={`lang-toggle-${l}`}>
              {l} {isMain && <span className="ml-1 text-[9px] opacity-70">(MAIN)</span>}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] mt-3" style={{ color: 'var(--lux-text-muted)' }}>
        Tip: Pick the languages you want available on the public link. Guests can switch languages from the link header. The MAIN language is set in the <strong>Couple</strong> step.
      </p>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button type="button" onClick={runTranslate} disabled={translating}
          className="lux-btn lux-btn-ghost text-[10px] inline-flex items-center gap-2"
          data-testid="translate-now-btn">
          {translating ? 'Translating…' : 'Auto-translate with Gemini'}
        </button>
        {translateMsg && (
          <span className="text-[10px]" style={{ color: 'var(--lux-text)' }}>{translateMsg}</span>
        )}
      </div>
    </div>
  );
};

/* ── Expiry tier selector (used inside Publish step) ──── */
const ExpiryTierSelector = ({ value, onChange }) => {
  const [tiers, setTiers] = React.useState([
    { id: '1_month',  label: '1 Month',   days: 30,  credits: 1 },
    { id: '3_months', label: '3 Months',  days: 90,  credits: 2 },
    { id: '6_months', label: '6 Months',  days: 180, credits: 3 },
    { id: '1_year',   label: '1 Year',    days: 365, credits: 5 },
  ]);
  React.useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/api/admin/expiry-tiers`).then((res) => {
      if (cancelled) return;
      if (Array.isArray(res.data?.tiers) && res.data.tiers.length > 0) setTiers(res.data.tiers);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="lux-glass p-5" data-testid="expiry-tier-card">
      <div className="lux-eyebrow mb-3">◆ Link Expiry — choose how long the invitation stays live</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {tiers.map((t) => {
          const active = value === t.id;
          return (
            <button key={t.id} type="button" onClick={() => onChange(t.id)}
              className="p-3 rounded-lg text-left transition-all"
              style={{
                background: active ? 'rgba(212,175,55,0.16)' : 'var(--lux-panel)',
                border: `1px solid ${active ? '#D4AF37' : 'var(--lux-border)'}`,
                color: active ? 'var(--lux-text)' : 'var(--lux-text)',
              }}
              data-testid={`expiry-tier-${t.id}`}>
              <div className="text-sm font-display">{t.label}</div>
              <div className="text-[10px] tracking-[0.15em] uppercase opacity-70 mt-0.5">{t.days} days</div>
              <div className="text-[10px] tracking-[0.15em] uppercase mt-1" style={{ color: '#D4AF37' }}>+ {t.credits} credit{t.credits === 1 ? '' : 's'}</div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] mt-3" style={{ color: 'var(--lux-text-muted)' }}>
        Days &amp; credits per tier are configurable from the Super-Admin Pricing panel.
      </p>
    </div>
  );
};

/* ── Events sub-editor ────────────────────────────────────── */
const EVENT_TYPES = ['Mehndi', 'Sangeet', 'Haldi', 'Wedding', 'Reception', 'Engagement', 'Cocktail', 'Sufi Night'];

const slugifyEventType = (t) => (t || 'event').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const MealTimeField = ({ value, onChange, testid }) => {
  const label = classifyMealTime(value);
  const display = formatMealTime(value);
  return (
    <div className="flex items-center gap-3" data-testid={testid}>
      <div className="flex-1">
        <AmPmTimePicker value={value} onChange={onChange} testid={`${testid}-picker`} />
      </div>
      {label ? (
        <span
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs tracking-wider uppercase"
          style={{
            background: 'rgba(212,175,55,0.10)',
            border: '1px solid rgba(212,175,55,0.35)',
            color: '#D4AF37',
          }}
          data-testid={`${testid}-label`}
          title={display ? `${label} served at ${display}` : label}
        >
          🍽 {label}
        </span>
      ) : (
        <span className="text-[10px] italic" style={{ color: 'var(--lux-text-faint)' }}>
          Pick a time
        </span>
      )}
    </div>
  );
};


const EventsEditor = ({ events, onChange, profileId, slug }) => {
  const add = () => onChange([
    ...events,
    {
      id: `tmp-${Date.now()}`,
      event_type: 'Mehndi',
      title: '',
      event_date: '',
      start_time: '',
      meal_time: '',
      venue: '',
      venue_address: '',
      description: '',
      google_map_link: '',
      dress_code: '',
      hero_photo_url: '',
      visible: true,
    },
  ]);
  const update = (i, k, v) => onChange(events.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const remove = (i) => onChange(events.filter((_, idx) => idx !== i));

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const [copiedIdx, setCopiedIdx] = React.useState(null);
  const copy = (text, idx) => {
    navigator.clipboard?.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="space-y-4" data-testid="events-editor">
      {events.length === 0 && (
        <div className="lux-glass p-6 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            No ceremonies added yet. Each ceremony gets its own page and link.
          </p>
        </div>
      )}
      {events.map((e, i) => {
        const eventSlug = slugifyEventType(e.event_type);
        const eventLink = slug ? `${origin}/invite/${slug}/${eventSlug}` : '';
        const isVisible = e.visible !== false; // default ON
        return (
          <div
            key={e.id || i}
            className="lux-glass p-5"
            style={isVisible ? {} : { opacity: 0.55 }}
            data-testid={`event-row-${i}`}
          >
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <span className="lux-eyebrow text-[10px]">
                Event {i + 1} · {e.event_type || 'Event'}
                {!isVisible && <span className="ml-2" style={{ color: '#FFB0A0' }}>· Hidden from guests</span>}
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase"
                  style={{ color: 'var(--lux-text)' }}
                  data-testid={`event-visible-label-${i}`}
                >
                  <span data-testid={`event-visible-state-${i}`}>{isVisible ? 'Enabled' : 'Disabled'}</span>
                  <button
                    type="button"
                    onClick={() => update(i, 'visible', !isVisible)}
                    className="w-9 h-5 rounded-full relative transition-colors shrink-0 cursor-pointer"
                    style={{ background: isVisible ? '#D4AF37' : 'rgba(255,255,255,0.18)' }}
                    aria-label={isVisible ? 'Disable ceremony' : 'Enable ceremony'}
                    aria-pressed={isVisible}
                    data-testid={`event-visible-toggle-${i}`}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full transition-all pointer-events-none"
                      style={{ background: 'var(--lux-text)', left: isVisible ? 'calc(100% - 18px)' : '2px' }}
                    />
                  </button>
                </div>
                <button type="button" onClick={() => remove(i)} className="text-xs tracking-widest uppercase" style={{ color: '#FFB0A0' }} data-testid={`remove-event-${i}`}>Remove</button>
              </div>
            </div>
            <Row>
              <Field label="Type"><Select value={e.event_type} onChange={(v) => update(i, 'event_type', v)} options={EVENT_TYPES} testid={`event-type-${i}`} /></Field>
              <Field label="Title"><Input value={e.title} onChange={(v) => update(i, 'title', v)} placeholder="An evening of music" testid={`event-title-${i}`} /></Field>
            </Row>
            <Row>
              <Field label="Date"><Input type="date" value={e.event_date?.slice(0, 10) || ''} onChange={(v) => update(i, 'event_date', v)} testid={`event-date-${i}`} /></Field>
              <Field label="Start Time (AM / PM)">
                <AmPmTimePicker value={e.start_time || ''} onChange={(v) => update(i, 'start_time', v)} testid={`event-time-${i}`} />
              </Field>
            </Row>
            <Row>
              <Field label="Meal Time (auto-detects Lunch / Dinner / etc.)">
                <MealTimeField
                  value={e.meal_time || ''}
                  onChange={(v) => update(i, 'meal_time', v)}
                  testid={`event-meal-${i}`}
                />
              </Field>
              <div />
            </Row>
            <Field label="Venue Name"><Input value={e.venue} onChange={(v) => update(i, 'venue', v)} placeholder="The Leela Palace" testid={`event-venue-${i}`} /></Field>
            <Field label="Full Venue Address"><Textarea rows={2} value={e.venue_address || ''} onChange={(v) => update(i, 'venue_address', v)} placeholder="Lake Pichola, Udaipur" testid={`event-address-${i}`} /></Field>
            <Field label="Google Maps Link">
              <Input value={e.google_map_link || ''} onChange={(v) => update(i, 'google_map_link', v)}
                placeholder="https://maps.google.com/?q=…" testid={`event-map-${i}`} />
            </Field>
            <Row>
              <Field label="Dress Code"><Input value={e.dress_code || ''} onChange={(v) => update(i, 'dress_code', v)} placeholder="Pastel · Indo-Western" testid={`event-dresscode-${i}`} /></Field>
              <Field label="Description"><Textarea rows={2} value={e.description || ''} onChange={(v) => update(i, 'description', v)} testid={`event-desc-${i}`} /></Field>
            </Row>

            {/* Hero photo for this event */}
            <div className="mt-4">
              <PhotoUploadField
                label={`${e.event_type || 'Event'} Hero Photo`}
                value={e.hero_photo_url || ''}
                onChange={(v) => update(i, 'hero_photo_url', v)}
                profileId={profileId}
                testid={`event-hero-${i}`}
              />
            </div>

            {/* Per-event shareable link */}
            {slug && (
              <div className="mt-4 px-4 py-3 rounded-lg flex items-center justify-between gap-3 flex-wrap"
                style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.25)' }}
                data-testid={`event-link-${i}`}
              >
                <div className="min-w-0">
                  <span className="lux-eyebrow text-[9px] block mb-1">◆ Separate link for {e.event_type}</span>
                  <code className="font-mono text-xs break-all" style={{ color: 'var(--lux-text)' }}>{eventLink}</code>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => copy(eventLink, i)}
                    className="lux-btn lux-btn-ghost text-[10px] inline-flex items-center gap-1.5"
                    data-testid={`event-copy-${i}`}
                  >
                    {copiedIdx === i ? <><Check className="w-3 h-3" /> Copied</> : 'Copy'}
                  </button>
                  <a href={eventLink} target="_blank" rel="noreferrer"
                    className="lux-btn text-[10px] inline-flex items-center gap-1.5"
                    data-testid={`event-open-${i}`}
                  >
                    <ExternalLink className="w-3 h-3" /> Open
                  </a>
                </div>
              </div>
            )}
            {!slug && (
              <p className="mt-3 text-[11px] italic" style={{ color: 'var(--lux-text-muted)' }}>
                Save the wedding draft first to generate the separate ceremony link.
              </p>
            )}
          </div>
        );
      })}
      <button type="button" onClick={add} className="lux-btn lux-btn-ghost w-full justify-center" data-testid="add-event">
        + Add Event
      </button>
    </div>
  );
};


/* ─────────────────────────────────────────────────────────────────────
   PublishCostBreakdown — auto-calculates the total credit charge

   Sum of:
     • Theme cost (from masterThemes or /api/public/pricing/effective)
     • Each enabled premium feature flag's credit cost
     • Expiry tier credit cost
     • Digital Shagun (if enabled)
     • Gift Registry (if enabled)

   The breakdown is rendered as a line-by-line list so the photographer
   sees EXACTLY where every credit goes. Updates instantly via React
   re-render when any toggle / dropdown / tier changes upstream.
   ───────────────────────────────────────────────────────────────────── */
const FEATURE_FLAG_COST_KEYS = [
  { flag: 'show_rsvp',           key: 'rsvp_basic',       label: 'RSVP',                  freeDefault: true,  fallback: 0 },
  { flag: 'show_wishes',         key: 'guest_messages',   label: 'Guest Wishes',          freeDefault: true,  fallback: 0 },
  { flag: 'show_countdown',      key: 'countdown_timer',  label: 'Countdown',             freeDefault: true,  fallback: 0 },
  { flag: 'show_music',          key: 'background_music', label: 'Ambient Music',         freeDefault: true,  fallback: 0 },
  { flag: 'show_live_gallery',   key: 'live_gallery',     label: 'Live Photo Gallery',    freeDefault: false, fallback: 3 },
  { flag: 'show_ai_story',       key: 'ai_story',         label: 'AI Story Composer',     freeDefault: false, fallback: 1 },
  { flag: 'show_digital_shagun', key: 'gift_registry',    label: 'Digital Shagun',        freeDefault: false, fallback: 2 },
  { flag: 'show_translations',   key: 'multi_language',     label: 'Multi-language',        freeDefault: false, fallback: 2 },
  { flag: 'show_ai_curation',    key: 'ai_photo_curation',  label: 'AI Photo Curation',     freeDefault: false, fallback: 3 },
  { flag: 'show_guest_upload',   key: 'guest_photo_upload', label: 'Guest Pre-event Upload',freeDefault: false, fallback: 2 },
];

// Resolved once with usePricing -> we expose a pure helper because the
// Publish button needs the same number for its disabled check.
//
// BUG 6 FIX: `expiryCreditsMap` is now passed in by the caller (loaded
// from /api/admin/expiry-tiers). Falls back to the static defaults if
// the caller doesn't provide one (e.g. early renders before fetch).
const STATIC_EXPIRY_CREDITS = { '1_month': 1, '3_months': 2, '6_months': 3, '1_year': 5, 'lifetime': 10 };

function computeTotalPublishCost(form, pricing, expiryCreditsMap = STATIC_EXPIRY_CREDITS) {
  const themeMeta = getThemeById(form?.design_theme);
  const themeCost = pricing.themeCost(form?.design_theme, themeMeta?.creditCost ?? 1);

  let featureCost = 0;
  FEATURE_FLAG_COST_KEYS.forEach((entry) => {
    if (form?.feature_flags?.[entry.flag]) {
      const credits = pricing.optionCredits(entry.key, entry.fallback);
      const isFree = pricing.optionIsFree(entry.key, entry.freeDefault);
      if (!isFree) featureCost += credits || 0;
    }
  });

  // Gift Registry — only adds cost if user enabled BOTH the feature flag
  // AND the gifts.enabled toggle (we already counted via show_digital_shagun
  // for shagun; gift registry adds nothing extra by default unless admin
  // configured a separate price row).
  const giftsExtra = form?.gifts?.enabled ? pricing.optionCredits('gift_registry_extra', 0) : 0;

  // Expiry tier cost — pulled live from /api/admin/expiry-tiers so the
  // preview matches whatever the super admin configured in the Pricing Hub.
  const expiryCost = expiryCreditsMap?.[form?.expiry_tier] ?? STATIC_EXPIRY_CREDITS[form?.expiry_tier] ?? 0;

  return themeCost + featureCost + giftsExtra + expiryCost;
}

const PublishCostBreakdown = ({ form, pricing, balance = 0, expiryCreditsMap = STATIC_EXPIRY_CREDITS }) => {
  const themeMeta = getThemeById(form?.design_theme);
  const themeCost = pricing.themeCost(form?.design_theme, themeMeta?.creditCost ?? 1);

  const featureRows = FEATURE_FLAG_COST_KEYS
    .filter((e) => form?.feature_flags?.[e.flag])
    .map((entry) => {
      const credits = pricing.optionCredits(entry.key, entry.fallback);
      const isFree = pricing.optionIsFree(entry.key, entry.freeDefault);
      return { label: entry.label, credits: isFree ? 0 : (credits || 0), isFree };
    });

  // BUG 6 FIX: dynamic expiry credit lookup (was hardcoded before).
  const expiryCost = expiryCreditsMap?.[form?.expiry_tier] ?? STATIC_EXPIRY_CREDITS[form?.expiry_tier] ?? 0;
  const total = computeTotalPublishCost(form, pricing, expiryCreditsMap);
  const enoughCredits = balance >= total;

  return (
    <div className="lux-glass p-6" data-testid="publish-cost-breakdown">
      <div className="flex items-center justify-between mb-4">
        <div className="lux-eyebrow">◆ Publishing Cost — auto-calculated</div>
        <div className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
          Live recalc
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        <Line label={`Theme · ${themeMeta?.name || form?.design_theme || '—'}`} credits={themeCost} testid="cost-row-theme" />
        {featureRows.map((r) => (
          <Line
            key={r.label}
            label={r.label}
            credits={r.credits}
            isFree={r.isFree}
            testid={`cost-row-${r.label.toLowerCase().replace(/\s+/g, '-')}`}
          />
        ))}
        <Line
          label={`Expiry · ${form?.expiry_tier?.replace(/_/g, ' ') || '—'}`}
          credits={expiryCost}
          testid="cost-row-expiry"
        />
      </div>

      <div className="mt-5 pt-4 flex items-baseline justify-between"
           style={{ borderTop: '1px solid rgba(212,175,55,0.25)' }}>
        <div>
          <div className="lux-eyebrow mb-1">◆ You'll consume</div>
          <div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
            Wallet balance: <span style={{ color: enoughCredits ? '#D4AF37' : '#FFB0A0' }}>{balance}</span> credits
          </div>
        </div>
        <div className="font-display text-4xl text-gold" data-testid="publish-total-cost">
          {total} <span className="text-base opacity-70">credit{total === 1 ? '' : 's'}</span>
        </div>
      </div>

      {!enoughCredits && (
        <div className="mt-3 px-3 py-2 rounded text-[12px]"
             style={{ background: 'rgba(255,176,160,0.08)', border: '1px solid rgba(255,176,160,0.3)', color: '#FFB0A0' }}
             data-testid="publish-insufficient-credits">
          You need {total - balance} more credit{(total - balance) === 1 ? '' : 's'} to publish. Top up from your wallet.
        </div>
      )}
    </div>
  );
};

const Line = ({ label, credits, isFree = false, testid }) => (
  <div className="flex items-center justify-between text-sm py-1" data-testid={testid}>
    <span style={{ color: 'var(--lux-text)' }}>{label}</span>
    <span style={{ color: isFree ? '#86EFAC' : '#D4AF37' }}>
      {isFree ? 'Free' : `+ ${credits} credit${credits === 1 ? '' : 's'}`}
    </span>
  </div>
);


/* ─────────────────────────────────────────────────────────────────────
   PublishMiniPreview — tiny thumbnail of the link the photographer is
   about to mint. Lives directly under the Publish button so the user
   sees a confidence-building preview of the exact invitation they're
   spending credits on. Tapping the card opens the full rich preview in
   a new browser tab (DesignFullPreview route).
   ───────────────────────────────────────────────────────────────────── */
const PublishMiniPreview = ({ themeId, event, designId, bride, groom, photo }) => {
  if (!themeId || !event) return null;
  // Resolve a design index — DesignFullPreview accepts numeric position.
  const designIdx = 0;
  const previewUrl = `/themes/${themeId}/events/${encodeURIComponent(event)}/design/${designIdx}`;
  const themeMeta = getThemeById(themeId);
  const themeName = themeMeta?.name || themeId;
  const heroSrc = photo
    ? (() => {
        const s = String(photo);
        if (s.startsWith('http')) return s.replace(/(https?:\/\/[^/]+)\/uploads\//i, `$1/api/uploads/`);
        return `${API_URL}${s.startsWith('/uploads/') ? '/api' + s : s}`;
      })()
    : 'https://images.unsplash.com/photo-1606800052052-a08af7148866?w=800&q=70&auto=format&fit=crop';

  return (
    <a
      href={previewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-3 rounded-xl overflow-hidden transition-transform hover:scale-[1.01] focus:outline-none"
      style={{
        background: 'rgba(245,236,215,0.04)',
        border: '1px solid rgba(212,175,55,0.32)',
      }}
      data-testid="publish-mini-preview"
    >
      <div className="flex items-stretch gap-3">
        {/* Thumbnail */}
        <div
          className="relative shrink-0"
          style={{ width: 96, height: 120, background: 'rgba(8,5,3,0.45)' }}
        >
          <img
            src={heroSrc}
            alt={`${bride || 'Bride'} & ${groom || 'Groom'} preview`}
            className="w-full h-full object-cover"
            style={{ opacity: 0.92 }}
          />
          <div
            className="absolute inset-0 flex flex-col justify-end p-2"
            style={{ background: 'linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.7) 100%)' }}
          >
            <div className="text-[8px] tracking-[0.3em] uppercase" style={{ color: '#D4AF37' }}>{event}</div>
          </div>
        </div>
        {/* Meta */}
        <div className="flex-1 py-3 pr-3 min-w-0">
          <div className="text-[9px] tracking-[0.3em] uppercase mb-0.5" style={{ color: '#D4AF37' }}>
            ◆ Mini preview
          </div>
          <div
            className="font-display text-[1.1rem] leading-tight truncate"
            style={{ color: 'var(--lux-text)' }}
            data-testid="mini-preview-names"
          >
            {bride || 'Bride'} <span className="text-gold italic font-script">&amp;</span> {groom || 'Groom'}
          </div>
          <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--lux-text-muted)' }}>
            {themeName} · {event}
          </div>
          <div className="text-[10px] tracking-[0.2em] uppercase mt-2 inline-flex items-center gap-1"
               style={{ color: '#FFE38A' }}>
            Open full preview <ExternalLink className="w-3 h-3" />
          </div>
        </div>
      </div>
    </a>
  );
};
/* ─────────────────────────────────────────────────────────────────────
   FeaturePackUpsell — "buy a bundle, save credits" CTA on the Publish step.

   Reads `/api/public/pricing/effective?audience=photographer` (already
   loaded by usePricing) for the audience-matched `feature_packs`. Picks
   the BEST pack (highest savings vs the currently-selected features).
   If at least one of the pack's features is not yet enabled AND its
   price beats buying them piece-meal, the upsell renders with an
   "Apply pack" button that toggles every feature ON.
   ───────────────────────────────────────────────────────────────────── */
// Map between INVITATION_OPTIONS keys (admin pricing) and feature-flag
// names used in `form.feature_flags`. We use this both for the upsell
// and to know which flag to flip when the user accepts a pack.
const FEATURE_KEY_TO_FLAG = {
  qr_code: 'show_qr',
  rsvp_form: 'show_rsvp',
  live_photo_wall: 'show_live_gallery',
  music_player: 'show_music',
  countdown: 'show_countdown',
  gift_registry: 'show_digital_shagun',
  prewedding_story: 'show_ai_story',
  ai_photo_curation: 'show_ai_curation',
  guest_photo_upload: 'show_guest_upload',
};

const FeaturePackUpsell = ({ form, pricing, setFlag }) => {
  const packs = pricing?.featurePacks || [];
  if (!packs.length) return null;

  // For each pack, compute (1) cost if photographer buys features one-by-one
  // (2) the pack price (3) savings = piecemeal - pack. Pick best savings.
  const evaluated = packs.map((p) => {
    let piecemeal = 0;
    p.feature_keys.forEach((k) => {
      if (!pricing.optionIsFree(k, false)) {
        piecemeal += pricing.optionCredits(k, 0) || 0;
      }
    });
    return { ...p, piecemeal, savings: piecemeal - p.price };
  });
  const best = evaluated
    .filter((e) => e.savings > 0)
    .sort((a, b) => b.savings - a.savings)[0];
  if (!best) return null;

  const applyPack = () => {
    best.feature_keys.forEach((k) => {
      const flag = FEATURE_KEY_TO_FLAG[k];
      if (flag) setFlag?.(flag, true);
    });
  };

  return (
    <div
      className="lux-glass p-5 flex flex-wrap items-start gap-4"
      style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.03) 100%)' }}
      data-testid="feature-pack-upsell"
    >
      <div className="shrink-0 w-12 h-12 rounded-full grid place-items-center"
           style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)' }}>
        <Sparkles className="w-5 h-5" style={{ color: '#D4AF37' }} />
      </div>
      <div className="flex-1 min-w-[200px]">
        <div className="lux-eyebrow text-[10px] mb-1">◆ Bundle &amp; save</div>
        <div className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }} data-testid="upsell-pack-label">
          {best.label}
        </div>
        <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
          {best.feature_keys.length} features for <span className="text-gold font-display">{best.price} credits</span>.
          Save <span className="text-gold font-display">{best.savings}</span> credits vs buying them one-by-one ({best.piecemeal} credits).
        </div>
      </div>
      <button
        type="button"
        onClick={applyPack}
        className="lux-btn shrink-0 text-xs"
        data-testid="upsell-apply-pack"
      >
        Apply pack →
      </button>
    </div>
  );
};

export default LuxuryProfileForm;
