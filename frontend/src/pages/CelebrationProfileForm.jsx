import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  ArrowLeft, Save, Sparkles, ChevronRight, ChevronLeft, Check,
  Heart, Calendar, MapPin, User, Image as ImageIcon, Video, Radio,
  Trash2, Plus, Eye, ExternalLink, Music, Languages, Loader2, AlertCircle,
  Copy, Download as DownloadIcon, Share2,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useAuth } from '@/context/AuthContext';
import { useUserAuth } from '@/context/UserAuthContext';
import MusicPresetPicker from '@/components/luxury/MusicPresetPicker';
import { classifyMealTime, formatMealTime } from '@/utils/mealTime';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const LANGUAGES = [
  { id: 'english',   label: 'English'   },
  { id: 'hindi',     label: 'हिंदी' },
  { id: 'tamil',     label: 'தமிழ்'    },
  { id: 'telugu',    label: 'తెలుగు'   },
  { id: 'bengali',   label: 'বাংলা'    },
  { id: 'punjabi',   label: 'ਪੰਜਾਬੀ'  },
  { id: 'marathi',   label: 'मराठी'   },
  { id: 'gujarati',  label: 'ગુજરાતી' },
  { id: 'kannada',   label: 'ಕನ್ನಡ'    },
  { id: 'malayalam', label: 'മലയാളം'  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  visible: (i = 0) => ({ opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.55, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] } }),
};

