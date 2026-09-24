import { useCallback, useEffect, useState } from 'react';
import AdminModule, { Panel, Segmented, Empty, useFlash } from '@/components/AdminModule';
import { Toast, InlineError } from '@/components/WeddingModule';
import ConfirmModal from '@/components/adminpricing/ConfirmModal';
import * as api from '@/api/adminPricing';

// AdminPricingHub — the live pricing engine (pricing_hub_service.py). This is
// the resolver checkout actually reads (pricing_engine.compute_wedding_total /
// compute_plan_total, via quote_wedding / quote_plan). It is a SEPARATE system
// from the "Pricing Hub" tabs at /admin/pricing (AdminPricing.jsx), which edit
// subscription_service.py / store_features.py / pricing_features.py rows —
// different collections, different fields, same visual language.
//
// Six endpoint groups, none of which had a frontend caller before this page:
// categories, feature-packs, link-durations, campaigns, plans, community —
// plus the read-only simulator. Every price-bearing save confirms old -> new
// before it submits; the simulator never writes anything.

const TABS = [
  { key: 'simulate', label: 'Simulator' },
  { key: 'categories', label: 'Categories' },
  { key: 'packs', label: 'Feature Packs' },
  { key: 'durations', label: 'Link Durations' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'plans', label: 'Plans' },
  { key: 'community', label: 'Community' },
];

