import { useCallback, useEffect, useState } from 'react';
import * as api from '@/api/pixora';
import {
  Section, Stats, Empty, Loading, ErrorNote, Rows, Pill, Toast, Field, Trend, Segments,
  PlanGate, useAsync, useFlash, inr,
} from './PixoraShell';

// Studio Tools — the six panels the legacy IA listed under this group:
// CRM · AI Review · AI Assistant · Analytics · Pricing Intelligence · Client Management.
//
// Every field name, status vocabulary, endpoint and derived number below was
// read out of the legacy PixoraCommunity implementation. The legacy "Analytics"
// tab stacked eight separate workbenches on one scroll; the workbenches are all
// still here, reached through a segmented control instead.

const num = new Intl.NumberFormat('en-IN');
const dt = (v) => (v ? new Date(v).toLocaleString('en-IN') : '');

// ══════════════════════════════════════════════════════════════════════ CRM

const CRM_STATUSES = ['lead', 'contacted', 'quoted', 'booked', 'shooting', 'delivered', 'completed', 'lost'];
const CRM_STAGES = ['inquiry', 'meeting', 'quotation', 'booking', 'shoot', 'delivery', 'review', 'repeat'];
const PAYMENT_STATES = ['unpaid', 'advance', 'partial', 'paid'];
const CONTRACT_STATES = ['none', 'sent', 'signed'];
const CRM_BLANK = {
  name: '', phone: '', email: '', event_type: '', event_date: '', status: 'lead',
  budget_inr: '', payment_status: 'unpaid', contract_status: 'none', notes: '', follow_up_date: '',
};

const statusTone = (s) => {
  if (s === 'completed' || s === 'booked' || s === 'delivered') return 'good';
  if (s === 'lost') return 'bad';
  if (s === 'quoted' || s === 'shooting') return 'warn';
  return 'neutral';
};