const CelebrationProfileForm = () => {
  const [searchParams] = useSearchParams();
  const { profileId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, loading: authLoading } = useAuth();
  const userAuth = useUserAuth?.() || { user: null, loading: false };
  const isUserRoute = location.pathname.startsWith('/user/');
  const isAdminRoute = location.pathname.startsWith('/studio/');
  const categoryId = searchParams.get('category') || 'baby_birthday';
  const preselectedDesignId = searchParams.get('design_id') || '';
  // 2026-09 — When the user lands here from the new purchase wizard the
  // chosen features + expiry tier ride along in the URL so we can pre-select
  // them and (more importantly) so the credits we charge match what the
  // wizard showed.
  const preselectedFeatures = useMemo(
    () => (searchParams.get('features') || '').split(',').filter(Boolean),
    [searchParams]
  );
  const preselectedExpiry = searchParams.get('expiry') || '';
  const isEdit = !!profileId;

  const [meta, setMeta] = useState(null);          // category meta + designs + features
  const [step, setStep] = useState(0);             // 0:basics  1:photos  2:design  3:features  4:review
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [profile, setProfile] = useState(null);   // existing profile if editing

  const [form, setForm] = useState({
    celebrant_name: '',
    nickname: '',
    nickname_visible: false,
    age_turning: 1,
    date_of_birth: '',
    father_name: '',
    mother_name: '',
    event_date: '',
    meal_time: '',          // Feb 2026 — auto-classifies → Lunch / Dinner chip on hero
    venue: '',
    city: '',
    venue_map_link: '',
    // Parking — optional. Same shape as the wedding (LuxuryProfileForm)
    // theme_settings.maja.parking so the public renderer can use one
    // identical block.
    parking: {
      enabled: false,
      text: '',
      google_map_link: '',
    },
    invitation_message: '',
    story: '',
    cover_photo_url: '',
    extra_photos: [],          // array of URLs
    enabled_languages: ['english'],
    design_id: '',
    selected_features: [],
    video_link: '',
    live_link: '',
    closing_message: '',
    // RSVP configuration — only used when the `rsvp` feature toggle is ON
    // in the Features step. Mirrors the wedding form shape so existing
    // public RSVP rendering picks it up without changes.
    rsvp_enabled: true,
    rsvp_deadline: '',           // ISO date the host needs replies by
    rsvp_max_guests_per_party: 4, // upper bound on guest count per family
    rsvp_message: '',            // optional note shown above the RSVP form
    // Background music — picked from celebration-curated preset library
    // or pasted as a custom URL. Same shape as wedding flow so the
    // public renderer (CelebrationPublicView) keeps working.
    background_music_url: '',
    background_music_autoplay: false,
    // AI-translated copies (read-only here; populated by "Translate now"
    // button further down).  Shape: { tamil: {...}, telugu: {...}, ... }
    translations: {},
  });
  // Translation UX state — independent of `saving` so the user can keep
  // editing while a translation is in flight.
  const [translating, setTranslating] = useState({ inflight: false, lang: '', err: '' });

  // ── DRAFT AUTOSAVE TO localStorage ────────────────────────────────────
  // Bug fix: previously, hitting reload mid-form wiped every field. Now we
  // persist a working draft on every change, and rehydrate from it on
  // mount BEFORE the API hydration for new (no profileId) profiles. Once
  // the profile is saved we clear the draft so future runs start clean.
  const draftStorageKey = React.useMemo(
    () => `celebration_draft:${isAdminRoute ? 'admin' : 'user'}:${categoryId || 'unknown'}:${profileId || 'new'}`,
    [categoryId, profileId, isAdminRoute]
  );
  const draftHydratedRef = useRef(false);
  useEffect(() => {
    // Only hydrate from draft for NEW profiles (no profileId) so we don't
    // overwrite freshly-loaded server data when editing an existing one.
    if (profileId) return;
    if (draftHydratedRef.current) return;
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          // Restore working draft into form state.
          setForm((f) => ({ ...f, ...saved }));
        }
      }
    } catch (_) {
      /* corrupt JSON or privacy-mode localStorage — ignore */
    }
    draftHydratedRef.current = true;
  }, [draftStorageKey, profileId]);

  // Write the current draft to localStorage on every form change.
  useEffect(() => {
    if (profileId) return; // editing: don't autosave drafts (server is source of truth)
    if (!draftHydratedRef.current) return; // wait until first hydration
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(form));
    } catch (_) {
      /* quota exceeded or privacy mode — ignore */
    }
  }, [form, draftStorageKey, profileId]);

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch (_) {
      /* ignore */
    }
  }, [draftStorageKey]);
  // ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    if (authLoading || userAuth.loading) return;
    // Route is /admin/* → require admin (photographer)
    // Route is /user/*  → require user (normal consumer)
    if (isAdminRoute && !admin) {
      navigate(`/studio/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    if (isUserRoute && !userAuth.user) {
      navigate(`/?signin=1&return=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/event-categories/${categoryId}`);
        setMeta(data);
        // pre-select defaults — honour preselected design + features from URL
        setForm((f) => ({
          ...f,
          design_id: f.design_id || preselectedDesignId || (data.designs?.[0]?.design_id || ''),
          selected_features: preselectedFeatures.length
            ? preselectedFeatures
            : (data.features || []).filter((x) => x.default).map((x) => x.key),
        }));
        if (isEdit) {
          const endpoint = isAdminRoute
            ? `${API_URL}/api/admin/profiles/${profileId}`
            : `${API_URL}/api/users/profiles/${profileId}`;
          const { data: p } = await axios.get(endpoint);
          setProfile(p);
          const ci = p.celebrant_info || {};
          setForm((f) => ({
            ...f,
            celebrant_name: ci.celebrant_name || p.groom_name || '',
            nickname: ci.nickname || '',
            nickname_visible: !!ci.nickname_visible,
            age_turning: ci.age_turning || 1,
            date_of_birth: ci.date_of_birth || '',
            father_name: ci.father_name || '',
            mother_name: ci.mother_name || '',
            event_date: p.event_date ? p.event_date.slice(0, 16) : '',
            meal_time: ci.meal_time || p.meal_time || '',
            venue: p.venue || '',
            city: p.city || '',
            venue_map_link: p.map_settings?.map_link || '',
            // Restore parking — stored under celebrant_info.parking so it
            // round-trips on edit. Falls back to legacy parking_info text.
            parking: {
              enabled: !!(ci.parking?.enabled || p.parking_info),
              text: ci.parking?.text || p.parking_info || '',
              google_map_link: ci.parking?.google_map_link || '',
            },
            invitation_message: p.invitation_message || '',
            story: ci.story || p.love_story || '',
            cover_photo_url: p.couple_photo_url || '',
            extra_photos: ci.extra_photos || [],
            enabled_languages: p.enabled_languages || ['english'],
            design_id: (p.design_selections && p.design_selections[categoryId]) || p.design_id || preselectedDesignId || (data.designs?.[0]?.design_id || ''),
            selected_features: p.selected_features || [],
            video_link: ci.video_link || '',
            live_link: ci.live_link || '',
            closing_message: ci.closing_message || '',
            // RSVP — restore from celebrant_info.rsvp (preferred), falling
            // back to top-level rsvp_settings for legacy profiles.
            rsvp_enabled: ci.rsvp?.enabled !== undefined
              ? !!ci.rsvp.enabled
              : (p.rsvp_settings?.enabled !== undefined ? !!p.rsvp_settings.enabled : true),
            rsvp_deadline: (ci.rsvp?.deadline || p.rsvp_settings?.deadline || '').slice(0, 10),
            rsvp_max_guests_per_party: ci.rsvp?.max_guests_per_party ||
              p.rsvp_settings?.max_guests_per_party || 4,
            rsvp_message: ci.rsvp?.message || p.rsvp_settings?.message || '',
            background_music_url: p.background_music?.url || p.background_music?.file_url || '',
            background_music_autoplay: !!p.background_music?.autoplay,
            translations: p.translations || ci.translations || {},
          }));
        }
      } catch (e) {
        console.error('Failed to load category', e);
        setError('Could not load category details.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, [categoryId, profileId, admin, userAuth.user, authLoading, userAuth.loading]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleLang = (id) => setForm((f) => {
    if (id === 'english') return f; // english is mandatory
    const exists = f.enabled_languages.includes(id);
    return { ...f, enabled_languages: exists ? f.enabled_languages.filter((x) => x !== id) : [...f.enabled_languages, id] };
  });
  const toggleFeature = (key) => setForm((f) => {
    const exists = f.selected_features.includes(key);
    return { ...f, selected_features: exists ? f.selected_features.filter((x) => x !== key) : [...f.selected_features, key] };
  });

  // ----- AI translation (Gemini-backed, credit-gated) ----------------------
  // The "Translate now" button shows up next to each non-English language.
  // It only works on a SAVED profile (so we have an id to charge against
  // and persist the translations on). The backend deducts 1 credit per
  // language and writes the translated copy into profile.translations.
  const translateLang = useCallback(async (lang) => {
    if (!profileId) {
      setError('Please save the profile first, then translate.');
      return;
    }
    setTranslating({ inflight: true, lang, err: '' });
    try {
      const endpoint = isAdminRoute
        ? `${API_URL}/api/admin/profiles/${profileId}/translate`
        : `${API_URL}/api/users/profiles/${profileId}/translate`;
      const { data } = await axios.post(endpoint, { language: lang });
      // Merge returned translation into form state
      setForm((f) => ({
        ...f,
        translations: { ...(f.translations || {}), [lang]: data.translation || {} },
      }));
      setSuccess(`Translated to ${lang}. ${data.credits_remaining != null ? `${data.credits_remaining} credit${data.credits_remaining === 1 ? '' : 's'} remaining.` : ''}`);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : (e?.response?.status === 402
            ? 'Not enough credits to translate. Please top up.'
            : 'Translation failed. Please try again.');
      setTranslating({ inflight: false, lang: '', err: msg });
      setError(msg);
      return;
    }
    setTranslating({ inflight: false, lang: '', err: '' });
  }, [profileId, isAdminRoute]);

  const totalCredits = useMemo(() => {
    if (!meta) return 0;
    const featureCredits = (meta.features || []).reduce((sum, f) => sum + (form.selected_features.includes(f.key) ? (f.credits || 0) : 0), 0);
    const selectedDesign = (meta.designs || []).find((d) => d.design_id === form.design_id);
    return (selectedDesign?.credit_cost || 1) + featureCredits;
  }, [meta, form.selected_features, form.design_id]);

  // -------------------------------------------------------------------------
  // Image upload helper (uses existing /api/uploads/* endpoint)
  // -------------------------------------------------------------------------
  const upload = async (file, slot = 'celebration') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot', slot);
    try {
      const endpoint = isAdminRoute
        ? `${API_URL}/api/admin/upload-image`
        : `${API_URL}/api/users/upload-image`;
      const { data } = await axios.post(endpoint, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.url || '';
    } catch (e) {
      console.error('Upload failed', e);
      setError('Image upload failed. Please try again.');
      return '';
    }
  };

  const onUploadCover = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const url = await upload(file, 'cover'); if (url) setField('cover_photo_url', url);
  };
  const onUploadExtra = async (e) => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    const urls = [];
    for (const f of files) { const u = await upload(f, 'gallery'); if (u) urls.push(u); }
    setForm((f) => ({ ...f, extra_photos: [...(f.extra_photos || []), ...urls] }));
  };

  // -------------------------------------------------------------------------
  // Submit handler — adapts the celebration form into the existing Profile
  // schema. `groom_name` carries the celebrant's name and `bride_name` carries
  // the parents (or nickname) so all existing wedding-side rendering keeps
  // working. Frontend public viewer uses `invitation_category` to render the
  // correct labels.
  // -------------------------------------------------------------------------
  const submit = async () => {
    if (!form.celebrant_name.trim()) { setError('Please enter the celebrant\'s name.'); setStep(0); return; }
    if (!form.event_date) { setError('Please pick an event date.'); setStep(0); return; }
    setSaving(true); setError('');
    try {
      const parents = [form.father_name, form.mother_name].filter(Boolean).join(' & ');
      const body = {
        invitation_category: categoryId,
        celebrant_info: {
          celebrant_name: form.celebrant_name.trim(),
          nickname: form.nickname || null,
          nickname_visible: !!form.nickname_visible,
          age_turning: categoryId === 'baby_birthday' ? Number(form.age_turning || 1) : null,
          date_of_birth: form.date_of_birth || null,
          father_name: form.father_name || null,
          mother_name: form.mother_name || null,
          story: form.story || null,
          extra_photos: form.extra_photos || [],
          video_link: form.video_link || null,
          live_link: form.live_link || null,
          closing_message: form.closing_message || null,
          meal_time: form.meal_time || '',  // Feb 2026 — Lunch/Dinner chip on hero banner
          // Parking — saved on celebrant_info so CelebrationPublicView can
          // render the same enable/disable + Google-Maps-link block the
          // wedding side has.
          parking: {
            enabled: !!form.parking?.enabled,
            text: form.parking?.enabled ? (form.parking?.text || '') : '',
            google_map_link: form.parking?.enabled ? (form.parking?.google_map_link || '') : '',
          },
          // RSVP config — bundled under celebrant_info so it round-trips on
          // edit. Only persisted when the rsvp feature toggle is ON, to
          // avoid showing RSVP fields the host explicitly turned off.
          rsvp: {
            enabled: !!form.rsvp_enabled && form.selected_features.includes('rsvp'),
            deadline: form.rsvp_enabled && form.rsvp_deadline
              ? new Date(form.rsvp_deadline).toISOString()
              : '',
            max_guests_per_party: Number(form.rsvp_max_guests_per_party) || 4,
            message: form.rsvp_message || '',
          },
        },
        groom_name: form.celebrant_name.trim(),
        bride_name: parents || form.nickname || '—',
        event_type: categoryId,
        event_date: new Date(form.event_date).toISOString(),
        venue: form.venue || 'TBA',
        city: form.city || '',
        invitation_message: (form.invitation_message || '').slice(0, 200),
        language: form.enabled_languages,
        enabled_languages: form.enabled_languages,
        design_id: form.design_id || (meta?.designs?.[0]?.design_id) || 'royal_mughal',  // submit the actual category design — validator is now category-aware
        design_selections: { [categoryId]: form.design_id },
        love_story: form.story || '',
        couple_photo_url: form.cover_photo_url || '',
        link_expiry_type: preselectedExpiry || 'permanent',
        background_music: {
          enabled: !!form.background_music_url,
          url: form.background_music_url || '',
          file_url: form.background_music_url || '',
          autoplay: !!form.background_music_autoplay,
        },
        translations: form.translations || {},
        sections_enabled: form.background_music_url ? { music: true } : {},
        map_settings: form.venue_map_link ? { embed_enabled: true, map_link: form.venue_map_link } : { embed_enabled: false },
        // Mirror parking text into the legacy parking_info field so old
        // public renderers / exports still pick it up.
        parking_info: form.parking?.enabled ? (form.parking?.text || '') : null,
        // Mirror RSVP config to top-level rsvp_settings so legacy public
        // renderers (which read rsvp_settings) keep working.
        rsvp_settings: {
          enabled: !!form.rsvp_enabled && form.selected_features.includes('rsvp'),
          deadline: form.rsvp_enabled && form.rsvp_deadline
            ? new Date(form.rsvp_deadline).toISOString()
            : '',
          max_guests_per_party: Number(form.rsvp_max_guests_per_party) || 4,
          message: form.rsvp_message || '',
        },
        selected_features: form.selected_features,
      };

      let saved;
      if (isAdminRoute) {
        if (isEdit) {
          const r = await axios.put(`${API_URL}/api/admin/profiles/${profileId}`, body);
          saved = r.data;
        } else {
          const r = await axios.post(`${API_URL}/api/admin/profiles`, body);
          saved = r.data;
        }
      } else {
        // Normal user flow → /api/users/profiles. The user endpoint expects a
        // slightly different schema (UserProfileCreate). We only forward the
        // fields it accepts; backend ignores the rest.
        if (isEdit) {
          const r = await axios.put(`${API_URL}/api/users/profiles/${profileId}`, body);
          saved = r.data;
        } else {
          const r = await axios.post(`${API_URL}/api/users/profiles`, body);
          saved = r.data;
        }
      }

      // BUGFIX (financial): for admin/photographer flow CREATING a new
      // celebration link, the saved profile is a DRAFT and the public link
      // should NOT be live until credits are deducted. Trigger the
      // lifecycle publish endpoint (same one weddings use — it works for
      // any invitation_category). For EDITS we don't republish (no
      // double-charging); the photographer must explicitly re-publish from
      // the profile detail page if they bought more features.
      const savedId = saved?.id || saved?.profile_id || profileId;
      if (isAdminRoute && savedId && !isEdit) {
        try {
          await axios.post(`${API_URL}/api/weddings/${savedId}/publish`, {
            expiry_tier_id: preselectedExpiry || '1_month',
          });
          setSuccess('Saved & published! Credits have been deducted.');
        } catch (pubErr) {
          const pubDetail = pubErr?.response?.data?.detail;
          const isCreditErr = pubErr?.response?.status === 402 ||
            (typeof pubDetail === 'string' && /credit/i.test(pubDetail));
          if (isCreditErr) {
            setError(`Not enough credits to publish. ${typeof pubDetail === 'string' ? pubDetail : 'Please top up and try again.'} The profile is saved as a DRAFT — it will not be visible publicly until you publish it.`);
          } else {
            // Non-credit error → still surface it but keep the draft saved.
            setError(`Saved as draft, but publish failed: ${typeof pubDetail === 'string' ? pubDetail : 'Unknown error'}.`);
          }
          // Do NOT clear the draft / do NOT redirect — let the user retry.
          setSaving(false);
          return;
        }
      } else {
        setSuccess('Saved successfully!');
      }

      // Clear the localStorage autosave once the server has the data.
      clearDraft();
      const editRoute = isAdminRoute
        ? `/studio/celebration/${savedId}/edit?category=${categoryId}`
        : `/user/celebration/${savedId}/edit?category=${categoryId}`;
      setTimeout(() => navigate(editRoute), 600);
    } catch (e) {
      console.error('Save failed', e);
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((d) => d.msg || JSON.stringify(d)).join('; ') : 'Save failed. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="luxe-page min-h-screen grid place-items-center" style={{ background: '#0b0908' }}>
        <div className="lux-mandala" />
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="luxe-page min-h-screen grid place-items-center" style={{ background: '#0b0908' }}>
        <div className="text-center" style={{ color: '#FFF8DC' }}>
          <p className="mb-4">Category not found.</p>
          <button onClick={() => navigate('/studio/category-selector')} className="lux-btn">Pick category</button>
        </div>
      </div>
    );
  }

  const steps = ['Basics', 'Photos & Story', 'Design', 'Features', 'Review'];

  // ===============
  // RENDER HELPERS
  // ===============
  const StepBasics = (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-6">
      <div className="grid md:grid-cols-2 gap-5">
        <Field label={categoryId === 'baby_birthday' ? "Baby's Name" : 'Celebrant\'s Name'} required>
          <input className="lux-input" data-testid="cf-celebrant-name"
            value={form.celebrant_name}
            onChange={(e) => setField('celebrant_name', e.target.value)}
            placeholder={categoryId === 'baby_birthday' ? 'Baby Aarav' : 'Anjali'} />
        </Field>

        <Field label="Nickname (optional)">
          <input className="lux-input" data-testid="cf-nickname"
            value={form.nickname}
            onChange={(e) => setField('nickname', e.target.value)}
            placeholder="Bunny / Chinnu" />
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" checked={form.nickname_visible}
              onChange={(e) => setField('nickname_visible', e.target.checked)}
              data-testid="cf-nickname-visible" />
            <span className="text-xs" style={{ color: 'rgba(255,248,220,0.82)' }}>
              Show nickname publicly
            </span>
          </label>
        </Field>

        {categoryId === 'baby_birthday' && (
          <>
            <Field label="Age Turning">
              <select className="lux-input" value={form.age_turning}
                onChange={(e) => setField('age_turning', e.target.value)}
                data-testid="cf-age">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}{n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} Birthday</option>
                ))}
              </select>
            </Field>
            <Field label="Date of Birth">
              <input type="date" className="lux-input"
                value={form.date_of_birth}
                onChange={(e) => setField('date_of_birth', e.target.value)}
                data-testid="cf-dob" />
            </Field>
          </>
        )}

        <Field label="Father's Name">
          <input className="lux-input" value={form.father_name}
            onChange={(e) => setField('father_name', e.target.value)}
            data-testid="cf-father" />
        </Field>
        <Field label="Mother's Name">
          <input className="lux-input" value={form.mother_name}
            onChange={(e) => setField('mother_name', e.target.value)}
            data-testid="cf-mother" />
        </Field>

        <Field label="Event Date & Time" required>
          <input type="datetime-local" className="lux-input"
            value={form.event_date} onChange={(e) => setField('event_date', e.target.value)}
            data-testid="cf-event-date" />
        </Field>
        <Field label="Meal Time (auto-detects Lunch / Dinner)">
          <MealTimeField
            value={form.meal_time || ''}
            onChange={(v) => setField('meal_time', v)}
            testid="cf-meal-time"
          />
        </Field>
        <Field label="Venue">
          <input className="lux-input" value={form.venue}
            onChange={(e) => setField('venue', e.target.value)}
            placeholder="Hall name"
            data-testid="cf-venue" />
        </Field>
        <Field label="City">
          <input className="lux-input" value={form.city}
            onChange={(e) => setField('city', e.target.value)}
            placeholder="Chennai"
            data-testid="cf-city" />
        </Field>
        <Field label="Google Maps Link (optional)">
          <input className="lux-input" value={form.venue_map_link}
            onChange={(e) => setField('venue_map_link', e.target.value)}
            placeholder="https://maps.google.com/?q=…"
            data-testid="cf-map" />
        </Field>

        {/* Parking — optional, toggleable. Mirrors LuxuryProfileForm wedding
            flow so guests on the published celebration link see the same
            "Parking Info" card with text + Google Maps link. */}
        <div className="md:col-span-2 lux-glass p-5 rounded-xl" data-testid="cf-parking-card">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-xs tracking-[0.3em] uppercase mb-1"
                style={{ color: '#D4AF37' }}>
                ◆ Parking Info <span className="text-[10px] opacity-60">(optional)</span>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,248,220,0.8)' }}>
                Turn this on when parking is at a different spot than the venue. Add a note + a Google Maps pin so guests can find it.
              </p>
            </div>
            <button type="button"
              onClick={() => setField('parking', { ...form.parking, enabled: !form.parking?.enabled })}
              className="w-11 h-6 rounded-full relative transition-colors shrink-0"
              style={{ background: form.parking?.enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
              data-testid="cf-parking-toggle"
              aria-label="Toggle parking info">
              <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{ background: '#FFF8DC', left: form.parking?.enabled ? 'calc(100% - 22px)' : '2px' }} />
            </button>
          </div>
          {form.parking?.enabled && (
            <div className="space-y-3">
              <Field label="Parking instructions (shown above the parking map link)">
                <textarea className="lux-input" rows={3}
                  value={form.parking?.text || ''}
                  onChange={(e) => setField('parking', { ...form.parking, text: e.target.value })}
                  placeholder='e.g. "Park in the underground lot of XYZ Hall — entry from Gate 2."'
                  data-testid="cf-parking-text" />
              </Field>
              <Field label="Parking Google Maps Link (optional)">
                <input className="lux-input"
                  value={form.parking?.google_map_link || ''}
                  onChange={(e) => setField('parking', { ...form.parking, google_map_link: e.target.value })}
                  placeholder="https://maps.google.com/?q=Parking+Lot"
                  data-testid="cf-parking-map" />
              </Field>
              <p className="text-xs" style={{ color: 'rgba(255,248,220,0.7)' }}>
                If parking is on-site at the same venue, you can leave this off.
              </p>
            </div>
          )}
        </div>

        <Field label="Welcome Message (max 200 chars)" full>
          <textarea className="lux-input" rows={2}
            value={form.invitation_message}
            onChange={(e) => setField('invitation_message', e.target.value.slice(0, 200))}
            placeholder="We warmly invite you to celebrate…"
            data-testid="cf-message" />
        </Field>
      </div>

      <Field label="Languages" full>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((L) => (
            <button key={L.id} type="button" onClick={() => toggleLang(L.id)}
              className={`lux-chip ${form.enabled_languages.includes(L.id) ? 'is-active' : ''}`}
              data-testid={`cf-lang-${L.id}`}>
              {L.label}{L.id === 'english' ? ' (default)' : ''}
            </button>
          ))}
        </div>
      </Field>

      {/* ── AI translation (Gemini, credit-gated) ──────────────────────
          Available languages: Tamil, Telugu, Kannada, Malayalam, Hindi.
          Photographer enables a language (above) → clicks "Translate now
          (1 credit)" → invitation copy (welcome, story, closing) is
          auto-translated using Gemini and saved on the profile.
          English is always the source language. */}
      <Field label="AI Translation (Gemini)" full>
        <div className="lux-glass p-4 space-y-3"
             style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.18)' }}>
          <div className="flex items-start gap-3">
            <Languages className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#D4AF37' }} />
            <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,248,220,0.85)' }}>
              We translate the welcome message, story, and closing line into your selected language using <span style={{ color: '#D4AF37' }}>Gemini AI</span>.
              {' '}<span style={{ color: '#D4AF37', fontWeight: 600 }}>1 credit per language.</span>{' '}
              {isEdit
                ? 'Pick a language below and tap "Translate now".'
                : 'Save the invitation first — then come back to this step to translate.'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {['tamil', 'telugu', 'kannada', 'malayalam', 'hindi'].map((langId) => {
              const L = LANGUAGES.find((x) => x.id === langId);
              const enabled = form.enabled_languages.includes(langId);
              const translated = !!form.translations?.[langId];
              const isInflight = translating.inflight && translating.lang === langId;
              return (
                <div key={langId}
                     className="flex items-center justify-between rounded-lg px-3 py-2"
                     style={{ background: 'rgba(255,248,220,0.03)', border: '1px solid rgba(212,175,55,0.12)' }}
                     data-testid={`cf-translate-row-${langId}`}>
                  <div className="min-w-0">
                    <div className="text-sm" style={{ color: enabled ? '#FFF8DC' : 'rgba(255,248,220,0.62)' }}>
                      {L?.label} <span className="text-[10px] tracking-wider uppercase ml-1"
                                       style={{ color: 'rgba(255,248,220,0.62)' }}>{langId}</span>
                    </div>
                    <div className="text-[10px] tracking-wider uppercase"
                         style={{ color: translated ? '#86EFAC' : 'rgba(255,248,220,0.62)' }}>
                      {translated ? '✓ Translated' : (enabled ? 'Ready to translate' : 'Enable above to translate')}
                    </div>
                  </div>
                  <button type="button"
                    disabled={!enabled || !isEdit || isInflight}
                    onClick={() => translateLang(langId)}
                    className="lux-btn lux-btn-ghost text-[10px] tracking-wider uppercase disabled:opacity-40 shrink-0"
                    data-testid={`cf-translate-btn-${langId}`}>
                    {isInflight ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {isInflight ? 'Translating…' : (translated ? 'Retranslate' : 'Translate (1 cr)')}
                  </button>
                </div>
              );
            })}
          </div>

          {!isEdit && (
            <div className="text-[10px] tracking-wider uppercase flex items-center gap-1.5"
                 style={{ color: 'rgba(212,175,55,0.7)' }}>
              <AlertCircle className="w-3 h-3" /> Save the invitation first, then return here to translate.
            </div>
          )}
        </div>
      </Field>
    </motion.div>
  );

  const StepPhotos = (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-6">
      <Field label="Cover / Hero Photo" full>
        <div className="flex items-center gap-4">
          {form.cover_photo_url ? (
            <img src={form.cover_photo_url} alt="cover"
              className="w-32 h-32 object-cover rounded-xl border"
              style={{ borderColor: 'rgba(212,175,55,0.3)' }} />
          ) : (
            <div className="w-32 h-32 grid place-items-center rounded-xl"
              style={{ background: 'rgba(212,175,55,0.05)', border: '1px dashed rgba(212,175,55,0.3)' }}>
              <ImageIcon className="w-6 h-6" style={{ color: '#D4AF37' }} />
            </div>
          )}
          <label className="lux-btn lux-btn-ghost cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onUploadCover}
              data-testid="cf-upload-cover" />
            Upload Cover
          </label>
        </div>
      </Field>

      <Field label="Additional Photos (gallery)" full>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-3">
          {(form.extra_photos || []).map((url, i) => (
            <div key={i} className="relative group">
              <img src={url} alt={`p${i}`}
                className="w-full aspect-square object-cover rounded-lg"
                style={{ border: '1px solid rgba(212,175,55,0.2)' }} />
              <button type="button"
                onClick={() => setForm((f) => ({ ...f, extra_photos: f.extra_photos.filter((_, x) => x !== i) }))}
                className="absolute top-1 right-1 w-6 h-6 rounded-full grid place-items-center opacity-0 group-hover:opacity-100"
                style={{ background: 'rgba(11,9,8,0.85)' }}>
                <Trash2 className="w-3 h-3" style={{ color: '#fff' }} />
              </button>
            </div>
          ))}
          <label className="aspect-square rounded-lg grid place-items-center cursor-pointer"
            style={{ background: 'rgba(212,175,55,0.05)', border: '1px dashed rgba(212,175,55,0.3)' }}>
            <input type="file" accept="image/*" multiple className="hidden" onChange={onUploadExtra}
              data-testid="cf-upload-extras" />
            <Plus className="w-5 h-5" style={{ color: '#D4AF37' }} />
          </label>
        </div>
      </Field>

      <Field label={`Story about the ${categoryId === 'baby_birthday' ? 'baby' : 'celebrant'}`} full>
        <textarea className="lux-input" rows={6}
          value={form.story} onChange={(e) => setField('story', e.target.value)}
          placeholder="Share a small story… milestones, traditions, family blessings."
          data-testid="cf-story" />
      </Field>

      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Video Link (YouTube / Vimeo)">
          <input className="lux-input" value={form.video_link}
            onChange={(e) => setField('video_link', e.target.value)}
            placeholder="https://youtu.be/…"
            data-testid="cf-video" />
        </Field>
        <Field label="Live Stream Link">
          <input className="lux-input" value={form.live_link}
            onChange={(e) => setField('live_link', e.target.value)}
            placeholder="https://… (zoom, youtube live, fb live)"
            data-testid="cf-live" />
        </Field>
      </div>

      <Field label="Closing Message" full>
        <textarea className="lux-input" rows={2}
          value={form.closing_message}
          onChange={(e) => setField('closing_message', e.target.value)}
          placeholder="Thank you for being part of our joy…"
          data-testid="cf-closing" />
      </Field>

      {/* ── Background music — celebration-curated picker ───────────
          A smaller (10-track) celebration-specific library: lullabies
          for babies, joyful welcomes for half-saree/dhoti, devotional
          beds for puberty ceremonies, plus cinematic moments. Honours
          the same shape as the wedding flow so the public renderer
          (CelebrationPublicView) plays the picked track unchanged. */}
      <Field label="Background music" full>
        <div className="lux-glass p-4"
             style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.18)' }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-2 min-w-0">
              <Music className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#D4AF37' }} />
              <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,248,220,0.85)' }}>
                Pick a soft instrumental that plays on the invitation page. Tap a track to preview, then &ldquo;Pick&rdquo; to select. Leave empty for a silent page.
              </div>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <input type="checkbox"
                checked={form.background_music_autoplay}
                onChange={(e) => setField('background_music_autoplay', e.target.checked)}
                data-testid="cf-music-autoplay" />
              <span className="text-[10px] tracking-wider uppercase"
                    style={{ color: 'rgba(255,248,220,0.85)' }}>
                Autoplay
              </span>
            </label>
          </div>
          <MusicPresetPicker
            category="celebration"
            value={form.background_music_url}
            onChange={(url) => setField('background_music_url', url || '')}
            allowCustom={true}
          />
        </div>
      </Field>
    </motion.div>
  );

  const StepDesign = (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <p className="text-sm mb-5" style={{ color: 'rgba(255,248,220,0.82)' }}>
        Pick a design. You can change it later.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {(meta.designs || []).map((d) => {
          const isSel = form.design_id === d.design_id;
          return (
            <button key={d.design_id} type="button"
              onClick={() => setField('design_id', d.design_id)}
              className="group relative rounded-xl overflow-hidden"
              style={{
                border: `2px solid ${isSel ? '#D4AF37' : 'rgba(212,175,55,0.15)'}`,
                boxShadow: isSel ? '0 0 0 4px rgba(212,175,55,0.18)' : 'none',
              }}
              data-testid={`cf-design-${d.design_id}`}>
              <div className="relative aspect-[3/4] overflow-hidden">
                <img src={d.preview_image} alt={d.name}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                {isSel && (
                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full grid place-items-center"
                    style={{ background: '#D4AF37' }}>
                    <Check className="w-4 h-4" style={{ color: '#0b0908' }} />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 p-2 text-left"
                  style={{ background: 'linear-gradient(180deg,transparent,rgba(11,9,8,0.95))' }}>
                  <div className="text-[10px] tracking-wider uppercase font-semibold"
                    style={{ color: '#FFF8DC' }}>{d.name}</div>
                  <div className="text-[10px]" style={{ color: '#D4AF37' }}>
                    {d.credit_cost} credit{d.credit_cost === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );

  const StepFeatures = (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <p className="text-sm mb-5" style={{ color: 'rgba(255,248,220,0.82)' }}>
        Toggle features for this invitation. Premium features cost credits.
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        {(meta.features || []).map((f) => {
          const on = form.selected_features.includes(f.key);
          return (
            <button key={f.key} type="button" onClick={() => toggleFeature(f.key)}
              className="flex items-center justify-between gap-3 rounded-xl p-4 text-left transition-all"
              style={{
                background: on ? 'rgba(212,175,55,0.12)' : 'rgba(255,248,220,0.03)',
                border: `1px solid ${on ? '#D4AF37' : 'rgba(212,175,55,0.15)'}`,
              }}
              data-testid={`cf-feature-${f.key}`}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl">{f.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: '#FFF8DC' }}>{f.label}</div>
                  <div className="text-[10px] tracking-wider uppercase"
                    style={{ color: 'rgba(255,248,220,0.7)' }}>
                    {f.credits === 0 ? 'Included' : `${f.credits} credit${f.credits === 1 ? '' : 's'}`}
                  </div>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full relative transition-colors`}
                style={{ background: on ? '#D4AF37' : 'rgba(255,248,220,0.18)' }}>
                <div className="absolute top-0.5 w-5 h-5 rounded-full"
                  style={{ background: '#fff', left: on ? '18px' : '2px', transition: 'left .2s' }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* ── RSVP CONFIG CARD — only shown when RSVP feature toggle is ON.
          Host configures the deadline, max guests per family, and an
          optional friendly note. CelebrationPublicView renders the RSVP
          form on the public link based on these settings. */}
      {form.selected_features.includes('rsvp') && (
        <div className="lux-glass p-5 rounded-xl mt-5" data-testid="cf-rsvp-card">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-xs tracking-[0.3em] uppercase mb-1"
                style={{ color: '#D4AF37' }}>
                ✉️ RSVP Settings
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,248,220,0.8)' }}>
                Configure how guests will RSVP on your invitation link.
              </p>
            </div>
            <button type="button"
              onClick={() => setField('rsvp_enabled', !form.rsvp_enabled)}
              className="w-11 h-6 rounded-full relative transition-colors shrink-0"
              style={{ background: form.rsvp_enabled ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
              data-testid="cf-rsvp-toggle"
              aria-label="Toggle RSVP">
              <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{ background: '#FFF8DC', left: form.rsvp_enabled ? 'calc(100% - 22px)' : '2px' }} />
            </button>
          </div>
          {form.rsvp_enabled && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="RSVP Deadline">
                <input type="date" className="lux-input"
                  value={form.rsvp_deadline || ''}
                  onChange={(e) => setField('rsvp_deadline', e.target.value)}
                  data-testid="cf-rsvp-deadline" />
              </Field>
              <Field label="Max guests per family">
                <input type="number" min={1} max={20} className="lux-input"
                  value={form.rsvp_max_guests_per_party}
                  onChange={(e) => setField('rsvp_max_guests_per_party', Number(e.target.value) || 1)}
                  data-testid="cf-rsvp-max-guests" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Optional note shown above the RSVP form">
                  <textarea className="lux-input" rows={2}
                    value={form.rsvp_message}
                    onChange={(e) => setField('rsvp_message', e.target.value)}
                    placeholder='e.g. "Please confirm by next Friday so we can plan the seating."'
                    data-testid="cf-rsvp-message" />
                </Field>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );

  const StepReview = (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <div className="lux-glass p-6 mb-5">
        <h3 className="font-display text-2xl mb-4" style={{ color: '#FFF8DC' }}>
          {meta.icon} {form.celebrant_name || 'Celebrant'} · {meta.label}
        </h3>
        <Row k="Event Date" v={form.event_date} />
        <Row k="Venue" v={`${form.venue}${form.city ? ', ' + form.city : ''}`} />
        {categoryId === 'baby_birthday' && (
          <>
            <Row k="Age Turning" v={`${form.age_turning}${form.age_turning == 1 ? 'st' : form.age_turning == 2 ? 'nd' : form.age_turning == 3 ? 'rd' : 'th'}`} />
            <Row k="Date of Birth" v={form.date_of_birth} />
          </>
        )}
        <Row k="Parents" v={[form.father_name, form.mother_name].filter(Boolean).join(' & ')} />
        <Row k="Photos" v={`Cover ${form.cover_photo_url ? '✓' : '—'} · ${(form.extra_photos || []).length} extras`} />
        <Row k="Languages" v={form.enabled_languages.join(', ')} />
        <Row k="Features" v={form.selected_features.length + ' selected'} />
        {preselectedExpiry && <Row k="Link Expiry" v={preselectedExpiry.replace(/_/g, ' ')} />}
      </div>

      {/* Purchase summary — mirrors the wedding flow so the user sees exactly
          what their wallet will be charged. */}
      <div className="lux-glass p-5 mb-5" data-testid="cf-purchase-summary">
        <div className="text-[10px] tracking-[0.32em] uppercase mb-3"
          style={{ color: 'rgba(255,248,220,0.78)' }}>
          ◆ Credits breakdown
        </div>
        <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,248,220,0.85)' }}>
          <li className="flex items-center justify-between">
            <span>Base design ({form.design_id || '—'})</span>
            <span className="font-display" style={{ color: '#D4AF37' }}>
              {(meta.designs || []).find((d) => d.design_id === form.design_id)?.credit_cost || 1}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span>Features ({form.selected_features.length} selected)</span>
            <span className="font-display" style={{ color: '#D4AF37' }}>
              {(meta.features || []).reduce(
                (s, f) => s + (form.selected_features.includes(f.key) ? (f.credits || 0) : 0),
                0
              )}
            </span>
          </li>
        </ul>
        <div className="lux-hairline my-3" />
        <div className="flex items-center justify-between">
          <span className="text-[11px] tracking-[0.32em] uppercase"
            style={{ color: 'rgba(255,248,220,0.8)' }}>
            Total to be charged
          </span>
          <div className="inline-flex items-baseline gap-1.5"
            data-testid="cf-purchase-summary-total">
            <span className="font-display text-3xl" style={{ color: '#D4AF37' }}>
              {totalCredits}
            </span>
            <span className="text-xs" style={{ color: 'rgba(255,248,220,0.8)' }}>
              credit{totalCredits !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="lux-glass p-5 flex items-center justify-between">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.7)' }}>
            Estimated credits
          </div>
          <div className="font-display text-3xl" style={{ color: '#D4AF37' }}>{totalCredits}</div>
        </div>
        <button onClick={submit} disabled={saving}
          className="lux-btn"
          data-testid="cf-publish">
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : (isEdit ? 'Save changes' : `Publish — ${totalCredits} credit${totalCredits !== 1 ? 's' : ''}`)}
        </button>
      </div>
    </motion.div>
  );

  // ===========================================
  // MAIN RENDER
  // ===========================================
  return (
    <div className="luxe-page min-h-screen" style={{ background: '#0b0908' }}>
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-8 pb-2 flex items-center justify-between">
        <button onClick={() => navigate(isAdminRoute ? '/studio/category-selector' : '/')}
          className="lux-btn lux-btn-ghost" data-testid="cf-back">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-4">
          {/* Live credit total — visible on every step so the user always
              knows what they're about to be charged. */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(180,140,40,0.12))',
              border: '1px solid rgba(212,175,55,0.35)',
            }}
            data-testid="cf-total-credits">
            <Sparkles className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
            <span className="text-[10px] tracking-[0.22em] uppercase"
              style={{ color: 'rgba(255,248,220,0.85)' }}>
              Total
            </span>
            <span className="font-display text-base" style={{ color: '#FFF8DC' }}>
              {totalCredits}
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(255,248,220,0.8)' }}>
              credit{totalCredits !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{meta.icon}</span>
            <div className="text-right">
              <div className="font-display text-lg" style={{ color: '#FFF8DC' }}>{meta.label}</div>
              <div className="text-[10px] tracking-wider uppercase" style={{ color: 'rgba(212,175,55,0.7)' }}>
                {meta.label_traditional}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
        {/* Stepper */}
        <div className="lux-glass p-3 md:p-4 flex items-center justify-between mb-6 overflow-x-auto">
          {steps.map((label, i) => (
            <React.Fragment key={label}>
              <button onClick={() => setStep(i)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
                style={{
                  background: step === i ? 'rgba(212,175,55,0.18)' : 'transparent',
                  color: step === i ? '#D4AF37' : 'rgba(255,248,220,0.78)',
                }}
                data-testid={`cf-step-${i}`}>
                <span className="w-5 h-5 rounded-full grid place-items-center text-[10px]"
                  style={{ background: step >= i ? '#D4AF37' : 'rgba(255,248,220,0.1)',
                           color: step >= i ? '#0b0908' : '#fff' }}>
                  {i + 1}
                </span>
                {label}
              </button>
              {i < steps.length - 1 && (
                <div className="h-px flex-1 mx-1 hidden sm:block"
                  style={{ background: 'rgba(212,175,55,0.18)' }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Error & Success */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-5 p-3 rounded-lg text-sm"
              style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#FCA5A5' }}>
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-5 p-3 rounded-lg text-sm"
              style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#86EFAC' }}>
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Content */}
        <div className="lux-glass p-5 md:p-8">
          {step === 0 && StepBasics}
          {step === 1 && StepPhotos}
          {step === 2 && StepDesign}
          {step === 3 && StepFeatures}
          {step === 4 && StepReview}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-6">
          <button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="lux-btn lux-btn-ghost" data-testid="cf-prev">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          {step < steps.length - 1 ? (
            <button onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              className="lux-btn" data-testid="cf-next">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={saving} className="lux-btn" data-testid="cf-save">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Save Draft')}
            </button>
          )}
        </div>

        {/* BUG O FIX: previously a one-line `<a>View public link</a>` was the
            only post-save share affordance. Photographers and users alike had
            to right-click, copy, then assemble the full URL by hand. Mirror
            the LuxuryProfileForm "Publish" panel here — full URL, copy
            button, native share, and a downloadable QR. */}
        {isEdit && profile?.slug && (
          <CelebrationShareLinkPanel slug={profile.slug} />
        )}
      </div>
    </div>
  );
};

const Field = ({ label, children, required, full }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className="block text-[10px] tracking-[0.25em] uppercase mb-2"
      style={{ color: 'rgba(255,248,220,0.78)' }}>
      {label} {required && <span style={{ color: '#D4AF37' }}>·</span>}
    </label>
    {children}
  </div>
);

// Feb 2026 — single time input that auto-classifies into a meal label
// (Breakfast / Lunch / Snacks / Dinner) and shows the resulting chip beside
// the input.  Used in both wedding and non-wedding (celebration) forms.
const MealTimeField = ({ value, onChange, testid }) => {
  const label = classifyMealTime(value);
  const display = formatMealTime(value);
  return (
    <div className="flex items-center gap-3" data-testid={testid}>
      <input
        type="time"
        className="lux-input flex-1"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`${testid}-input`}
      />
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
        <span className="text-[10px] italic" style={{ color: 'rgba(255,248,220,0.4)' }}>
          Pick a time
        </span>
      )}
    </div>
  );
};

const Row = ({ k, v }) => (
  <div className="flex items-start justify-between py-2"
    style={{ borderBottom: '1px solid rgba(212,175,55,0.08)' }}>
    <span className="text-xs tracking-wider uppercase" style={{ color: 'rgba(255,248,220,0.7)' }}>{k}</span>
    <span className="text-sm text-right max-w-[60%] truncate" style={{ color: '#FFF8DC' }}>
      {v || '—'}
    </span>
  </div>
);

/**
 * BUG O FIX — Share Link panel rendered after the celebration invitation
 * is saved. Mirrors the look of the LuxuryProfileForm "Publish" step:
 *   • Full URL (with origin) shown in a copyable code box.
 *   • One-click "Copy", "Open", "Share" (native share API where available),
 *     and "Download QR" actions.
 *   • QR code rendered to a canvas so it can be downloaded as PNG.
 */
const CelebrationShareLinkPanel = ({ slug }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const fullUrl = `${origin}/invite/${slug}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_e) { /* ignore */ }
  };

  const share = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Invitation', text: 'You\u2019re invited!', url: fullUrl });
      } catch (_e) { /* user cancelled */ }
    } else {
      copy();
    }
  };

  const downloadQR = () => {
    // Pull the canvas the QRCodeCanvas component renders and offer a PNG.
    const canvas = document.getElementById('celebration-share-qr');
    if (!canvas || !canvas.toDataURL) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `invitation-${slug}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="mt-8 p-5 rounded-2xl"
      style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.28)' }}
      data-testid="celebration-share-panel"
    >
      <div className="flex items-center gap-2 mb-3">
        <Share2 className="w-4 h-4" style={{ color: '#D4AF37' }} />
        <span className="text-[10px] tracking-[0.3em] uppercase font-medium" style={{ color: '#D4AF37' }}>
          Share your invitation
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-5 items-center">
        <div className="space-y-3">
          <code
            className="block px-3 py-2 rounded-md text-xs overflow-x-auto font-mono"
            style={{ background: 'rgba(10,7,4,0.6)', border: '1px solid rgba(212,175,55,0.25)', color: '#FFF8DC' }}
            data-testid="celebration-share-url"
          >
            {fullUrl}
          </code>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} className="lux-btn-ghost inline-flex items-center gap-2 text-xs" data-testid="celebration-share-copy">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              href={fullUrl}
              target="_blank"
              rel="noreferrer"
              className="lux-btn-ghost inline-flex items-center gap-2 text-xs"
              data-testid="celebration-share-open"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </a>
            <button onClick={share} className="lux-btn-ghost inline-flex items-center gap-2 text-xs" data-testid="celebration-share-native">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            <button onClick={downloadQR} className="lux-btn-ghost inline-flex items-center gap-2 text-xs" data-testid="celebration-share-qr-download">
              <DownloadIcon className="w-3.5 h-3.5" /> Download QR
            </button>
          </div>
        </div>

        <div
          className="bg-white p-3 rounded-lg flex items-center justify-center"
          style={{ alignSelf: 'center' }}
        >
          <QRCodeCanvas id="celebration-share-qr" value={fullUrl} size={150} level="M" includeMargin={false} />
        </div>
      </div>
    </div>
  );
};

export default CelebrationProfileForm;