const rupee = (v) => (v === null || v === undefined || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

export default function AdminPricingHub() {
  const [tab, setTab] = useState('simulate');
  const [toast, flash] = useFlash();

  return (
    <AdminModule
      active="Pricing hub"
      title="Pricing Engine"
      sub="The live resolver checkout reads (pricing_engine.py). Every price-bearing save confirms old → new before it submits — nothing here is a draft that silently goes live."
    >
      <Segmented ariaLabel="Section" value={tab} onChange={setTab} options={TABS.map((t) => ({ id: t.key, label: t.label }))} />

      {tab === 'simulate' && <SimulateTab />}
      {tab === 'categories' && <CategoriesTab flash={flash} />}
      {tab === 'packs' && <FeaturePacksTab flash={flash} />}
      {tab === 'durations' && <LinkDurationsTab flash={flash} />}
      {tab === 'campaigns' && <CampaignsTab flash={flash} />}
      {tab === 'plans' && <PlansTab flash={flash} />}
      {tab === 'community' && <CommunityTab flash={flash} />}

      <Toast message={toast} />
    </AdminModule>
  );
}

// --------------------------------------------------------------------------
// Simulator — read-only dry run against the exact resolver checkout uses
// --------------------------------------------------------------------------
function SimulateTab() {
  return (
    <>
      <div style={{
        background: 'var(--mj-accent-soft)', border: '1px solid var(--mj-border-accent)',
        borderRadius: 'var(--mj-radius-card)', padding: '14px 18px', marginBottom: 20,
        fontSize: 13.5, color: 'var(--mj-ink-deep)', lineHeight: 1.6,
      }}
      >
        <strong>Dry run.</strong> This calls <code>POST /api/admin/pricing/simulate</code>, which runs
        the identical <code>compute_wedding_total</code> / <code>compute_plan_total</code> resolver the
        live checkout uses. It reads current prices and campaigns — it writes nothing, ever.
      </div>
      <WeddingSimulator />
      <PlanSimulator />
    </>
  );
}

function WeddingSimulator() {
  const [form, setForm] = useState({ design_id: '', feature_pack_key: '', duration_id: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [packs, setPacks] = useState([]);
  const [durations, setDurations] = useState([]);

  useEffect(() => {
    api.hubFeaturePacks().then((r) => setPacks(r.data?.feature_packs || [])).catch(() => {});
    api.hubLinkDurations().then((r) => setDurations(r.data?.link_durations || [])).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.design_id.trim() || !form.feature_pack_key || !form.duration_id) {
      setError('Fill in a design ID, feature pack, and link duration first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.hubSimulate({ kind: 'wedding', ...form, design_id: form.design_id.trim() });
      setResult(data);
    } catch (e2) {
      setResult(null);
      setError(e2?.response?.data?.detail || 'Could not simulate that combination.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Wedding link — quote simulator" sub="design + feature pack + link duration − best campaign.">
      <form onSubmit={submit} className="wmod-grid" style={{ marginBottom: 16 }}>
        <label className="wmod-field">
          <span className="wmod-label">Design ID</span>
          <input className="wmod-input" placeholder="e.g. mughal_engagement_1" value={form.design_id}
            onChange={(e) => setForm({ ...form, design_id: e.target.value })} required
          />
        </label>
        <label className="wmod-field">
          <span className="wmod-label">Feature pack</span>
          <select className="wmod-input" value={form.feature_pack_key}
            onChange={(e) => setForm({ ...form, feature_pack_key: e.target.value })} required
          >
            <option value="">Choose…</option>
            {packs.map((p) => <option key={p.key} value={p.key}>{p.name} ({rupee(p.price)})</option>)}
          </select>
        </label>
        <label className="wmod-field">
          <span className="wmod-label">Link duration</span>
          <select className="wmod-input" value={form.duration_id}
            onChange={(e) => setForm({ ...form, duration_id: e.target.value })} required
          >
            <option value="">Choose…</option>
            {durations.map((d) => <option key={d.id} value={d.id}>{d.name} ({rupee(d.price)})</option>)}
          </select>
        </label>
        <div className="wmod-field" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" className="wmod-btn wmod-btn--primary" disabled={busy}>
            {busy ? 'Simulating…' : 'Simulate'}
          </button>
        </div>
      </form>
      <InlineError message={error} />
      {result && (
        <div className="wmod-tablewrap">
          <table className="wmod-table">
            <tbody>
              <tr><td>Design</td><td>{result.design?.name || result.design?.id}</td><td>{rupee(result.design_price)}</td></tr>
              <tr><td>Feature pack</td><td>{result.feature_pack?.name}</td><td>{rupee(result.feature_pack_price)}</td></tr>
              <tr><td>Link duration</td><td>{result.link_duration?.name}</td><td>{rupee(result.link_duration_price)}</td></tr>
              <tr><td colSpan={2} className="wmod-td-muted">Subtotal</td><td>{rupee(result.subtotal)}</td></tr>
              <tr>
                <td colSpan={2} className="wmod-td-muted">
                  Discount{result.campaign ? ` — ${result.campaign.name}` : ''}
                </td>
                <td>{result.discount ? `− ${rupee(result.discount)}` : '—'}</td>
              </tr>
              <tr style={{ fontWeight: 700 }}><td colSpan={2}>Total (what the buyer pays)</td><td>{rupee(result.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function PlanSimulator() {
  const [form, setForm] = useState({ plan_kind: 'portfolio', plan_id: '', cycle: '1' });
  const [plans, setPlans] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadPlans = useCallback((kind) => {
    api.hubPlans(kind).then((r) => setPlans(r.data?.plans || [])).catch(() => setPlans([]));
  }, []);
  useEffect(() => { loadPlans(form.plan_kind); }, [form.plan_kind, loadPlans]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.plan_id) { setError('Choose a plan first.'); return; }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.hubSimulate({ kind: 'plan', ...form });
      setResult(data);
    } catch (e2) {
      setResult(null);
      setError(e2?.response?.data?.detail || 'Could not simulate that plan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Portfolio / storage plan — quote simulator" sub="plan.durations[cycle] − best campaign.">
      <form onSubmit={submit} className="wmod-grid" style={{ marginBottom: 16 }}>
        <label className="wmod-field">
          <span className="wmod-label">Product</span>
          <select className="wmod-input" value={form.plan_kind}
            onChange={(e) => setForm({ ...form, plan_kind: e.target.value, plan_id: '' })}
          >
            <option value="portfolio">portfolio</option>
            <option value="storage">storage</option>
          </select>
        </label>
        <label className="wmod-field">
          <span className="wmod-label">Plan</span>
          <select className="wmod-input" value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })} required>
            <option value="">Choose…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name || p.tier}</option>)}
          </select>
        </label>
        <label className="wmod-field">
          <span className="wmod-label">Billing cycle (months)</span>
          <select className="wmod-input" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })}>
            {['1', '3', '6', '12'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="wmod-field" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" className="wmod-btn wmod-btn--primary" disabled={busy}>
            {busy ? 'Simulating…' : 'Simulate'}
          </button>
        </div>
      </form>
      <InlineError message={error} />
      {result && (
        result.available === false ? (
          <Empty title="No price set for this cycle" body={result.reason || 'That plan has no admin-set price for this billing cycle.'} />
        ) : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <tbody>
                <tr><td>Plan</td><td>{result.plan_name}</td><td>{rupee(result.price)}</td></tr>
                <tr>
                  <td colSpan={2} className="wmod-td-muted">Discount{result.campaign ? ` — ${result.campaign.name}` : ''}</td>
                  <td>{result.discount ? `− ${rupee(result.discount)}` : '—'}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}><td colSpan={2}>Total (what the buyer pays)</td><td>{rupee(result.total)}</td></tr>
              </tbody>
            </table>
          </div>
        )
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Categories — no money on the row itself, so no confirm gate
// --------------------------------------------------------------------------
const emptyCategory = { name: '', active: true, sort: 999 };

function CategoriesTab({ flash }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(emptyCategory);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.hubCategories().then((r) => setRows(r.data?.categories || [])).catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load categories.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('A category name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (editingId) await api.hubUpdateCategory(editingId, { name: form.name.trim(), active: form.active, sort: Number(form.sort) || 0 });
      else await api.hubCreateCategory({ name: form.name.trim(), active: form.active, sort: Number(form.sort) || 999 });
      setForm(emptyCategory); setEditingId(null);
      flash(editingId ? 'Category updated.' : 'Category created.');
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not save that category.');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    setError(null);
    try { await api.hubDeleteCategory(id); flash('Category deleted.'); load(); }
    catch (e2) { setError(e2?.response?.data?.detail || 'Could not delete that category.'); }
  };

  return (
    <>
      <InlineError message={error} />
      <Panel title={editingId ? 'Edit category' : 'New category'} sub="Groups designs on the storefront catalog.">
        <form onSubmit={submit} className="wmod-grid">
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Name</span>
            <input className="wmod-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Sort order</span>
            <input className="wmod-input" type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} />
          </label>
          <label className="wmod-check">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            {editingId && <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => { setEditingId(null); setForm(emptyCategory); }}>Cancel edit</button>}
            <button type="submit" className="wmod-btn wmod-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save category'}</button>
          </div>
        </form>
      </Panel>
      <Panel title="Categories" pad={false}>
        {rows === null ? <div className="wmod-panel-body"><Empty title="Loading…" /></div>
          : rows.length === 0 ? <div className="wmod-panel-body"><Empty title="No categories yet." /></div>
          : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Name</th><th>Sort</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="wmod-td-muted">{c.sort}</td>
                      <td><span className={`wmod-pill ${c.active ? 'wmod-pill--yes' : 'wmod-pill--no'}`}>{c.active ? 'Active' : 'Inactive'}</span></td>
                      <td className="wmod-td-actions">
                        <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => { setEditingId(c.id); setForm({ name: c.name, active: c.active, sort: c.sort ?? 999 }); }}>Edit</button>{' '}
                        <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" onClick={() => remove(c.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
    </>
  );
}

// --------------------------------------------------------------------------
// Feature Packs — price-bearing, confirm-gated
// --------------------------------------------------------------------------
const emptyPack = { key: '', name: '', price: '', active: true, sort: 999, features: '' };

function FeaturePacksTab({ flash }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(emptyPack);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.hubFeaturePacks().then((r) => setRows(r.data?.feature_packs || [])).catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load feature packs.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const openConfirm = (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.price === '' || (!editing && !form.key.trim())) {
      setError('Fill in a key, name, and price before saving.');
      return;
    }
    setError(null);
    const price = Number(form.price) || 0;
    setConfirm({
      title: editing ? `Update "${form.name}"` : `Create "${form.name}"`,
      rows: [{ label: 'Price', from: editing ? rupee(editing.price) : undefined, to: rupee(price) }],
      note: 'This price feeds every wedding-link checkout quote that includes this pack.',
      run: async () => {
        setBusy(true);
        try {
          const payload = { name: form.name.trim(), price, active: form.active, sort: Number(form.sort) || 999, features: form.features.split(',').map((f) => f.trim()).filter(Boolean) };
          if (editing) await api.hubUpdateFeaturePack(editing.id, payload);
          else await api.hubCreateFeaturePack({ key: form.key.trim().toLowerCase(), ...payload });
          setForm(emptyPack); setEditing(null); setConfirm(null);
          flash(editing ? 'Feature pack updated.' : 'Feature pack created.');
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not save that feature pack.');
        } finally { setBusy(false); }
      },
    });
  };

  return (
    <>
      <InlineError message={error} />
      <Panel title={editing ? `Edit "${editing.name}"` : 'New feature pack'} sub="Priced add-on bundled into a wedding link at checkout.">
        <form onSubmit={openConfirm} className="wmod-grid">
          <label className="wmod-field">
            <span className="wmod-label">Key</span>
            <input className="wmod-input" placeholder="e.g. premium_pack" value={editing ? editing.key : form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })} disabled={!!editing} required={!editing}
            />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Name</span>
            <input className="wmod-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Price (₹)</span>
            <input className="wmod-input" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Sort order</span>
            <input className="wmod-input" type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Features (comma-separated)</span>
            <input className="wmod-input" value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
          </label>
          <label className="wmod-check">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            {editing && <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => { setEditing(null); setForm(emptyPack); }}>Cancel edit</button>}
            <button type="submit" className="wmod-btn wmod-btn--primary">Review & save</button>
          </div>
        </form>
      </Panel>
      <Panel title="Feature packs" pad={false}>
        {rows === null ? <div className="wmod-panel-body"><Empty title="Loading…" /></div>
          : rows.length === 0 ? <div className="wmod-panel-body"><Empty title="No feature packs yet." /></div>
          : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Key</th><th>Name</th><th>Price</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="wmod-td-muted">{p.key}</td>
                      <td>{p.name}</td>
                      <td>{rupee(p.price)}</td>
                      <td><span className={`wmod-pill ${p.active ? 'wmod-pill--yes' : 'wmod-pill--no'}`}>{p.active ? 'Active' : 'Inactive'}</span></td>
                      <td className="wmod-td-actions">
                        <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          onClick={() => { setEditing(p); setForm({ key: p.key, name: p.name, price: String(p.price ?? ''), active: p.active !== false, sort: p.sort ?? 999, features: (p.features || []).join(', ') }); }}
                        >Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
      {confirm && (
        <ConfirmModal title={confirm.title} rows={confirm.rows} note={confirm.note} busy={busy}
          confirmLabel="Save price" onConfirm={confirm.run} onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Link Durations — feeds compute_wedding_total; price-bearing, confirm-gated
// --------------------------------------------------------------------------
const emptyDuration = { name: '', duration_days: '', lifetime: false, price: '', description: '', active: true, sort: 999 };

function LinkDurationsTab({ flash }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(emptyDuration);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.hubLinkDurations().then((r) => setRows(r.data?.link_durations || [])).catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load link durations.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const openConfirm = (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.price === '' || (!form.lifetime && form.duration_days === '')) {
      setError('Fill in a name, price, and either a day count or lifetime before saving.');
      return;
    }
    setError(null);
    const price = Number(form.price) || 0;
    setConfirm({
      title: editing ? `Update "${form.name}"` : `Create "${form.name}"`,
      rows: [
        { label: 'Price', from: editing ? rupee(editing.price) : undefined, to: rupee(price) },
        { label: 'Duration', to: form.lifetime ? 'Lifetime' : `${form.duration_days} days` },
      ],
      note: 'This price feeds every wedding-link checkout total, and how long the buyer’s link stays live.',
      run: async () => {
        setBusy(true);
        try {
          const payload = {
            name: form.name.trim(), price, lifetime: form.lifetime,
            duration_days: form.lifetime ? null : Number(form.duration_days) || 0,
            description: form.description, active: form.active, sort: Number(form.sort) || 999,
          };
          if (editing) await api.hubUpdateLinkDuration(editing.id, payload);
          else await api.hubCreateLinkDuration(payload);
          setForm(emptyDuration); setEditing(null); setConfirm(null);
          flash(editing ? 'Link duration updated.' : 'Link duration created.');
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not save that link duration.');
        } finally { setBusy(false); }
      },
    });
  };

  return (
    <>
      <InlineError message={error} />
      <Panel title={editing ? `Edit "${editing.name}"` : 'New link duration tier'} sub="How long an invitation link stays live, and what that costs the buyer.">
        <form onSubmit={openConfirm} className="wmod-grid">
          <label className="wmod-field">
            <span className="wmod-label">Name</span>
            <input className="wmod-input" placeholder="e.g. 1 Year" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Price (₹)</span>
            <input className="wmod-input" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Duration (days)</span>
            <input className="wmod-input" type="number" min="0" value={form.duration_days} disabled={form.lifetime}
              onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
            />
          </label>
          <label className="wmod-check">
            <input type="checkbox" checked={form.lifetime} onChange={(e) => setForm({ ...form, lifetime: e.target.checked })} /> Lifetime (never expires)
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Description</span>
            <input className="wmod-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="wmod-check">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            {editing && <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => { setEditing(null); setForm(emptyDuration); }}>Cancel edit</button>}
            <button type="submit" className="wmod-btn wmod-btn--primary">Review & save</button>
          </div>
        </form>
      </Panel>
      <Panel title="Link duration tiers" pad={false}>
        {rows === null ? <div className="wmod-panel-body"><Empty title="Loading…" /></div>
          : rows.length === 0 ? <div className="wmod-panel-body"><Empty title="No link durations yet." /></div>
          : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Name</th><th>Duration</th><th>Price</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td className="wmod-td-muted">{d.lifetime ? 'Lifetime' : `${d.duration_days ?? '—'} days`}</td>
                      <td>{rupee(d.price)}</td>
                      <td><span className={`wmod-pill ${d.active ? 'wmod-pill--yes' : 'wmod-pill--no'}`}>{d.active ? 'Active' : 'Inactive'}</span></td>
                      <td className="wmod-td-actions">
                        <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          onClick={() => { setEditing(d); setForm({ name: d.name, price: String(d.price ?? ''), lifetime: !!d.lifetime, duration_days: d.duration_days ?? '', description: d.description || '', active: d.active !== false, sort: d.sort ?? 999 }); }}
                        >Edit</button>{' '}
                        <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" onClick={async () => { try { await api.hubDeleteLinkDuration(d.id); flash('Deleted.'); load(); } catch (e2) { setError(e2?.response?.data?.detail || 'Could not delete.'); } }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
      {confirm && (
        <ConfirmModal title={confirm.title} rows={confirm.rows} note={confirm.note} busy={busy}
          confirmLabel="Save duration" onConfirm={confirm.run} onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Campaigns — discount value/scope, confirm-gated
// --------------------------------------------------------------------------
const emptyCampaign = {
  name: '', description: '', banner_text: '', start_at: '', end_at: '', active: false,
  discount_type: 'percentage', discount_value: '', scope_mode: 'all', scope_ids: '', priority: 0,
};

function CampaignsTab({ flash }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(emptyCampaign);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.hubCampaigns().then((r) => setRows(r.data?.campaigns || [])).catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load campaigns.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const openConfirm = (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.discount_value === '') {
      setError('A campaign name and a discount value are required.');
      return;
    }
    setError(null);
    const val = Number(form.discount_value) || 0;
    setConfirm({
      title: editing ? `Update "${form.name}"` : `Create "${form.name}"`,
      rows: [
        { label: 'Discount', from: editing ? `${editing.discount_value}${editing.discount_type === 'percentage' ? '%' : ' flat'}` : undefined, to: `${val}${form.discount_type === 'percentage' ? '%' : ' flat'}` },
        { label: 'Scope', to: form.scope_mode },
        { label: 'Active', to: form.active ? 'Yes — live now' : 'No — saved but not applied' },
      ],
      note: 'A campaign automatically discounts every matching checkout while it is active and in its date window — no code needed from the buyer.',
      run: async () => {
        setBusy(true);
        try {
          const payload = {
            name: form.name.trim(), description: form.description, banner_text: form.banner_text,
            start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
            end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
            active: form.active, discount_type: form.discount_type, discount_value: val,
            scope: { mode: form.scope_mode, ids: form.scope_ids.split(',').map((s) => s.trim()).filter(Boolean) },
            priority: Number(form.priority) || 0,
          };
          if (editing) await api.hubUpdateCampaign(editing.id, payload);
          else await api.hubCreateCampaign(payload);
          setForm(emptyCampaign); setEditing(null); setConfirm(null);
          flash(editing ? 'Campaign updated.' : 'Campaign created.');
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not save that campaign.');
        } finally { setBusy(false); }
      },
    });
  };

  const toggle = async (c) => {
    setError(null);
    try { await api.hubToggleCampaign(c.id); flash(`${c.name} is now ${c.active ? 'inactive' : 'active'}.`); load(); }
    catch (e2) { setError(e2?.response?.data?.detail || 'Could not toggle that campaign.'); }
  };

  return (
    <>
      <InlineError message={error} />
      <Panel title={editing ? `Edit "${editing.name}"` : 'New campaign'} sub="Automatic discount — applies at checkout without a code, to whatever is in scope.">
        <form onSubmit={openConfirm} className="wmod-grid">
          <label className="wmod-field">
            <span className="wmod-label">Name</span>
            <input className="wmod-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Banner text</span>
            <input className="wmod-input" value={form.banner_text} onChange={(e) => setForm({ ...form, banner_text: e.target.value })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Discount type</span>
            <select className="wmod-input" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed ₹</option>
            </select>
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Discount value {form.discount_type === 'percentage' ? '(0–100)' : '(₹)'}</span>
            <input className="wmod-input" type="number" min="0" max={form.discount_type === 'percentage' ? 100 : undefined}
              value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required
            />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Scope</span>
            <select className="wmod-input" value={form.scope_mode} onChange={(e) => setForm({ ...form, scope_mode: e.target.value })}>
              <option value="all">Everything</option>
              <option value="designs">Specific designs</option>
              <option value="categories">Specific categories</option>
              <option value="feature_packs">Specific feature packs</option>
              <option value="portfolio">All portfolio plans</option>
              <option value="storage">All storage plans</option>
            </select>
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Scope IDs (comma-separated, if narrowed)</span>
            <input className="wmod-input" value={form.scope_ids} disabled={form.scope_mode === 'all'} onChange={(e) => setForm({ ...form, scope_ids: e.target.value })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Starts</span>
            <input className="wmod-input" type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Ends</span>
            <input className="wmod-input" type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Priority (ties go to higher)</span>
            <input className="wmod-input" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </label>
          <label className="wmod-check">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active now
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            {editing && <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => { setEditing(null); setForm(emptyCampaign); }}>Cancel edit</button>}
            <button type="submit" className="wmod-btn wmod-btn--primary">Review & save</button>
          </div>
        </form>
      </Panel>
      <Panel title="Campaigns" pad={false}>
        {rows === null ? <div className="wmod-panel-body"><Empty title="Loading…" /></div>
          : rows.length === 0 ? <div className="wmod-panel-body"><Empty title="No campaigns yet." /></div>
          : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Name</th><th>Discount</th><th>Scope</th><th>Window</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="wmod-td-muted">{c.discount_value}{c.discount_type === 'percentage' ? '%' : ' flat'}</td>
                      <td className="wmod-td-muted">{c.scope?.mode}</td>
                      <td className="wmod-td-muted">{c.start_at ? new Date(c.start_at).toLocaleDateString('en-IN') : '—'} → {c.end_at ? new Date(c.end_at).toLocaleDateString('en-IN') : 'no end'}</td>
                      <td><span className={`wmod-pill ${c.active ? 'wmod-pill--yes' : 'wmod-pill--no'}`}>{c.active ? 'Active' : 'Inactive'}</span></td>
                      <td className="wmod-td-actions">
                        <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => toggle(c)}>{c.active ? 'Deactivate' : 'Activate'}</button>{' '}
                        <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          onClick={() => { setEditing(c); setForm({ name: c.name, description: c.description || '', banner_text: c.banner_text || '', start_at: c.start_at ? c.start_at.slice(0, 16) : '', end_at: c.end_at ? c.end_at.slice(0, 16) : '', active: !!c.active, discount_type: c.discount_type, discount_value: String(c.discount_value ?? ''), scope_mode: c.scope?.mode || 'all', scope_ids: (c.scope?.ids || []).join(', '), priority: c.priority ?? 0 }); }}
                        >Edit</button>{' '}
                        <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" onClick={async () => { try { await api.hubDeleteCampaign(c.id); flash('Deleted.'); load(); } catch (e2) { setError(e2?.response?.data?.detail || 'Could not delete.'); } }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
      {confirm && (
        <ConfirmModal title={confirm.title} rows={confirm.rows} note={confirm.note} busy={busy}
          confirmLabel="Save campaign" onConfirm={confirm.run} onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Plans — edits subscription_plans.durations, the map quote_plan() reads
// --------------------------------------------------------------------------
const CYCLES = ['1', '3', '6', '12'];
const PLAN_PRODUCTS = ['', 'portfolio', 'storage', 'invitation', 'backup'];

function PlansTab({ flash }) {
  const [product, setProduct] = useState('');
  const [rows, setRows] = useState(null);
  const [edits, setEdits] = useState({});
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.hubPlans(product).then((r) => {
      const plans = r.data?.plans || [];
      setRows(plans);
      const e = {};
      plans.forEach((p) => { e[p.id] = { ...(p.durations || {}) }; });
      setEdits(e);
    }).catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load plans.'); });
  }, [product]);
  useEffect(() => { load(); }, [load]);

  const setCell = (planId, cycle, val) => setEdits((prev) => ({ ...prev, [planId]: { ...prev[planId], [cycle]: val } }));

  const save = (plan) => {
    const before = plan.durations || {};
    const after = edits[plan.id] || {};
    const changed = CYCLES.filter((c) => String(before[c] ?? '') !== String(after[c] ?? ''));
    if (changed.length === 0) { flash('Nothing changed.'); return; }
    setConfirm({
      title: `Update "${plan.name || plan.tier}" pricing`,
      rows: changed.map((c) => ({ label: `${c}-month`, from: rupee(before[c]), to: rupee(after[c]) })),
      note: 'This is the exact map pricing_engine.compute_plan_total reads — the change is live at checkout the moment you confirm.',
      run: async () => {
        setBusy(true);
        try {
          const durations = {};
          changed.forEach((c) => { durations[c] = after[c] === '' ? null : Number(after[c]); });
          await api.hubUpdatePlan(plan.id, { durations });
          setConfirm(null);
          flash(`${plan.name || plan.tier} saved.`);
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not save that plan.');
        } finally { setBusy(false); }
      },
    });
  };

  return (
    <>
      <div className="wmod-inline-error" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
        Verified against the backend: the &ldquo;Subscription Plans&rdquo; tab on the other Pricing Hub page
        (<code>/admin/pricing</code>) posts to <code>subscription_service.py</code>&rsquo;s
        {' '}<code>/api/admin/subscription-plans</code>, which writes only <code>base_monthly</code> — a field{' '}
        <code>pricing_engine.quote_plan</code> never reads. <strong>Only the table below</strong> edits{' '}
        <code>durations</code>, the map checkout actually charges from. A save on the other tab can look
        successful while leaving what the buyer pays completely unchanged.
      </div>
      <InlineError message={error} />
      <Segmented ariaLabel="Product" value={product} onChange={setProduct} options={PLAN_PRODUCTS.map((p) => ({ id: p, label: p || 'All' }))} />
      <Panel title="Plans" sub="Edit a cycle's price, then Save that row — only changed cycles are sent." pad={false}>
        {rows === null ? <div className="wmod-panel-body"><Empty title="Loading…" /></div>
          : rows.length === 0 ? <div className="wmod-panel-body"><Empty title="No plans found." /></div>
          : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Product</th><th>Plan</th>{CYCLES.map((c) => <th key={c}>{c}-month ₹</th>)}<th /></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="wmod-td-muted">{p.product}</td>
                      <td>{p.name || p.tier}</td>
                      {CYCLES.map((c) => (
                        <td key={c}>
                          <input className="wmod-input" type="number" min="0" style={{ minHeight: 36, width: 96 }}
                            value={edits[p.id]?.[c] ?? ''} placeholder="—"
                            onChange={(e) => setCell(p.id, c, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="wmod-td-actions"><button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" onClick={() => save(p)}>Save</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
      {confirm && (
        <ConfirmModal title={confirm.title} rows={confirm.rows} note={confirm.note} busy={busy} danger
          confirmLabel="Save live prices" onConfirm={confirm.run} onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Community — capability matrix, no money on the row itself
// --------------------------------------------------------------------------
const TIERS = ['free', 'basic', 'premium', 'pro'];

function CommunityTab({ flash }) {
  const [caps, setCaps] = useState([]);
  const [tiers, setTiers] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.hubCommunity().then((r) => {
      setCaps(r.data?.capabilities || []);
      const t = {};
      TIERS.forEach((tier) => { t[tier] = { ...(r.data?.tiers?.[tier] || {}) }; });
      setTiers(t);
    }).catch((e) => setError(e?.response?.data?.detail || 'Could not load community settings.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleCap = (tier, cap) => setTiers((prev) => ({ ...prev, [tier]: { ...prev[tier], [cap]: !prev[tier]?.[cap] } }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.hubPutCommunity({ tiers });
      flash('Community capabilities saved.');
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not save community settings.');
    } finally { setSaving(false); }
  };

  return (
    <>
      <InlineError message={error} />
      <Panel title="Community capability matrix" sub="What each Pixora community tier can do." actions={<button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save matrix'}</button>} pad={false}>
        {caps.length === 0 ? <div className="wmod-panel-body"><Empty title="No capabilities returned yet." /></div> : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead><tr><th>Capability</th>{TIERS.map((t) => <th key={t}>{t}</th>)}</tr></thead>
              <tbody>
                {caps.map((cap) => (
                  <tr key={cap}>
                    <td>{cap}</td>
                    {TIERS.map((tier) => (
                      <td key={tier}>
                        <input type="checkbox" checked={!!tiers[tier]?.[cap]} onChange={() => toggleCap(tier, cap)} style={{ width: 18, height: 18, accentColor: 'var(--mj-primary)' }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
