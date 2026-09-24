import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import WeddingModule, { Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash } from '@/components/WeddingModule';
import * as api from '@/api/weddingGifts';

// Gifts tab — replaces the legacy GiftRegistryEditor + DigitalShagunSettings.
// Two genuinely different features, so they stay as two sub-views rather than
// one merged form: the registry says what to give, Shagun takes cash.

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const UPI_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export default function WeddingGifts() {
  const { weddingId } = useParams();
  return (
    <WeddingModule weddingId={weddingId} active="Gifts" title="Gifts">
      {(profile) => <GiftsBody profileId={profile.id} />}
    </WeddingModule>
  );
}

function GiftsBody({ profileId }) {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'shagun' ? 'shagun' : 'registry';
  const setView = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'shagun') next.set('view', 'shagun'); else next.delete('view');
    setParams(next, { replace: true });
  };

  const [registry, setRegistry] = useState(null);
  const [shagun, setShagun] = useState(null);
  const [dash, setDash] = useState(null);
  const [error, setError] = useState(null);
  const [toast, flash] = useFlash();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, s, d] = await Promise.all([
        api.getRegistry(profileId),
        api.getShagun(profileId),
        api.shagunDashboard(profileId).catch(() => ({ data: null })),
      ]);
      setRegistry(r.data);
      setShagun(s.data);
      setDash(d.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load gift settings.');
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const loading = registry === null && shagun === null && !error;

  return (
    <>
      <StatRow items={[
        { label: 'Registry', value: registry?.enabled ? 'On' : 'Off', hint: registry ? `${(registry.suggestions || []).length} suggestions` : undefined },
        { label: 'Shagun', value: shagun?.enabled ? 'On' : 'Off', hint: shagun?.razorpay_enabled ? 'Razorpay live' : 'UPI only' },
        { label: 'Blessings received', value: dash ? rupees.format(dash.total_received || 0) : '—', hint: dash ? `${dash.paid_count} paid` : undefined },
        { label: 'Your share', value: dash ? rupees.format(dash.photographer_earnings || 0) : '—', hint: dash ? `after ${rupees.format(dash.platform_fees || 0)} fees` : undefined },
      ]}
      />

      <Segmented
        ariaLabel="Gift views"
        value={view}
        onChange={setView}
        options={[
          { id: 'registry', label: 'Gift registry' },
          { id: 'shagun', label: 'Digital Shagun' },
        ]}
      />

      <InlineError message={error} />
      {loading && <div className="wmod-skel" style={{ height: 340 }} />}

      {!loading && view === 'registry' && registry && (
        <RegistryForm profileId={profileId} initial={registry} onSaved={(d) => { setRegistry(d); flash('Gift registry saved.'); }} />
      )}
      {!loading && view === 'shagun' && shagun && (
        <ShagunForm profileId={profileId} initial={shagun} dash={dash} onSaved={(d) => { setShagun(d); flash('Shagun settings saved.'); }} />
      )}

      <Toast message={toast} />
    </>
  );
}

// ---------------------------------------------------------------- registry

