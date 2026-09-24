import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getOrder, submitOrderInfo, saveOrderInfoDraft } from '@/api/store';
import './buyer-shared.css';
import './OrderDetails.css';

// Ported from "MAJA Order Details Form.dc.html". Collected fields map onto the
// legacy OrderInfoRequest key names (bride_name/groom_name/event_date/venue/
// city/phone/notes + a free-form `extra` dict) so the studio's existing
// fulfillment console — which already reads those exact keys — keeps working
// unchanged; this form just collects a smaller slice of `extra` than the
// legacy full form does (no photo uploads / ceremony-type picker in this DC
// design), plus `city`/`phone` which the DC mock omitted but the studio needs
// to actually reach the buyer about the build.
const EMPTY_FORM = {
  bride_name: '', groom_name: '', event_date: '', venue: '', city: '', phone: '', notes: '',
  extra: {
    venue_google_map_link: '',
    parking: { enabled: false, text: '', google_map_link: '' },
    bride_father: '', bride_mother: '', groom_father: '', groom_mother: '',
    background_music_url: '',
    shagun: { enabled: false, upi_id: '', message: '' },
    accepting_gifts: false,
    faq: [],
  },
};

const DRAFT_DEBOUNCE_MS = 2000;

export default function OrderDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [resumePrompt, setResumePrompt] = useState(null);
  const [savedTag, setSavedTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(null); // submit response, once complete
  const loadedRef = useRef(false);

  const load = useCallback(() => {
    setLoadState('loading');
    getOrder(orderId).then(({ data }) => {
      setOrder(data);
      if (data.info) {
        // Already submitted once — load the buyer's own current values, no
        // "resume" question, they're just editing what they already told us.
        setForm((f) => ({ ...f, ...data.info, extra: { ...f.extra, ...(data.info.extra || {}) } }));
      } else if (data.info_draft) {
        setResumePrompt(data.info_draft);
      }
      setLoadState('ready');
      loadedRef.current = true;
    }).catch(() => setLoadState('error'));
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Autosave draft, debounced — only once the order has loaded and only while
  // the buyer is actually allowed to edit.
  useEffect(() => {
    if (!loadedRef.current || !order?.edit_state?.can_edit || done) return;
    const t = setTimeout(() => {
      saveOrderInfoDraft(orderId, form)
        .then(() => { setSavedTag('Saved'); setTimeout(() => setSavedTag(''), 1200); })
        .catch(() => {});
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [form, orderId, order, done]);

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const setX = (k, v) => setForm((s) => ({ ...s, extra: { ...s.extra, [k]: v } }));
  const setXField = (group, k, v) => setForm((s) => ({ ...s, extra: { ...s.extra, [group]: { ...s.extra[group], [k]: v } } }));

  const acceptResume = () => {
    setForm((f) => ({ ...f, ...resumePrompt, extra: { ...f.extra, ...(resumePrompt.extra || {}) } }));
    setResumePrompt(null);
  };

  const faqQ = form.extra.faq[0]?.q || '';
  const faqA = form.extra.faq[0]?.a || '';
  const setFaq = (q, a) => setX('faq', (q || a) ? [{ q, a }] : []);

  const REQUIRED = [
    ['od-bride', form.bride_name, "the bride's name"],
    ['od-groom', form.groom_name, "the groom's name"],
    ['od-date', form.event_date, 'the wedding date'],
    ['od-phone', form.phone, 'a phone number'],
  ];

  const submit = async (e) => {
    e.preventDefault();
    for (const [testid, val, label] of REQUIRED) {
      if (!String(val || '').trim()) {
        setSubmitError(`Please fill in ${label}.`);
        document.querySelector(`[data-testid="${testid}"]`)?.focus();
        return;
      }
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const { data } = await submitOrderInfo(orderId, form);
      setDone(data);
    } catch (err) {
      setSubmitError(err.response?.data?.detail || 'Could not submit your details. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadState === 'loading') {
    return <div className="mjWashLite mj-buyer-page od-status"><p className="mj-buyer-loading">Loading your order…</p></div>;
  }
  if (loadState === 'error') {
    return (
      <div className="mjWashLite mj-buyer-page od-status">
        <p className="mj-buyer-error">Couldn't load this order. <button type="button" className="cart-retry" onClick={load}>Try again</button></p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mjWashLite mj-buyer-page od-status" data-testid="order-details-done">
        <div className="mjGlass od-done-card">
          <h1 className="mj-buyer-h1" style={{ margin: '0 0 12px' }}>Thank you!</h1>
          <p style={{ fontSize: 14, color: 'var(--mj-ink)', margin: '0 0 24px' }}>
            {done.message || "We've received your details. Our studio will craft your invitation and share the live link soon."}
          </p>
          <Link to="/" className="mj-buyer-btn-primary" style={{ display: 'inline-flex' }}>Back to MAJA Invites</Link>
        </div>
      </div>
    );
  }

  const editState = order?.edit_state;
  const w = form.extra;

  return (
    <div className="mjWashLite mj-buyer-page" data-testid="order-details-form">
      <div className="mjRipple" aria-hidden="true" style={{ zIndex: -1 }} />

      <nav className="mjGlass mj-buyer-nav">
        <Link to="/" className="mj-buyer-brand">
          <span className="mj-buyer-brand-mark">M</span>
          <span className="mj-buyer-brand-name">MAJA Invites</span>
        </Link>
      </nav>

      {resumePrompt && (
        <div className="od-resume-banner">
          <p className="od-resume-copy">Resume your previous invitation? We saved your earlier details.</p>
          <div className="od-resume-actions">
            <button type="button" className="mj-buyer-btn-primary od-resume-btn" onClick={acceptResume} data-testid="od-resume-yes">Resume</button>
            <button type="button" className="od-resume-dismiss" onClick={() => setResumePrompt(null)} data-testid="od-resume-no">Start fresh</button>
          </div>
        </div>
      )}

      <div className="od-body">
        <h1 className="mj-buyer-h1" style={{ marginBottom: 6 }}>Tell us about<br /><span style={{ color: 'var(--mj-primary)' }}>your wedding</span></h1>
        <p className="od-lede">We'll build your invitation from these details.</p>

        {editState && !editState.can_edit ? (
          <div className="mj-buyer-card od-locked" data-testid="od-locked">
            <h2 className="cart-item-name" style={{ fontSize: 20, marginBottom: 8 }}>{editState.delivered ? 'Editing is closed' : 'Not editable yet'}</h2>
            <p style={{ fontSize: 13.5, color: 'var(--mj-muted)', marginBottom: 16 }}>{editState.reason}</p>
            {editState.whatsapp_number ? (
              <a className="mj-buyer-btn-primary" style={{ display: 'inline-flex' }}
                href={`https://wa.me/${editState.whatsapp_number}?text=${encodeURIComponent(`Hi MAJA Invites, I'd like to request changes to my invitation (order ${orderId}).`)}`}
                target="_blank" rel="noreferrer" data-testid="od-whatsapp">
                Contact us on WhatsApp for changes
              </a>
            ) : (
              <p className="mj-buyer-hint">Please contact our team for any changes.</p>
            )}
          </div>
        ) : (
        <form onSubmit={submit}>
          {savedTag && <p className="od-saved-tag">{savedTag}</p>}

          <Section title="The couple">
            <Field label="Groom’s full name"><input data-mj-field className="od-input" placeholder="Arjun Sharma" value={form.groom_name} onChange={set('groom_name')} data-testid="od-groom" /></Field>
            <Field label="Bride’s full name"><input data-mj-field className="od-input" placeholder="Priya Kapoor" value={form.bride_name} onChange={set('bride_name')} data-testid="od-bride" /></Field>
          </Section>

          <Section title="When & where">
            <Field label="Wedding date"><input data-mj-field type="date" className="od-input" value={form.event_date} onChange={set('event_date')} data-testid="od-date" /></Field>
            <Field label="Venue name"><input data-mj-field className="od-input" placeholder="Taj Falaknuma Palace" value={form.venue} onChange={set('venue')} data-testid="od-venue" /></Field>
            <Field label="Map link"><input data-mj-field className="od-input" placeholder="https://maps.google.com/…" value={w.venue_google_map_link} onChange={(e) => setX('venue_google_map_link', e.target.value)} data-testid="od-venue-map" /></Field>
            <Field label="Directions & parking"><input data-mj-field className="od-input" placeholder="Park at the east gate, valet available" value={w.parking.text} onChange={(e) => setXField('parking', 'text', e.target.value)} data-testid="od-parking" /></Field>
            <Field label="City"><input data-mj-field className="od-input" placeholder="Hyderabad" value={form.city} onChange={set('city')} data-testid="od-city" /></Field>
            <Field label="Your phone number"><input data-mj-field className="od-input" placeholder="10-digit mobile number" inputMode="tel" value={form.phone} onChange={set('phone')} data-testid="od-phone" /></Field>
          </Section>

          <Section title="With the blessings of our families">
            <Field label="Groom’s father"><input data-mj-field className="od-input" placeholder="Mr. Anand Sharma" value={w.groom_father} onChange={(e) => setX('groom_father', e.target.value)} data-testid="od-groom-father" /></Field>
            <Field label="Groom’s mother"><input data-mj-field className="od-input" placeholder="Mrs. Rekha Sharma" value={w.groom_mother} onChange={(e) => setX('groom_mother', e.target.value)} data-testid="od-groom-mother" /></Field>
            <Field label="Bride’s father"><input data-mj-field className="od-input" placeholder="Mr. Vikram Kapoor" value={w.bride_father} onChange={(e) => setX('bride_father', e.target.value)} data-testid="od-bride-father" /></Field>
            <Field label="Bride’s mother"><input data-mj-field className="od-input" placeholder="Mrs. Meera Kapoor" value={w.bride_mother} onChange={(e) => setX('bride_mother', e.target.value)} data-testid="od-bride-mother" /></Field>
          </Section>

          <Section title="Background music & films" full>
            <Field label="Music or film link"><input data-mj-field className="od-input" placeholder="https://youtube.com/live/…" value={w.background_music_url} onChange={(e) => setX('background_music_url', e.target.value)} data-testid="od-music" /></Field>
          </Section>

          <Section title="Gifts & digital shagun">
            <Field label="UPI ID"><input data-mj-field className="od-input" placeholder="name@upi" value={w.shagun.upi_id}
              onChange={(e) => setForm((s) => ({ ...s, extra: { ...s.extra, shagun: { ...s.extra.shagun, upi_id: e.target.value, enabled: !!e.target.value }, accepting_gifts: !!e.target.value } }))}
              data-testid="od-upi" /></Field>
            <Field label="Message with the gift"><input data-mj-field className="od-input" placeholder="Bless our new beginning" value={w.shagun.message} onChange={(e) => setXField('shagun', 'message', e.target.value)} data-testid="od-gift-message" /></Field>
          </Section>

          <Section title="Guest FAQ">
            <Field label="Question"><input data-mj-field className="od-input" placeholder="Is parking available?" value={faqQ} onChange={(e) => setFaq(e.target.value, faqA)} data-testid="od-faq-q" /></Field>
            <Field label="Answer"><input data-mj-field className="od-input" placeholder="Yes, free valet at the east gate." value={faqA} onChange={(e) => setFaq(faqQ, e.target.value)} data-testid="od-faq-a" /></Field>
          </Section>

          {submitError && <div className="mj-buyer-error" data-testid="od-error">{submitError}</div>}

          <button type="submit" className="mj-buyer-btn-primary od-submit" disabled={submitting} data-testid="od-submit">
            {submitting && <span className="mj-buyer-spinner" />}
            {submitting ? 'Submitting…' : 'Complete'}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <label className="od-field">
    <span className="od-field-label">{label}</span>
    {children}
  </label>
);

const Section = ({ title, full, children }) => (
  <div className="mj-buyer-card od-section">
    <h3 className="cart-summary-title" style={{ marginBottom: 18 }}>{title}</h3>
    <div className={full ? 'od-fields-1' : 'od-fields-2'}>{children}</div>
  </div>
);
