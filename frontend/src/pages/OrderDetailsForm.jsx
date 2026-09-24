import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Sparkles, Crown, Heart, Plus, X, RotateCcw, MapPin, Music, Gift } from 'lucide-react';
import PhotoUploadField from '@/components/luxury/PhotoUploadField';
import FeatureWishForm from '@/components/FeatureWishForm';
import MusicPresetPicker from '@/components/luxury/MusicPresetPicker';
import PreWeddingLinksEditor from '@/components/luxury/PreWeddingLinksEditor';
import { PxButton, PxCard } from '@/components/px';
import { resolveMediaUrl } from '@/utils/mediaUrl';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const DRAFT_TTL_DAYS = 30;          // keep the draft this long
const AUTO_RESTORE_DAYS = 7;        // silently restore within this window
const draftKey = (orderId) => `maja_order_draft_${orderId}`;

const EMPTY_EXTRA = {
  // Which ceremony this is. Drives which traditional details are even asked for:
  // a Christian wedding has no gotram or nakshatram, so we must not ask for them
  // (and must not carry stale values if the buyer switches type).
  marriage_type: 'hindu',
  // What the invitation's background should be: the couple's own photo, or the
  // design's own artwork exactly as shown in the preview they bought.
  background_choice: 'couple',
  wedding_time: '', meal: 'lunch',
  primary_language: 'English', other_languages: [],
  bride_photo: '', groom_photo: '', couple_photo: '', other_photos: [],
  about_bride: '', about_groom: '', couple_story: '',
  nakshatram: { enabled: false, bride: '', groom: '' },
  muhurtam: { enabled: false, value: '' },
  gotram: { enabled: false, bride: '', groom: '' },
  // parents (optional — welcome line + families section)
  bride_father: '', bride_mother: '', groom_father: '', groom_mother: '',
  // venue extras
  venue_google_map_link: '',
  parking: { enabled: false, text: '', google_map_link: '' },
  // media
  background_music_url: '',
  pre_wedding_links: [],
  live_link: '',
  // gifts
  accepting_gifts: true,
  shagun: { enabled: false, upi_id: '', payee_name: '', gpay_handle: '', phonepe_handle: '', paytm_handle: '' },
  honeymoon_fund: { enabled: false, upi_id: '', payee_name: '', title: 'Honeymoon Fund', message: '' },
  // guest FAQ (P3) — studio maps this to faq_settings on the invitation
  faq: [],
};
const EMPTY_FORM = {
  bride_name: '', groom_name: '', event_date: '', venue: '', city: '', phone: '', notes: '',
  extra: EMPTY_EXTRA,
};

const LANGUAGES = ['English', 'Telugu', 'Hindi', 'Tamil', 'Kannada', 'Malayalam', 'Marathi', 'Bengali'];

// Ceremony types and the traditional details each one actually has. This is the
// whole point of asking: a Christian or Muslim wedding has no gotram/nakshatram,
// so those fields are not shown at all rather than shown and left blank.
const MARRIAGE_TYPES = [
  { key: 'hindu',     label: 'Hindu',            traditions: ['nakshatram', 'muhurtam', 'gotram'] },
  { key: 'christian', label: 'Christian',        traditions: [] },
  { key: 'muslim',    label: 'Muslim / Nikah',   traditions: [] },
  { key: 'sikh',      label: 'Sikh',             traditions: ['muhurtam'] },
  { key: 'other',     label: 'Other / mixed',    traditions: ['nakshatram', 'muhurtam', 'gotram'] },
];
const traditionsFor = (t) =>
  (MARRIAGE_TYPES.find((m) => m.key === t) || MARRIAGE_TYPES[0]).traditions;

// The two ways the invitation background can be produced. The choice travels to
// the admin panel in the build brief, because it changes how the page is built.
const BACKGROUND_CHOICES = [
  { key: 'couple', label: 'Our couple photo',
    hint: 'Your couple photo fills the opening and the page background.' },
  { key: 'design', label: 'Same as the design preview',
    hint: "Keep the design's own artwork exactly as you saw it when you chose it." },
];
const MAX_OTHER_PHOTOS = 12;

// Predefined starter texts — user clicks one to fill the box, then edits freely.
const ABOUT_PRESETS = [
  'A kind heart, a bright smile, and a love for family — meet our beautiful bride.',
  'Warm, ambitious and endlessly caring — a groom who lights up every room.',
];
const STORY_PRESETS = [
  'Two families, one beautiful beginning — their journey started with a simple hello and grew into forever.',
  'From strangers to soulmates, their story is proof that the best love feels like coming home.',
];

