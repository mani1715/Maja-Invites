import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import * as weddingsApi from '@/api/weddings';
import {
  THEMES, EVENT_TYPES, LANGUAGES, SECTION_GROUPS, EXPIRY_TYPES, MAX_EVENTS,
  blankEvent, emptyWedding, fromProfile, toPayload, validateStep,
} from '@/lib/weddingSchema';
import './StudioWeddingWizard.css';

// The wedding create/edit wizard — the entry point for the entire studio
// workflow. Every other studio surface operates on the profile this page
// produces, so until it existed a photographer could not use the product at
// all (audit C1).
//
// Functionality is lifted from the legacy LuxuryProfileForm; none of its markup
// is. Layout, tokens and nav follow the frontend-v2 studio shell
// (StudioDashboard.css conventions, --mj-* tokens, RailNav + MobileNav).
//
// Save model — deliberately not "one giant POST at the end":
//   • NEW: step 1 is the minimum ProfileCreate body. Finishing it POSTs a
//     DRAFT and swaps the URL to /studio/wedding/:id/edit. Everything after
//     that is a partial PUT. A photographer who closes the tab at step 4 keeps
//     their work, and photo upload needs a profile id to attach to anyway.
//   • EDIT: every step advance PUTs the delta.
// Publishing is a separate, explicit action and only ever goes through
// POST /api/weddings/{id}/publish (see api/weddings.js for why).

const WIZARD_STEPS = [
  { id: 'couple', label: 'Couple', blurb: 'Names, date and the main venue.' },
  { id: 'story', label: 'Story & photos', blurb: 'Portraits and the words that go with them.' },
  { id: 'ceremonies', label: 'Ceremonies', blurb: 'Every function, with its own time and venue.' },
  { id: 'design', label: 'Design', blurb: 'The look of the invitation and its languages.' },
  { id: 'settings', label: 'Sections', blurb: 'What guests see, and how long the link lives.' },
  { id: 'review', label: 'Review', blurb: 'Check it over, then publish.' },
];

function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

