import { useCallback, useEffect, useState } from 'react';
import AdminNav from '@/components/nav/AdminNav';
import * as api from '@/api/adminPricing';
import { THEME_ABBR } from '@/lib/designCode';
import './AdminPricing.css';

// Ported from "MAJA Super Admin Pricing Hub.dc.html" (tab bar + per-tab
// create-form + table pattern). The design mock shows 11 tabs; this build
// wires the 5 INR surfaces the live storefront actually reads — see the
// per-tab notes below for why the rest are out of scope.
//
// Theme Bundles and Discount Codes were added because both had a PUBLIC reader
// live on the storefront and no writer anywhere: the bundle endpoint returned
// {} forever, and every discount code a customer typed was refused as invalid
// because none could be created. A read model with no way to populate it looks
// wired and is not.
function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

const TABS = [
  { key: 'subscriptions', label: 'Subscription Plans' },
  { key: 'features', label: 'Store Features & Languages' },
  { key: 'design', label: 'Design Prices' },
  { key: 'bundles', label: 'Theme Bundles' },
  { key: 'discounts', label: 'Discount Codes' },
];
const PRODUCTS = ['invitation', 'portfolio', 'storage', 'backup'];
const THEME_IDS = Object.keys(THEME_ABBR);

export default function AdminPricing() {
  const vw = useViewportWidth();
  const isMobile = vw < 900;
  const [tab, setTab] = useState('subscriptions');

  const shellCols = isMobile ? 'minmax(0,1fr)' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const mainPadding = vw < 400 ? '24px 16px' : (isMobile ? '28px 22px' : (vw < 1200 ? '32px 30px' : '40px 48px'));

  return (
    <div style={{ fontFamily: 'var(--mj-font-body)' }}>
      <div style={{ background: 'var(--mj-bg)', color: 'var(--mj-ink)', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols }}>
        {!isMobile && <AdminNav active="Pricing hub" />}

        <main id="main-content" className="admpr-main" style={{ padding: mainPadding, minWidth: 0 }}>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 400, fontSize: 'clamp(26px,4vw,38px)', lineHeight: 1.15, margin: '0 0 6px' }}>
              Pricing <span className="admpr-hl">Hub</span>
            </h1>
            <p style={{ fontSize: 14, color: 'var(--mj-muted)', margin: 0 }}>
              The canonical INR surfaces the live checkout reads. Every save refetches the table.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 28, paddingBottom: 4 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`admpr-tab${tab === t.key ? ' admpr-tab-active' : ''}`}
                onClick={() => setTab(t.key)}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'subscriptions' && <SubscriptionsTab isMobile={isMobile} />}
          {tab === 'features' && <FeaturesTab isMobile={isMobile} />}
          {tab === 'design' && <DesignPricesTab isMobile={isMobile} />}
          {tab === 'bundles' && <ThemeBundlesTab />}
          {tab === 'discounts' && <DiscountCodesTab />}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function Card({ children, style }) {
  return <div className="admpr-card" style={style}>{children}</div>;
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mj-muted)', whiteSpace: 'nowrap' }}>{children}</th>;
}

function Td({ children, muted }) {
  return <td style={{ padding: '12px 16px', color: muted ? 'var(--mj-muted)' : 'var(--mj-ink)', whiteSpace: 'nowrap' }}>{children}</td>;
}

function Pill({ on, onLabel = 'Active', offLabel = 'Inactive' }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
      background: on ? 'rgba(16,185,129,.14)' : 'var(--mj-section)',
      color: on ? '#047857' : 'var(--mj-muted)',
    }}>
      {on ? onLabel : offLabel}
    </span>
  );
}

function SaveButton({ children = 'Save', ...props }) {
  return <button type="submit" className="admpr-btn" {...props}>{children}</button>;
}

function ErrorBanner({ error }) {
  if (!error) return null;
  return <div className="admpr-error">{error}</div>;
}

// ---------------------------------------------------------------------------
// Tab 1 — Subscription Plans (subscription_service.py)
// ---------------------------------------------------------------------------
const emptyPlanForm = { product: 'invitation', tier: '', base_monthly: '', sort_order: 0, storage_gb: '', popular: false, is_active: true, features: '' };
const emptyCycleForm = { key: '', label: '', unit: 'months', count: 1, discount: 0 };