export function Crm() {
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(CRM_BLANK);
  const [selId, setSelId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lock, setLock] = useState('');
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.crmClients(filter ? { status: filter } : {}).then((r) => r.data),
      api.crmFollowups().then((r) => r.data).catch(() => ({})),
    ]).then(([cl, fu]) => ({ cl, fu })),
    [filter],
  );

  const clients = data?.cl?.clients || [];
  const counts = data?.cl?.counts || {};
  const fu = data?.fu || {};
  const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Reading the CRM is free; only adding a client is plan-gated, so the gate
  // is raised where it actually bites rather than over the whole panel.
  const create = async () => {
    if (!form.name.trim()) { flash('A client needs a name.'); return; }
    setSaving(true);
    try {
      await api.createCrmClient({ ...form, budget_inr: Number(form.budget_inr) || 0 });
      setForm(CRM_BLANK);
      setAdding(false);
      flash('Client added.');
      reload();
    } catch (e) {
      if (e?.response?.status === 403) setLock(e.response.data?.detail || '');
      else flash(e?.response?.data?.detail || 'Could not add that client.');
    } finally { setSaving(false); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section
        title="Client CRM"
        sub={`${total} client${total === 1 ? '' : 's'} — leads, bookings and follow-ups in one ledger.`}
        actions={(
          <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cancel' : 'Add client'}
          </button>
        )}
      >
        {adding && lock ? (
          <PlanGate what="Adding CRM clients" message={lock} />
        ) : adding ? (
          <div className="pxc-formgrid">
            <Field label="Client name" htmlFor="crm-name">
              <input id="crm-name" className="pxc-input" value={form.name} onChange={set('name')} placeholder="Who is the booking for?" />
            </Field>
            <Field label="Phone" htmlFor="crm-phone">
              <input id="crm-phone" className="pxc-input" value={form.phone} onChange={set('phone')} inputMode="tel" />
            </Field>
            <Field label="Email" htmlFor="crm-email">
              <input id="crm-email" className="pxc-input" type="email" value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Event type" htmlFor="crm-type" hint="Wedding, Haldi, Reception…">
              <input id="crm-type" className="pxc-input" value={form.event_type} onChange={set('event_type')} />
            </Field>
            <Field label="Event date" htmlFor="crm-date">
              <input id="crm-date" className="pxc-input" type="date" value={form.event_date} onChange={set('event_date')} />
            </Field>
            <Field label="Budget (₹)" htmlFor="crm-budget">
              <input id="crm-budget" className="pxc-input" type="number" min="0" value={form.budget_inr} onChange={set('budget_inr')} />
            </Field>
            <Field label="Status" htmlFor="crm-status">
              <select id="crm-status" className="pxc-input" value={form.status} onChange={set('status')}>
                {CRM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Follow-up date" htmlFor="crm-fu" hint="Shows up in your due list.">
              <input id="crm-fu" className="pxc-input" type="date" value={form.follow_up_date} onChange={set('follow_up_date')} />
            </Field>
            <Field label="Notes" htmlFor="crm-notes" wide>
              <textarea id="crm-notes" className="pxc-input" rows={2} value={form.notes} onChange={set('notes')} />
            </Field>
            <div className="pxc-field pxc-field--wide">
              <button type="button" className="pxc-btn pxc-btn--primary" onClick={create} disabled={saving}>
                {saving ? 'Saving…' : 'Save client'}
              </button>
            </div>
          </div>
        ) : (
          <div className="pxc-chips">
            <button type="button" className={`pxc-chip${!filter ? ' pxc-chip--on' : ''}`} onClick={() => setFilter('')}>
              All ({total})
            </button>
            {CRM_STATUSES.filter((s) => counts[s]).map((s) => (
              <button key={s} type="button" className={`pxc-chip${filter === s ? ' pxc-chip--on' : ''}`} onClick={() => setFilter(s)}>
                {s} ({counts[s]})
              </button>
            ))}
          </div>
        )}
      </Section>

      {(fu.count > 0 || (fu.top_leads || []).length > 0) && (
        <Section title="Lead management" sub="What the CRM thinks you should touch today.">
          {fu.count > 0 && (
            <>
              <p className="pxc-label">
                Follow-ups due
                {fu.overdue_count > 0 && <> · <span style={{ color: 'var(--mj-error-text)' }}>{fu.overdue_count} overdue</span></>}
              </p>
              <div className="pxc-chips" style={{ marginBottom: 16 }}>
                {(fu.followups || []).slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`pxc-chip${c.overdue ? ' pxc-chip--alert' : ''}`}
                    onClick={() => setSelId(c.id)}
                  >
                    {c.name} · {c.follow_up_date}{c.overdue ? ' (overdue)' : ''}
                  </button>
                ))}
              </div>
            </>
          )}
          {(fu.top_leads || []).length > 0 && (
            <>
              <p className="pxc-label">Priority leads</p>
              <div className="pxc-chips">
                {fu.top_leads.map((c) => (
                  <button key={c.id} type="button" className="pxc-chip" onClick={() => setSelId(c.id)}>
                    {c.name} · {c.priority}
                  </button>
                ))}
              </div>
            </>
          )}
        </Section>
      )}

      <Section title={filter ? `Clients · ${filter}` : 'All clients'} flush>
        <div style={{ padding: 18 }}>
          {clients.length === 0 ? (
            <Empty
              title="No clients here yet"
              body="Add your first client to start tracking enquiries, quotes and bookings — enquiries that arrive through your public portfolio land here automatically."
            />
          ) : (
            <div className="pxc-grid">
              {clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="pxc-card"
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => setSelId(c.id)}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span className="pxc-card-title">{c.name}</span>
                    <Pill tone={statusTone(c.status)}>{c.status}</Pill>
                  </span>
                  <span className="pxc-card-meta">
                    {[c.event_type, c.event_date, c.phone].filter(Boolean).join(' · ')}
                  </span>
                  {c.budget_inr > 0 && <span className="pxc-card-meta" style={{ color: 'var(--mj-primary)' }}>{inr(c.budget_inr)}</span>}
                  <span className="pxc-card-meta">
                    Payment: {c.payment_status} · Contract: {c.contract_status}
                    {c.follow_up_date ? ` · Follow-up ${c.follow_up_date}` : ''}
                  </span>
                  {c.source === 'portfolio' && <span><Pill tone="accent">Came via portfolio</Pill></span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>

      {selId && (
        <CrmClientDetail
          clientId={selId}
          onClose={() => setSelId(null)}
          onChange={reload}
        />
      )}
      <Toast message={toast} />
    </>
  );
}

function CrmClientDetail({ clientId, onClose, onChange }) {
  const [edit, setEdit] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [ev, setEv] = useState({ stage: 'inquiry', note: '' });
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const load = useCallback(async () => {
    try {
      const { data } = await api.crmClient(clientId);
      setEdit(data.client);
      setTimeline(data.timeline || []);
    } catch {
      onClose();
    }
  }, [clientId, onClose]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setEdit((c) => ({ ...c, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await api.updateCrmClient(clientId, { ...edit, budget_inr: Number(edit.budget_inr) || 0 });
      flash('Saved.');
      onChange?.();
      load();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not save.'); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this client and their whole timeline? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.deleteCrmClient(clientId);
      onChange?.();
      onClose();
    } catch { flash('Could not delete.'); setBusy(false); }
  };

  const addEvent = async () => {
    try {
      await api.addCrmTimeline(clientId, ev);
      setEv({ stage: ev.stage, note: '' });
      load();
    } catch { flash('Could not add that event.'); }
  };

  const delEvent = async (id) => {
    try { await api.deleteCrmTimeline(id); load(); } catch { flash('Could not remove it.'); }
  };

  return (
    <div className="pxc-scrim" role="dialog" aria-modal="true" aria-label="Client detail" onClick={onClose}>
      <div className="pxc-dialog" onClick={(e) => e.stopPropagation()}>
        {!edit ? <Loading rows={2} /> : (
          <>
            <div className="pxc-dialog-head">
              <h2 className="pxc-dialog-title">{edit.name}</h2>
              <button type="button" className="pxc-x" onClick={onClose} aria-label="Close">×</button>
            </div>

            <div className="pxc-formgrid">
              <Field label="Name" htmlFor="cd-name"><input id="cd-name" className="pxc-input" value={edit.name || ''} onChange={set('name')} /></Field>
              <Field label="Phone" htmlFor="cd-phone"><input id="cd-phone" className="pxc-input" value={edit.phone || ''} onChange={set('phone')} inputMode="tel" /></Field>
              <Field label="Email" htmlFor="cd-email"><input id="cd-email" className="pxc-input" type="email" value={edit.email || ''} onChange={set('email')} /></Field>
              <Field label="Event type" htmlFor="cd-type"><input id="cd-type" className="pxc-input" value={edit.event_type || ''} onChange={set('event_type')} /></Field>
              <Field label="Event date" htmlFor="cd-date"><input id="cd-date" className="pxc-input" type="date" value={edit.event_date || ''} onChange={set('event_date')} /></Field>
              <Field label="Budget (₹)" htmlFor="cd-budget"><input id="cd-budget" className="pxc-input" type="number" min="0" value={edit.budget_inr || ''} onChange={set('budget_inr')} /></Field>
              <Field label="Status" htmlFor="cd-status">
                <select id="cd-status" className="pxc-input" value={edit.status || 'lead'} onChange={set('status')}>
                  {CRM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Payment" htmlFor="cd-pay">
                <select id="cd-pay" className="pxc-input" value={edit.payment_status || 'unpaid'} onChange={set('payment_status')}>
                  {PAYMENT_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Contract" htmlFor="cd-contract">
                <select id="cd-contract" className="pxc-input" value={edit.contract_status || 'none'} onChange={set('contract_status')}>
                  {CONTRACT_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Follow-up date" htmlFor="cd-fu"><input id="cd-fu" className="pxc-input" type="date" value={edit.follow_up_date || ''} onChange={set('follow_up_date')} /></Field>
              <Field label="Notes" htmlFor="cd-notes" wide>
                <textarea id="cd-notes" className="pxc-input" rows={2} value={edit.notes || ''} onChange={set('notes')} />
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 8, margin: '18px 0 26px' }}>
              <button type="button" className="pxc-btn pxc-btn--primary" onClick={save} disabled={busy}>Save</button>
              <button type="button" className="pxc-btn pxc-btn--danger" onClick={remove} disabled={busy}>Delete client</button>
            </div>

            <h3 className="pxc-section-title" style={{ fontSize: 15 }}>Client timeline</h3>
            <p className="pxc-section-sub" style={{ marginBottom: 12 }}>Every stage from first enquiry to repeat booking.</p>

            <div className="pxc-inline" style={{ marginBottom: 14 }}>
              <select
                className="pxc-input"
                style={{ flex: '0 0 150px' }}
                value={ev.stage}
                onChange={(e) => setEv((s) => ({ ...s, stage: e.target.value }))}
                aria-label="Stage"
              >
                {CRM_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                className="pxc-input"
                value={ev.note}
                onChange={(e) => setEv((s) => ({ ...s, note: e.target.value }))}
                placeholder="Note (optional)"
                aria-label="Timeline note"
              />
              <button type="button" className="pxc-btn pxc-btn--ghost" onClick={addEvent}>Add</button>
            </div>

            <Rows
              rows={timeline}
              empty="No timeline events yet."
              render={(t) => (
                <div className="pxc-rowline">
                  <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
                    <Pill tone="accent">{t.stage}</Pill>
                    <span className="pxc-rowmeta">{t.note}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="pxc-rowmeta">{t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN') : ''}</span>
                    <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => delEvent(t.id)}>Remove</button>
                  </span>
                </div>
              )}
            />
          </>
        )}
        <Toast message={toast} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════ AI Review

const REVIEW_SUBS = [
  ['profile_completeness', 'Profile completeness', 30],
  ['gallery', 'Gallery', 25],
  ['testimonials', 'Testimonials', 15],
  ['categories', 'Categories', 10],
  ['engagement', 'Engagement', 10],
  ['polish', 'Design & published', 10],
];

export function AiReview() {
  const { data, error, gated, loading, reload } = useAsync(() => api.portfolioReview().then((r) => r.data));
  const [fresh, setFresh] = useState(null);
  const [lock, setLock] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const r = fresh || data?.review || null;

  const generate = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.generatePortfolioReview();
      setFresh(d.review);
      flash('Review generated.');
    } catch (e) {
      if (e?.response?.status === 403) setLock(e.response.data?.detail || '');
      else flash(e?.response?.data?.detail || 'Could not generate the review.');
    } finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (gated || lock) {
    return <Section title="AI portfolio review"><PlanGate what="AI portfolio review" message={gated || lock} /></Section>;
  }

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section
        title="AI portfolio review"
        sub="An honest score of your real portfolio, and a prioritised roadmap for turning it into bookings."
        actions={(
          <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" onClick={generate} disabled={busy}>
            {busy ? 'Analysing…' : r ? 'Refresh review' : 'Generate review'}
          </button>
        )}
      >
        {!r ? (
          <Empty
            title="No review yet"
            body="Generating a review reads your live portfolio — sections filled in, gallery, testimonials, categories and engagement — and scores it out of 100."
          />
        ) : (
          <div className="pxc-score">
            <div>
              <div className="pxc-score-num">{r.overall}</div>
              <span className="pxc-score-of">out of 100</span>
            </div>
            <div className="pxc-subscores">
              {REVIEW_SUBS.map(([k, label, max]) => {
                const v = Number(r.subscores?.[k] || 0);
                return (
                  <div key={k}>
                    <div className="pxc-subscore-line"><span>{label}</span><span>{v}/{max}</span></div>
                    <div className="pxc-bar"><span style={{ width: `${max ? Math.min(100, (v / max) * 100) : 0}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {r?.ai_summary && (
        <Section title="Your report card">
          <p className="pxc-prose">{r.ai_summary}</p>
        </Section>
      )}

      {(r?.suggestions || []).length > 0 && (
        <Section title="Improvement roadmap" sub="In the order that moves the score most.">
          <ul className="pxc-list">
            {r.suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Section>
      )}

      {r?.generated_at && <p className="pxc-hint">Last generated {dt(r.generated_at)}</p>}
      <Toast message={toast} />
    </>
  );
}

// ════════════════════════════════════════════════════════════ AI Assistant

export function AiAssistant() {
  const { data, error, gated, loading, reload } = useAsync(() => api.businessAssistant().then((r) => r.data));
  const [fresh, setFresh] = useState(null);
  const [lock, setLock] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const r = fresh || data?.report || null;
  const signals = r?.signals || {};
  const fb = r?.fallback || {};

  const generate = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.generateBusinessReport();
      setFresh(d.report);
      flash('Report ready.');
    } catch (e) {
      if (e?.response?.status === 403) setLock(e.response.data?.detail || '');
      else flash(e?.response?.data?.detail || 'Could not generate the report.');
    } finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  if (gated || lock) {
    return <Section title="AI business assistant"><PlanGate what="The AI business assistant" message={gated || lock} /></Section>;
  }

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section
        title="AI business assistant"
        sub="Pricing, packages, marketing and growth advice built from your own portfolio and CRM data — not generic tips."
        actions={(
          <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" onClick={generate} disabled={busy}>
            {busy ? 'Thinking…' : r ? 'Refresh' : 'Generate'}
          </button>
        )}
      >
        {!r && (
          <Empty
            title="No report yet"
            body="The assistant reads your clients, conversion rate and booked pipeline, then writes advice for the studio you actually run."
          />
        )}
        {r && (
          <Stats items={[
            { label: 'Clients', value: num.format(signals.clients_total || 0) },
            { label: 'Conversion', value: `${signals.conversion_pct || 0}%` },
            { label: 'Booked pipeline', value: inr(signals.booked_value_inr || 0) },
          ]}
          />
        )}
      </Section>

      {r?.ai_summary && (
        <Section title="Consultant report">
          <p className="pxc-prose">{r.ai_summary}</p>
        </Section>
      )}

      {r && (
        <>
          {(fb.pricing || fb.growth) && (
            <Section title="Direction">
              {fb.pricing && (
                <>
                  <p className="pxc-label">Pricing guidance</p>
                  <p className="pxc-rowbody" style={{ marginTop: 0, marginBottom: 14 }}>{fb.pricing}</p>
                </>
              )}
              {fb.growth && (
                <>
                  <p className="pxc-label">Growth</p>
                  <p className="pxc-rowbody" style={{ marginTop: 0 }}>{fb.growth}</p>
                </>
              )}
            </Section>
          )}

          {(fb.packages || []).length > 0 && (
            <Section title="Package ideas">
              <ul className="pxc-list">{fb.packages.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </Section>
          )}

          {(fb.marketing || []).length > 0 && (
            <Section title="Marketing actions">
              <ul className="pxc-list">{fb.marketing.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </Section>
          )}

          {r.generated_at && <p className="pxc-hint">Last generated {dt(r.generated_at)}</p>}
        </>
      )}
      <Toast message={toast} />
    </>
  );
}

// ══════════════════════════════════════════════════════ Pricing Intelligence

export function PricingIntelligence() {
  const { data, error, loading, reload } = useAsync(() => api.pricingIntelligence().then((r) => r.data));

  if (loading) return <Loading rows={2} />;
  const d = data || {};
  const peers = Number(d.peers || 0);

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Stats items={[
        { label: 'Suggested from', value: inr(d.suggested_min) },
        { label: 'Suggested to', value: inr(d.suggested_max) },
        { label: 'Peer average', value: inr(d.peer_avg) },
      ]}
      />
      <Section title="How this band was worked out">
        <p className="pxc-rowbody" style={{ marginTop: 0 }}>
          Based on {peers} comparable {peers === 1 ? 'studio' : 'studios'}
          {d.city ? ` in ${d.city}` : ''}. Guidance only — your pricing stays yours.
        </p>
        {d.reasoning && <p className="pxc-rowbody">{d.reasoning}</p>}
      </Section>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════ Analytics

const ANALYTICS_SEGMENTS = [
  ['overview', 'Overview'],
  ['content', 'Content'],
  ['revenue', 'Revenue'],
  ['finance', 'Finance'],
  ['budget', 'Budgets'],
  ['packages', 'Packages'],
  ['career', 'Career'],
  ['quote', 'Quote'],
];

export function Analytics() {
  const [seg, setSeg] = useState('overview');
  return (
    <>
      <Segments value={seg} onChange={setSeg} options={ANALYTICS_SEGMENTS} />
      {seg === 'overview' && <AnalyticsOverview />}
      {seg === 'content' && <ContentAnalytics />}
      {seg === 'revenue' && <RevenueCentre />}
      {seg === 'finance' && <FinanceTracker />}
      {seg === 'budget' && <BudgetPlanner />}
      {seg === 'packages' && <Packages />}
      {seg === 'career' && <CareerEngine />}
      {seg === 'quote' && <QuoteBuilder />}
    </>
  );
}

function AnalyticsOverview() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.insights().then((r) => r.data).catch(() => null),
      api.scoreHistory().then((r) => r.data).catch(() => null),
      api.analytics().then((r) => r.data).catch(() => null),
      api.weddingBi().then((r) => r.data).catch(() => null),
    ]).then(([ins, hist, prof, bi]) => ({ ins, hist, prof, bi })),
  );

  if (loading) return <Loading />;

  const ins = data?.ins || {};
  const hist = data?.hist || {};
  const prof = data?.prof || {};
  const bi = data?.bi || {};
  const eng = ins.engagement || {};
  const growth = ins.growth || {};
  const port = ins.portfolio || {};

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      {ins.growth && (
        <Stats items={[
          { label: 'Reputation', value: num.format(ins.reputation || 0), hint: ins.tier || undefined },
          { label: 'Followers', value: num.format(eng.followers || 0) },
          { label: 'Leaderboard', value: growth.leaderboard_rank ? `#${growth.leaderboard_rank}` : '—' },
          { label: 'Certifications', value: num.format(growth.certifications || 0) },
          { label: 'Posts', value: num.format(eng.posts || 0) },
          { label: 'Likes', value: num.format(eng.likes_received || 0) },
          { label: 'Portfolio works', value: num.format(port.works || 0) },
          { label: 'Achievements', value: num.format(growth.achievements || 0) },
        ]}
        />
      )}

      <Section
        title="Community score trend"
        sub="Grows as you complete your profile, publish, post, gain followers and visit daily."
        actions={<span className="pxc-stat-value">{hist.current?.score ?? 0}</span>}
      >
        <Trend points={(hist.history || []).map((h) => ({ v: h.score }))} />
        <p className="pxc-hint">
          {(hist.history || []).length} day{(hist.history || []).length === 1 ? '' : 's'} tracked.
        </p>
      </Section>

      <Section title="Profile analytics" sub="How your public portfolio is performing.">
        <Stats items={[
          { label: 'Portfolio views', value: num.format(prof.portfolio_views || 0) },
          { label: 'Followers', value: num.format(prof.followers || 0) },
          { label: 'Posts', value: num.format(prof.posts || 0) },
          { label: 'Community score', value: num.format(prof.community_score || 0) },
        ]}
        />
        <Trend
          points={(prof.by_day || []).map((x) => ({ v: x.views }))}
          label="The views chart appears once your public portfolio starts getting visits."
        />
      </Section>

      {bi.total_bookings ? (
        <Section title="Wedding business intelligence" sub="Your booking funnel, rolled up.">
          <Stats items={[
            { label: 'Bookings', value: num.format(bi.total_bookings) },
            { label: 'Won', value: num.format(bi.won || 0) },
            { label: 'Revenue', value: inr(bi.revenue) },
            { label: 'Avg deal', value: inr(bi.avg_deal) },
            { label: 'Conversion', value: `${bi.conversion_pct || 0}%` },
          ]}
          />
          <Trend points={(bi.monthly || []).map((m) => ({ v: m.count }))} label="Monthly trend appears after two months of bookings." />
        </Section>
      ) : null}

    </>
  );
}

const WINDOWS = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['all', 'All time']];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Per-post performance: reach, top posts and reels, tag reach, follower
 *  growth, best time to post, and what the audience also likes. */
function ContentAnalytics() {
  const [win, setWin] = useState('30d');
  const { data, error, loading, reload } = useAsync(
    () => api.contentAnalytics({ window: win }).then((r) => r.data),
    [win],
  );

  const d = data || {};
  const t = d.totals || {};
  const top = d.top_content || [];
  const tags = d.top_tags || [];
  const topics = d.audience_topics || [];

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <div className="pxc-chips" style={{ marginBottom: 16 }}>
        {WINDOWS.map(([k, label]) => (
          <button key={k} type="button" className={`pxc-chip${win === k ? ' pxc-chip--on' : ''}`} onClick={() => setWin(k)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <Loading rows={2} /> : (
        <>
          <Stats items={[
            { label: 'Views', value: num.format(t.views || 0) },
            { label: 'Likes', value: num.format(t.likes || 0) },
            { label: 'Comments', value: num.format(t.comments || 0) },
            { label: 'Saves', value: num.format(t.saves || 0) },
            { label: 'Shares', value: num.format(t.shares || 0) },
            { label: 'Followers', value: num.format(d.total_followers || 0) },
          ]}
          />

          <Section title="Top content" sub="Ranked by engagement score across this window.">
            <Rows
              rows={top}
              empty="Post something and its performance shows up here."
              render={(p) => (
                <>
                  <div className="pxc-rowline">
                    <span className="pxc-rowmain">{p.title || (p.kind === 'reel' ? 'Reel' : 'Post')}</span>
                    <span className="pxc-rowmeta">{p.engagement} score</span>
                  </div>
                  <p className="pxc-rowbody">
                    {num.format(p.views || 0)} views · {num.format(p.likes || 0)} likes
                    {' · '}{num.format(p.saves || 0)} saves · {num.format(p.shares || 0)} shares
                  </p>
                </>
              )}
            />
          </Section>

          <Section title="Top tags by reach" sub="Where your work is being found.">
            {tags.length === 0 ? (
              <p className="pxc-hint">Add #tags to your posts to grow reach.</p>
            ) : (
              <div className="pxc-chips">
                {tags.map((tg) => (
                  <a key={tg.tag} className="pxc-chip" href={`/community/tag/${encodeURIComponent(tg.tag)}`}>
                    #{tg.tag} · {num.format(tg.reach || 0)}
                  </a>
                ))}
              </div>
            )}
          </Section>

          <Section title="Follower growth">
            <p className="pxc-stat-value">+{num.format(d.new_followers || 0)}</p>
            <p className="pxc-hint">New followers in this window.</p>
          </Section>

          <Section title="Best time to post" sub="When your own audience is most likely to be looking.">
            {d.best_time ? (
              <p className="pxc-stat-value">
                {DAYS[d.best_time.weekday] || ''} · {String(d.best_time.hour ?? 0).padStart(2, '0')}:00
              </p>
            ) : <p className="pxc-hint">Not enough data yet — keep posting.</p>}
          </Section>

          {topics.length > 0 && (
            <Section title="Your audience also likes">
              <div className="pxc-chips">
                {topics.map((a) => <span key={a.topic} className="pxc-chip">#{a.topic}</span>)}
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}

function RevenueCentre() {
  const { data, error, loading, reload } = useAsync(() => api.revenue().then((r) => r.data));
  if (loading) return <Loading rows={2} />;
  const d = data || {};
  const sources = d.sources || [];

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section
        title="Creator revenue centre"
        sub="Rolls up your tracked income, completed bookings and pipeline. Tracking only — payouts happen through your payment provider."
      >
        {sources.length === 0 && !d.profit ? (
          <Empty title="Nothing to roll up yet" body="Log income in Finance or complete a booking and the totals appear here." />
        ) : (
          <Stats items={[
            ...sources.map((s) => ({ label: s.label, value: inr(s.value) })),
            { label: 'Profit', value: inr(d.profit || 0) },
          ]}
          />
        )}
      </Section>
    </>
  );
}

function FinanceTracker() {
  const [form, setForm] = useState({ kind: 'income', category: '', amount_inr: '', note: '', date: '' });
  const [toast, flash] = useFlash();
  const { data, error, loading, reload } = useAsync(() => api.finance().then((r) => r.data));

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const s = data?.summary || {};
  const entries = data?.entries || [];

  const add = async () => {
    if (!Number(form.amount_inr)) { flash('Enter an amount.'); return; }
    try {
      await api.saveFinance({ ...form, amount_inr: Number(form.amount_inr) });
      setForm((f) => ({ ...f, category: '', amount_inr: '', note: '' }));
      reload();
    } catch { flash('Could not add that entry.'); }
  };

  const remove = async (id) => {
    try { await api.deleteFinance(id); reload(); } catch { flash('Could not remove it.'); }
  };

  if (loading) return <Loading rows={2} />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Stats items={[
        { label: 'Income', value: inr(s.income || 0) },
        { label: 'Expenses', value: inr(s.expense || 0) },
        { label: 'Profit', value: inr(s.profit || 0) },
      ]}
      />

      <Section title="Expense & revenue tracker" sub="Every rupee in and out of the studio.">
        <div className="pxc-inline" style={{ marginBottom: 16 }}>
          <select className="pxc-input" style={{ flex: '0 0 130px' }} value={form.kind} onChange={set('kind')} aria-label="Kind">
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <input className="pxc-input" value={form.category} onChange={set('category')} placeholder="Category (Booking, Gear…)" aria-label="Category" />
          <input className="pxc-input" style={{ flex: '0 0 120px' }} type="number" min="0" value={form.amount_inr} onChange={set('amount_inr')} placeholder="₹" aria-label="Amount" />
          <input className="pxc-input" style={{ flex: '0 0 160px' }} type="date" value={form.date} onChange={set('date')} aria-label="Date" />
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={add}>Add</button>
        </div>

        <Rows
          rows={entries}
          empty="Nothing logged yet."
          render={(e) => (
            <div className="pxc-rowline">
              <span className="pxc-rowmeta">
                {e.category || e.kind}{e.date ? ` · ${e.date}` : ''}{e.note ? ` · ${e.note}` : ''}
              </span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Pill tone={e.kind === 'income' ? 'good' : 'bad'}>
                  {e.kind === 'expense' ? '−' : '+'}{inr(e.amount_inr)}
                </Pill>
                <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => remove(e.id)}>Remove</button>
              </span>
            </div>
          )}
        />
      </Section>
      <Toast message={toast} />
    </>
  );
}

function BudgetPlanner() {
  const [form, setForm] = useState({ event_name: '', category: '', allocated_inr: '', spent_inr: '', note: '' });
  const [toast, flash] = useFlash();
  const { data, error, loading, reload } = useAsync(() => api.budget().then((r) => r.data));

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const s = data?.summary || {};
  const items = data?.items || [];

  const add = async () => {
    if (!form.category.trim() && !form.event_name.trim()) { flash('Give the line a category or an event.'); return; }
    try {
      await api.addBudgetItem({
        ...form,
        allocated_inr: Number(form.allocated_inr) || 0,
        spent_inr: Number(form.spent_inr) || 0,
      });
      setForm((f) => ({ event_name: f.event_name, category: '', allocated_inr: '', spent_inr: '', note: '' }));
      reload();
    } catch { flash('Could not add that line.'); }
  };

  const remove = async (id) => {
    try { await api.deleteBudgetItem(id); reload(); } catch { flash('Could not remove it.'); }
  };

  if (loading) return <Loading rows={2} />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Stats items={[
        { label: 'Allocated', value: inr(s.allocated || 0) },
        { label: 'Spent', value: inr(s.spent || 0) },
        { label: 'Remaining', value: inr(s.remaining || 0) },
      ]}
      />

      <Section title="Wedding budget planner" sub="Plan a shoot budget by category and watch the spend against it.">
        <div className="pxc-inline" style={{ marginBottom: 16 }}>
          <input className="pxc-input" style={{ flex: '0 0 160px' }} value={form.event_name} onChange={set('event_name')} placeholder="Event (optional)" aria-label="Event" />
          <input className="pxc-input" value={form.category} onChange={set('category')} placeholder="Category (Venue, Catering…)" aria-label="Category" />
          <input className="pxc-input" style={{ flex: '0 0 130px' }} type="number" min="0" value={form.allocated_inr} onChange={set('allocated_inr')} placeholder="Allocated ₹" aria-label="Allocated" />
          <input className="pxc-input" style={{ flex: '0 0 130px' }} type="number" min="0" value={form.spent_inr} onChange={set('spent_inr')} placeholder="Spent ₹" aria-label="Spent" />
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={add}>Add</button>
        </div>

        <Rows
          rows={items}
          empty="No budget lines yet."
          render={(it) => {
            const allocated = Number(it.allocated_inr || 0);
            const spent = Number(it.spent_inr || 0);
            const over = allocated > 0 && spent > allocated;
            const pct = allocated ? Math.min(100, (spent / allocated) * 100) : 0;
            return (
              <>
                <div className="pxc-rowline">
                  <span className="pxc-rowmain">{it.category || 'Item'}{it.event_name ? ` · ${it.event_name}` : ''}</span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="pxc-rowmeta" style={over ? { color: 'var(--mj-error-text)' } : undefined}>
                      {inr(spent)} / {inr(allocated)}
                    </span>
                    <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => remove(it.id)}>Remove</button>
                  </span>
                </div>
                <div className={`pxc-bar${over ? ' pxc-bar--over' : ''}`} style={{ marginTop: 8 }}>
                  <span style={{ width: `${pct}%` }} />
                </div>
              </>
            );
          }}
        />
      </Section>
      <Toast message={toast} />
    </>
  );
}

const PKG_TIERS = ['starter', 'premium', 'luxury', 'custom'];

function Packages() {
  const [form, setForm] = useState({ name: '', tier: 'starter', price_inr: '', includes: '', description: '' });
  const [ccy, setCcy] = useState('INR');
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.packages().then((r) => r.data).catch(() => ({ packages: [] })),
      api.currencyRates().then((r) => r.data).catch(() => null),
    ]).then(([p, c]) => ({ p, c })),
  );

  const rows = data?.p?.packages || [];
  const cur = data?.c || null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const price = (amtInr) => {
    if (!cur || ccy === 'INR') return inr(amtInr);
    const rate = cur.rates?.[ccy] || 0;
    const sym = cur.symbols?.[ccy] || '';
    return `${sym}${(Number(amtInr || 0) * rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const add = async () => {
    if (!form.name.trim()) { flash('Give the package a name.'); return; }
    try {
      await api.savePackage({
        ...form,
        price_inr: Number(form.price_inr) || 0,
        includes: form.includes.split(',').map((x) => x.trim()).filter(Boolean),
      });
      setForm({ name: '', tier: 'starter', price_inr: '', includes: '', description: '' });
      reload();
    } catch { flash('Could not save that package.'); }
  };

  const remove = async (id) => {
    try { await api.deletePackage(id); reload(); } catch { flash('Could not delete it.'); }
  };

  if (loading) return <Loading rows={2} />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title="Your packages" sub="What couples see when they ask what you charge.">
        <div className="pxc-formgrid" style={{ marginBottom: 18 }}>
          <Field label="Package name" htmlFor="pk-name">
            <input id="pk-name" className="pxc-input" value={form.name} onChange={set('name')} placeholder="Full-day wedding" />
          </Field>
          <Field label="Tier" htmlFor="pk-tier">
            <select id="pk-tier" className="pxc-input" value={form.tier} onChange={set('tier')}>
              {PKG_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Price (₹)" htmlFor="pk-price">
            <input id="pk-price" className="pxc-input" type="number" min="0" value={form.price_inr} onChange={set('price_inr')} />
          </Field>
          <Field label="Includes" htmlFor="pk-inc" hint="Comma separated — two shooters, 300 edits, album…" wide>
            <input id="pk-inc" className="pxc-input" value={form.includes} onChange={set('includes')} />
          </Field>
          <Field label="Description" htmlFor="pk-desc" wide>
            <textarea id="pk-desc" className="pxc-input" rows={2} value={form.description} onChange={set('description')} />
          </Field>
          <div className="pxc-field pxc-field--wide">
            <button type="button" className="pxc-btn pxc-btn--primary" onClick={add}>Add package</button>
          </div>
        </div>

        {cur && (cur.currencies || []).length > 0 && (
          <div className="pxc-chips" style={{ marginBottom: 14 }}>
            {['INR', ...(cur.currencies || []).filter((c) => c !== 'INR')].map((c) => (
              <button key={c} type="button" className={`pxc-chip${ccy === c ? ' pxc-chip--on' : ''}`} onClick={() => setCcy(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <Empty title="No packages yet" body="Studios that publish two or three clear packages get far fewer 'what do you charge?' messages." />
        ) : (
          <div className="pxc-grid">
            {rows.map((p) => (
              <div className="pxc-card" key={p.id}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="pxc-card-title">{p.name}</span>
                  <Pill tone="accent">{p.tier}</Pill>
                </span>
                <span className="pxc-stat-value" style={{ fontSize: 20 }}>{price(p.price_inr)}</span>
                {p.description && <span className="pxc-card-meta">{p.description}</span>}
                {(p.includes || []).length > 0 && (
                  <span className="pxc-card-meta">{(p.includes || []).join(' · ')}</span>
                )}
                <span>
                  <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => remove(p.id)}>Delete</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Toast message={toast} />
    </>
  );
}

function CareerEngine() {
  const { data, error, loading, reload } = useAsync(() => api.careerEngine().then((r) => r.data));
  const [fresh, setFresh] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const r = fresh || data?.report || null;
  const fb = r?.fallback || {};

  const generate = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.generateCareer();
      setFresh(d.report);
      flash('Roadmap ready.');
    } catch (e) { flash(e?.response?.data?.detail || 'Could not generate the roadmap.'); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading rows={2} />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section
        title="AI career growth engine"
        sub="Where your studio is on its arc, and what to do next."
        actions={(
          <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" onClick={generate} disabled={busy}>
            {busy ? 'Working…' : r ? 'Refresh' : 'Generate'}
          </button>
        )}
      >
        {!r ? (
          <Empty title="No roadmap yet" body="Generate a personalised roadmap built from your portfolio, community activity and bookings." />
        ) : (
          <>
            {r.stage && <p style={{ margin: '0 0 12px' }}><Pill tone="accent">Stage: {r.stage}</Pill></p>}
            {r.ai_summary && <p className="pxc-prose">{r.ai_summary}</p>}
          </>
        )}
      </Section>

      {r && [['Skills', fb.skills], ['Career', fb.career], ['Business', fb.business]].map(([label, arr]) => (
        (arr || []).length > 0 ? (
          <Section title={label} key={label}>
            <ul className="pxc-list">{arr.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Section>
        ) : null
      ))}
      <Toast message={toast} />
    </>
  );
}

function QuoteBuilder() {
  const [quote, setQuote] = useState({ client_name: '', event: '', lines: [{ label: 'Photography', amount_inr: '' }] });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const setLine = (i, k, v) => setQuote((q) => ({
    ...q, lines: q.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)),
  }));
  const addLine = () => setQuote((q) => ({ ...q, lines: [...q.lines, { label: '', amount_inr: '' }] }));
  const dropLine = (i) => setQuote((q) => ({ ...q, lines: q.lines.filter((_, j) => j !== i) }));

  const generate = async () => {
    const lines = quote.lines
      .filter((l) => l.label.trim())
      .map((l) => ({ label: l.label.trim(), amount_inr: Number(l.amount_inr) || 0 }));
    if (lines.length === 0) { flash('Add at least one line item.'); return; }
    setBusy(true);
    try {
      const { data } = await api.businessQuote({ ...quote, lines });
      setResult(data.quote);
    } catch (e) { flash(e?.response?.data?.detail || 'Could not build the quote.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Section title="Quote / invoice generator" sub="Line items in, a GST-inclusive quote out.">
        <div className="pxc-inline" style={{ marginBottom: 14 }}>
          <input
            className="pxc-input"
            value={quote.client_name}
            onChange={(e) => setQuote((q) => ({ ...q, client_name: e.target.value }))}
            placeholder="Client name"
            aria-label="Client name"
          />
          <input
            className="pxc-input"
            value={quote.event}
            onChange={(e) => setQuote((q) => ({ ...q, event: e.target.value }))}
            placeholder="Event"
            aria-label="Event"
          />
        </div>

        {quote.lines.map((l, i) => (
          <div className="pxc-inline" key={i} style={{ marginBottom: 8 }}>
            <input
              className="pxc-input"
              value={l.label}
              onChange={(e) => setLine(i, 'label', e.target.value)}
              placeholder="Line item"
              aria-label={`Line item ${i + 1}`}
            />
            <input
              className="pxc-input"
              style={{ flex: '0 0 130px' }}
              type="number"
              min="0"
              value={l.amount_inr}
              onChange={(e) => setLine(i, 'amount_inr', e.target.value)}
              placeholder="₹"
              aria-label={`Amount for line ${i + 1}`}
            />
            {quote.lines.length > 1 && (
              <button type="button" className="pxc-btn pxc-btn--ghost" onClick={() => dropLine(i)} aria-label={`Remove line ${i + 1}`}>Remove</button>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="pxc-btn pxc-btn--ghost" onClick={addLine}>Add line</button>
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={generate} disabled={busy}>
            {busy ? 'Building…' : 'Generate quote'}
          </button>
        </div>
      </Section>

      {result && (
        <Section title={`Quote ${result.id}`} sub={result.studio_name}>
          {(result.lines || []).map((l, i) => (
            <div className="pxc-money" key={i}><span>{l.label}</span><span>{inr(l.amount_inr)}</span></div>
          ))}
          <div className="pxc-money"><span>GST 18%</span><span>{inr(result.gst_inr)}</span></div>
          <div className="pxc-money pxc-money--total"><span>Total</span><span>{inr(result.total_inr)}</span></div>
        </Section>
      )}
      <Toast message={toast} />
    </>
  );
}

// ══════════════════════════════════════════════════════ Client Management

const WS_BOOK_STAGES = [
  'inquiry', 'quotation', 'negotiation', 'accepted', 'rejected',
  'confirmed', 'completed', 'cancelled', 'disputed',
];
const WS_BLANK = {
  wedding_name: '', bride_name: '', groom_name: '', wedding_date: '', location: '',
  budget_inr: '', guest_count: '',
};

export function ClientManagement() {
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(WS_BLANK);
  const [toast, flash] = useFlash();
  const { data, error, loading, reload } = useAsync(() => api.workspaces().then((r) => r.data));

  const list = data?.workspaces || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = async () => {
    if (!form.wedding_name.trim()) { flash('Give the wedding a name.'); return; }
    try {
      await api.createWorkspace({
        ...form,
        budget_inr: Number(form.budget_inr) || 0,
        guest_count: Number(form.guest_count) || 0,
      });
      setForm(WS_BLANK);
      setCreating(false);
      flash('Workspace created with its starter checklist.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not create it.'); }
  };

  if (sel) return <WorkspaceDetail id={sel} onBack={() => { setSel(null); reload(); }} />;
  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section
        title="Wedding workspaces"
        sub="Each wedding is a project — checklist, milestones, vendor bookings, guests and budget in one place."
        actions={(
          <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'New wedding'}
          </button>
        )}
      >
        {creating ? (
          <div className="pxc-formgrid">
            <Field label="Wedding name" htmlFor="ws-name" wide>
              <input id="ws-name" className="pxc-input" value={form.wedding_name} onChange={set('wedding_name')} placeholder="Aditi & Rohan" />
            </Field>
            <Field label="Bride" htmlFor="ws-bride"><input id="ws-bride" className="pxc-input" value={form.bride_name} onChange={set('bride_name')} /></Field>
            <Field label="Groom" htmlFor="ws-groom"><input id="ws-groom" className="pxc-input" value={form.groom_name} onChange={set('groom_name')} /></Field>
            <Field label="Wedding date" htmlFor="ws-date"><input id="ws-date" className="pxc-input" type="date" value={form.wedding_date} onChange={set('wedding_date')} /></Field>
            <Field label="Location" htmlFor="ws-loc"><input id="ws-loc" className="pxc-input" value={form.location} onChange={set('location')} /></Field>
            <Field label="Budget (₹)" htmlFor="ws-budget"><input id="ws-budget" className="pxc-input" type="number" min="0" value={form.budget_inr} onChange={set('budget_inr')} /></Field>
            <Field label="Guest count" htmlFor="ws-guests"><input id="ws-guests" className="pxc-input" type="number" min="0" value={form.guest_count} onChange={set('guest_count')} /></Field>
            <div className="pxc-field pxc-field--wide">
              <button type="button" className="pxc-btn pxc-btn--primary" onClick={create}>Create workspace</button>
              <p className="pxc-hint">A standard wedding checklist is added automatically.</p>
            </div>
          </div>
        ) : list.length === 0 ? (
          <Empty title="No weddings yet" body="Create your first workspace and everything for that wedding lives in one place." />
        ) : (
          <div className="pxc-grid">
            {list.map((w) => (
              <button key={w.id} type="button" className="pxc-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setSel(w.id)}>
                <span className="pxc-card-title">{w.wedding_name}</span>
                <span className="pxc-card-meta">
                  {[w.bride_name, w.groom_name].filter(Boolean).join(' & ')}
                  {w.wedding_date ? ` · ${w.wedding_date}` : ''}
                </span>
                <span className="pxc-card-meta">{[w.status, w.my_role].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        )}
      </Section>
      <Toast message={toast} />
    </>
  );
}

function WorkspaceDetail({ id, onBack }) {
  const [d, setD] = useState(null);
  const [an, setAn] = useState(null);
  const [guests, setGuests] = useState({ guests: [], counts: {} });
  const [activity, setActivity] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [task, setTask] = useState('');
  const [msTitle, setMsTitle] = useState('');
  const [guest, setGuest] = useState('');
  const [comment, setComment] = useState('');
  const [bookVendor, setBookVendor] = useState('');
  const [failed, setFailed] = useState(false);
  const [toast, flash] = useFlash();

  const load = useCallback(async () => {
    try {
      const [w, a, g, act, m] = await Promise.all([
        api.workspace(id).then((r) => r.data),
        api.workspaceAnalytics(id).then((r) => r.data).catch(() => null),
        api.workspaceGuests(id).then((r) => r.data).catch(() => ({ guests: [], counts: {} })),
        api.workspaceActivity(id).then((r) => r.data).catch(() => ({ activity: [] })),
        api.workspaceMilestones(id).then((r) => r.data).catch(() => ({ milestones: [] })),
      ]);
      setD(w);
      setAn(a);
      setGuests(g);
      setActivity(act.activity || []);
      setMilestones(m.milestones || []);
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    load();
    api.vendors().then((r) => setVendors(r.data.vendors || [])).catch(() => {});
  }, [load]);

  const guard = (fn, msg) => async () => {
    try { await fn(); load(); } catch (e) { flash(e?.response?.data?.detail || msg); }
  };

  const addTask = guard(async () => {
    if (!task.trim()) return;
    await api.addWorkspaceTask(id, { title: task.trim() });
    setTask('');
  }, 'Could not add that task.');

  const toggleTask = (t) => guard(
    () => api.updateTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' }),
    'Could not update that task.',
  )();

  const addMilestone = guard(async () => {
    if (!msTitle.trim()) return;
    await api.addWorkspaceMilestone(id, { title: msTitle.trim() });
    setMsTitle('');
  }, 'Could not add that milestone.');

  const cycleMilestone = (m) => guard(() => {
    const next = { pending: 'in_progress', in_progress: 'done', done: 'pending' }[m.status] || 'pending';
    return api.updateMilestone(m.id, { title: m.title, due_date: m.due_date || '', status: next });
  }, 'Could not update that milestone.')();

  const addGuest = guard(async () => {
    if (!guest.trim()) return;
    await api.addWorkspaceGuest(id, { name: guest.trim(), status: 'invited' });
    setGuest('');
  }, 'Could not add that guest.');

  const book = guard(async () => {
    if (!bookVendor) return;
    await api.bookWorkspaceVendor(id, bookVendor);
    setBookVendor('');
  }, 'Could not send that enquiry.');

  const setBooking = (b, status) => guard(() => api.setBookingStatus(b.id, status), 'Could not update the booking.')();

  const send = guard(async () => {
    if (!comment.trim()) return;
    await api.workspaceComment(id, comment.trim());
    setComment('');
  }, 'Could not post that comment.');

  if (failed) {
    return (
      <Section title="Workspace unavailable">
        <Empty title="Could not open this wedding" body="It may have been removed, or your access to it changed." action={<button type="button" className="pxc-btn pxc-btn--primary" onClick={onBack}>Back to all weddings</button>} />
      </Section>
    );
  }
  if (!d) return <Loading />;

  const w = d.workspace || {};
  const tasks = d.tasks || [];
  const bookings = d.bookings || [];
  const counts = guests.counts || {};

  return (
    <>
      <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={onBack} style={{ marginBottom: 14 }}>
        ← All weddings
      </button>

      <Section
        title={w.wedding_name}
        sub={[
          [w.bride_name, w.groom_name].filter(Boolean).join(' & '),
          w.wedding_date, w.location, w.my_role,
        ].filter(Boolean).join(' · ')}
      >
        {an ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <div className="pxc-subscore-line"><span>Tasks ({an.tasks_done}/{an.tasks_total})</span><span>{an.task_progress}%</span></div>
              <div className="pxc-bar"><span style={{ width: `${an.task_progress || 0}%` }} /></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="pxc-subscore-line"><span>Bookings confirmed ({an.bookings_confirmed}/{an.bookings_total})</span><span>{an.booking_progress}%</span></div>
              <div className="pxc-bar"><span style={{ width: `${an.booking_progress || 0}%` }} /></div>
            </div>
            <p className="pxc-rowbody" style={{ marginTop: 0 }}>
              Budget {inr(an.budget)} · committed {inr(an.committed)} · remaining {inr(an.remaining)}
              {' · '}guests {an.guests_confirmed}/{an.guests_total} confirmed
            </p>
          </>
        ) : <p className="pxc-hint">Progress appears once this workspace has tasks and bookings.</p>}
      </Section>

      <Section title="Checklist" sub="Everything that has to happen before the day.">
        <div className="pxc-inline" style={{ marginBottom: 14 }}>
          <input className="pxc-input" value={task} onChange={(e) => setTask(e.target.value)} placeholder="Add task" aria-label="New task" />
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={addTask}>Add</button>
        </div>
        {tasks.length === 0 ? <Empty title="No tasks yet" /> : (
          <ul className="pxc-rows">
            {tasks.map((t) => (
              <li className="pxc-row" key={t.id}>
                <label className="pxc-check">
                  <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleTask(t)} />
                  <span style={t.status === 'done' ? { textDecoration: 'line-through', color: 'var(--mj-faint)' } : undefined}>
                    {t.title}
                  </span>
                  {t.phase && <Pill tone="accent">{t.phase}</Pill>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Milestones" sub="Tap a milestone to move it through pending → in progress → done.">
        <div className="pxc-inline" style={{ marginBottom: 14 }}>
          <input className="pxc-input" value={msTitle} onChange={(e) => setMsTitle(e.target.value)} placeholder="Add milestone" aria-label="New milestone" />
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={addMilestone}>Add</button>
        </div>
        <Rows
          rows={milestones}
          empty="No milestones yet."
          render={(m) => (
            <button
              type="button"
              className="pxc-rowline"
              style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
              onClick={() => cycleMilestone(m)}
            >
              <span className="pxc-rowmain">{m.title}</span>
              <Pill tone={m.status === 'done' ? 'good' : m.status === 'in_progress' ? 'warn' : 'neutral'}>
                {String(m.status || 'pending').replace('_', ' ')}
              </Pill>
            </button>
          )}
        />
      </Section>

      <Section title="Vendor bookings" sub="Enquire with vendors from the community directory and track each one.">
        <div className="pxc-inline" style={{ marginBottom: 14 }}>
          <select className="pxc-input" value={bookVendor} onChange={(e) => setBookVendor(e.target.value)} aria-label="Vendor">
            <option value="">Book a vendor…</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.business_name} ({v.category})</option>)}
          </select>
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={book} disabled={!bookVendor}>Inquire</button>
        </div>
        <Rows
          rows={bookings}
          empty="No vendor bookings yet."
          render={(b) => (
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{b.vendor_name}</span>
              <select
                className="pxc-input"
                style={{ maxWidth: 180, minHeight: 36 }}
                value={b.status}
                onChange={(e) => setBooking(b, e.target.value)}
                aria-label={`Status for ${b.vendor_name}`}
              >
                {WS_BOOK_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        />
      </Section>

      <Section
        title="Guests"
        sub={Object.keys(counts).length > 0
          ? Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')
          : 'Track who is invited and who confirmed.'}
      >
        <div className="pxc-inline" style={{ marginBottom: 14 }}>
          <input className="pxc-input" value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Add guest" aria-label="New guest" />
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={addGuest}>Add</button>
        </div>
        <Rows
          rows={guests.guests || []}
          empty="No guests added yet."
          render={(g) => (
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{g.name}</span>
              <Pill tone={g.status === 'confirmed' ? 'good' : 'neutral'}>{g.status || 'invited'}</Pill>
            </div>
          )}
        />
      </Section>

      <Section title="Activity" sub="Notes between everyone working this wedding.">
        <div className="pxc-inline" style={{ marginBottom: 14 }}>
          <input className="pxc-input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" aria-label="Comment" />
          <button type="button" className="pxc-btn pxc-btn--ghost" onClick={send}>Post</button>
        </div>
        <Rows
          rows={activity}
          empty="Nothing logged yet."
          render={(a) => (
            <p className="pxc-rowbody" style={{ marginTop: 0 }}>
              <strong style={{ color: 'var(--mj-primary)' }}>{a.actor_name}</strong> {a.text}
            </p>
          )}
        />
      </Section>
      <Toast message={toast} />
    </>
  );
}