export default function StudioWeddingWizard() {
  const { profileId: routeId } = useParams();
  const navigate = useNavigate();
  const vw = useViewportWidth();
  const isMobile = vw < 900;

  const isNew = !routeId;
  const [profileId, setProfileId] = useState(routeId || null);
  const [w, setW] = useState(emptyWedding);
  const [stepIdx, setStepIdx] = useState(0);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [publishState, setPublishState] = useState({ busy: false, error: null });
  const [serverProfile, setServerProfile] = useState(null);

  const step = WIZARD_STEPS[stepIdx];
  const headingRef = useRef(null);

  useEffect(() => {
    document.title = isNew ? 'New wedding — MAJA Studio' : 'Edit wedding — MAJA Studio';
  }, [isNew]);

  // ---------------------------------------------------------------- load
  const load = useCallback(() => {
    if (!routeId) return;
    setLoading(true);
    setLoadError(null);
    weddingsApi.get(routeId)
      .then(({ data }) => {
        setServerProfile(data);
        setW(fromProfile(data));
        setProfileId(data.id);
      })
      .catch((e) => {
        const s = e?.response?.status;
        setLoadError(
          s === 404 ? 'That wedding no longer exists, or it belongs to another studio.'
            : s === 403 ? 'You do not have access to this wedding.'
              : e?.response?.data?.detail || 'Could not load this wedding.',
        );
      })
      .finally(() => setLoading(false));
  }, [routeId]);

  useEffect(() => { load(); }, [load]);

  // Move focus to the step heading on advance — without this a keyboard user
  // stays on the (now unmounted) Next button and loses their place.
  useEffect(() => { headingRef.current?.focus(); }, [stepIdx]);

  const set = useCallback((patch) => {
    setW((prev) => ({ ...prev, ...patch }));
    setSaveError(null);
  }, []);

  const isPublished = !!(serverProfile?.status === 'PUBLISHED' || serverProfile?.is_published);

  // ---------------------------------------------------------------- save
  /** Persist the current state. Creates on first call in NEW mode, PUTs after.
   *  Returns the profile id, or null if it failed (error already surfaced). */
  const persist = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (!profileId) {
        const { data } = await weddingsApi.create(toPayload(w, { forCreate: true }));
        setProfileId(data.id);
        setServerProfile(data);
        setSavedAt(Date.now());
        // Swap to the edit URL so a refresh or a shared link resumes the draft
        // instead of starting a second blank wedding.
        navigate(`/studio/wedding/${data.id}/edit`, { replace: true });
        return data.id;
      }
      const { data } = await weddingsApi.update(profileId, toPayload(w, { forCreate: false }));
      setServerProfile(data);
      setSavedAt(Date.now());
      return profileId;
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setSaveError(
        Array.isArray(detail)
          // FastAPI 422 -> [{loc:[body,field], msg}]. Surface the first field.
          ? `${detail[0]?.loc?.slice(-1)[0] || 'A field'}: ${detail[0]?.msg || 'is invalid'}`
          : (typeof detail === 'string' && detail) || 'Could not save. Your changes are still here — try again.',
      );
      return null;
    } finally {
      setSaving(false);
    }
  }, [profileId, w, navigate]);

  const goNext = async () => {
    const e = validateStep(step.id, w);
    setErrors(e);
    if (Object.keys(e).length) return;
    const id = await persist();
    if (!id) return;
    setStepIdx((i) => Math.min(WIZARD_STEPS.length - 1, i + 1));
  };

  const goBack = () => {
    setErrors({});
    setStepIdx((i) => Math.max(0, i - 1));
  };

  const jumpTo = async (idx) => {
    if (idx === stepIdx) return;
    if (idx < stepIdx) { setErrors({}); setStepIdx(idx); return; }
    // Forward jumps still validate every step in between.
    for (let i = stepIdx; i < idx; i += 1) {
      const e = validateStep(WIZARD_STEPS[i].id, w);
      if (Object.keys(e).length) { setStepIdx(i); setErrors(e); return; }
    }
    const id = await persist();
    if (!id) return;
    setErrors({});
    setStepIdx(idx);
  };

  const saveDraftAndExit = async () => {
    const e = validateStep('couple', w);
    if (Object.keys(e).length) { setStepIdx(0); setErrors(e); return; }
    const id = await persist();
    if (id) navigate(`/studio/wedding/${id}`);
  };

  const doPublish = async () => {
    // Every step must be valid before a link goes live.
    for (let i = 0; i < WIZARD_STEPS.length; i += 1) {
      const e = validateStep(WIZARD_STEPS[i].id, w);
      if (Object.keys(e).length) { setStepIdx(i); setErrors(e); return; }
    }
    const id = await persist();
    if (!id) return;
    setPublishState({ busy: true, error: null });
    try {
      await weddingsApi.publish(id);
      navigate(`/studio/wedding/${id}`);
    } catch (e) {
      setPublishState({
        busy: false,
        error: e?.response?.data?.detail || 'Could not publish. Nothing was changed.',
      });
    }
  };

  const doUnpublish = async () => {
    if (!profileId) return;
    setPublishState({ busy: true, error: null });
    try {
      await weddingsApi.unpublish(profileId);
      const { data } = await weddingsApi.get(profileId);
      setServerProfile(data);
      setPublishState({ busy: false, error: null });
    } catch (e) {
      setPublishState({
        busy: false,
        error: e?.response?.data?.detail || 'Could not unpublish.',
      });
    }
  };

  // ---------------------------------------------------------------- render
  const shellCols = isMobile ? 'minmax(0,1fr)' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const mainPadding = vw < 400 ? '24px 16px' : (isMobile ? '28px 22px' : (vw < 1200 ? '32px 30px' : '40px 48px'));

  if (loading) {
    return (
      <WizardShell shellCols={shellCols} mainPadding={mainPadding} isMobile={isMobile}>
        <div className="wzd-skel-head" />
        <div className="wzd-skel-rail" />
        <div className="wzd-card"><div className="wzd-skel-body" /></div>
      </WizardShell>
    );
  }

  if (loadError) {
    return (
      <WizardShell shellCols={shellCols} mainPadding={mainPadding} isMobile={isMobile}>
        <div className="wzd-card wzd-card--error" role="alert">
          <h1 className="wzd-error-title">Couldn&rsquo;t open this wedding</h1>
          <p className="wzd-error-body">{loadError}</p>
          <div className="wzd-actions">
            <button type="button" className="wzd-btn wzd-btn--primary" onClick={load}>Try again</button>
            <Link className="wzd-btn wzd-btn--ghost" to="/studio/dashboard">Back to dashboard</Link>
          </div>
        </div>
      </WizardShell>
    );
  }

  const names = [w.bride_name, w.groom_name].filter(Boolean).join(' & ');

  return (
    <WizardShell shellCols={shellCols} mainPadding={mainPadding} isMobile={isMobile}>
      <header className="wzd-head">
        <div className="wzd-head-text">
          <p className="wzd-kicker">
            <Link to="/studio/dashboard" data-mj-link>Your weddings</Link>
            <span aria-hidden="true"> / </span>
            {isNew && !profileId ? 'New wedding' : (names || 'Untitled wedding')}
          </p>
          <h1 className="wzd-title">
            {isNew && !profileId ? <>Create a <span className="wzd-hl">wedding</span></> : <>Edit <span className="wzd-hl">wedding</span></>}
          </h1>
          <p className="wzd-sub">{step.blurb}</p>
        </div>
        <div className="wzd-head-side">
          {isPublished && <span className="wzd-pill wzd-pill--live">Published</span>}
          {!isPublished && profileId && <span className="wzd-pill">Draft</span>}
          <SaveState saving={saving} savedAt={savedAt} />
        </div>
      </header>

      <StepRail steps={WIZARD_STEPS} current={stepIdx} onJump={jumpTo} disabled={saving} />

      {saveError && (
        <div className="wzd-banner wzd-banner--error" role="alert">{saveError}</div>
      )}

      <div className="wzd-card">
        <h2 className="wzd-step-title" tabIndex={-1} ref={headingRef}>
          <span className="wzd-step-n">{stepIdx + 1}</span> {step.label}
        </h2>

        {step.id === 'couple' && <StepCouple w={w} set={set} errors={errors} />}
        {step.id === 'story' && (
          <StepStory w={w} set={set} errors={errors} profileId={profileId} />
        )}
        {step.id === 'ceremonies' && <StepCeremonies w={w} set={set} errors={errors} />}
        {step.id === 'design' && <StepDesign w={w} set={set} errors={errors} />}
        {step.id === 'settings' && <StepSettings w={w} set={set} errors={errors} />}
        {step.id === 'review' && (
          <StepReview
            w={w}
            serverProfile={serverProfile}
            isPublished={isPublished}
            publishState={publishState}
            onPublish={doPublish}
            onUnpublish={doUnpublish}
            onJump={jumpTo}
          />
        )}
      </div>

      <nav className="wzd-foot" aria-label="Wizard navigation">
        <button
          type="button"
          className="wzd-btn wzd-btn--ghost"
          onClick={goBack}
          disabled={stepIdx === 0 || saving}
        >
          Back
        </button>
        <div className="wzd-foot-right">
          <button
            type="button"
            className="wzd-btn wzd-btn--ghost"
            onClick={saveDraftAndExit}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save draft & exit'}
          </button>
          {stepIdx < WIZARD_STEPS.length - 1 && (
            <button
              type="button"
              className="wzd-btn wzd-btn--primary"
              onClick={goNext}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
          )}
        </div>
      </nav>
    </WizardShell>
  );
}

