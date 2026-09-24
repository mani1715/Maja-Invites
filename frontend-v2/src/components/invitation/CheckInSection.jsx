import { useState } from 'react';
import { checkIn } from '@/api/invitations';

// CheckInSection — "I've arrived" for guests at the venue. Live API:
// POST /api/invite/{slug}/check-in (server 403s if sections_enabled.check_in
// is off, so `enabled` here mirrors that gate rather than trusting it alone).
export default function CheckInSection({ slug, enabled, events, preview }) {
  const [form, setForm] = useState({ guest_name: '', guest_phone: '', event_id: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [previewNote, setPreviewNote] = useState(false);

  if (!enabled) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (preview) { setPreviewNote(true); return; }
    setErr('');
    setBusy(true);
    try {
      await checkIn(slug, {
        guest_name: form.guest_name.trim(),
        guest_phone: form.guest_phone.trim() || undefined,
        event_id: form.event_id || undefined,
      });
      setDone(true);
    } catch (e2) {
      setErr(e2.response?.data?.detail || 'Could not check in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gi-section" data-reveal>
      <p className="gi-eyebrow">I&rsquo;m here</p>
      <h2 className="gi-split-title gi-checkin-title">Made it? Let the couple know.</h2>

      {done ? (
        <p className="gi-rsvp-success" style={{ textAlign: 'center' }}>
          <span style={{ display: 'block', fontFamily: 'var(--inv-font-display, var(--mj-font-display))', fontSize: 22, marginBottom: 8 }}>You&rsquo;re checked in.</span>
          Thanks for letting them know you&rsquo;ve arrived.
        </p>
      ) : (
        <form onSubmit={submit} className="gi-checkin-form">
          <input className="gi-rsvp-field" placeholder="Your name" required value={form.guest_name}
            onChange={(e) => setForm({ ...form, guest_name: e.target.value })} />
          <input className="gi-rsvp-field" type="tel" placeholder="Phone (optional)" value={form.guest_phone}
            onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} />
          {events?.length > 0 && (
            <select className="gi-rsvp-field" value={form.event_id} aria-label="Event"
              onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
              <option value="">— Pick an event (optional) —</option>
              {events.map((ev) => (
                <option key={ev.event_id} value={ev.event_id}>{ev.name || ev.event_type}</option>
              ))}
            </select>
          )}
          {err && <p className="gi-rsvp-error">{err}</p>}
          {previewNote && <p className="gi-preview-note">This is a sample invitation — nothing you send here is recorded.</p>}
          <button type="submit" className="mj-btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Checking in…' : "I've arrived"}
          </button>
        </form>
      )}
    </section>
  );
}
