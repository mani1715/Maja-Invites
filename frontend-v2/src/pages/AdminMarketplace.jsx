import { useEffect, useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, rupees, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Marketplace operations — the Pixora economy, which had backend support and
// no screen at all.
//
// Four things the owner could not see or change without a database client:
//   who is advertising            GET  /api/admin/campaigns  (+ brands)
//   what the marketplace earns    GET  /api/admin/industry-analytics
//   what currency we quote in     GET/PUT /api/admin/currency/rates
//   whether push can reach anyone GET  /api/admin/push/stats
//
// Every shape below is read off pixora_service.py. Notably INR is forced to
// 1.0 server-side because it is the base, so it is shown read-only rather than
// as an editable field that silently ignores you.

const CAMPAIGN_ACTIONS = [
  ['feature', 'Feature'],
  ['unfeature', 'Unfeature'],
  ['remove', 'Remove'],
  ['reopen', 'Reopen'],
];

export default function AdminMarketplace() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const { data, error, loading, reload } = useAsync(() => Promise.all([
    api.adminCampaigns().then((r) => r.data).catch(() => null),
    api.industryAnalytics().then((r) => r.data).catch(() => null),
    api.currencyRates().then((r) => r.data).catch(() => null),
    // Push is genuinely optional — no FCM_SERVER_KEY in production means the
    // registration endpoints exist but nothing ever registers.
    api.pushStats().then((r) => r.data).catch(() => null),
  ]).then(([campaigns, industry, currency, push]) => ({ campaigns, industry, currency, push })));

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try { await fn(); flash(msg); await reload(); }
    catch (e) { setErr(e?.response?.data?.detail || 'That did not work.'); }
    finally { setBusy(null); }
  };

  const camp = data?.campaigns;
  const ind = data?.industry;
  const push = data?.push;
  const campaigns = camp?.campaigns || [];
  const brands = camp?.brands || [];

  return (
    <AdminModule
      active="Marketplace"
      title="Marketplace"
      sub="Brand campaigns, what the vendor marketplace earns, and the exchange rates the storefront quotes in."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Campaigns', value: loading ? '—' : numberFmt.format(camp?.totals?.campaigns ?? campaigns.length) },
        { label: 'Open', value: loading ? '—' : numberFmt.format(camp?.totals?.open ?? 0) },
        { label: 'Brands', value: loading ? '—' : numberFmt.format(camp?.totals?.brands ?? brands.length) },
        { label: 'Booking revenue', value: loading ? '—' : rupees.format(ind?.revenue ?? 0) },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={3} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel
            title="Brand campaigns"
            sub="Paid placements studios can apply to. Removing one hides it from the community immediately."
            pad={false}
          >
            {campaigns.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty
                  title="No campaigns yet"
                  body="Brands create campaigns from the Pixora marketplace. They appear here for moderation as soon as one does."
                />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Campaign</th><th>Brand</th><th>Budget</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.title || c.name || 'Untitled'}
                          {c.featured && <span className="wmod-pill wmod-pill--yes" style={{ marginLeft: 8 }}>Featured</span>}
                          {c.created_at && <><br /><span className="wmod-td-muted">{relTime(c.created_at)}</span></>}
                        </td>
                        <td className="wmod-td-muted">{c.brand_name || c.brand?.name || '—'}</td>
                        <td>{c.budget_inr != null ? rupees.format(c.budget_inr) : '—'}</td>
                        <td>
                          <span className={`wmod-pill wmod-pill--${c.status === 'open' ? 'yes' : 'neutral'}`}>
                            {c.status || '—'}
                          </span>
                        </td>
                        <td className="wmod-td-actions">
                          {CAMPAIGN_ACTIONS.map(([a, lbl]) => (
                            <button
                              key={a}
                              type="button"
                              className={`wmod-btn wmod-btn--sm ${a === 'remove' ? 'wmod-btn--danger' : 'wmod-btn--ghost'}`}
                              style={{ marginLeft: 6 }}
                              disabled={busy === `${c.id}-${a}`}
                              onClick={() => run(`${c.id}-${a}`, () => api.campaignAction(c.id, a), `Campaign ${a}d.`)}
                            >
                              {busy === `${c.id}-${a}` ? '…' : lbl}
                            </button>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Brands" sub="Verifying a brand is a trust signal shown to every studio it approaches." pad={false}>
            {brands.length === 0 ? (
              <div className="wmod-panel-body"><Empty title="No brands registered" /></div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr><th>Brand</th><th>Campaigns</th><th>Verified</th><th /></tr></thead>
                  <tbody>
                    {brands.map((b) => (
                      <tr key={b.id}>
                        <td>{b.name || 'Unnamed'}</td>
                        <td>{numberFmt.format(b.campaigns ?? 0)}</td>
                        <td>
                          <span className={`wmod-pill wmod-pill--${b.verified ? 'yes' : 'neutral'}`}>
                            {b.verified ? 'Verified' : 'No'}
                          </span>
                        </td>
                        <td className="wmod-td-actions">
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                            disabled={busy === `brand-${b.id}`}
                            onClick={() => run(`brand-${b.id}`, () => api.verifyBrand(b.id), 'Brand updated.')}
                          >
                            {busy === `brand-${b.id}` ? '…' : b.verified ? 'Unverify' : 'Verify'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {ind && <IndustryPanel ind={ind} />}

          <CurrencyPanel initial={data?.currency} onSaved={reload} flash={flash} setErr={setErr} />

          <Panel
            title="Push notifications"
            sub="Device registrations. Sending also needs FCM_SERVER_KEY on the server — without it these tokens are collected but nothing is delivered."
          >
            {!push ? (
              <Empty title="Push statistics unavailable" body="The push endpoints are not mounted on this deployment." />
            ) : (
              <>
                <StatRow items={[
                  { label: 'Registered devices', value: numberFmt.format(push.tokens ?? 0) },
                  { label: 'Queued, unsent', value: numberFmt.format(push.outbox_pending ?? 0) },
                ]}
                />
                {Object.keys(push.by_platform || {}).length > 0 && (
                  <div className="wmod-list" style={{ marginTop: 14 }}>
                    {Object.entries(push.by_platform).map(([k, v]) => (
                      <div className="wmod-item" key={k}>
                        <span style={{ textTransform: 'capitalize' }}>{k}</span>
                        <span>{numberFmt.format(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(push.outbox_pending ?? 0) > 0 && (
                  <p className="wmod-hint" style={{ marginTop: 12 }}>
                    {numberFmt.format(push.outbox_pending)} notifications are waiting.
                    They will stay queued until a push provider is configured.
                  </p>
                )}
              </>
            )}
          </Panel>
        </>
      )}

      <Toast message={toast} />
    </AdminModule>
  );
}

function IndustryPanel({ ind }) {
  const rows = (label, arr) => (
    <div style={{ flex: '1 1 220px', minWidth: 200 }}>
      <p className="wmod-label" style={{ marginBottom: 8 }}>{label}</p>
      {(!arr || arr.length === 0) ? (
        <p className="wmod-hint">Nothing yet.</p>
      ) : (
        <div className="wmod-list">
          {arr.map((r) => (
            <div className="wmod-item" key={r.k}>
              <span>{r.k}</span>
              <span>{numberFmt.format(r.v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Panel title="Vendor marketplace" sub="Bookings between studios and vendors. Revenue counts confirmed and completed bookings only.">
      <StatRow items={[
        { label: 'Workspaces', value: numberFmt.format(ind.workspaces ?? 0) },
        { label: 'Vendors', value: numberFmt.format(ind.vendors ?? 0) },
        { label: 'Bookings', value: numberFmt.format(ind.bookings ?? 0) },
        { label: 'Revenue', value: rupees.format(ind.revenue ?? 0) },
      ]}
      />
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginTop: 18 }}>
        {rows('By category', ind.by_category)}
        {rows('By region', ind.by_region)}
      </div>
      {Array.isArray(ind.monthly) && ind.monthly.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p className="wmod-label" style={{ marginBottom: 8 }}>Bookings by month</p>
          <div className="wmod-list">
            {ind.monthly.map((m) => (
              <div className="wmod-item" key={m.month}>
                <span>{m.month}</span>
                <span>{numberFmt.format(m.count)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function CurrencyPanel({ initial, onSaved, flash, setErr }) {
  const [rates, setRates] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRates({ ...(initial?.rates || {}) }); }, [initial]);

  if (!initial) {
    return (
      <Panel title="Currency">
        <Empty title="Exchange rates unavailable" body="The currency endpoints are not mounted on this deployment." />
      </Panel>
    );
  }

  const currencies = initial.currencies || Object.keys(rates);
  const symbols = initial.symbols || {};

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const clean = {};
      for (const c of currencies) {
        const n = Number(rates[c]);
        if (Number.isFinite(n) && n > 0) clean[c] = n;
      }
      await api.saveCurrencyRates(clean);
      flash('Rates saved.');
      await onSaved();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Rates did not save.');
    } finally { setBusy(false); }
  };

  return (
    <Panel
      title="Currency"
      sub="What one rupee is worth in each currency the storefront can quote. These are entered by hand — nothing fetches a live rate."
    >
      <div className="wmod-grid">
        {currencies.map((c) => (
          <div className="wmod-field" key={c}>
            <label className="wmod-label" htmlFor={`cur-${c}`}>
              {symbols[c] ? `${symbols[c]} ` : ''}{c}
              {c === 'INR' && <span className="wmod-td-muted"> · base</span>}
            </label>
            <input
              id={`cur-${c}`}
              data-mj-field
              className="wmod-input"
              type="number"
              step="0.0001"
              min="0"
              /* INR is the base and the server forces it to 1.0 whatever is
                 sent, so an editable box here would be a lie. */
              disabled={c === 'INR'}
              value={c === 'INR' ? 1 : (rates[c] ?? '')}
              onChange={(e) => setRates((p) => ({ ...p, [c]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <button type="button" className="wmod-btn wmod-btn--primary" style={{ marginTop: 16 }} disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save rates'}
      </button>
    </Panel>
  );
}