const OrderDetailsForm = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [doneInfo, setDoneInfo] = useState(null);   // submit response (edit_request, message)
  const [error, setError] = useState('');
  const [savedTag, setSavedTag] = useState('');       // "Saved" indicator
  const [resumePrompt, setResumePrompt] = useState(null); // stale draft awaiting confirm
  const loadedRef = useRef(false);
  const backendTimer = useRef(null);

  // The details form is filled by whoever bought the invitation — a normal user
  // (session cookie) OR a photographer (studio admin token). Pick the upload
  // endpoint that matches the logged-in identity: a photographer has NO user
  // session, so /api/users/upload-image 401s ("Invalid session") for them.
  // Route photographers to /api/admin/upload-image (admin-token auth) instead.
  const uploadMode = (typeof localStorage !== 'undefined' && localStorage.getItem('admin_token'))
    ? 'admin-presave' : 'user';

  // ── restore on mount: localStorage first (instant), then backend draft ──
  // Can this order still be edited? (first fill always allowed; re-edits open
  // only once the link is delivered, and close 24h later → WhatsApp instead.)
  const [editState, setEditState] = useState(null);
  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/api/store/order/${orderId}/edit-state`, { withCredentials: true })
      .then(({ data }) => { if (alive) setEditState(data); })
      .catch(() => { if (alive) setEditState({ can_edit: true }); });
    return () => { alive = false; };
  }, [orderId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let restored = null, savedAt = 0;
      try {
        const raw = localStorage.getItem(draftKey(orderId));
        if (raw) { const d = JSON.parse(raw); restored = d.form; savedAt = d.at || 0; }
      } catch { /* ignore corrupt draft */ }
      if (!restored) {
        try {
          const { data } = await axios.get(`${API_URL}/api/store/order/${orderId}`, { withCredentials: true });
          if (data?.info_draft) { restored = data.info_draft; savedAt = Date.parse(data.draft_at || '') || 0; }
        } catch { /* no order/draft */ }
      }
      if (!alive) return;
      const ageDays = savedAt ? (Date.now() - savedAt) / 86400000 : Infinity;
      if (restored && ageDays <= DRAFT_TTL_DAYS) {
        if (ageDays <= AUTO_RESTORE_DAYS) setForm((f) => ({ ...f, ...restored, extra: { ...f.extra, ...(restored.extra || {}) } }));
        else setResumePrompt(restored);   // older → ask before loading
      }
      loadedRef.current = true;
    })();
    return () => { alive = false; };
  }, [orderId]);

  // ── autosave: localStorage on every change (debounced), backend every ~45s ──
  useEffect(() => {
    if (!loadedRef.current) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey(orderId), JSON.stringify({ form, at: Date.now() })); } catch { /* quota */ }
      setSavedTag('Saved'); setTimeout(() => setSavedTag(''), 1200);
    }, 600);
    if (!backendTimer.current) {
      backendTimer.current = setTimeout(() => {
        backendTimer.current = null;
        axios.put(`${API_URL}/api/store/order/${orderId}/info-draft`, form, { withCredentials: true }).catch(() => {});
      }, 45000);
    }
    return () => clearTimeout(t);
  }, [form, orderId]);

  const acceptResume = () => { setForm((f) => ({ ...f, ...resumePrompt, extra: { ...f.extra, ...(resumePrompt.extra || {}) } })); setResumePrompt(null); };
  const reset = useCallback(() => {
    if (!window.confirm('Clear all details and start fresh?')) return;
    setForm(EMPTY_FORM);
    try { localStorage.removeItem(draftKey(orderId)); } catch { /* ignore */ }
    axios.put(`${API_URL}/api/store/order/${orderId}/info-draft`, EMPTY_FORM, { withCredentials: true }).catch(() => {});
  }, [orderId]);

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const setX = (k, v) => setForm((s) => ({ ...s, extra: { ...s.extra, [k]: v } }));
  const setXField = (group, k, v) => setForm((s) => ({ ...s, extra: { ...s.extra, [group]: { ...s.extra[group], [k]: v } } }));
  const x = form.extra;
  // Which traditional details this ceremony actually has.
  const traditions = traditionsFor(x.marriage_type);
  // Switching ceremony type must also CLEAR what no longer applies — otherwise a
  // buyer who starts as Hindu, fills a gotram, then switches to Christian would
  // silently ship a gotram on a Christian invitation.
  const setMarriageType = (t) => setForm((s) => {
    const keep = traditionsFor(t);
    const e = { ...s.extra, marriage_type: t };
    for (const k of ['nakshatram', 'muhurtam', 'gotram']) {
      if (!keep.includes(k)) {
        e[k] = k === 'muhurtam'
          ? { enabled: false, value: '' }
          : { enabled: false, bride: '', groom: '' };
      }
    }
    return { ...s, extra: e };
  });

  const toggleLang = (l) => setX('other_languages',
    x.other_languages.includes(l) ? x.other_languages.filter((o) => o !== l) : [...x.other_languages, l]);

  const addOtherPhoto = (url) => { if (url && x.other_photos.length < MAX_OTHER_PHOTOS) setX('other_photos', [...x.other_photos, url]); };
  const removeOtherPhoto = (i) => setX('other_photos', x.other_photos.filter((_, j) => j !== i));

  // Pick several photos at once (the single-file picker made adding 12 photos
  // painfully slow). Uploads sequentially and stops at the cap.
  const multiRef = useRef(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState('');
  const onPickMany = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setBulkBusy(true); setBulkErr('');
    const added = [];
    for (const f of files) {
      if (x.other_photos.length + added.length >= MAX_OTHER_PHOTOS) break;
      if (!f.type?.startsWith('image/')) continue;
      try {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('slot', 'other');
        const res = await axios.post(`${API_URL}/api/users/upload-image`, fd, { withCredentials: true });
        if (res.data?.url) added.push(res.data.url);
      } catch (err) {
        setBulkErr(err?.response?.data?.detail || `Could not upload ${f.name}`);
      }
    }
    if (added.length) setX('other_photos', [...x.other_photos, ...added].slice(0, MAX_OTHER_PHOTOS));
    setBulkBusy(false);
  };

  // On Complete: jump to the first required field that's empty.
  const REQUIRED = [
    ['od-bride', form.bride_name, "Bride's name"],
    ['od-groom', form.groom_name, "Groom's name"],
    ['od-date', form.event_date, 'Wedding date'],
    // Mandatory: without a number we cannot call about the build, and the owner
    // asked for it explicitly. Submit is blocked until it is a real number.
    ['od-phone', form.phone, 'Phone number'],
  ];
  // 10 local digits, or an international form with a country code.
  const phoneOk = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    return d.length === 10 || (d.length >= 11 && d.length <= 15);
  };
  const submit = async (e) => {
    e.preventDefault();
    for (const [tid, val, label] of REQUIRED) {
      if (!val || !String(val).trim()) {
        setError(`Please fill: ${label}`);
        const el = document.querySelector(`[data-testid=${tid}]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus?.(); }
        return;
      }
    }
    if (!phoneOk(form.phone)) {
      setError('Please enter a valid phone number (10 digits, or with your country code).');
      const el = document.querySelector('[data-testid=od-phone]');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus?.(); }
      return;
    }
    setBusy(true); setError('');
    try {
      const { data } = await axios.post(`${API_URL}/api/store/order/${orderId}/info`, form, { withCredentials: true });
      try { localStorage.removeItem(draftKey(orderId)); } catch { /* ignore */ }
      setDoneInfo(data || null);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not submit details.');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="px-aurora min-h-screen grid place-items-center px-6" data-testid="order-details-done">
        <div className="px-glass p-10 md:p-12 text-center max-w-md">
          <div className="w-16 h-16 mx-auto rounded-full grid place-items-center mb-5" style={{ background: 'var(--px-primary)' }}>
            <Crown className="w-8 h-8" style={{ color: '#fff' }} />
          </div>
          <h1 className="px-section-title mb-3">Thank you!</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--px-ink)' }}>
            {doneInfo?.edit_request
              ? `Your changes were sent to our studio — we'll update your live link shortly.${typeof doneInfo.post_delivery_edits_remaining === 'number' ? ` You have ${doneInfo.post_delivery_edits_remaining} edit(s) left.` : ''}`
              : "We've received your details. Our studio will craft your invitation and share the live link soon."}
          </p>
          <PxButton onClick={() => navigate(uploadMode === 'admin-presave' ? '/studio/dashboard' : '/user/dashboard')} data-testid="order-done-dashboard">Go to my dashboard</PxButton>
        </div>
      </div>
    );
  }

  return (
    <div className="px-aurora min-h-screen px-6 py-12" data-testid="order-details-form">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <span className="px-eyebrow inline-flex items-center justify-center gap-2 mb-3"><Heart className="w-3.5 h-3.5" /> Payment received</span>
          <h1 className="px-section-title">Tell us about your wedding</h1>
          <p className="text-sm mt-3" style={{ color: 'var(--px-muted)' }}>We'll build your invitation from these details.</p>
        </div>

        {resumePrompt && (
          <div className="px-glass p-4 mb-4 flex flex-col sm:flex-row items-center gap-3" data-testid="od-resume">
            <span className="text-sm flex-1" style={{ color: 'var(--px-ink)' }}>Resume your previous invitation? We saved your earlier details.</span>
            <PxButton onClick={acceptResume} data-testid="od-resume-yes">Resume</PxButton>
            <PxButton variant="secondary" onClick={() => setResumePrompt(null)} data-testid="od-resume-no">Start fresh</PxButton>
          </div>
        )}

        {/* Post-delivery edits are limited — tell the buyer how many remain. */}
        {editState?.can_edit && editState?.delivered && typeof editState.post_delivery_edits_remaining === 'number' && (
          <div className="px-glass p-3 mb-3 text-xs text-center" data-testid="od-edits-remaining"
            style={{ color: 'var(--px-primary)', border: '1px solid var(--px-border-tint)' }}>
            Your invitation is already live. You can make {editState.post_delivery_edits_remaining} more edit{editState.post_delivery_edits_remaining === 1 ? '' : 's'} —
            each one is sent to our studio to update the live link.
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: 'var(--px-faint)' }}>{savedTag && <><Sparkles className="inline w-3 h-3" /> {savedTag}</>}</span>
          <PxButton type="button" variant="ghost" onClick={reset} className="text-xs" data-testid="od-reset">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </PxButton>
        </div>

        {/* Edit window closed / turned off → point the couple at WhatsApp. */}
        {editState && !editState.can_edit ? (
          <div className="px-glass p-8 text-center" data-testid="od-locked">
            <Crown className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--px-primary)' }} />
            <h2 className="px-section-title mb-2" style={{ fontSize: 24 }}>
              {editState.delivered ? 'Editing is closed' : 'Not editable yet'}
            </h2>
            <p className="text-sm mb-5" style={{ color: 'var(--px-muted)' }}>{editState.reason}</p>
            {editState.whatsapp_number ? (
              <a
                href={`https://wa.me/${editState.whatsapp_number}?text=${encodeURIComponent(
                  `Hi MAJA Invites, I'd like to request changes to my invitation (order ${orderId}).`)}`}
                target="_blank" rel="noreferrer"
                className="px-btn inline-flex" data-testid="od-whatsapp">
                Contact us on WhatsApp for changes
              </a>
            ) : (
              <p className="text-xs" style={{ color: 'var(--px-faint)' }}>
                Please contact our team for any changes.
              </p>
            )}
            {editState.edit_deadline && editState.delivered && (
              <p className="text-[11px] mt-3" style={{ color: 'var(--px-faint)' }}>
                The {editState.edit_window_hours}-hour window ended {new Date(editState.edit_deadline).toLocaleString('en-IN')}.
              </p>
            )}
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-6">
          {/* Couple */}
          <Section title="The couple">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Bride's name"><input className="px-input" value={form.bride_name} onChange={set('bride_name')} data-testid="od-bride" /></Field>
              <Field label="Groom's name"><input className="px-input" value={form.groom_name} onChange={set('groom_name')} data-testid="od-groom" /></Field>
            </div>
          </Section>

          {/* Which ceremony — decides what we ask further down */}
          <Section title="Type of ceremony"
            hint="This decides which traditional details we ask for. A Christian or Muslim ceremony has no gotram or nakshatram, so we simply won't ask.">
            <div className="flex flex-wrap gap-2">
              {MARRIAGE_TYPES.map((m) => (
                <button key={m.key} type="button" onClick={() => setMarriageType(m.key)}
                  className="px-4 py-2 text-sm" data-testid={`od-mtype-${m.key}`}
                  style={x.marriage_type === m.key
                    ? { borderRadius: 'var(--px-r-btn)', background: 'var(--px-primary)', color: '#fff', fontWeight: 600, border: '1.5px solid var(--px-primary)' }
                    : { borderRadius: 'var(--px-r-btn)', border: '1.5px solid var(--px-border)', color: 'var(--px-ink)', background: '#fff' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Background of the invitation — couple photo, or the design as bought */}
          <Section title="Invitation background"
            hint="Pick how your invitation should look behind the text.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BACKGROUND_CHOICES.map((b) => {
                const on = x.background_choice === b.key;
                return (
                  <button key={b.key} type="button" onClick={() => setX('background_choice', b.key)}
                    className="text-left p-4" style={{ borderRadius: 'var(--px-r-btn)', ...(on
                      ? { border: '1.5px solid var(--px-primary)', background: 'var(--px-violet-100)' }
                      : { border: '1.5px solid var(--px-border)', background: '#fff' }) }} data-testid={`od-bg-${b.key}`}>
                    <span className="block text-sm" style={{ color: on ? 'var(--px-primary)' : 'var(--px-ink)', fontWeight: on ? 600 : 400 }}>
                      {on ? '◆ ' : ''}{b.label}
                    </span>
                    <span className="block text-[11px] mt-1" style={{ color: 'var(--px-muted)' }}>{b.hint}</span>
                  </button>
                );
              })}
            </div>
            {x.background_choice === 'couple' && !x.couple_photo && (
              <p className="text-[11px]" style={{ color: 'var(--px-warning)' }} data-testid="od-bg-warn">
                Add a couple photo below — that is what will be used as the background.
              </p>
            )}
          </Section>

          {/* Date / time / meal */}
          <Section title="When">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Wedding date"><input type="date" className="px-input" value={form.event_date} onChange={set('event_date')} data-testid="od-date" /></Field>
              <Field label="Wedding time"><input type="time" className="px-input" value={x.wedding_time} onChange={(e) => setX('wedding_time', e.target.value)} data-testid="od-time" /></Field>
            </div>
            <Field label="Meal">
              <div className="flex gap-2">
                {['lunch', 'dinner'].map((m) => (
                  <button key={m} type="button" onClick={() => setX('meal', m)}
                    className="flex-1 py-2.5 text-sm capitalize" style={{ borderRadius: 'var(--px-r-btn)', ...(x.meal === m
                      ? { background: 'var(--px-primary)', color: '#fff', fontWeight: 600, border: '1.5px solid var(--px-primary)' }
                      : { border: '1.5px solid var(--px-border)', color: 'var(--px-ink)', background: '#fff' }) }} data-testid={`od-meal-${m}`}>
                    {m}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          {/* Venue */}
          <Section title="Where">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Venue"><input className="px-input" value={form.venue} onChange={set('venue')} data-testid="od-venue" /></Field>
              <Field label="City"><input className="px-input" value={form.city} onChange={set('city')} data-testid="od-city" /></Field>
            </div>
            <Field label="Your phone number (required)">
              <input className="px-input" value={form.phone} onChange={set('phone')} required
                inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number"
                data-testid="od-phone" />
              <p className="mt-1.5 text-[11px]" style={{ color: 'var(--px-muted)' }}>
                We call this number about your invitation — it cannot be left blank.
              </p>
            </Field>
          </Section>

          {/* Languages */}
          <Section title="Languages">
            <Field label="Main language">
              <select className="px-input" value={x.primary_language} onChange={(e) => setX('primary_language', e.target.value)} data-testid="od-lang-main">
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Other languages on the invitation">
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.filter((l) => l !== x.primary_language).map((l) => (
                  <button key={l} type="button" onClick={() => toggleLang(l)}
                    className={x.other_languages.includes(l) ? 'px-chip' : 'px-3 py-1.5 rounded-full text-xs'}
                    style={x.other_languages.includes(l) ? undefined : { border: '1.5px solid var(--px-border)', color: 'var(--px-muted)', background: '#fff' }}
                    data-testid={`od-lang-${l}`}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          {/* Photos */}
          <Section title="Photos">
            <div className="grid grid-cols-3 gap-3">
              <PhotoUploadField mode={uploadMode} label="Bride" value={x.bride_photo} onChange={(u) => setX('bride_photo', u)} testid="od-photo-bride" />
              <PhotoUploadField mode={uploadMode} label="Groom" value={x.groom_photo} onChange={(u) => setX('groom_photo', u)} testid="od-photo-groom" />
              <PhotoUploadField mode={uploadMode} label="Couple" value={x.couple_photo} onChange={(u) => setX('couple_photo', u)} testid="od-photo-couple" />
            </div>
            <Field label={`Other photos (${x.other_photos.length}/${MAX_OTHER_PHOTOS})`}>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {x.other_photos.map((u, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden" data-testid={`od-otherphoto-${i}`}>
                    <img src={resolveMediaUrl(u)} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeOtherPhoto(i)} className="absolute top-1 right-1 rounded-full p-0.5" style={{ background: 'rgba(17,24,39,0.6)' }}>
                      <X className="w-3 h-3" style={{ color: '#fff' }} />
                    </button>
                  </div>
                ))}
                {x.other_photos.length < MAX_OTHER_PHOTOS && (
                  <div className="aspect-square"><PhotoUploadField mode={uploadMode} label={<Plus className="w-4 h-4" />} value="" onChange={addOtherPhoto} testid="od-otherphoto-add" /></div>
                )}
              </div>
              {x.other_photos.length < MAX_OTHER_PHOTOS && (
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <PxButton type="button" variant="ghost" onClick={() => multiRef.current?.click()} disabled={bulkBusy}
                    className="text-xs" data-testid="od-otherphoto-bulk">
                    <Plus className="w-3.5 h-3.5" /> {bulkBusy ? 'Uploading…' : 'Add several at once'}
                  </PxButton>
                  <span className="text-[11px]" style={{ color: 'var(--px-muted)' }}>
                    You can add up to {MAX_OTHER_PHOTOS} photos.
                  </span>
                  <input ref={multiRef} type="file" accept="image/*" multiple hidden onChange={onPickMany} data-testid="od-otherphoto-multi-input" />
                </div>
              )}
              {bulkErr && <div className="text-[11px] mt-1" style={{ color: 'var(--px-error)' }}>{bulkErr}</div>}
            </Field>
          </Section>

          {/* About + story */}
          <Section title="About the couple">
            <PresetText label="About the bride" presets={ABOUT_PRESETS} value={x.about_bride} onChange={(v) => setX('about_bride', v)} testid="od-about-bride" />
            <PresetText label="About the groom" presets={ABOUT_PRESETS} value={x.about_groom} onChange={(v) => setX('about_groom', v)} testid="od-about-groom" />
            <PresetText label="Your story" presets={STORY_PRESETS} value={x.couple_story} onChange={(v) => setX('couple_story', v)} testid="od-story" />
          </Section>

          {/* Parents / families */}
          <Section title="With the blessings of our families" hint="Parents' names for the welcome line and families section. Leave blank to skip.">
            <div className="text-xs mb-1" style={{ color: 'var(--px-primary)' }}>◆ Bride's parents</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Father's name"><input className="px-input" value={x.bride_father} onChange={(e) => setX('bride_father', e.target.value)} placeholder="Mr. Anand Sharma" data-testid="od-bride-father" /></Field>
              <Field label="Mother's name"><input className="px-input" value={x.bride_mother} onChange={(e) => setX('bride_mother', e.target.value)} placeholder="Mrs. Rekha Sharma" data-testid="od-bride-mother" /></Field>
            </div>
            <div className="text-xs mb-1 mt-2" style={{ color: 'var(--px-primary)' }}>◆ Groom's parents</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Father's name"><input className="px-input" value={x.groom_father} onChange={(e) => setX('groom_father', e.target.value)} placeholder="Mr. Vikram Kapoor" data-testid="od-groom-father" /></Field>
              <Field label="Mother's name"><input className="px-input" value={x.groom_mother} onChange={(e) => setX('groom_mother', e.target.value)} placeholder="Mrs. Meera Kapoor" data-testid="od-groom-mother" /></Field>
            </div>
          </Section>

          {/* Venue details */}
          <Section title="Venue details">
            <Field label="Venue Google Maps link">
              <input className="px-input" value={x.venue_google_map_link} onChange={(e) => setX('venue_google_map_link', e.target.value)} placeholder="https://maps.google.com/…" data-testid="od-venue-map" />
            </Field>
            <ToggleGroup label="Parking directions" on={x.parking.enabled} onToggle={(v) => setXField('parking', 'enabled', v)} testid="od-parking">
              <Field label="Parking note"><input className="px-input" value={x.parking.text} onChange={(e) => setXField('parking', 'text', e.target.value)} placeholder="Park at the east gate, valet available" /></Field>
              <Field label="Parking Google Maps link"><input className="px-input" value={x.parking.google_map_link} onChange={(e) => setXField('parking', 'google_map_link', e.target.value)} placeholder="https://maps.google.com/…" /></Field>
            </ToggleGroup>
          </Section>

          {/* Music */}
          <Section title="Background music" hint="Pick from our library or paste your own link. Per-design top picks coming soon.">
            <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: 'var(--px-muted)' }}><Music className="w-3.5 h-3.5" /> Choose a track</div>
            <MusicPresetPicker value={x.background_music_url} onChange={(u) => setX('background_music_url', u)} allowCustom category="wedding" />
          </Section>

          {/* Films & links */}
          <Section title="Films & links" hint="Pre-wedding shoot (Drive / YouTube / Vimeo) and a live-stream link.">
            <PreWeddingLinksEditor links={x.pre_wedding_links} onChange={(l) => setX('pre_wedding_links', l)} />
            <Field label="Event live-stream link"><input className="px-input" value={x.live_link} onChange={(e) => setX('live_link', e.target.value)} placeholder="https://youtube.com/live/…" data-testid="od-live-link" /></Field>
          </Section>

          {/* Gifts & blessings */}
          <Section title="Gifts & digital shagun">
            <div className="flex items-center justify-between p-3" style={{ borderRadius: 'var(--px-r-btn)', border: '1.5px solid var(--px-border)' }}>
              <span className="text-sm flex items-center gap-2" style={{ color: 'var(--px-ink)' }}><Gift className="w-4 h-4" /> Accepting gifts / shagun?</span>
              <button type="button" onClick={() => setX('accepting_gifts', !x.accepting_gifts)} className="relative w-11 h-6 rounded-full" data-testid="od-gifts-toggle"
                style={{ background: x.accepting_gifts ? 'var(--px-primary)' : 'var(--px-border)' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: x.accepting_gifts ? '22px' : '2px' }} />
              </button>
            </div>
            {x.accepting_gifts && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="UPI ID"><input className="px-input" value={x.shagun.upi_id} onChange={(e) => setXField('shagun', 'upi_id', e.target.value)} placeholder="name@upi" data-testid="od-upi" /></Field>
                  <Field label="Payee name"><input className="px-input" value={x.shagun.payee_name} onChange={(e) => setXField('shagun', 'payee_name', e.target.value)} /></Field>
                  <Field label="Google Pay handle (optional)"><input className="px-input" value={x.shagun.gpay_handle} onChange={(e) => setXField('shagun', 'gpay_handle', e.target.value)} placeholder="@okgpay" /></Field>
                  <Field label="PhonePe handle (optional)"><input className="px-input" value={x.shagun.phonepe_handle} onChange={(e) => setXField('shagun', 'phonepe_handle', e.target.value)} placeholder="@ybl" /></Field>
                  <Field label="Paytm handle (optional)"><input className="px-input" value={x.shagun.paytm_handle} onChange={(e) => setXField('shagun', 'paytm_handle', e.target.value)} placeholder="@paytm" /></Field>
                </div>
                <ToggleGroup label="Honeymoon fund" on={x.honeymoon_fund.enabled} onToggle={(v) => setXField('honeymoon_fund', 'enabled', v)} testid="od-honeymoon">
                  <Field label="UPI ID"><input className="px-input" value={x.honeymoon_fund.upi_id} onChange={(e) => setXField('honeymoon_fund', 'upi_id', e.target.value)} placeholder="name@upi" /></Field>
                  <Field label="Message"><input className="px-input" value={x.honeymoon_fund.message} onChange={(e) => setXField('honeymoon_fund', 'message', e.target.value)} placeholder="Bless our new beginning" /></Field>
                </ToggleGroup>
              </>
            )}
          </Section>

          {/* Traditional details — ONLY the ones this ceremony actually has.
              Driven by marriage_type, so a Christian/Muslim ceremony is never
              asked for a gotram, and switching type clears what no longer applies. */}
          {traditions.length > 0 && (
          <Section title="Traditional details" hint="Turn on only what applies to you.">
            {traditions.includes('nakshatram') && (
            <ToggleGroup label="Nakshatram" on={x.nakshatram.enabled} onToggle={(v) => setXField('nakshatram', 'enabled', v)} testid="od-nakshatram">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bride"><input className="px-input" value={x.nakshatram.bride} onChange={(e) => setXField('nakshatram', 'bride', e.target.value)} placeholder="e.g. Anuradha" /></Field>
                <Field label="Groom"><input className="px-input" value={x.nakshatram.groom} onChange={(e) => setXField('nakshatram', 'groom', e.target.value)} placeholder="e.g. Rohini" /></Field>
              </div>
            </ToggleGroup>
            )}
            {traditions.includes('muhurtam') && (
            <ToggleGroup label="Muhurtam window" on={x.muhurtam.enabled} onToggle={(v) => setXField('muhurtam', 'enabled', v)} testid="od-muhurtam">
              <Field label="Muhurtam"><input className="px-input" value={x.muhurtam.value} onChange={(e) => setXField('muhurtam', 'value', e.target.value)} placeholder="e.g. 10:30 AM – 11:15 AM" /></Field>
            </ToggleGroup>
            )}
            {traditions.includes('gotram') && (
            <ToggleGroup label="Gotram" on={x.gotram.enabled} onToggle={(v) => setXField('gotram', 'enabled', v)} testid="od-gotram">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bride"><input className="px-input" value={x.gotram.bride} onChange={(e) => setXField('gotram', 'bride', e.target.value)} /></Field>
                <Field label="Groom"><input className="px-input" value={x.gotram.groom} onChange={(e) => setXField('gotram', 'groom', e.target.value)} /></Field>
              </div>
            </ToggleGroup>
            )}
          </Section>
          )}

          {/* Guest FAQ (P3) — questions guests commonly ask, shown on the invitation */}
          <Section title="Guest FAQ" hint="Answer what guests always ask — parking, kids, gifts, timings. Optional.">
            <div className="space-y-3">
              {(x.faq || []).map((it, i) => (
                <div key={i} className="p-3 space-y-2" style={{ borderRadius: 'var(--px-r-btn)', border: '1.5px solid var(--px-border)' }} data-testid={`od-faq-${i}`}>
                  <input className="px-input" value={it.q} placeholder="Question — e.g. Is parking available?"
                    onChange={(e) => setX('faq', x.faq.map((f, j) => j === i ? { ...f, q: e.target.value } : f))} data-testid={`od-faq-q-${i}`} />
                  <textarea rows={2} className="px-input" value={it.a} placeholder="Answer"
                    onChange={(e) => setX('faq', x.faq.map((f, j) => j === i ? { ...f, a: e.target.value } : f))} data-testid={`od-faq-a-${i}`} />
                  <button type="button" className="text-xs" style={{ color: 'var(--px-error)' }}
                    onClick={() => setX('faq', x.faq.filter((_, j) => j !== i))} data-testid={`od-faq-del-${i}`}>Remove</button>
                </div>
              ))}
              <PxButton type="button" variant="ghost" className="text-xs"
                onClick={() => setX('faq', [...(x.faq || []), { q: '', a: '' }])} data-testid="od-faq-add">+ Add a question</PxButton>
            </div>
          </Section>

          {/* The "Anything else" box that used to sit here was removed: the
              feature-request card below it asks the same question AND takes a
              phone number, so the owner gets a lead they can act on instead of a
              note nobody is notified about. `notes` stays in the payload for the
              studio's own use. */}

          {error && <div className="px-4 py-3 text-sm" style={{ borderRadius: 'var(--px-r-btn)', background: '#FEF2F2', color: 'var(--px-error)' }}>{error}</div>}

          <PxButton type="submit" disabled={busy} className="w-full justify-center" data-testid="od-submit">
            {busy ? <><Sparkles className="w-4 h-4 animate-pulse" /> Submitting…</> : <>Complete</>}
          </PxButton>
        </form>
        )}

        {/* After paying, people realise what else they want. Carries the order id
            so the owner knows which invitation the call is about. */}
        <div className="mt-8">
          <FeatureWishForm source="order_details" orderId={orderId} />
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs mb-2" style={{ color: 'var(--px-muted)', fontWeight: 500 }}>{label}</label>
    {children}
  </div>
);
const Section = ({ title, hint, children }) => (
  <PxCard className="p-6 space-y-4">
    <div>
      <h2 style={{ fontFamily: 'var(--px-font-display)', fontSize: 18, fontWeight: 500, color: 'var(--px-ink)', margin: 0 }}>{title}</h2>
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--px-faint)' }}>{hint}</p>}
    </div>
    {children}
  </PxCard>
);
const PresetText = ({ label, presets, value, onChange, testid }) => (
  <Field label={label}>
    <div className="flex flex-wrap gap-2 mb-2">
      {presets.map((p, i) => (
        <button key={i} type="button" onClick={() => onChange(p)} className="px-2.5 py-1 rounded-full text-[11px]"
          style={{ border: '1.5px solid var(--px-border)', color: 'var(--px-muted)', background: '#fff' }} data-testid={`${testid}-preset-${i}`}>
          Use suggestion {i + 1}
        </button>
      ))}
    </div>
    <textarea rows={3} className="px-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Write your own, or pick a suggestion above." data-testid={testid} />
  </Field>
);
const ToggleGroup = ({ label, on, onToggle, testid, children }) => (
  <div className="p-3" style={{ borderRadius: 'var(--px-r-btn)', border: '1.5px solid var(--px-border)' }}>
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: 'var(--px-ink)' }}>{label}</span>
      <button type="button" onClick={() => onToggle(!on)} className="relative w-11 h-6 rounded-full transition-colors" data-testid={`${testid}-toggle`}
        style={{ background: on ? 'var(--px-primary)' : 'var(--px-border)' }}>
        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? '22px' : '2px' }} />
      </button>
    </div>
    {on && <div className="mt-3">{children}</div>}
  </div>
);

export default OrderDetailsForm;
