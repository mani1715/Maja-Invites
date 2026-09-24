import { useCallback, useEffect, useState } from 'react';
import StudioModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, rupees, relTime,
} from '@/components/StudioModule';
import { loadRazorpay } from '@/lib/razorpay';
import * as api from '@/api/portfolio';

// "Build it for me" — a studio that cannot fill its own portfolio in submits a
// brief and the MAJA team builds it. The backend has had the whole flow since
// launch (gate -> pay -> brief -> queue, and an admin queue on the other side)
// and no screen ever opened it, so nobody could ask.
//
// Contract (portfolio_service.py):
//   GET  /portfolio/build-help        -> { fee_inr, unlocked, via: plan|payment|null }
//   POST /portfolio/build-help/order  -> Razorpay order (409 if already unlocked)
//   POST /portfolio/build-help/verify -> { razorpay_order_id, _payment_id, _signature }
//   GET  /portfolio/build-request     -> { request | null }
//   POST /portfolio/build-request     -> { details: {...}, notes }   (402 if locked)
//   GET  /portfolio/team              -> { team_members, is_premium }
//
// `details` is deliberately free-form server-side so the brief can change
// without a migration. The fields below are the brief; they are sent as an
// object, not flattened.

const BRIEF = [
  ['style', 'Your style in a sentence', 'Warm, candid, documentary — not posed.'],
  ['services', 'What you offer', 'Wedding, pre-wedding, engagement, video…'],
  ['cities', 'Where you work', 'Hyderabad, Vijayawada, destination'],
  ['pricing', 'Roughly what you charge', 'Starting ₹80,000 for a two-day wedding'],
  ['highlights', 'Work you want featured', 'Links to the albums you are proudest of'],
  ['references', 'Portfolios you admire', 'Links — helps us match the feel you want'],
];

export default function StudioPortfolioBuild() {
  const [details, setDetails] = useState({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.buildHelpStatus().then((r) => r.data).catch(() => null),
      api.buildRequest().then((r) => r.data).catch(() => ({ request: null })),
      api.portfolioTeam().then((r) => r.data).catch(() => null),
    ]).then(([gate, req, team]) => ({ gate, req, team })),
  );

  const gate = data?.gate || {};
  const existing = data?.req?.request || null;
  const team = data?.team || {};
  const unlocked = !!gate.unlocked;

  // Prefill from an existing brief so "resubmit" is an edit, not a retype.
  useEffect(() => {
    if (existing?.details) setDetails(existing.details);
    if (existing?.notes) setNotes(existing.notes);
  }, [existing]);

  const set = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }));

  const pay = useCallback(async () => {
    setBusy('pay');
    setErr(null);
    try {
      const { data: order } = await api.buildHelpOrder();
      const ok = await loadRazorpay();
      if (!ok) throw new Error('checkout-unavailable');

      const rz = new window.Razorpay({
        key: order.razorpay_key_id || order.key_id,
        order_id: order.order_id || order.id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'MAJA Invites',
        description: 'Portfolio build help',
        handler: async (res) => {
          try {
            await api.buildHelpVerify({
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
            });
            flash('Unlocked — the brief is open below.');
            await reload();
          } catch (e) {
            setErr(e?.response?.data?.detail || 'Payment went through but unlocking failed. Contact support with your payment id.');
          }
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rz.open();
    } catch (e) {
      if (e?.message === 'checkout-unavailable') {
        setErr('The payment window could not load. Check your connection and try again.');
      } else if (e?.response?.status === 409) {
        flash('Already unlocked.');
        await reload();
      } else {
        setErr(e?.response?.data?.detail || 'Could not start that payment.');
      }
    } finally {
      if (busy === 'pay') setBusy(null);
    }
  }, [busy, flash, reload]);

  const submit = async () => {
    setBusy('submit');
    setErr(null);
    try {
      await api.submitBuildRequest(details, notes);
      flash('Brief sent. The team will pick it up from the build queue.');
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not send that brief.');
    } finally { setBusy(null); }
  };

  const filled = BRIEF.filter(([k]) => (details[k] || '').trim()).length;

  return (
    <StudioModule
      active="Build my portfolio"
      title="Build my portfolio"
      sub="Send us the brief and our team builds your portfolio for you — rather than you filling in fifteen sections yourself."
    >
      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <StatRow items={[
            { label: 'Access', value: unlocked ? 'Unlocked' : 'Locked', hint: gate.via === 'plan' ? 'Included in your plan' : gate.via === 'payment' ? 'Paid' : undefined },
            { label: 'Brief', value: `${filled} / ${BRIEF.length} answered` },
            { label: 'Request', value: existing ? (existing.status || 'pending') : 'None yet' },
            { label: 'Team listed', value: (team.team_members || []).length ? `${(team.team_members || []).length}` : 'No' },
          ]}
          />

          <InlineError message={err} />

          {existing && (
            <Panel
              title="Your current request"
              sub={existing.created_at ? `Sent ${relTime(existing.created_at)}` : undefined}
              actions={<span className={`wmod-pill wmod-pill--${existing.status === 'done' ? 'yes' : 'maybe'}`}>{existing.status || 'pending'}</span>}
            >
              <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: 0, color: 'var(--mj-muted)' }}>
                We have your brief. Editing it below and sending again replaces this one —
                there is only ever a single open request per studio.
              </p>
            </Panel>
          )}

          {!unlocked ? (
            <Panel title="Unlock build help" sub="A one-off fee, or included free on a premium portfolio plan.">
              <Empty
                title={`${rupees.format(gate.fee_inr ?? 100)} once`}
                body="Covers our team building the portfolio from your brief. If you upgrade to a premium portfolio plan later, this is included and you will not be charged again."
                action={(
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button type="button" className="wmod-btn wmod-btn--primary" onClick={pay} disabled={busy === 'pay'}>
                      {busy === 'pay' ? 'Opening payment…' : `Pay ${rupees.format(gate.fee_inr ?? 100)}`}
                    </button>
                    <a className="wmod-btn wmod-btn--ghost" href="/studio/plans">See plans</a>
                  </div>
                )}
              />
            </Panel>
          ) : (
            <Panel
              title="Your brief"
              sub="The more specific this is, the closer the first draft lands. Nothing here is published until you approve it."
            >
              <div className="wmod-grid">
                {BRIEF.map(([key, label, placeholder]) => (
                  <div className="wmod-field" key={key}>
                    <label className="wmod-label" htmlFor={`brief-${key}`}>{label}</label>
                    <textarea
                      id={`brief-${key}`}
                      className="wmod-input"
                      rows={2}
                      value={details[key] || ''}
                      onChange={set(key)}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>

              <div className="wmod-field" style={{ marginTop: 14 }}>
                <label className="wmod-label" htmlFor="brief-notes">Anything else</label>
                <textarea
                  id="brief-notes"
                  className="wmod-input"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Deadlines, things to avoid, a look you specifically do not want."
                />
              </div>

              <button
                type="button"
                className="wmod-btn wmod-btn--primary"
                style={{ marginTop: 14 }}
                onClick={submit}
                disabled={busy === 'submit' || filled === 0}
              >
                {busy === 'submit' ? 'Sending…' : existing ? 'Replace my brief' : 'Send the brief'}
              </button>
              {filled === 0 && <p className="wmod-hint" style={{ marginTop: 8 }}>Answer at least one question first.</p>}
            </Panel>
          )}
        </>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