function SubscriptionsTab({ isMobile }) {
  const [plans, setPlans] = useState(null);
  const [cyclesData, setCyclesData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [savingPlan, setSavingPlan] = useState(false);
  const [cycleForm, setCycleForm] = useState(emptyCycleForm);
  const [savingCycle, setSavingCycle] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.listSubscriptionPlans(), api.getBillingCycles()])
      .then(([plansRes, cyclesRes]) => {
        setPlans(plansRes.data?.plans || []);
        setCyclesData(cyclesRes.data);
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load subscription plans.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const editPlan = (p) => setPlanForm({
    product: p.product, tier: p.tier,
    base_monthly: String(p.base_monthly ?? p.durations?.['1'] ?? ''),
    sort_order: p.sort_order ?? 0,
    storage_gb: p.storage_gb ?? '',
    popular: !!p.popular,
    is_active: p.is_active ?? p.active ?? true,
    features: (p.features || []).join(', '),
  });

  const submitPlan = async (e) => {
    e.preventDefault();
    setSavingPlan(true);
    setError(null);
    try {
      await api.upsertSubscriptionPlan({
        product: planForm.product,
        tier: planForm.tier.trim(),
        base_monthly: Number(planForm.base_monthly) || 0,
        sort_order: Number(planForm.sort_order) || 0,
        storage_gb: planForm.storage_gb === '' ? null : Number(planForm.storage_gb),
        popular: planForm.popular,
        is_active: planForm.is_active,
        features: planForm.features.split(',').map((f) => f.trim()).filter(Boolean),
      });
      setPlanForm(emptyPlanForm);
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not save the plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  const editCycle = (c) => setCycleForm({ key: c.key, label: c.label || '', unit: c.unit || 'months', count: c.count ?? 1, discount: c.discount ?? 0 });

  const saveCycles = async (nextCustom) => {
    setSavingCycle(true);
    setError(null);
    try {
      await api.putBillingCycles(nextCustom);
      setCycleForm(emptyCycleForm);
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not save billing periods.');
    } finally {
      setSavingCycle(false);
    }
  };

  const submitCycle = (e) => {
    e.preventDefault();
    const custom = cyclesData?.custom || [];
    const clean = { key: cycleForm.key.trim(), label: cycleForm.label.trim(), unit: cycleForm.unit, count: Number(cycleForm.count) || 1, discount: Number(cycleForm.discount) || 0 };
    const withoutExisting = custom.filter((c) => c.key !== clean.key.toLowerCase().replace(/\s+/g, '_'));
    saveCycles([...withoutExisting, clean]);
  };

  const removeCycle = (key) => {
    const custom = cyclesData?.custom || [];
    saveCycles(custom.filter((c) => c.key !== key));
  };

  return (
    <>
      <ErrorBanner error={error} />

      {/* Plan create/edit form */}
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <p className="admpr-section-title">Create or edit a plan</p>
        <form onSubmit={submitPlan} className="admpr-form-grid">
          <select className="admpr-field" value={planForm.product} onChange={(e) => setPlanForm({ ...planForm, product: e.target.value })}>
            {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className="admpr-field" placeholder="Tier — e.g. Offer5TB" value={planForm.tier} onChange={(e) => setPlanForm({ ...planForm, tier: e.target.value })} required />
          <input className="admpr-field" type="number" min="0" placeholder="₹ / month" value={planForm.base_monthly} onChange={(e) => setPlanForm({ ...planForm, base_monthly: e.target.value })} required />
          <input className="admpr-field" type="number" min="0" placeholder="Storage GB" value={planForm.storage_gb} onChange={(e) => setPlanForm({ ...planForm, storage_gb: e.target.value })} />
          <input className="admpr-field" type="number" placeholder="Sort order" value={planForm.sort_order} onChange={(e) => setPlanForm({ ...planForm, sort_order: e.target.value })} />
          <input className="admpr-field" placeholder="Features, comma-separated" value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} />
          <label className="admpr-check"><input type="checkbox" checked={planForm.popular} onChange={(e) => setPlanForm({ ...planForm, popular: e.target.checked })} /> Popular</label>
          <label className="admpr-check"><input type="checkbox" checked={planForm.is_active} onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.checked })} /> Active</label>
          <SaveButton disabled={savingPlan}>{savingPlan ? 'Saving…' : 'Save plan'}</SaveButton>
        </form>
      </Card>

      <Card style={{ overflowX: 'auto', minWidth: 0, marginBottom: 32 }}>
        {loading ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>Loading…</p>
        ) : (plans || []).length === 0 ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>No plans yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr><Th>Product</Th><Th>Tier</Th><Th>₹/month</Th><Th>Storage</Th><Th>Sort</Th><Th>Popular</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--mj-border)' }}>
                  <Td muted>{p.product}</Td>
                  <Td>{p.tier}</Td>
                  <Td>₹{p.base_monthly ?? p.durations?.['1'] ?? '—'}</Td>
                  <Td muted>{p.storage_gb ?? p.capacity_gb ?? '—'}</Td>
                  <Td muted>{p.sort_order ?? '—'}</Td>
                  <Td muted>{p.popular ? 'Yes' : '—'}</Td>
                  <Td><Pill on={p.is_active ?? p.active ?? true} /></Td>
                  <Td><button type="button" className="admpr-link-btn" onClick={() => editPlan(p)}>Edit</button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Billing cycles */}
      <p className="admpr-section-title">Billing periods</p>
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <form onSubmit={submitCycle} className="admpr-form-grid">
          <input className="admpr-field" placeholder="Period key — e.g. weekly" value={cycleForm.key} onChange={(e) => setCycleForm({ ...cycleForm, key: e.target.value })} required />
          <input className="admpr-field" placeholder="Label" value={cycleForm.label} onChange={(e) => setCycleForm({ ...cycleForm, label: e.target.value })} />
          <select className="admpr-field" value={cycleForm.unit} onChange={(e) => setCycleForm({ ...cycleForm, unit: e.target.value })}>
            <option value="days">days</option><option value="months">months</option><option value="years">years</option>
          </select>
          <input className="admpr-field" type="number" min="1" placeholder="Count" value={cycleForm.count} onChange={(e) => setCycleForm({ ...cycleForm, count: e.target.value })} />
          <input className="admpr-field" type="number" min="0" max="0.95" step="0.01" placeholder="Discount (0–0.95)" value={cycleForm.discount} onChange={(e) => setCycleForm({ ...cycleForm, discount: e.target.value })} />
          <SaveButton disabled={savingCycle}>{savingCycle ? 'Saving…' : 'Save period'}</SaveButton>
        </form>
      </Card>
      <Card style={{ overflowX: 'auto', minWidth: 0 }}>
        {loading ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>Loading…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr><Th>Key</Th><Th>Label</Th><Th>Period</Th><Th>Discount</Th><Th>Source</Th><Th /></tr></thead>
            <tbody>
              {(cyclesData?.effective || []).map((c) => {
                const isCustom = (cyclesData?.custom || []).some((cc) => cc.key === c.key);
                return (
                  <tr key={c.key} style={{ borderTop: '1px solid var(--mj-border)' }}>
                    <Td muted>{c.key}</Td>
                    <Td>{c.label}</Td>
                    <Td muted>{c.count} {c.unit}</Td>
                    <Td muted>{Math.round((c.discount || 0) * 100)}%</Td>
                    <Td muted>{isCustom ? 'custom' : 'default'}</Td>
                    <Td>
                      {isCustom && (
                        <>
                          <button type="button" className="admpr-link-btn" onClick={() => editCycle(c)}>Edit</button>{' '}
                          <button type="button" className="admpr-link-btn admpr-link-danger" onClick={() => removeCycle(c.key)}>Remove</button>
                        </>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Store Features & Languages (store_features.py)
// ---------------------------------------------------------------------------
const emptyFeatureForm = { key: '', label: '', price: '', included: false, sort: 0, note: '', is_active: true };
const emptyLanguageForm = { key: '', label: '', price: '', sort: 0, is_active: true };

function FeaturesTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [featureForm, setFeatureForm] = useState(emptyFeatureForm);
  const [savingFeature, setSavingFeature] = useState(false);
  const [languageForm, setLanguageForm] = useState(emptyLanguageForm);
  const [savingLanguage, setSavingLanguage] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getStoreAlacarte()
      .then((res) => setData(res.data))
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load features & languages.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submitFeature = async (e) => {
    e.preventDefault();
    setSavingFeature(true);
    setError(null);
    try {
      await api.upsertStoreFeature({
        key: featureForm.key.trim().toLowerCase(),
        label: featureForm.label.trim() || featureForm.key.trim(),
        price: Number(featureForm.price) || 0,
        included: featureForm.included,
        sort: Number(featureForm.sort) || 0,
        note: featureForm.note,
        is_active: featureForm.is_active,
      });
      setFeatureForm(emptyFeatureForm);
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not save the feature.');
    } finally {
      setSavingFeature(false);
    }
  };

  const submitLanguage = async (e) => {
    e.preventDefault();
    setSavingLanguage(true);
    setError(null);
    try {
      await api.upsertStoreLanguage({
        key: languageForm.key.trim().toLowerCase(),
        label: languageForm.label.trim() || languageForm.key.trim(),
        price: Number(languageForm.price) || 0,
        sort: Number(languageForm.sort) || 0,
        is_active: languageForm.is_active,
      });
      setLanguageForm(emptyLanguageForm);
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not save the language.');
    } finally {
      setSavingLanguage(false);
    }
  };

  return (
    <>
      <ErrorBanner error={error} />

      <p className="admpr-section-title">Features</p>
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <form onSubmit={submitFeature} className="admpr-form-grid">
          <input className="admpr-field" placeholder="Key — e.g. qr_live_gallery" value={featureForm.key} onChange={(e) => setFeatureForm({ ...featureForm, key: e.target.value })} required />
          <input className="admpr-field" placeholder="Label" value={featureForm.label} onChange={(e) => setFeatureForm({ ...featureForm, label: e.target.value })} />
          <input className="admpr-field" type="number" min="0" placeholder="₹ price" value={featureForm.price} onChange={(e) => setFeatureForm({ ...featureForm, price: e.target.value })} disabled={featureForm.included} />
          <input className="admpr-field" type="number" placeholder="Sort" value={featureForm.sort} onChange={(e) => setFeatureForm({ ...featureForm, sort: e.target.value })} />
          <input className="admpr-field" placeholder="Note" value={featureForm.note} onChange={(e) => setFeatureForm({ ...featureForm, note: e.target.value })} />
          <label className="admpr-check"><input type="checkbox" checked={featureForm.included} onChange={(e) => setFeatureForm({ ...featureForm, included: e.target.checked })} /> Included (free)</label>
          <label className="admpr-check"><input type="checkbox" checked={featureForm.is_active} onChange={(e) => setFeatureForm({ ...featureForm, is_active: e.target.checked })} /> Active</label>
          <SaveButton disabled={savingFeature}>{savingFeature ? 'Saving…' : 'Save feature'}</SaveButton>
        </form>
      </Card>
      <Card style={{ overflowX: 'auto', minWidth: 0, marginBottom: 32 }}>
        {loading ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>Loading…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr><Th>Key</Th><Th>Label</Th><Th>₹ price</Th><Th>Included</Th><Th>Sort</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {(data?.features || []).map((f) => (
                <tr key={f.key} style={{ borderTop: '1px solid var(--mj-border)' }}>
                  <Td muted>{f.key}</Td>
                  <Td>{f.label}</Td>
                  <Td>{f.included ? '—' : `₹${f.price}`}</Td>
                  <Td muted>{f.included ? 'Yes' : 'No'}</Td>
                  <Td muted>{f.sort ?? '—'}</Td>
                  <Td><Pill on={f.is_active !== false} /></Td>
                  <Td><button type="button" className="admpr-link-btn" onClick={() => setFeatureForm({ key: f.key, label: f.label, price: String(f.price ?? ''), included: !!f.included, sort: f.sort ?? 0, note: f.note || '', is_active: f.is_active !== false })}>Edit</button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="admpr-section-title">Languages</p>
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <form onSubmit={submitLanguage} className="admpr-form-grid">
          <input className="admpr-field" placeholder="Key — e.g. tamil" value={languageForm.key} onChange={(e) => setLanguageForm({ ...languageForm, key: e.target.value })} required />
          <input className="admpr-field" placeholder="Label" value={languageForm.label} onChange={(e) => setLanguageForm({ ...languageForm, label: e.target.value })} />
          <input className="admpr-field" type="number" min="0" placeholder="₹ extra-language price" value={languageForm.price} onChange={(e) => setLanguageForm({ ...languageForm, price: e.target.value })} />
          <input className="admpr-field" type="number" placeholder="Sort" value={languageForm.sort} onChange={(e) => setLanguageForm({ ...languageForm, sort: e.target.value })} />
          <label className="admpr-check"><input type="checkbox" checked={languageForm.is_active} onChange={(e) => setLanguageForm({ ...languageForm, is_active: e.target.checked })} /> Active</label>
          <SaveButton disabled={savingLanguage}>{savingLanguage ? 'Saving…' : 'Save language'}</SaveButton>
        </form>
      </Card>
      <Card style={{ overflowX: 'auto', minWidth: 0 }}>
        {loading ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>Loading…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr><Th>Key</Th><Th>Label</Th><Th>₹ price</Th><Th>Sort</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {(data?.languages || []).map((l) => (
                <tr key={l.key} style={{ borderTop: '1px solid var(--mj-border)' }}>
                  <Td muted>{l.key}</Td>
                  <Td>{l.label}</Td>
                  <Td>₹{l.price}</Td>
                  <Td muted>{l.sort ?? '—'}</Td>
                  <Td><Pill on={l.is_active !== false} /></Td>
                  <Td><button type="button" className="admpr-link-btn" onClick={() => setLanguageForm({ key: l.key, label: l.label, price: String(l.price ?? ''), sort: l.sort ?? 0, is_active: l.is_active !== false })}>Edit</button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Design Prices (READ-ONLY)
// ---------------------------------------------------------------------------
// store_features.py has no admin write endpoint for per-design INR prices.
// The only writer is super_admin_pricing.py's POST /api/super-admin/pricing/designs,
// whose `base_price` is CREDITS while this same collection is read back as
// literal INR by the storefront — a unit collision. Editing is disabled here
// until that's fixed; this tab reads the live public resolver instead, so an
// admin can still check what a design will actually charge.
function DesignPricesTab() {
  const [designId, setDesignId] = useState('');
  const [themeId, setThemeId] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [looking, setLooking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const id = designId.trim();
    if (!id) return;
    setLooking(true);
    setError(null);
    try {
      const { data } = await api.lookupDesignPrice(id, themeId);
      setResults((prev) => [{
        design_id: data.design_id, theme_id: themeId || '—',
        price_inr: data.design_price_inr, source: data.design_price_source,
        at: new Date().toLocaleTimeString('en-IN'),
      }, ...prev].slice(0, 25));
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not look up that design.');
    } finally {
      setLooking(false);
    }
  };

  return (
    <>
      <div className="admpr-warning">
        This tab is read-only: it queries the same public resolver the storefront uses.
        Everything here is INR — the credit system it once had to reconcile against is deleted.
      </div>

      <Card style={{ padding: 20, marginBottom: 20, marginTop: 20 }}>
        <p className="admpr-section-title">Look up a design's live price</p>
        <form onSubmit={submit} className="admpr-form-grid">
          <input className="admpr-field" placeholder="Design ID — e.g. mughal_engagement_1" value={designId} onChange={(e) => setDesignId(e.target.value)} required />
          <select className="admpr-field" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            <option value="">Theme (optional — for bundle fallback)</option>
            {THEME_IDS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <SaveButton disabled={looking}>{looking ? 'Looking up…' : 'Look up price'}</SaveButton>
        </form>
      </Card>

      <ErrorBanner error={error} />

      <Card style={{ overflowX: 'auto', minWidth: 0 }}>
        {results.length === 0 ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>Look up a design ID to see its resolved INR price.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr><Th>Design ID</Th><Th>Theme</Th><Th>₹ price</Th><Th>Resolved from</Th><Th>Looked up</Th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={`${r.design_id}-${i}`} style={{ borderTop: '1px solid var(--mj-border)' }}>
                  <Td>{r.design_id}</Td>
                  <Td muted>{r.theme_id}</Td>
                  <Td>₹{r.price_inr}</Td>
                  <Td muted>{r.source}</Td>
                  <Td muted>{r.at}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 4 — Theme Bundles (pricing_features.py)
// ---------------------------------------------------------------------------
// One INR price for a whole collection. GET /api/public/theme-bundle-pricing
// has been live and returning {} because nothing could write a row: the upsert
// model required `credits`, a currency that is deleted, and the public reader
// refuses to return it anyway. `credits` is off the model now, so what is saved
// here is exactly what a buyer is quoted.
const emptyBundleForm = { theme_id: '', inr_price: '', label: '', is_active: true };

function ThemeBundlesTab() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(emptyBundleForm);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.listThemeBundles()
      .then((res) => setRows(res.data?.bundles || []))
      .catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load theme bundles.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.upsertThemeBundle({
        theme_id: form.theme_id,
        inr_price: Number(form.inr_price) || 0,
        label: form.label.trim() || null,
        is_active: form.is_active,
      });
      setForm(emptyBundleForm);
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not save that bundle price.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (themeId) => {
    setError(null);
    try {
      await api.deleteThemeBundle(themeId);
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not remove that bundle price.');
    }
  };

  return (
    <>
      <ErrorBanner error={error} />

      <Card style={{ padding: 20, marginBottom: 20, marginTop: 20 }}>
        <p className="admpr-section-title">Price a whole collection</p>
        <form onSubmit={submit} className="admpr-form-grid">
          <select className="admpr-field" value={form.theme_id} onChange={(e) => setForm({ ...form, theme_id: e.target.value })} required>
            <option value="">Collection…</option>
            {THEME_IDS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <input className="admpr-field" type="number" min="0" placeholder="Bundle price in rupees" value={form.inr_price} onChange={(e) => setForm({ ...form, inr_price: e.target.value })} required />
          <input className="admpr-field" placeholder="Label shown to buyers" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <label className="admpr-check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
          <SaveButton disabled={saving}>{saving ? 'Saving…' : 'Save bundle price'}</SaveButton>
        </form>
      </Card>

      <Card style={{ overflowX: 'auto', minWidth: 0 }}>
        {rows === null ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>
            No bundle prices yet. Until one exists, the collection pages show per-design
            prices only — they do not invent a bundle.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr><Th>Collection</Th><Th>Bundle price</Th><Th>Label</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.theme_id} style={{ borderTop: '1px solid var(--mj-border)' }}>
                  <Td>{b.theme_id}</Td>
                  <Td>{rupeeText(b.inr_price)}</Td>
                  <Td muted>{b.label || '—'}</Td>
                  <Td><Pill on={b.is_active !== false} /></Td>
                  <Td>
                    <button type="button" className="admpr-link-btn" onClick={() => setForm({ theme_id: b.theme_id, inr_price: String(b.inr_price ?? ''), label: b.label || '', is_active: b.is_active !== false })}>Edit</button>
                    {' · '}
                    <button type="button" className="admpr-link-btn" onClick={() => remove(b.theme_id)}>Remove</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 5 — Discount Codes (pricing_features.py)
// ---------------------------------------------------------------------------
// POST /api/public/discount/validate is already wired into the checkout. There
// was no way to create a code, so every code a customer typed came back
// "Invalid or inactive code". This is the missing half.
//
// The server computes the discount and enforces expiry, usage cap and scope.
// Nothing here re-derives any of that.
const emptyCodeForm = {
  code: '', kind: 'percent', value: '', applies_to: 'all',
  target_id: '', max_uses: '0', expires_at: '', is_active: true,
};

function DiscountCodesTab() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(emptyCodeForm);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.listDiscountCodes()
      .then((res) => setRows(res.data?.codes || []))
      .catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load discount codes.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createDiscountCode({
        code: form.code.trim().toUpperCase(),
        kind: form.kind,
        value: Number(form.value) || 0,
        applies_to: form.applies_to,
        // An empty string would store a target that matches nothing.
        target_id: form.target_id.trim() || null,
        max_uses: Number(form.max_uses) || 0,
        // The validator parses this with fromisoformat and treats anything it
        // cannot parse as EXPIRED, so send a full ISO instant or nothing.
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: form.is_active,
      });
      setForm(emptyCodeForm);
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not create that code.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row) => {
    setError(null);
    try {
      await api.updateDiscountCode(row.id, { is_active: !(row.is_active !== false) });
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not update that code.');
    }
  };

  const remove = async (row) => {
    setError(null);
    try {
      await api.deleteDiscountCode(row.id);
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not delete that code.');
    }
  };

  return (
    <>
      <ErrorBanner error={error} />

      <Card style={{ padding: 20, marginBottom: 20, marginTop: 20 }}>
        <p className="admpr-section-title">Create a code</p>
        <form onSubmit={submit} className="admpr-form-grid">
          <input className="admpr-field" placeholder="CODE" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required minLength={3} maxLength={24} />
          <select className="admpr-field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="percent">Percent off</option>
            <option value="flat">Flat rupees off</option>
          </select>
          <input className="admpr-field" type="number" min="0" max={form.kind === 'percent' ? 100 : undefined} placeholder={form.kind === 'percent' ? 'Percent off (max 100)' : 'Rupees off'} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          <select className="admpr-field" value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })}>
            <option value="all">Everything</option>
            <option value="design">Designs only</option>
            <option value="theme">Themes only</option>
          </select>
          <input className="admpr-field" placeholder="Target ID (optional)" value={form.target_id} onChange={(e) => setForm({ ...form, target_id: e.target.value })} disabled={form.applies_to === 'all'} />
          <input className="admpr-field" type="number" min="0" placeholder="Max uses (0 = unlimited)" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} />
          <input className="admpr-field" type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          <label className="admpr-check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
          <SaveButton disabled={saving}>{saving ? 'Creating…' : 'Create code'}</SaveButton>
        </form>
      </Card>

      <Card style={{ overflowX: 'auto', minWidth: 0 }}>
        {rows === null ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>
            No codes yet. Until one exists, every code a customer enters at checkout
            is correctly refused as invalid.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr><Th>Code</Th><Th>Discount</Th><Th>Applies to</Th><Th>Used</Th><Th>Expires</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--mj-border)' }}>
                  <Td>{c.code}</Td>
                  <Td>{c.kind === 'percent' ? `${c.value}% off` : `${rupeeText(c.value)} off`}</Td>
                  <Td muted>{c.applies_to === 'all' ? 'Everything' : `${c.applies_to}${c.target_id ? ` · ${c.target_id}` : ''}`}</Td>
                  <Td muted>{`${c.used_count ?? 0}${c.max_uses ? ` / ${c.max_uses}` : ''}`}</Td>
                  <Td muted>{fmtExpiry(c.expires_at)}</Td>
                  <Td><Pill on={c.is_active !== false} /></Td>
                  <Td>
                    <button type="button" className="admpr-link-btn" onClick={() => toggle(c)}>{c.is_active !== false ? 'Deactivate' : 'Activate'}</button>
                    {' · '}
                    <button type="button" className="admpr-link-btn" onClick={() => remove(c)}>Delete</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function rupeeText(v) {
  return `₹${Number(v || 0).toLocaleString('en-IN')}`;
}

function fmtExpiry(v) {
  if (!v) return 'Never';
  const d = new Date(v);
  // The validator refuses a code whose expires_at it cannot parse, so say that
  // here rather than showing "Invalid Date" and leaving an admin guessing.
  if (Number.isNaN(d.getTime())) return 'Malformed — treated as expired';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