function RegistryForm({ profileId, initial, onSaved }) {
  const [f, setF] = useState(() => ({ ...initial, suggestions: initial.suggestions || [] }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [fe, setFe] = useState({});

  const set = (patch) => { setF((p) => ({ ...p, ...patch })); setErr(null); };

  const setSuggestion = (i, patch) =>
    set({ suggestions: f.suggestions.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });

  const addSuggestion = () =>
    set({
      suggestions: [...f.suggestions, {
        // A tmp- id is safe: the server strips non-UUID ids and reissues.
        id: `tmp-${Date.now()}`, title: '', description: '', category: 'custom',
        icon: '🎁', price_hint: '', link: '', order: f.suggestions.length,
      }],
    });

  const removeSuggestion = (i) => set({ suggestions: f.suggestions.filter((_, idx) => idx !== i) });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (f.accept_upi && !UPI_RE.test((f.upi_id || '').trim())) errs.upi_id = 'Enter a valid UPI id, e.g. name@okhdfcbank';
    if (f.accept_bank) {
      if (!(f.bank_account_name || '').trim()) errs.bank_account_name = 'Account holder name is required.';
      if (!(f.bank_account_number || '').trim()) errs.bank_account_number = 'Account number is required.';
      if (!IFSC_RE.test((f.bank_ifsc || '').trim().toUpperCase())) errs.bank_ifsc = 'IFSC looks wrong, e.g. HDFC0001234';
    }
    if (f.accept_external_registry && !/^https?:\/\//i.test((f.external_registry_url || '').trim())) {
      errs.external_registry_url = 'Enter the full URL, starting with https://';
    }
    f.suggestions.forEach((s, i) => {
      if (!(s.title || '').trim()) errs[`s${i}`] = 'A title is required.';
    });
    setFe(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setErr(null);
    try {
      const { data } = await api.updateRegistry(profileId, {
        ...f,
        bank_ifsc: f.bank_ifsc ? f.bank_ifsc.trim().toUpperCase() : null,
        suggestions: f.suggestions.map((s, i) => ({ ...s, order: i })),
      });
      onSaved(data);
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not save the registry.');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit}>
      <InlineError message={err} />

      <Panel title="Gift registry" sub="Shown on the invitation under its own section. Off by default — many families prefer no gifts at all.">
        <label className="wmod-check" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={!!f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Show the gift section on the invitation
        </label>

        <div className="wmod-grid">
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="r-head">Headline</label>
            <input id="r-head" data-mj-field className="wmod-input" value={f.headline || ''} onChange={(e) => set({ headline: e.target.value })} />
          </div>
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="r-msg">Message</label>
            <textarea id="r-msg" data-mj-field className="wmod-input" rows={3} value={f.message || ''} onChange={(e) => set({ message: e.target.value })} />
          </div>
        </div>

        {!f.enabled && (
          <label className="wmod-check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={!!f.show_disabled_note} onChange={(e) => set({ show_disabled_note: e.target.checked })} />
            Still show a short &ldquo;no gifts please&rdquo; note
          </label>
        )}
      </Panel>

      <Panel title="How guests can give" sub="Only what you switch on is shown. Bank details appear exactly as typed, so check them twice.">
        <label className="wmod-check">
          <input type="checkbox" checked={!!f.accept_upi} onChange={(e) => set({ accept_upi: e.target.checked })} />
          UPI
        </label>
        {f.accept_upi && (
          <div className="wmod-grid" style={{ margin: '10px 0 18px' }}>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="r-upi">UPI id</label>
              <input id="r-upi" data-mj-field className="wmod-input" value={f.upi_id || ''} onChange={(e) => set({ upi_id: e.target.value })} placeholder="name@okhdfcbank" />
              {fe.upi_id && <p className="wmod-err">{fe.upi_id}</p>}
            </div>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="r-upin">Name on the UPI account</label>
              <input id="r-upin" data-mj-field className="wmod-input" value={f.upi_name || ''} onChange={(e) => set({ upi_name: e.target.value })} />
            </div>
          </div>
        )}

        <label className="wmod-check">
          <input type="checkbox" checked={!!f.accept_bank} onChange={(e) => set({ accept_bank: e.target.checked })} />
          Bank transfer
        </label>
        {f.accept_bank && (
          <div className="wmod-grid" style={{ margin: '10px 0 18px' }}>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="r-ban">Account holder</label>
              <input id="r-ban" data-mj-field className="wmod-input" value={f.bank_account_name || ''} onChange={(e) => set({ bank_account_name: e.target.value })} />
              {fe.bank_account_name && <p className="wmod-err">{fe.bank_account_name}</p>}
            </div>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="r-bank">Bank</label>
              <input id="r-bank" data-mj-field className="wmod-input" value={f.bank_name || ''} onChange={(e) => set({ bank_name: e.target.value })} />
            </div>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="r-bacc">Account number</label>
              <input id="r-bacc" data-mj-field className="wmod-input" value={f.bank_account_number || ''} onChange={(e) => set({ bank_account_number: e.target.value })} inputMode="numeric" />
              {fe.bank_account_number && <p className="wmod-err">{fe.bank_account_number}</p>}
            </div>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="r-ifsc">IFSC</label>
              <input id="r-ifsc" data-mj-field className="wmod-input" value={f.bank_ifsc || ''} onChange={(e) => set({ bank_ifsc: e.target.value })} style={{ textTransform: 'uppercase' }} />
              {fe.bank_ifsc && <p className="wmod-err">{fe.bank_ifsc}</p>}
            </div>
          </div>
        )}

        <label className="wmod-check">
          <input type="checkbox" checked={!!f.accept_external_registry} onChange={(e) => set({ accept_external_registry: e.target.checked })} />
          Link an external wishlist
        </label>
        {f.accept_external_registry && (
          <div className="wmod-grid" style={{ marginTop: 10 }}>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="r-exurl">Wishlist URL</label>
              <input id="r-exurl" data-mj-field className="wmod-input" value={f.external_registry_url || ''} onChange={(e) => set({ external_registry_url: e.target.value })} inputMode="url" />
              {fe.external_registry_url && <p className="wmod-err">{fe.external_registry_url}</p>}
            </div>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="r-exlab">Button label</label>
              <input id="r-exlab" data-mj-field className="wmod-input" value={f.external_registry_label || ''} onChange={(e) => set({ external_registry_label: e.target.value })} />
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Gift suggestions"
        sub="Optional ideas shown as cards. Leave empty if the couple would rather not suggest anything."
        actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={addSuggestion}>+ Add suggestion</button>}
      >
        {f.suggestions.length === 0 ? (
          <Empty title="No suggestions" body="Guests will just see the message and the payment options above." />
        ) : f.suggestions.map((s, i) => (
          <div key={s.id || i} style={{ border: '1px solid var(--mj-border)', borderRadius: 'var(--mj-radius-card-inner)', padding: 16, marginBottom: 12, background: 'var(--mj-section)' }}>
            <div className="wmod-grid">
              <div className="wmod-field">
                <label className="wmod-label" htmlFor={`s-t-${i}`}>Title</label>
                <input id={`s-t-${i}`} data-mj-field className="wmod-input" value={s.title} onChange={(e) => setSuggestion(i, { title: e.target.value })} maxLength={120} />
                {fe[`s${i}`] && <p className="wmod-err">{fe[`s${i}`]}</p>}
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor={`s-p-${i}`}>Price hint</label>
                <input id={`s-p-${i}`} data-mj-field className="wmod-input" value={s.price_hint || ''} onChange={(e) => setSuggestion(i, { price_hint: e.target.value })} placeholder="around Rs 2,000" />
              </div>
              <div className="wmod-field wmod-field--wide">
                <label className="wmod-label" htmlFor={`s-d-${i}`}>Description</label>
                <textarea id={`s-d-${i}`} data-mj-field className="wmod-input" rows={2} maxLength={400} value={s.description || ''} onChange={(e) => setSuggestion(i, { description: e.target.value })} />
              </div>
              <div className="wmod-field wmod-field--wide">
                <label className="wmod-label" htmlFor={`s-l-${i}`}>Link</label>
                <input id={`s-l-${i}`} data-mj-field className="wmod-input" value={s.link || ''} onChange={(e) => setSuggestion(i, { link: e.target.value })} inputMode="url" />
              </div>
            </div>
            <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" style={{ marginTop: 12 }} onClick={() => removeSuggestion(i)}>Remove</button>
          </div>
        ))}
      </Panel>

      <button type="submit" className="wmod-btn wmod-btn--primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save gift registry'}
      </button>
    </form>
  );
}

// ------------------------------------------------------------------ shagun

function ShagunForm({ profileId, initial, dash, onSaved }) {
  const [f, setF] = useState(() => ({ ...initial, suggested_amounts: initial.suggested_amounts || [] }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [fe, setFe] = useState({});
  const [amountsText, setAmountsText] = useState((initial.suggested_amounts || []).join(', '));

  const set = (patch) => { setF((p) => ({ ...p, ...patch })); setErr(null); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const amounts = amountsText.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    if (f.enabled && !UPI_RE.test((f.upi_id || '').trim()) && !f.razorpay_enabled) {
      errs.upi_id = 'Shagun needs either a valid UPI id or Razorpay switched on.';
    }
    if (f.razorpay_enabled && !(f.razorpay_key_id || '').trim()) {
      errs.razorpay_key_id = 'Razorpay key id is required when Razorpay is on.';
    }
    if (!amounts.length) errs.amounts = 'Give at least one suggested amount.';
    const fee = Number(f.platform_fee_percent);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) errs.fee = 'Fee must be between 0 and 100.';
    setFe(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setErr(null);
    try {
      // ShagunSettings is a full model — send every field back or the omitted
      // ones reset to their defaults.
      const payload = {
        enabled: !!f.enabled,
        upi_id: f.upi_id || null,
        payee_name: f.payee_name || null,
        suggested_amounts: amounts,
        blessing_message: f.blessing_message || null,
        gpay_handle: f.gpay_handle || null,
        phonepe_handle: f.phonepe_handle || null,
        paytm_handle: f.paytm_handle || null,
        razorpay_enabled: !!f.razorpay_enabled,
        razorpay_key_id: f.razorpay_key_id || null,
        razorpay_key_secret: f.razorpay_key_secret || null,
        platform_fee_percent: fee,
      };
      const { data } = await api.setShagun(profileId, payload);
      onSaved(data.settings || payload);
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not save Shagun settings.');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit}>
      <InlineError message={err} />

      <Panel title="Digital Shagun" sub="Cash blessings, sent from the invitation. Guests pick an amount and pay by UPI or card.">
        <label className="wmod-check" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={!!f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Accept Shagun on this invitation
        </label>

        <div className="wmod-grid">
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="sh-upi">UPI id</label>
            <input id="sh-upi" data-mj-field className="wmod-input" value={f.upi_id || ''} onChange={(e) => set({ upi_id: e.target.value })} placeholder="name@okhdfcbank" />
            {fe.upi_id && <p className="wmod-err">{fe.upi_id}</p>}
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="sh-payee">Payee name</label>
            <input id="sh-payee" data-mj-field className="wmod-input" value={f.payee_name || ''} onChange={(e) => set({ payee_name: e.target.value })} />
          </div>
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="sh-amt">Suggested amounts</label>
            <input id="sh-amt" data-mj-field className="wmod-input" value={amountsText} onChange={(e) => { setAmountsText(e.target.value); setErr(null); }} placeholder="101, 501, 1001, 2001" inputMode="numeric" />
            <p className="wmod-hint">Comma separated, in rupees. Guests can always type their own.</p>
            {fe.amounts && <p className="wmod-err">{fe.amounts}</p>}
          </div>
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="sh-msg">Blessing message</label>
            <textarea id="sh-msg" data-mj-field className="wmod-input" rows={2} value={f.blessing_message || ''} onChange={(e) => set({ blessing_message: e.target.value })} />
          </div>
        </div>
      </Panel>

      <Panel title="Other wallets" sub="Optional. Shown as extra buttons alongside UPI.">
        <div className="wmod-grid">
          {[['gpay_handle', 'Google Pay handle'], ['phonepe_handle', 'PhonePe handle'], ['paytm_handle', 'Paytm handle']].map(([k, label]) => (
            <div className="wmod-field" key={k}>
              <label className="wmod-label" htmlFor={`sh-${k}`}>{label}</label>
              <input id={`sh-${k}`} data-mj-field className="wmod-input" value={f[k] || ''} onChange={(e) => set({ [k]: e.target.value })} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Card payments (Razorpay)" sub="Turn this on to accept cards and netbanking as well as UPI. Use your own studio keys — money settles to your Razorpay account.">
        <label className="wmod-check" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={!!f.razorpay_enabled} onChange={(e) => set({ razorpay_enabled: e.target.checked })} />
          Accept card payments through Razorpay
        </label>
        {f.razorpay_enabled && (
          <div className="wmod-grid">
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="sh-rzk">Key id</label>
              <input id="sh-rzk" data-mj-field className="wmod-input" value={f.razorpay_key_id || ''} onChange={(e) => set({ razorpay_key_id: e.target.value })} autoComplete="off" />
              {fe.razorpay_key_id && <p className="wmod-err">{fe.razorpay_key_id}</p>}
            </div>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="sh-rzs">Key secret</label>
              <input id="sh-rzs" data-mj-field className="wmod-input" type="password" value={f.razorpay_key_secret || ''} onChange={(e) => set({ razorpay_key_secret: e.target.value })} autoComplete="new-password" />
              <p className="wmod-hint">Stored against this wedding only.</p>
            </div>
            <div className="wmod-field">
              <label className="wmod-label" htmlFor="sh-fee">Platform fee %</label>
              <input id="sh-fee" data-mj-field className="wmod-input" type="number" min="0" max="100" step="0.5" value={f.platform_fee_percent} onChange={(e) => set({ platform_fee_percent: e.target.value })} />
              {fe.fee && <p className="wmod-err">{fe.fee}</p>}
            </div>
          </div>
        )}
      </Panel>

      {dash && dash.records?.length > 0 && (
        <Panel title="Blessings received" sub="The most recent Shagun payments on this wedding." pad={false}>
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead>
                <tr><th>From</th><th>Amount</th><th>Your share</th><th>Status</th><th>When</th></tr>
              </thead>
              <tbody>
                {dash.records.slice(0, 25).map((r) => (
                  <tr key={r.id || `${r.created_at}-${r.amount}`}>
                    <td>{r.guest_name || r.name || 'A guest'}</td>
                    <td>{rupees.format(r.amount || 0)}</td>
                    <td className="wmod-td-muted">{rupees.format(r.photographer_amount ?? r.amount ?? 0)}</td>
                    <td>
                      <span className={`wmod-pill wmod-pill--${r.status === 'paid' ? 'yes' : 'maybe'}`}>{r.status || 'pending'}</span>
                    </td>
                    <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <button type="submit" className="wmod-btn wmod-btn--primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save Shagun settings'}
      </button>
    </form>
  );
}
