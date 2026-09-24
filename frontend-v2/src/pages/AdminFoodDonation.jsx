import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Food donation centres — where surplus wedding food can actually go.
//
// The register is shown to guests on invitations, which makes it the one
// screen in this console where a typo has consequences outside the product: a
// wrong phone number sends food, or a person, nowhere. CLAUDE.md's rule is
// therefore absolute — display only what the API returns, never hard-code or
// complete a charity number. This page has no placeholder numbers and no
// example data for that reason; the one entry that ships is the seeded
// national Childline helpline, and it comes from the server.
//
// `city: ""` means national — shown everywhere, not just in one city.

export default function AdminFoodDonation() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ name: '', phone: '', address: '', city: '', state: '' });

  const { data, error, loading, reload } = useAsync(() => api.foodCenters().then((r) => r.data));
  const centers = data?.centers || [];
  const national = centers.filter((c) => !c.city);
  const local = centers.filter((c) => c.city);

  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setErr(null); };

  const add = async () => {
    if (!f.name.trim() || f.phone.trim().length < 3) {
      setErr('A name and a working phone number are both required.');
      return;
    }
    setBusy('add');
    setErr(null);
    try {
      await api.addFoodCenter({
        name: f.name.trim(),
        phone: f.phone.trim(),
        address: f.address.trim(),
        // Lower-cased because the public lookup matches on an exact
        // lower-cased city string (food_features.list_for_city).
        city: f.city.trim().toLowerCase(),
        state: f.state.trim(),
        verified: true,
      });
      setF({ name: '', phone: '', address: '', city: '', state: '' });
      flash('Centre added.');
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not save.');
    } finally { setBusy(null); }
  };

  const remove = (c) => {
    if (!window.confirm(`Remove “${c.name}”? Guests will stop seeing it immediately.`)) return;
    setBusy(c.id);
    setErr(null);
    api.deleteFoodCenter(c.id)
      .then(() => { flash('Removed.'); return reload(); })
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not remove it.'))
      .finally(() => setBusy(null));
  };

  const table = (rows, title, sub) => (
    <Panel title={title} sub={sub} pad={false}>
      {rows.length === 0 ? (
        <div className="wmod-panel-body"><Empty title="None listed" /></div>
      ) : (
        <div className="wmod-tablewrap">
          <table className="wmod-table">
            <thead><tr><th>Centre</th><th>Phone</th><th>Where</th><th /></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name}
                    {c.verified && <span className="wmod-pill wmod-pill--yes" style={{ marginLeft: 8 }}>Verified</span>}
                    {c.address && <><br /><span className="wmod-td-muted">{c.address}</span></>}
                  </td>
                  <td><a href={`tel:${c.phone}`}>{c.phone}</a></td>
                  <td className="wmod-td-muted" style={{ textTransform: 'capitalize' }}>
                    {c.city ? [c.city, c.state].filter(Boolean).join(', ') : 'Everywhere'}
                  </td>
                  <td className="wmod-td-actions">
                    <button
                      type="button"
                      className="wmod-btn wmod-btn--danger wmod-btn--sm"
                      disabled={busy === c.id}
                      onClick={() => remove(c)}
                    >
                      {busy === c.id ? '…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );

  return (
    <AdminModule
      active="Food donation"
      title="Food donation"
      sub="Where surplus food from a wedding can go. These numbers are shown to guests, so only add ones you have actually called."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Centres', value: loading ? '—' : numberFmt.format(centers.length) },
        { label: 'National', value: loading ? '—' : numberFmt.format(national.length) },
        { label: 'City-specific', value: loading ? '—' : numberFmt.format(local.length) },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {table(national, 'Shown everywhere', 'Listed on every invitation regardless of city.')}
          {table(local, 'City-specific', 'Only shown on invitations for a matching city.')}

          <Panel title="Add a centre" sub="Leave the city blank to list it on every invitation.">
            <div className="wmod-grid">
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="fd-name">Name</label>
                <input id="fd-name" data-mj-field className="wmod-input" value={f.name} onChange={set('name')} />
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="fd-phone">Phone</label>
                <input id="fd-phone" data-mj-field className="wmod-input" value={f.phone} onChange={set('phone')} inputMode="tel" />
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="fd-city">City <span className="wmod-td-muted">(blank = everywhere)</span></label>
                <input id="fd-city" data-mj-field className="wmod-input" value={f.city} onChange={set('city')} />
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="fd-state">State</label>
                <input id="fd-state" data-mj-field className="wmod-input" value={f.state} onChange={set('state')} />
              </div>
              <div className="wmod-field wmod-field--wide">
                <label className="wmod-label" htmlFor="fd-addr">Address</label>
                <input id="fd-addr" data-mj-field className="wmod-input" value={f.address} onChange={set('address')} />
              </div>
            </div>
            <p className="wmod-hint" style={{ marginTop: 12 }}>
              Call the number before you add it. Guests act on what is listed here.
            </p>
            <button type="button" className="wmod-btn wmod-btn--primary" style={{ marginTop: 12 }} disabled={busy === 'add'} onClick={add}>
              {busy === 'add' ? 'Saving…' : 'Add centre'}
            </button>
          </Panel>
        </>
      )}

      <Toast message={toast} />
    </AdminModule>
  );
}
