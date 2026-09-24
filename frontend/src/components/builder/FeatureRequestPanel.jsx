/**
 * FeatureRequestPanel.jsx — "I need something extra on my link".
 * ==============================================================
 *
 * A host who has already bought a plan can ask for a feature their plan does not
 * include — or for something we do not sell at all — without hunting for a phone
 * number. The owner reviews it in the super-admin queue, talks to them, and can grant
 * the feature straight onto this one invitation (backend: event_feature_requests.py).
 *
 * Shown in the builder after the event exists, so it is always in context: the request
 * carries the event id, and the host can see what they already asked for.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { EventService } from '../../services/eventApi';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const STATUS_COPY = {
  new: { label: 'Sent', tone: 'text-amber-600' },
  in_review: { label: 'We are looking at it', tone: 'text-amber-600' },
  approved: { label: 'Added to your link', tone: 'text-emerald-600' },
  declined: { label: 'Not possible', tone: 'text-muted-foreground' },
  closed: { label: 'Closed', tone: 'text-muted-foreground' },
};

export default function FeatureRequestPanel({ event }) {
  const eventId = event && (event.event_id || event.id);
  const eventType = (event && event.event_type) || 'ganesh_chaturthi';
  const granted = Array.isArray(event && event.granted_features) ? event.granted_features : null;

  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState([]);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState('idle');   // idle | saving | done | error
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    if (!eventId) return;
    EventService.requestCatalog(eventType).then((r) => setCatalog(r.features || [])).catch(() => {});
    EventService.listRequests(eventId).then((r) => setRows(r.requests || [])).catch(() => {});
  }, [eventId, eventType]);
  useEffect(() => { load(); }, [load]);

  if (!eventId) return null;

  // A feature the plan already grants is not something to request.
  const askable = catalog.filter((f) => !(granted && granted.includes(f.feature_key)));
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const submit = async () => {
    setErr('');
    if (picked.length === 0 && message.trim().length < 10) {
      setErr('Pick a feature, or describe what you need in a sentence.');
      return;
    }
    setState('saving');
    try {
      await EventService.createRequest(eventId, {
        feature_keys: picked, message: message.trim(), contact: contact.trim(),
      });
      setState('done'); setPicked([]); setMessage(''); load();
    } catch (ex) {
      setState('error');
      const d = ex?.response?.data?.detail;
      setErr(typeof d === 'string' ? d : 'Could not send the request. Please try again.');
    }
  };

  return (
    <div className="space-y-5" data-testid="feature-request-panel">
      <div>
        <h3 className="text-base font-medium">Need something extra on your link?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick anything below, or just describe what you have in mind. We’ll get in touch,
          agree the price with you, and switch it on for this invitation — you don’t have
          to start again.
        </p>
      </div>

      {askable.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {askable.map((f) => {
            const on = picked.includes(f.feature_key);
            return (
              <button key={f.feature_key} type="button" onClick={() => toggle(f.feature_key)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${on
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'}`}
                data-testid={`request-feature-${f.feature_key}`}>
                {on ? '✓ ' : '+ '}{f.label}
                {f.price > 0 && <span className="ml-1.5 opacity-70">≈ {inr(f.price)}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <textarea
          rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Anything else? e.g. “we want a live video stream of the evening aarti”, or “a second language for my relatives abroad”."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          data-testid="request-message" />
        <input
          value={contact} onChange={(e) => setContact(e.target.value)}
          placeholder="Best number or email to reach you (optional)"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          data-testid="request-contact" />
        {err && <p className="text-xs text-red-600">{err}</p>}
        {state === 'done' && (
          <p className="text-sm text-emerald-700" data-testid="request-sent">
            Sent — we’ll contact you shortly. You can keep editing meanwhile.
          </p>
        )}
        <button onClick={submit} disabled={state === 'saving'}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          data-testid="request-submit">
          {state === 'saving' ? 'Sending…' : 'Send request'}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Your requests</div>
          <ul className="space-y-2">
            {rows.map((r) => {
              const s = STATUS_COPY[r.status] || STATUS_COPY.new;
              return (
                <li key={r.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>
                      {(r.feature_keys || []).length > 0
                        ? (r.feature_keys || []).map((k) => {
                          const f = catalog.find((c) => c.feature_key === k);
                          return f ? f.label : k;
                        }).join(', ')
                        : 'Custom request'}
                    </span>
                    <span className={`shrink-0 text-xs ${s.tone}`}>{s.label}</span>
                  </div>
                  {r.message && <p className="mt-0.5 text-xs text-muted-foreground">“{r.message}”</p>}
                  {r.owner_note && (
                    <p className="mt-1 text-xs text-foreground/80">MAJA: {r.owner_note}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