// ------------------------------------------------------------------ shell

function WizardShell({ children, shellCols, mainPadding, isMobile }) {
  return (
    <div className="wzd-root">
      <MobileNav panel="studio" active="Dashboard" />
      <div className="wzd-shell" style={{ gridTemplateColumns: shellCols }}>
        {!isMobile && <StudioNav active="Dashboard" />}
        <main id="main-content" className="wzd-main" style={{ padding: mainPadding }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function SaveState({ saving, savedAt }) {
  const [, force] = useState(0);
  // Re-render once a minute so "saved 2 min ago" doesn't go stale.
  useEffect(() => {
    if (!savedAt) return undefined;
    const t = setInterval(() => force((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, [savedAt]);

  if (saving) return <span className="wzd-save" aria-live="polite">Saving…</span>;
  if (!savedAt) return null;
  const mins = Math.floor((Date.now() - savedAt) / 60000);
  return (
    <span className="wzd-save" aria-live="polite">
      {mins < 1 ? 'Saved just now' : `Saved ${mins} min ago`}
    </span>
  );
}

function StepRail({ steps, current, onJump, disabled }) {
  return (
    <ol className="wzd-rail" aria-label="Steps">
      {steps.map((s, i) => {
        const state = i === current ? 'current' : i < current ? 'done' : 'todo';
        return (
          <li key={s.id} className={`wzd-rail-item wzd-rail-item--${state}`}>
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={disabled}
              aria-current={i === current ? 'step' : undefined}
            >
              <span className="wzd-rail-n">{i < current ? '✓' : i + 1}</span>
              <span className="wzd-rail-label">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ fields

function Field({ label, htmlFor, error, hint, children, wide }) {
  return (
    <div className={`wzd-field${wide ? ' wzd-field--wide' : ''}`}>
      <label className="wzd-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="wzd-hint">{hint}</p>}
      {error && <p className="wzd-err" role="alert">{error}</p>}
    </div>
  );
}

function Text({ id, value, onChange, error, ...rest }) {
  return (
    <input
      id={id}
      data-mj-field
      className={`wzd-input${error ? ' wzd-input--bad' : ''}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={error ? 'true' : undefined}
      {...rest}
    />
  );
}

function Area({ id, value, onChange, error, rows = 4, ...rest }) {
  return (
    <textarea
      id={id}
      data-mj-field
      rows={rows}
      className={`wzd-input wzd-textarea${error ? ' wzd-input--bad' : ''}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={error ? 'true' : undefined}
      {...rest}
    />
  );
}

function Toggle({ id, checked, onChange, label }) {
  return (
    <label className="wzd-toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="wzd-toggle-track" aria-hidden="true"><span className="wzd-toggle-dot" /></span>
      <span className="wzd-toggle-label">{label}</span>
    </label>
  );
}

// ------------------------------------------------------------------ steps

function StepCouple({ w, set, errors }) {
  return (
    <div className="wzd-grid">
      <Field label="Bride's name" htmlFor="f-bride" error={errors.bride_name}>
        <Text id="f-bride" value={w.bride_name} onChange={(v) => set({ bride_name: v })} error={errors.bride_name} placeholder="Divya" autoComplete="off" />
      </Field>
      <Field label="Groom's name" htmlFor="f-groom" error={errors.groom_name}>
        <Text id="f-groom" value={w.groom_name} onChange={(v) => set({ groom_name: v })} error={errors.groom_name} placeholder="Arjun" autoComplete="off" />
      </Field>

      <Field label="Wedding date" htmlFor="f-date" error={errors.event_date} hint="The main ceremony. Individual functions get their own dates in step 3.">
        <Text id="f-date" type="date" value={w.event_date} onChange={(v) => set({ event_date: v })} error={errors.event_date} />
      </Field>
      <Field label="City" htmlFor="f-city" hint="Shown under the couple's names.">
        <Text id="f-city" value={w.city} onChange={(v) => set({ city: v })} placeholder="Hyderabad" />
      </Field>

      <Field label="Main venue" htmlFor="f-venue" error={errors.venue} wide>
        <Text id="f-venue" value={w.venue} onChange={(v) => set({ venue: v })} error={errors.venue} placeholder="Sri Venkateswara Kalyana Mandapam" />
      </Field>

      <Field label="Invitation message" htmlFor="f-msg" wide hint="The line that opens the invitation. Leave blank for the design's default.">
        <Area id="f-msg" value={w.invitation_message} onChange={(v) => set({ invitation_message: v })} rows={3} placeholder="Together with our families, we invite you to celebrate our wedding." />
      </Field>

      <Field label="Bride's WhatsApp" htmlFor="f-wb" error={errors.whatsapp_bride} hint="Optional. International format.">
        <Text id="f-wb" value={w.whatsapp_bride} onChange={(v) => set({ whatsapp_bride: v })} error={errors.whatsapp_bride} placeholder="+919876543210" inputMode="tel" />
      </Field>
      <Field label="Groom's WhatsApp" htmlFor="f-wg" error={errors.whatsapp_groom} hint="Optional. International format.">
        <Text id="f-wg" value={w.whatsapp_groom} onChange={(v) => set({ whatsapp_groom: v })} error={errors.whatsapp_groom} placeholder="+919876543210" inputMode="tel" />
      </Field>
    </div>
  );
}

function StepStory({ w, set, errors, profileId }) {
  return (
    <>
      <div className="wzd-photos">
        <PhotoSlot label="Bride" profileId={profileId} url={w.bride_photo_url} onChange={(u) => set({ bride_photo_url: u })} />
        <PhotoSlot label="Groom" profileId={profileId} url={w.groom_photo_url} onChange={(u) => set({ groom_photo_url: u })} />
        <PhotoSlot label="Couple" profileId={profileId} url={w.couple_photo_url} onChange={(u) => set({ couple_photo_url: u })} />
      </div>

      <div className="wzd-grid">
        <Field label="About the bride" htmlFor="f-ba" hint="A few lines. Appears beside her portrait.">
          <Area id="f-ba" value={w.bride_about} onChange={(v) => set({ bride_about: v })} error={errors.bride_about} />
        </Field>
        <Field label="About the groom" htmlFor="f-ga" hint="A few lines. Appears beside his portrait.">
          <Area id="f-ga" value={w.groom_about} onChange={(v) => set({ groom_about: v })} error={errors.groom_about} />
        </Field>
        <Field label="About the couple" htmlFor="f-ac" wide>
          <Area id="f-ac" value={w.about_couple} onChange={(v) => set({ about_couple: v })} />
        </Field>
        <Field label="How they met" htmlFor="f-ls" wide hint="Enable the 'Love story' section in step 5 to show this.">
          <Area id="f-ls" value={w.love_story} onChange={(v) => set({ love_story: v })} rows={5} />
        </Field>
        <Field label="Family details" htmlFor="f-fd" wide hint="Parents and family named on the invitation. Enable 'Family details' in step 5 to show this.">
          <Area id="f-fd" value={w.family_details} onChange={(v) => set({ family_details: v })} />
        </Field>
      </div>
    </>
  );
}

function PhotoSlot({ label, profileId, url, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const inputRef = useRef(null);
  const inputId = `photo-${label.toLowerCase()}`;

  const pick = async (file) => {
    if (!file) return;
    if (!profileId) {
      setErr('Save step 1 first — photos attach to the saved wedding.');
      return;
    }
    if (!file.type.startsWith('image/')) { setErr('Pick an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setErr('Images must be under 10 MB.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const { data } = await weddingsApi.uploadPhoto(profileId, file, `${label} portrait`);
      onChange(data.media_url);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Upload failed. Try again.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="wzd-photo">
      <p className="wzd-photo-label">{label}</p>
      <div className="wzd-photo-frame">
        {url ? (
          <img src={url} alt={`${label} portrait`} />
        ) : (
          <span className="wzd-photo-empty">No photo yet</span>
        )}
        {busy && <span className="wzd-photo-busy">Uploading…</span>}
      </div>
      <div className="wzd-photo-actions">
        <label className="wzd-btn wzd-btn--ghost wzd-btn--sm" htmlFor={inputId}>
          {url ? 'Replace' : 'Upload'}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            className="wzd-visually-hidden"
            onChange={(e) => pick(e.target.files?.[0])}
            disabled={busy}
          />
        </label>
        {url && (
          <button type="button" className="wzd-btn wzd-btn--ghost wzd-btn--sm" onClick={() => onChange('')}>
            Remove
          </button>
        )}
      </div>
      {err && <p className="wzd-err" role="alert">{err}</p>}
    </div>
  );
}

function StepCeremonies({ w, set, errors }) {
  const usedTypes = useMemo(() => w.events.map((e) => e.event_type), [w.events]);
  const canAdd = w.events.length < MAX_EVENTS && usedTypes.length < EVENT_TYPES.length;

  const patchEvent = (i, patch) => {
    const next = w.events.map((ev, idx) => (idx === i ? { ...ev, ...patch } : ev));
    set({ events: next });
  };
  const removeEvent = (i) => set({ events: w.events.filter((_, idx) => idx !== i) });
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= w.events.length) return;
    const next = [...w.events];
    [next[i], next[j]] = [next[j], next[i]];
    set({ events: next });
  };

  return (
    <>
      {errors._events && <div className="wzd-banner wzd-banner--error" role="alert">{errors._events}</div>}

      {w.events.length === 0 && (
        <div className="wzd-empty">
          <p className="wzd-empty-title">No ceremonies yet</p>
          <p className="wzd-empty-body">
            Add each function guests are invited to — haldi, mehendi, sangeet, the
            marriage itself, the reception. Each one gets its own date, time and venue
            on the invitation. You can skip this and add them later.
          </p>
        </div>
      )}

      {w.events.map((ev, i) => (
        <fieldset className="wzd-event" key={ev.event_id || i}>
          <legend className="wzd-event-legend">Ceremony {i + 1}</legend>
          <div className="wzd-event-bar">
            <div className="wzd-event-order">
              <button type="button" className="wzd-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ceremony ${i + 1} earlier`}>↑</button>
              <button type="button" className="wzd-icon-btn" onClick={() => move(i, 1)} disabled={i === w.events.length - 1} aria-label={`Move ceremony ${i + 1} later`}>↓</button>
            </div>
            <Toggle id={`ev-vis-${i}`} checked={ev.visible} onChange={(v) => patchEvent(i, { visible: v })} label="Visible to guests" />
            <button type="button" className="wzd-btn wzd-btn--danger wzd-btn--sm" onClick={() => removeEvent(i)}>
              Remove
            </button>
          </div>

          <div className="wzd-grid">
            <Field label="Type" htmlFor={`ev-type-${i}`} error={errors[`event_${i}_type`]}>
              <select
                id={`ev-type-${i}`}
                data-mj-field
                className="wzd-input"
                value={ev.event_type}
                onChange={(e) => {
                  const t = EVENT_TYPES.find((x) => x.id === e.target.value);
                  // Keep the name in step with the type unless it was customised.
                  const wasDefault = EVENT_TYPES.some((x) => x.label === ev.name);
                  patchEvent(i, { event_type: e.target.value, ...(wasDefault ? { name: t?.label || ev.name } : {}) });
                }}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.id} value={t.id} disabled={usedTypes.includes(t.id) && t.id !== ev.event_type}>
                    {t.label}{usedTypes.includes(t.id) && t.id !== ev.event_type ? ' (already used)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Display name" htmlFor={`ev-name-${i}`} error={errors[`event_${i}_name`]}>
              <Text id={`ev-name-${i}`} value={ev.name} onChange={(v) => patchEvent(i, { name: v })} error={errors[`event_${i}_name`]} />
            </Field>

            <Field label="Date" htmlFor={`ev-date-${i}`} error={errors[`event_${i}_date`]}>
              <Text id={`ev-date-${i}`} type="date" value={ev.date} onChange={(v) => patchEvent(i, { date: v })} error={errors[`event_${i}_date`]} />
            </Field>
            <div className="wzd-field wzd-field--split">
              <Field label="Starts" htmlFor={`ev-st-${i}`} error={errors[`event_${i}_start_time`]}>
                <Text id={`ev-st-${i}`} type="time" value={ev.start_time} onChange={(v) => patchEvent(i, { start_time: v })} error={errors[`event_${i}_start_time`]} />
              </Field>
              <Field label="Ends" htmlFor={`ev-et-${i}`} error={errors[`event_${i}_end_time`]} hint="Optional">
                <Text id={`ev-et-${i}`} type="time" value={ev.end_time} onChange={(v) => patchEvent(i, { end_time: v })} error={errors[`event_${i}_end_time`]} />
              </Field>
            </div>

            <Field label="Venue name" htmlFor={`ev-vn-${i}`} error={errors[`event_${i}_venue_name`]}>
              <Text id={`ev-vn-${i}`} value={ev.venue_name} onChange={(v) => patchEvent(i, { venue_name: v })} error={errors[`event_${i}_venue_name`]} />
            </Field>
            <Field label="Google Maps link" htmlFor={`ev-ml-${i}`} hint="Optional, but guests will ask for it.">
              <Text id={`ev-ml-${i}`} value={ev.map_link} onChange={(v) => patchEvent(i, { map_link: v })} placeholder="https://maps.app.goo.gl/…" inputMode="url" />
            </Field>

            <Field label="Venue address" htmlFor={`ev-va-${i}`} error={errors[`event_${i}_venue_address`]} wide>
              <Text id={`ev-va-${i}`} value={ev.venue_address} onChange={(v) => patchEvent(i, { venue_address: v })} error={errors[`event_${i}_venue_address`]} />
            </Field>

            <Field
              label="Note for guests"
              htmlFor={`ev-desc-${i}`}
              error={errors[`event_${i}_description`]}
              wide
              hint={`${(ev.description || '').length}/500`}
            >
              <Area id={`ev-desc-${i}`} rows={3} value={ev.description} onChange={(v) => patchEvent(i, { description: v })} error={errors[`event_${i}_description`]} maxLength={500} />
            </Field>
          </div>
        </fieldset>
      ))}

      <button
        type="button"
        className="wzd-btn wzd-btn--ghost wzd-add"
        onClick={() => set({ events: [...w.events, blankEvent(usedTypes)] })}
        disabled={!canAdd}
      >
        + Add a ceremony
      </button>
      {!canAdd && (
        <p className="wzd-hint">
          {w.events.length >= MAX_EVENTS
            ? `That's the maximum of ${MAX_EVENTS} ceremonies.`
            : 'Every ceremony type is already in use.'}
        </p>
      )}
    </>
  );
}

function StepDesign({ w, set, errors }) {
  const toggleLang = (id) => {
    const has = w.enabled_languages.includes(id);
    const next = has ? w.enabled_languages.filter((l) => l !== id) : [...w.enabled_languages, id];
    set({ enabled_languages: next, language: next });
  };

  return (
    <>
      <p className="wzd-section-label" id="design-label">Invitation design</p>
      {errors.design_id && <p className="wzd-err" role="alert">{errors.design_id}</p>}
      <div className="wzd-themes" role="radiogroup" aria-labelledby="design-label">
        {THEMES.map((t) => {
          const on = w.design_id === t.id;
          return (
            <button
              type="button"
              key={t.id}
              role="radio"
              aria-checked={on}
              className={`wzd-theme${on ? ' wzd-theme--on' : ''}`}
              onClick={() => set({ design_id: t.id })}
            >
              <span className={`wzd-theme-swatch wzd-sw-${t.id}`} aria-hidden="true" />
              <span className="wzd-theme-name">{t.label}</span>
              <span className="wzd-theme-hint">{t.hint}</span>
            </button>
          );
        })}
      </div>

      <p className="wzd-section-label" id="lang-label">Languages</p>
      <p className="wzd-hint wzd-hint--block">
        Guests can switch between the languages you enable. English is a safe default;
        add the family&rsquo;s language if you have the translations.
      </p>
      {errors.enabled_languages && <p className="wzd-err" role="alert">{errors.enabled_languages}</p>}
      <div className="wzd-chips" role="group" aria-labelledby="lang-label">
        {LANGUAGES.map((l) => {
          const on = w.enabled_languages.includes(l.id);
          return (
            <button
              type="button"
              key={l.id}
              className={`wzd-chip${on ? ' wzd-chip--on' : ''}`}
              aria-pressed={on}
              onClick={() => toggleLang(l.id)}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function StepSettings({ w, set, errors }) {
  const setSection = (key, val) =>
    set({ sections_enabled: { ...w.sections_enabled, [key]: val } });

  return (
    <>
      <p className="wzd-section-label">Sections on the invitation</p>
      <p className="wzd-hint wzd-hint--block">
        Turn off anything you are not using — an empty section still takes up
        scroll on a phone.
      </p>

      {SECTION_GROUPS.map((g) => (
        <div className="wzd-sec-group" key={g.title}>
          <p className="wzd-sec-title">{g.title}</p>
          <div className="wzd-sec-items">
            {g.items.map(([key, label]) => (
              <Toggle
                key={key}
                id={`sec-${key}`}
                checked={w.sections_enabled[key]}
                onChange={(v) => setSection(key, v)}
                label={label}
              />
            ))}
          </div>
        </div>
      ))}

      <p className="wzd-section-label">Extras</p>
      <div className="wzd-grid">
        <Field label="Parking guidance" htmlFor="f-park" wide hint="Free text shown on the venue card.">
          <Area id="f-park" rows={2} value={w.parking_info} onChange={(v) => set({ parking_info: v })} />
        </Field>
        <Field label="Live stream URL" htmlFor="f-yt" wide hint="YouTube link. Enable 'Live stream' above to show it.">
          <Text id="f-yt" value={w.youtube_live_url} onChange={(v) => set({ youtube_live_url: v })} placeholder="https://youtube.com/live/…" inputMode="url" />
        </Field>
      </div>

      <p className="wzd-section-label">Link lifetime</p>
      <div className="wzd-grid">
        <Field label="Expires" htmlFor="f-exp">
          <select
            id="f-exp"
            data-mj-field
            className="wzd-input"
            value={w.link_expiry_type}
            onChange={(e) => set({ link_expiry_type: e.target.value })}
          >
            {EXPIRY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        {w.link_expiry_type === 'days' && (
          <Field label="Days" htmlFor="f-expv" error={errors.link_expiry_value} hint="Counted from today.">
            <Text id="f-expv" type="number" min="1" value={w.link_expiry_value} onChange={(v) => set({ link_expiry_value: v })} error={errors.link_expiry_value} />
          </Field>
        )}
      </div>
    </>
  );
}

function StepReview({ w, serverProfile, isPublished, publishState, onPublish, onUnpublish, onJump }) {
  const names = [w.bride_name, w.groom_name].filter(Boolean).join(' & ') || 'Untitled';
  const dateStr = w.event_date
    ? new Date(`${w.event_date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const theme = THEMES.find((t) => t.id === w.design_id);
  const liveSections = SECTION_GROUPS
    .flatMap((g) => g.items)
    .filter(([k]) => w.sections_enabled[k])
    .map(([, label]) => label);
  const slug = serverProfile?.slug;
  const inviteHref = slug ? `/invite/${slug}` : null;

  return (
    <>
      <dl className="wzd-review">
        <ReviewRow label="Couple" value={names} onEdit={() => onJump(0)} />
        <ReviewRow label="Date" value={dateStr} onEdit={() => onJump(0)} />
        <ReviewRow label="Venue" value={[w.venue, w.city].filter(Boolean).join(', ') || '—'} onEdit={() => onJump(0)} />
        <ReviewRow
          label="Portraits"
          value={['bride_photo_url', 'groom_photo_url', 'couple_photo_url'].filter((k) => w[k]).length + ' of 3 uploaded'}
          onEdit={() => onJump(1)}
        />
        <ReviewRow
          label="Ceremonies"
          value={w.events.length ? w.events.map((e) => e.name).join(' · ') : 'None added'}
          onEdit={() => onJump(2)}
        />
        <ReviewRow label="Design" value={theme?.label || w.design_id} onEdit={() => onJump(3)} />
        <ReviewRow
          label="Languages"
          value={w.enabled_languages.map((id) => LANGUAGES.find((l) => l.id === id)?.label || id).join(', ')}
          onEdit={() => onJump(3)}
        />
        <ReviewRow label="Sections on" value={`${liveSections.length} enabled`} onEdit={() => onJump(4)} />
        <ReviewRow
          label="Link expiry"
          value={w.link_expiry_type === 'never' ? 'Never' : w.link_expiry_type === 'days' ? `${w.link_expiry_value} days` : 'Fixed date'}
          onEdit={() => onJump(4)}
        />
        {slug && (
          <div className="wzd-review-row">
            <dt>Public link</dt>
            <dd>
              <a href={inviteHref} target="_blank" rel="noreferrer" data-mj-link>
                /invite/{slug}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {publishState.error && (
        <div className="wzd-banner wzd-banner--error" role="alert">{publishState.error}</div>
      )}

      <div className="wzd-publish">
        {isPublished ? (
          <>
            <div>
              <p className="wzd-publish-title">This invitation is live.</p>
              <p className="wzd-publish-body">
                Guests with the link can open it right now. Unpublishing takes it
                offline without deleting anything.
              </p>
            </div>
            <button type="button" className="wzd-btn wzd-btn--ghost" onClick={onUnpublish} disabled={publishState.busy}>
              {publishState.busy ? 'Working…' : 'Unpublish'}
            </button>
          </>
        ) : (
          <>
            <div>
              <p className="wzd-publish-title">Ready to go live?</p>
              <p className="wzd-publish-body">
                Publishing makes the link openable by anyone who has it. You can
                keep editing afterwards, and unpublish at any time.
              </p>
            </div>
            <button type="button" className="wzd-btn wzd-btn--primary" onClick={onPublish} disabled={publishState.busy}>
              {publishState.busy ? 'Publishing…' : 'Publish invitation'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function ReviewRow({ label, value, onEdit }) {
  return (
    <div className="wzd-review-row">
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        <button type="button" className="wzd-review-edit" onClick={onEdit}>Edit</button>
      </dd>
    </div>
  );
}
