/**
 * /super-admin/pricing — Unified Pricing Hub
 *
 * Single page replacing 17 legacy pricing pages. Structure:
 *
 *   ┌──────────── PHOTOGRAPHER ────────────┐  ┌──────── NORMAL USER ────────┐
 *   │ 1. Credit Packs                       │  │ 1. Credit Packs            │
 *   │ 2. Monthly Subscription               │  │ 2. Theme Prices            │
 *   │ 3. Post-Subscription Credit Pricing   │  │ 3. Design Prices           │
 *   │ 4. Theme Prices                       │  │ 4. Invitation Option Prices│
 *   │ 5. Design Prices                      │  └────────────────────────────┘
 *   │ 6. Invitation Option Prices           │
 *   └───────────────────────────────────────┘
 *
 * Every price row supports:
 *   - base_price
 *   - "Enable discount" toggle  → enter discount_price (old shown struck-through)
 *   - "Free" toggle (option_prices only)
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Crown, Users, IndianRupee, Coins, Repeat, Layers,
  Palette, ListTree, ChevronLeft, Save, Plus, Trash2, Tag,
  ToggleLeft, ToggleRight, AlertCircle, CheckCircle2,
  Database, HardDrive, Power, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const PRICE = `${API}/api/super-admin/pricing`;

const AUDIENCES = [
  { key: 'photographer', label: 'Photographer', icon: Crown, blurb: 'Plans + per-design prices' },
  { key: 'normal_user',  label: 'Normal User',  icon: Users, blurb: 'Design + per-feature + language prices' },
  // Events (Ganesh Chaturthi first) — same three knobs as weddings: per design,
  // per plan, per feature. Sold to BOTH photographers and families, so it is its
  // own tab rather than an audience-specific sheet.
  { key: 'events',       label: 'Events (Ganesh)', icon: Sparkles, blurb: 'Design + plan + feature prices' },
];

const PHOTOG_SUBTABS = [
  { key: 'sub_plans',      label: 'Portfolio Plans',     icon: Crown },
  { key: 'studio_storage', label: 'Cloud Storage',       icon: HardDrive },
  { key: 'designs',        label: 'Design Prices',       icon: Palette },
  { key: 'options',        label: 'Link Features',       icon: ListTree },
];
const NORMAL_SUBTABS = [
  { key: 'alacarte',      label: 'Features & Languages', icon: ListTree },
  { key: 'link_packages', label: 'Packages (legacy)',  icon: IndianRupee },
  { key: 'designs',       label: 'Design Prices',      icon: Palette },
  { key: 'options',       label: 'Link Features',      icon: ListTree },
  { key: 'pricing_page',  label: 'Pricing Page',       icon: Tag },
];
const EVENT_SUBTABS = [
  { key: 'event_designs',  label: 'Design Prices',  icon: Palette },
  { key: 'event_plans',    label: 'Plans',          icon: IndianRupee },
  { key: 'event_features', label: 'Feature Prices', icon: ListTree },
];
const EVENT_TYPE = 'ganesh_chaturthi';

// -------------- Generic UI building blocks --------------
const Toast = ({ msg, kind }) => msg ? (
  <div
    data-testid="pricing-toast"
    className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
      kind === 'err' ? 'bg-red-700 text-white' : 'bg-emerald-700 text-white'
    }`}
  >
    {kind === 'err' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
    <span className="text-sm">{msg}</span>
  </div>
) : null;

const ToggleSwitch = ({ on, onChange, testid }) => (
  <button
    type="button" onClick={() => onChange(!on)} data-testid={testid}
    className={`inline-flex items-center transition ${on ? 'text-emerald-400' : 'text-white/40'}`}
  >
    {on ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
  </button>
);

const PriceCell = ({ value, oldValue, suffix }) => (
  <div className="flex items-baseline gap-2">
    {oldValue != null && (
      <span className="text-white/40 text-sm line-through" data-testid="price-old">
        {oldValue}{suffix}
      </span>
    )}
    <span className="text-yellow-200 font-medium text-lg" data-testid="price-new">
      {value}{suffix}
    </span>
  </div>
);

const NumberInput = ({ value, onChange, testid, placeholder, min = 0 }) => (
  <input
    type="number" min={min}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    placeholder={placeholder}
    data-testid={testid}
    className="bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 w-28 focus:outline-none focus:border-yellow-300"
  />
);

const TextInput = ({ value, onChange, testid, placeholder, width = 'w-40' }) => (
  <input
    type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder} data-testid={testid}
    className={`bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 ${width} focus:outline-none focus:border-yellow-300`}
  />
);

// -------------- Reusable price row controls --------------
const DiscountControls = ({ row, onPatch, suffix, testid }) => (
  <div className="flex items-center gap-3">
    <span className="text-xs uppercase tracking-wider text-white/60">Discount</span>
    <ToggleSwitch
      on={!!row.discount_enabled}
      onChange={(v) => onPatch({ discount_enabled: v, ...(v ? {} : { discount_price: null }) })}
      testid={`${testid}-discount-toggle`}
    />
    {row.discount_enabled && (
      <NumberInput
        value={row.discount_price} onChange={(v) => onPatch({ discount_price: v })}
        testid={`${testid}-discount-input`} placeholder={`new ${suffix}`}
      />
    )}
  </div>
);

// -------------- Hook: auth header --------------
const useAuthAxios = () => {
  return useMemo(() => {
    const token = localStorage.getItem('admin_token');
    const instance = axios.create({ baseURL: API });
    if (token) instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    return instance;
  }, []);
};

// =============================================================
// SECTION COMPONENTS (one per sub-tab)
// =============================================================

// ---- Subscription Plans (the 4-product engine: /studio/plans) ----
// Full control: create/edit any plan — product, tier, monthly price, storage GB,
// feature list, popular flag, active flag, sort order. An "offer" is just a new
// tier (e.g. "Offer5TB") at a promo price, or an edit to an existing price.
// Photographer-panel plans are only Portfolio + Cloud Backup (storage + invitation removed per owner).
// Owner: portfolio pricing is Portfolio tiers (Basic/Premium) only — the
// Cloud Backup ('backup') product was removed from this screen.
const SUB_PRODUCTS = ['portfolio'];
// The 15 portfolio sections the admin can unlock per portfolio plan.
const PORTFOLIO_SECTIONS = [
  ['hero', 'Hero'], ['about', 'About Us'], ['journey', 'Our Journey'], ['statistics', 'Statistics'],
  ['services', 'Services'], ['featured_work', 'Featured Work'], ['why_choose_us', 'Why Choose Us'],
  ['testimonials', 'Testimonials'], ['equipment', 'Equipment'], ['awards', 'Awards'],
  ['event_highlights', 'Event Highlights'], ['booking_process', 'Booking Process'],
  ['availability', 'Availability'], ['contact', 'Contact'], ['special_feature', 'Special Feature'],
];
// Small checkbox grid for choosing which portfolio sections a plan unlocks.
const SectionPicker = ({ value, onChange, testid }) => {
  const set = new Set(value || []);
  const toggle = (k) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); onChange([...n]); };
  return (
    <div className="w-full mt-2 p-3 rounded-lg border border-yellow-200/15 bg-black/20" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2">Portfolio sections this plan unlocks (blank = all 15)</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
        {PORTFOLIO_SECTIONS.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-xs text-yellow-50 cursor-pointer">
            <input type="checkbox" checked={set.has(k)} onChange={() => toggle(k)} data-testid={`${testid}-${k}`} />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
};
function SubscriptionPlansSection({ http, toast }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const blankNew = { product: 'storage', tier: '', base_monthly: '', storage_gb: '', features: '', popular: false, sort_order: 0 };
  const [nw, setNw] = useState(blankNew);

  const load = async () => {
    setLoading(true);
    try { const { data } = await http.get('/api/admin/subscription-plans'); setPlans(data.plans || []); }
    catch (e) { toast('Could not load subscription plans', 'err'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const save = async (p) => {
    try {
      await http.post('/api/admin/subscription-plans', {
        product: p.product, tier: p.tier, base_monthly: Number(p.base_monthly) || 0,
        sort_order: Number(p.sort_order) || 0, is_active: p.is_active !== false, popular: !!p.popular,
        storage_gb: (p.storage_gb === '' || p.storage_gb == null) ? null : Number(p.storage_gb),
        features: Array.isArray(p.features) ? p.features : String(p.features || '').split(',').map((s) => s.trim()).filter(Boolean),
        portfolio_sections: Array.isArray(p.portfolio_sections) && p.portfolio_sections.length ? p.portfolio_sections : null,
      });
      toast('Saved'); load();
    } catch (e) { toast(e?.response?.data?.detail || 'Save failed', 'err'); }
  };
  const patch = (id, k, v) => setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  const create = async () => {
    if (!nw.tier.trim()) { toast('Tier name required', 'err'); return; }
    await save(nw); setNw(blankNew);
  };

  const feat = (p) => (Array.isArray(p.features) ? p.features.join(', ') : (p.features || ''));

  return (
    <div>
      <SectionHeader title="Subscription Plans" blurb="The plans behind /studio/plans (Get Premium). Control price, storage GB, features & offers per product. Create a new tier for any offer (e.g. 5TB promo)." />

      {/* Create a new plan */}
      <div className="rounded-xl border border-yellow-200/20 bg-black/30 p-4 mb-6" data-testid="subplan-new">
        <div className="text-xs uppercase tracking-wider text-white/60 mb-3">Add / offer a new plan</div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={nw.product} onChange={(e) => setNw({ ...nw, product: e.target.value })} className="bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50" data-testid="subplan-new-product">
            {SUB_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <TextInput value={nw.tier} onChange={(v) => setNw({ ...nw, tier: v })} placeholder="Tier (e.g. Offer5TB)" testid="subplan-new-tier" />
          <NumberInput value={nw.base_monthly} onChange={(v) => setNw({ ...nw, base_monthly: v })} placeholder="₹/month" testid="subplan-new-price" />
          <NumberInput value={nw.storage_gb} onChange={(v) => setNw({ ...nw, storage_gb: v })} placeholder="Storage GB" testid="subplan-new-gb" />
          <TextInput value={nw.features} onChange={(v) => setNw({ ...nw, features: v })} placeholder="features, comma, separated" width="w-72" testid="subplan-new-features" />
          <label className="flex items-center gap-2 text-xs text-white/60">Popular <ToggleSwitch on={nw.popular} onChange={(v) => setNw({ ...nw, popular: v })} testid="subplan-new-popular" /></label>
          <button onClick={create} className="bg-yellow-300 text-black rounded px-4 py-2 text-sm font-medium" data-testid="subplan-new-save">Create</button>
        </div>
        {nw.product === 'portfolio' && <SectionPicker value={nw.portfolio_sections} onChange={(v) => setNw({ ...nw, portfolio_sections: v })} testid="subplan-new-sections" />}
      </div>

      {loading ? <div className="text-white/60">Loading…</div> : SUB_PRODUCTS.map((prod) => {
        const rows = plans.filter((p) => p.product === prod).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        return (
          <div key={prod} className="mb-6">
            <div className="text-sm uppercase tracking-wider text-yellow-200/80 mb-2">{prod}</div>
            {rows.length === 0 ? <div className="text-white/40 text-sm mb-2">No plans.</div> : rows.map((p) => (
              <div key={p.id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-3 mb-2 flex flex-wrap items-center gap-3" data-testid={`subplan-${p.id}`} style={{ opacity: p.is_active === false ? 0.55 : 1 }}>
                <span className="font-serif text-yellow-200 w-32">{p.tier}</span>
                <label className="text-[10px] uppercase text-white/50">₹/mo <NumberInput value={p.base_monthly} onChange={(v) => patch(p.id, 'base_monthly', v)} testid={`subplan-price-${p.id}`} /></label>
                <label className="text-[10px] uppercase text-white/50">GB <NumberInput value={p.storage_gb} onChange={(v) => patch(p.id, 'storage_gb', v)} testid={`subplan-gb-${p.id}`} /></label>
                <label className="text-[10px] uppercase text-white/50">Sort <NumberInput value={p.sort_order} onChange={(v) => patch(p.id, 'sort_order', v)} testid={`subplan-sort-${p.id}`} /></label>
                <TextInput value={feat(p)} onChange={(v) => patch(p.id, 'features', v)} placeholder="features, comma, separated" width="w-64" testid={`subplan-features-${p.id}`} />
                <label className="flex items-center gap-1.5 text-xs text-white/60">Popular <ToggleSwitch on={!!p.popular} onChange={(v) => patch(p.id, 'popular', v)} testid={`subplan-popular-${p.id}`} /></label>
                <label className="flex items-center gap-1.5 text-xs text-white/60">Active <ToggleSwitch on={p.is_active !== false} onChange={(v) => patch(p.id, 'is_active', v)} testid={`subplan-active-${p.id}`} /></label>
                <button onClick={() => save(p)} className="bg-yellow-300 text-black rounded px-3 py-1.5 text-xs font-medium ml-auto" data-testid={`subplan-save-${p.id}`}>Save</button>
                {p.product === 'portfolio' && <SectionPicker value={p.portfolio_sections} onChange={(v) => patch(p.id, 'portfolio_sections', v)} testid={`subplan-sections-${p.id}`} />}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---- Billing Periods (days / months / years for subscription plans) ----
// Lets the owner offer plans by day, month or year (e.g. a 7-day trial or a
// 2-year plan) on top of the built-in Monthly/Quarterly/Half-Yearly/Yearly.
function BillingPeriodsSection({ http, toast }) {
  const [meta, setMeta] = useState({ defaults: [], units: ['days', 'months', 'years'] });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await http.get('/api/admin/billing-cycles');
      setMeta(data);
      setRows((data.custom || []).map((c) => ({ ...c, discount: Math.round((c.discount || 0) * 100) })));
    } catch (e) { toast('Could not load billing periods', 'err'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const addRow = () => setRows((r) => [...r, { key: '', label: '', unit: 'days', count: 7, discount: 0 }]);
  const patch = (i, k, v) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const remove = (i) => setRows((r) => r.filter((_, idx) => idx !== i));
  const save = async () => {
    try {
      const cycles = rows.filter((r) => r.key && String(r.key).trim()).map((r) => ({
        key: r.key, label: r.label, unit: r.unit, count: Number(r.count) || 1,
        discount: Math.max(0, Math.min(0.95, (Number(r.discount) || 0) / 100)),
      }));
      await http.put('/api/admin/billing-cycles', { cycles });
      toast('Billing periods saved'); load();
    } catch (e) { toast(e?.response?.data?.detail || 'Save failed', 'err'); }
  };

  return (
    <div className="mt-10" data-testid="billing-periods-section">
      <SectionHeader title="Billing Periods — days / months / years" blurb="Durations buyers can choose for every subscription plan (portfolio, cloud storage, …). Add day-, month- or year-based periods with an optional discount off the monthly price. The defaults below are always available." />
      <div className="rounded-xl border border-yellow-200/15 bg-black/20 p-4 mb-4">
        <div className="text-xs uppercase tracking-wider text-white/60 mb-2">Default periods (always available)</div>
        <div className="flex flex-wrap gap-2">
          {(meta.defaults || []).map((d) => (
            <span key={d.key} className="text-xs px-2.5 py-1 rounded-full border border-yellow-200/20 text-yellow-50">
              {d.label} · {d.count} {d.unit}{d.discount > 0 ? ` · −${Math.round(d.discount * 100)}%` : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-yellow-200/20 bg-black/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wider text-white/60">Custom periods</div>
          <button onClick={addRow} className="text-xs flex items-center gap-1 text-yellow-200" data-testid="billing-add"><Plus className="w-3.5 h-3.5" /> Add period</button>
        </div>
        {loading ? <div className="text-white/60">Loading…</div> : (
          <>
            {rows.length === 0 && <div className="text-white/40 text-sm mb-3">No custom periods yet. Add one to offer e.g. a 7-day trial or a 2-year plan.</div>}
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 mb-2 rounded-lg border border-yellow-200/15 bg-black/20 p-3" data-testid={`billing-period-${i}`}>
                <TextInput value={r.key} onChange={(v) => patch(i, 'key', v)} placeholder="key (e.g. weekly)" testid={`billing-key-${i}`} />
                <TextInput value={r.label} onChange={(v) => patch(i, 'label', v)} placeholder="Label (e.g. Weekly)" testid={`billing-label-${i}`} />
                <select value={r.unit} onChange={(e) => patch(i, 'unit', e.target.value)} className="bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50" data-testid={`billing-unit-${i}`}>
                  {(meta.units || ['days', 'months', 'years']).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <label className="text-[10px] uppercase text-white/50">Count <NumberInput value={r.count} onChange={(v) => patch(i, 'count', v)} testid={`billing-count-${i}`} /></label>
                <label className="text-[10px] uppercase text-white/50">Discount % <NumberInput value={r.discount} onChange={(v) => patch(i, 'discount', v)} testid={`billing-discount-${i}`} /></label>
                <button onClick={() => remove(i)} className="text-red-300 ml-auto" data-testid={`billing-remove-${i}`}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={save} className="bg-yellow-300 text-black rounded px-4 py-2 text-sm font-medium mt-2" data-testid="billing-save">Save periods</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Link Packages (normal-user invitation-link tiers + add-ons) ----
// The plan tiers a normal user (or photographer) picks in the cart when buying
// an invitation link — served by /api/store/packages, priced here.
/**
 * AlaCarteSection — how the cart actually prices an invitation now.
 *
 * There are no ceremony packages: the buyer pays the DESIGN price, gets the
 * "included" features free, and pays separately for each extra feature and each
 * additional language. Every number on this screen is the live price the cart
 * charges (db.store_features / db.store_languages).
 */
function AlaCarteSection({ http, toast }) {
  const [features, setFeatures] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [defaults, setDefaults] = useState({});
  const [loading, setLoading] = useState(true);
  const [nwF, setNwF] = useState({ key: '', label: '', price: '', note: '', included: false, sort: 0 });
  const [nwL, setNwL] = useState({ key: '', label: '', price: '', sort: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await http.get('/api/admin/store-alacarte');
      setFeatures(data.features || []);
      setLanguages(data.languages || []);
      setDefaults({ main: data.default_main_language, design: data.design_price_default_inr });
    } catch (e) { toast('Could not load feature & language prices', 'err'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const saveFeature = async (f) => {
    try {
      await http.post('/api/admin/store-features', {
        key: f.key, label: f.label, price: Number(f.price) || 0, note: f.note || '',
        included: !!f.included, sort: Number(f.sort) || 0, is_active: f.is_active !== false,
      });
      toast('Saved'); load();
    } catch (e) { toast(e?.response?.data?.detail || 'Save failed', 'err'); }
  };
  const patchF = (key, k, v) => setFeatures((fs) => fs.map((f) => (f.key === key ? { ...f, [k]: v } : f)));
  const createF = async () => {
    if (!nwF.key.trim()) { toast('Key required', 'err'); return; }
    await saveFeature(nwF); setNwF({ key: '', label: '', price: '', note: '', included: false, sort: 0 });
  };

  const saveLang = async (l) => {
    try {
      await http.post('/api/admin/store-languages', {
        key: l.key, label: l.label, price: Number(l.price) || 0,
        sort: Number(l.sort) || 0, is_active: l.is_active !== false,
      });
      toast('Saved'); load();
    } catch (e) { toast(e?.response?.data?.detail || 'Save failed', 'err'); }
  };
  const patchL = (key, k, v) => setLanguages((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));
  const createL = async () => {
    if (!nwL.key.trim()) { toast('Key required', 'err'); return; }
    await saveLang(nwL); setNwL({ key: '', label: '', price: '', sort: 0 });
  };

  if (loading) return <div className="text-white/60">Loading…</div>;
  const included = features.filter((f) => f.included);
  const paid = features.filter((f) => !f.included);

  return (
    <div>
      <SectionHeader
        title="Features & Languages — what the cart charges"
        blurb="The cart price is: design price + each feature the buyer picks + each ADDITIONAL language. Features marked “Included” ship free with every design and are always ₹0. The buyer's main language is free; every other language is charged at its price below." />

      <div className="rounded-xl border border-yellow-200/20 bg-black/30 p-4 mb-6 text-xs text-white/60">
        Design prices live in the <span className="text-yellow-200">Design Prices</span> tab
        (fallback ₹{defaults.design}). Default main language: <span className="text-yellow-200">{defaults.main}</span>.
      </div>

      {/* new feature */}
      <div className="rounded-xl border border-yellow-200/20 bg-black/30 p-4 mb-6" data-testid="alacarte-new-feature">
        <div className="text-xs uppercase tracking-wider text-white/60 mb-3">Add a feature</div>
        <div className="flex flex-wrap items-center gap-3">
          <TextInput value={nwF.key} onChange={(v) => setNwF({ ...nwF, key: v })} placeholder="key (e.g. seating_chart)" testid="alacarte-nf-key" />
          <TextInput value={nwF.label} onChange={(v) => setNwF({ ...nwF, label: v })} placeholder="Label shown to buyers" testid="alacarte-nf-label" />
          <NumberInput value={nwF.price} onChange={(v) => setNwF({ ...nwF, price: v })} placeholder="₹" testid="alacarte-nf-price" />
          <TextInput value={nwF.note} onChange={(v) => setNwF({ ...nwF, note: v })} placeholder="One-line explanation (optional)" width="w-64" testid="alacarte-nf-note" />
          <label className="flex items-center gap-2 text-xs text-white/60">Included free <ToggleSwitch on={nwF.included} onChange={(v) => setNwF({ ...nwF, included: v })} testid="alacarte-nf-included" /></label>
          <button onClick={createF} className="bg-yellow-300 text-black rounded px-4 py-2 text-sm font-medium" data-testid="alacarte-nf-save">Create</button>
        </div>
      </div>

      <div className="text-sm uppercase tracking-wider text-yellow-200/80 mb-2">
        Included with every design — always ₹0
      </div>
      {included.map((f) => (
        <div key={f.key} className="rounded-lg border border-yellow-200/15 bg-black/20 p-3 mb-2 flex flex-wrap items-center gap-3" data-testid={`alacarte-feature-${f.key}`} style={{ opacity: f.is_active === false ? 0.55 : 1 }}>
          <span className="font-serif text-yellow-200 w-44">{f.key}</span>
          <TextInput value={f.label} onChange={(v) => patchF(f.key, 'label', v)} width="w-56" testid={`alacarte-flabel-${f.key}`} />
          <span className="text-xs text-white/40">free</span>
          <label className="text-[10px] uppercase text-white/50">Sort <NumberInput value={f.sort} onChange={(v) => patchF(f.key, 'sort', v)} testid={`alacarte-fsort-${f.key}`} /></label>
          <label className="flex items-center gap-1.5 text-xs text-white/60">Included <ToggleSwitch on onChange={(v) => patchF(f.key, 'included', v)} testid={`alacarte-fincl-${f.key}`} /></label>
          <label className="flex items-center gap-1.5 text-xs text-white/60">Active <ToggleSwitch on={f.is_active !== false} onChange={(v) => patchF(f.key, 'is_active', v)} testid={`alacarte-factive-${f.key}`} /></label>
          <button onClick={() => saveFeature(f)} className="bg-yellow-300 text-black rounded px-3 py-1.5 text-xs font-medium ml-auto" data-testid={`alacarte-fsave-${f.key}`}>Save</button>
        </div>
      ))}

      <div className="text-sm uppercase tracking-wider text-yellow-200/80 mb-2 mt-6">
        Priced separately — the buyer picks these
      </div>
      {paid.map((f) => (
        <div key={f.key} className="rounded-lg border border-yellow-200/15 bg-black/20 p-3 mb-2" data-testid={`alacarte-feature-${f.key}`} style={{ opacity: f.is_active === false ? 0.55 : 1 }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-serif text-yellow-200 w-44">{f.key}</span>
            <TextInput value={f.label} onChange={(v) => patchF(f.key, 'label', v)} width="w-56" testid={`alacarte-flabel-${f.key}`} />
            <label className="text-[10px] uppercase text-white/50">₹ <NumberInput value={f.price} onChange={(v) => patchF(f.key, 'price', v)} testid={`alacarte-fprice-${f.key}`} /></label>
            <label className="text-[10px] uppercase text-white/50">Sort <NumberInput value={f.sort} onChange={(v) => patchF(f.key, 'sort', v)} testid={`alacarte-fsort-${f.key}`} /></label>
            <label className="flex items-center gap-1.5 text-xs text-white/60">Included <ToggleSwitch on={false} onChange={(v) => patchF(f.key, 'included', v)} testid={`alacarte-fincl-${f.key}`} /></label>
            <label className="flex items-center gap-1.5 text-xs text-white/60">Active <ToggleSwitch on={f.is_active !== false} onChange={(v) => patchF(f.key, 'is_active', v)} testid={`alacarte-factive-${f.key}`} /></label>
            <button onClick={() => saveFeature(f)} className="bg-yellow-300 text-black rounded px-3 py-1.5 text-xs font-medium ml-auto" data-testid={`alacarte-fsave-${f.key}`}>Save</button>
          </div>
          <TextInput value={f.note} onChange={(v) => patchF(f.key, 'note', v)} placeholder="One-line explanation shown under the feature" width="w-full mt-2" testid={`alacarte-fnote-${f.key}`} />
        </div>
      ))}

      <div className="text-sm uppercase tracking-wider text-yellow-200/80 mb-2 mt-8">
        Languages — main language free, each extra one charged
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <TextInput value={nwL.key} onChange={(v) => setNwL({ ...nwL, key: v })} placeholder="key (e.g. konkani)" testid="alacarte-nl-key" />
        <TextInput value={nwL.label} onChange={(v) => setNwL({ ...nwL, label: v })} placeholder="Label" testid="alacarte-nl-label" />
        <NumberInput value={nwL.price} onChange={(v) => setNwL({ ...nwL, price: v })} placeholder="₹ extra" testid="alacarte-nl-price" />
        <button onClick={createL} className="bg-yellow-300 text-black rounded px-4 py-2 text-sm font-medium" data-testid="alacarte-nl-save">Add</button>
      </div>
      {languages.map((l) => (
        <div key={l.key} className="rounded-lg border border-yellow-200/15 bg-black/20 p-3 mb-2 flex flex-wrap items-center gap-3" data-testid={`alacarte-lang-${l.key}`} style={{ opacity: l.is_active === false ? 0.55 : 1 }}>
          <span className="font-serif text-yellow-200 w-32">{l.key}</span>
          <TextInput value={l.label} onChange={(v) => patchL(l.key, 'label', v)} width="w-40" testid={`alacarte-llabel-${l.key}`} />
          <label className="text-[10px] uppercase text-white/50">₹ extra <NumberInput value={l.price} onChange={(v) => patchL(l.key, 'price', v)} testid={`alacarte-lprice-${l.key}`} /></label>
          <label className="text-[10px] uppercase text-white/50">Sort <NumberInput value={l.sort} onChange={(v) => patchL(l.key, 'sort', v)} testid={`alacarte-lsort-${l.key}`} /></label>
          <label className="flex items-center gap-1.5 text-xs text-white/60">Active <ToggleSwitch on={l.is_active !== false} onChange={(v) => patchL(l.key, 'is_active', v)} testid={`alacarte-lactive-${l.key}`} /></label>
          <button onClick={() => saveLang(l)} className="bg-yellow-300 text-black rounded px-3 py-1.5 text-xs font-medium ml-auto" data-testid={`alacarte-lsave-${l.key}`}>Save</button>
        </div>
      ))}
    </div>
  );
}

function LinkPackagesSection({ http, toast }) {
  const [packages, setPackages] = useState([]);
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const blankPkg = { key: '', label: '', events: '', price_english: '', price_regional: '', featured: false, sort: 0 };
  const [nw, setNw] = useState(blankPkg);
  const [nwAddon, setNwAddon] = useState({ key: '', label: '', price: '' });

  const load = async () => {
    setLoading(true);
    try { const { data } = await http.get('/api/admin/store-packages'); setPackages(data.packages || []); setAddons(data.addons || []); }
    catch (e) { toast('Could not load link packages', 'err'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const savePkg = async (p) => {
    try {
      await http.post('/api/admin/store-packages', {
        key: p.key, label: p.label, events: p.events === '' || p.events == null ? null : Number(p.events),
        price_english: Number(p.price?.english ?? p.price_english) || 0,
        price_regional: Number(p.price?.regional ?? p.price_regional ?? p.price?.english ?? p.price_english) || 0,
        featured: !!p.featured, sort: Number(p.sort) || 0, is_active: p.is_active !== false,
      });
      toast('Saved'); load();
    } catch (e) { toast(e?.response?.data?.detail || 'Save failed', 'err'); }
  };
  const patchPkg = (key, k, v) => setPackages((ps) => ps.map((p) => (p.key === key ? { ...p, [k]: v } : p)));
  const patchPrice = (key, lang, v) => setPackages((ps) => ps.map((p) => (p.key === key ? { ...p, price: { ...(p.price || {}), [lang]: v } } : p)));
  const createPkg = async () => { if (!nw.key.trim()) { toast('Key required', 'err'); return; } await savePkg(nw); setNw(blankPkg); };

  const saveAddon = async (a) => {
    try { await http.post('/api/admin/store-addons', { key: a.key, label: a.label, price: Number(a.price) || 0, is_active: a.is_active !== false }); toast('Saved'); load(); }
    catch (e) { toast(e?.response?.data?.detail || 'Save failed', 'err'); }
  };
  const patchAddon = (key, k, v) => setAddons((as) => as.map((a) => (a.key === key ? { ...a, [k]: v } : a)));
  const createAddon = async () => { if (!nwAddon.key.trim()) { toast('Key required', 'err'); return; } await saveAddon(nwAddon); setNwAddon({ key: '', label: '', price: '' }); };

  if (loading) return <div className="text-white/60">Loading…</div>;
  return (
    <div>
      <SectionHeader title="Link Packages" blurb="The invitation-link plan tiers a normal user picks in the cart (Classic/Premium/…) + add-ons. Set English/Regional price, ceremonies covered, featured tier & active state." />

      {/* new package */}
      <div className="rounded-xl border border-yellow-200/20 bg-black/30 p-4 mb-6" data-testid="linkpkg-new">
        <div className="text-xs uppercase tracking-wider text-white/60 mb-3">Add a package tier</div>
        <div className="flex flex-wrap items-center gap-3">
          <TextInput value={nw.key} onChange={(v) => setNw({ ...nw, key: v })} placeholder="key (e.g. classic)" testid="linkpkg-new-key" />
          <TextInput value={nw.label} onChange={(v) => setNw({ ...nw, label: v })} placeholder="Label" testid="linkpkg-new-label" />
          <NumberInput value={nw.events} onChange={(v) => setNw({ ...nw, events: v })} placeholder="events (blank=all)" testid="linkpkg-new-events" />
          <NumberInput value={nw.price_english} onChange={(v) => setNw({ ...nw, price_english: v })} placeholder="₹ English" testid="linkpkg-new-eng" />
          <NumberInput value={nw.price_regional} onChange={(v) => setNw({ ...nw, price_regional: v })} placeholder="₹ Regional" testid="linkpkg-new-reg" />
          <label className="flex items-center gap-2 text-xs text-white/60">Featured <ToggleSwitch on={nw.featured} onChange={(v) => setNw({ ...nw, featured: v })} testid="linkpkg-new-featured" /></label>
          <button onClick={createPkg} className="bg-yellow-300 text-black rounded px-4 py-2 text-sm font-medium" data-testid="linkpkg-new-save">Create</button>
        </div>
      </div>

      <div className="text-sm uppercase tracking-wider text-yellow-200/80 mb-2">Package tiers</div>
      {packages.map((p) => (
        <div key={p.key} className="rounded-lg border border-yellow-200/15 bg-black/20 p-3 mb-2 flex flex-wrap items-center gap-3" data-testid={`linkpkg-${p.key}`} style={{ opacity: p.is_active === false ? 0.55 : 1 }}>
          <span className="font-serif text-yellow-200 w-24">{p.key}</span>
          <TextInput value={p.label} onChange={(v) => patchPkg(p.key, 'label', v)} placeholder="Label" testid={`linkpkg-label-${p.key}`} width="w-32" />
          <label className="text-[10px] uppercase text-white/50">Events <NumberInput value={p.events} onChange={(v) => patchPkg(p.key, 'events', v)} testid={`linkpkg-events-${p.key}`} /></label>
          <label className="text-[10px] uppercase text-white/50">₹Eng <NumberInput value={p.price?.english} onChange={(v) => patchPrice(p.key, 'english', v)} testid={`linkpkg-eng-${p.key}`} /></label>
          <label className="text-[10px] uppercase text-white/50">₹Reg <NumberInput value={p.price?.regional} onChange={(v) => patchPrice(p.key, 'regional', v)} testid={`linkpkg-reg-${p.key}`} /></label>
          <label className="text-[10px] uppercase text-white/50">Sort <NumberInput value={p.sort} onChange={(v) => patchPkg(p.key, 'sort', v)} testid={`linkpkg-sort-${p.key}`} /></label>
          <label className="flex items-center gap-1.5 text-xs text-white/60">Featured <ToggleSwitch on={!!p.featured} onChange={(v) => patchPkg(p.key, 'featured', v)} testid={`linkpkg-featured-${p.key}`} /></label>
          <label className="flex items-center gap-1.5 text-xs text-white/60">Active <ToggleSwitch on={p.is_active !== false} onChange={(v) => patchPkg(p.key, 'is_active', v)} testid={`linkpkg-active-${p.key}`} /></label>
          <button onClick={() => savePkg(p)} className="bg-yellow-300 text-black rounded px-3 py-1.5 text-xs font-medium ml-auto" data-testid={`linkpkg-save-${p.key}`}>Save</button>
        </div>
      ))}

      <div className="text-sm uppercase tracking-wider text-yellow-200/80 mb-2 mt-6">Add-ons</div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <TextInput value={nwAddon.key} onChange={(v) => setNwAddon({ ...nwAddon, key: v })} placeholder="key" testid="linkaddon-new-key" />
        <TextInput value={nwAddon.label} onChange={(v) => setNwAddon({ ...nwAddon, label: v })} placeholder="Label" testid="linkaddon-new-label" />
        <NumberInput value={nwAddon.price} onChange={(v) => setNwAddon({ ...nwAddon, price: v })} placeholder="₹" testid="linkaddon-new-price" />
        <button onClick={createAddon} className="bg-yellow-300 text-black rounded px-4 py-2 text-sm font-medium" data-testid="linkaddon-new-save">Add</button>
      </div>
      {addons.map((a) => (
        <div key={a.key} className="rounded-lg border border-yellow-200/15 bg-black/20 p-3 mb-2 flex flex-wrap items-center gap-3" data-testid={`linkaddon-${a.key}`} style={{ opacity: a.is_active === false ? 0.55 : 1 }}>
          <span className="font-serif text-yellow-200 w-40">{a.key}</span>
          <TextInput value={a.label} onChange={(v) => patchAddon(a.key, 'label', v)} testid={`linkaddon-label-${a.key}`} width="w-56" />
          <label className="text-[10px] uppercase text-white/50">₹ <NumberInput value={a.price} onChange={(v) => patchAddon(a.key, 'price', v)} testid={`linkaddon-price-${a.key}`} /></label>
          <label className="flex items-center gap-1.5 text-xs text-white/60">Active <ToggleSwitch on={a.is_active !== false} onChange={(v) => patchAddon(a.key, 'is_active', v)} testid={`linkaddon-active-${a.key}`} /></label>
          <button onClick={() => saveAddon(a)} className="bg-yellow-300 text-black rounded px-3 py-1.5 text-xs font-medium ml-auto" data-testid={`linkaddon-save-${a.key}`}>Save</button>
        </div>
      ))}
    </div>
  );
}

// ---- Credit Packs ----
function CreditPacksSection({ audience, http, toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newRow, setNewRow] = useState({ credits: '', base_price: '', label: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await http.get(`/api/super-admin/pricing/credit-packs?audience=${audience}`);
      setRows(r.data);
    } catch (e) { toast(e.message || 'Failed to load packs', 'err'); }
    setLoading(false);
  }, [audience, http, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (row) => {
    try {
      await http.post('/api/super-admin/pricing/credit-packs', { ...row, audience });
      toast('Pack saved');
      load();
    } catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this pack?')) return;
    try {
      await http.delete(`/api/super-admin/pricing/credit-packs/${id}`);
      toast('Pack deleted');
      load();
    } catch (e) { toast(e.response?.data?.detail || 'Delete failed', 'err'); }
  };

  const addNew = async () => {
    if (!newRow.credits || !newRow.base_price) return toast('Enter credits + price', 'err');
    await save({ ...newRow, credits: Number(newRow.credits), base_price: Number(newRow.base_price), is_active: true });
    setNewRow({ credits: '', base_price: '', label: '' });
  };

  return (
    <div data-testid="credit-packs-section">
      <SectionHeader title="Credit Packs" blurb="Buy-credit bundles. Set credits → price. Discount toggles a struck-through old price." />
      {loading ? <Skeleton /> : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PackRow key={row.id} row={row} onSave={save} onRemove={remove} testid={`pack-${row.credits}`} />
          ))}
          {!rows.length && <Empty label="No packs yet" />}
        </div>
      )}
      <div className="mt-6 p-4 rounded-lg border border-yellow-200/15 bg-black/30">
        <div className="text-xs uppercase tracking-wider text-yellow-200/70 mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> New Pack</div>
        <div className="flex flex-wrap items-end gap-3">
          <NumberInput value={newRow.credits} onChange={(v) => setNewRow({ ...newRow, credits: v })} placeholder="100" testid="new-pack-credits" />
          <span className="text-white/40 text-sm">credits =</span>
          <NumberInput value={newRow.base_price} onChange={(v) => setNewRow({ ...newRow, base_price: v })} placeholder="600" testid="new-pack-price" />
          <span className="text-white/40 text-sm">rupees</span>
          <TextInput value={newRow.label} onChange={(v) => setNewRow({ ...newRow, label: v })} placeholder="Label (optional)" testid="new-pack-label" />
          <button onClick={addNew} className="px-4 py-2 bg-yellow-300 text-black rounded font-medium hover:bg-yellow-200" data-testid="new-pack-save">Add Pack</button>
        </div>
      </div>
    </div>
  );
}

function PackRow({ row, onSave, onRemove, testid }) {
  const [local, setLocal] = useState(row);
  useEffect(() => { setLocal(row); }, [row]);
  const dirty = JSON.stringify(local) !== JSON.stringify(row);

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-yellow-200/15 bg-black/40" data-testid={testid}>
      <div className="flex items-center gap-2 min-w-[180px]">
        <Coins className="w-4 h-4 text-yellow-300" />
        <span className="text-yellow-50 font-medium">{row.credits} credits</span>
        {row.label && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-300/15 text-yellow-200/90">{row.label}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-white/50 text-sm">₹</span>
        <NumberInput value={local.base_price} onChange={(v) => setLocal({ ...local, base_price: v })} testid={`${testid}-base`} />
      </div>
      <DiscountControls row={local} onPatch={(p) => setLocal({ ...local, ...p })} suffix="₹" testid={testid} />
      <div className="ml-auto flex items-center gap-2">
        <PriceCell
          value={local.discount_enabled && local.discount_price != null ? local.discount_price : local.base_price}
          oldValue={local.discount_enabled && local.discount_price != null ? local.base_price : null}
          suffix="₹"
        />
        {dirty && (
          <button onClick={() => onSave(local)} className="px-3 py-2 bg-emerald-600 text-white rounded text-sm flex items-center gap-1" data-testid={`${testid}-save`}>
            <Save className="w-4 h-4" /> Save
          </button>
        )}
        <button onClick={() => onRemove(row.id)} className="p-2 text-red-400 hover:text-red-300" data-testid={`${testid}-delete`}><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// ---- Subscription (photographer only) ----
function SubscriptionSection({ http, toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await http.get('/api/super-admin/pricing/subscriptions')).data); }
    catch (e) { toast(e.message, 'err'); }
    setLoading(false);
  }, [http, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (row) => {
    try {
      await http.post('/api/super-admin/pricing/subscriptions', row);
      toast('Plan saved'); load();
    } catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this plan?')) return;
    try { await http.delete(`/api/super-admin/pricing/subscriptions/${id}`); toast('Plan deleted'); load(); }
    catch (e) { toast(e.response?.data?.detail || 'Delete failed', 'err'); }
  };

  const addNew = () => save({ name: 'New Plan', credits_per_month: 400, duration_days: 30, base_price: 600, is_active: true });

  return (
    <div data-testid="subscription-section">
      <SectionHeader
        title="Monthly Subscription"
        blurb="Photographer's recurring plan. Photographer pays a fixed monthly fee and receives a credit balance refreshed each cycle."
      />
      {loading ? <Skeleton /> : (
        <div className="space-y-3">
          {rows.map((row) => <SubRow key={row.id} row={row} onSave={save} onRemove={remove} />)}
          {!rows.length && <Empty label="No subscription plans yet" />}
        </div>
      )}
      <div className="mt-4">
        <button onClick={addNew} className="px-4 py-2 border border-yellow-300/40 text-yellow-200 rounded hover:bg-yellow-300/10" data-testid="add-subscription">
          <Plus className="inline w-4 h-4 mr-1" /> Add Plan
        </button>
      </div>
    </div>
  );
}

function SubRow({ row, onSave, onRemove }) {
  const [local, setLocal] = useState(row);
  useEffect(() => { setLocal(row); }, [row]);
  const dirty = JSON.stringify(local) !== JSON.stringify(row);
  const testid = `sub-${row.id}`;
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-yellow-200/15 bg-black/40" data-testid={testid}>
      <TextInput value={local.name} onChange={(v) => setLocal({ ...local, name: v })} testid={`${testid}-name`} />
      <span className="text-white/50 text-sm">credits/mo</span>
      <NumberInput value={local.credits_per_month} onChange={(v) => setLocal({ ...local, credits_per_month: v })} testid={`${testid}-credits`} />
      <span className="text-white/50 text-sm">days</span>
      <NumberInput value={local.duration_days} onChange={(v) => setLocal({ ...local, duration_days: v })} testid={`${testid}-days`} />
      <span className="text-white/50 text-sm">₹</span>
      <NumberInput value={local.base_price} onChange={(v) => setLocal({ ...local, base_price: v })} testid={`${testid}-price`} />
      <DiscountControls row={local} onPatch={(p) => setLocal({ ...local, ...p })} suffix="₹" testid={testid} />
      <ToggleSwitch on={!!local.is_active} onChange={(v) => setLocal({ ...local, is_active: v })} testid={`${testid}-active`} />
      <span className="text-white/50 text-xs">{local.is_active ? 'Active' : 'Inactive'}</span>
      <div className="ml-auto flex items-center gap-2">
        <PriceCell
          value={local.discount_enabled && local.discount_price != null ? local.discount_price : local.base_price}
          oldValue={local.discount_enabled && local.discount_price != null ? local.base_price : null}
          suffix="₹"
        />
        {dirty && <button onClick={() => onSave(local)} className="px-3 py-2 bg-emerald-600 text-white rounded text-sm" data-testid={`${testid}-save`}><Save className="inline w-4 h-4 mr-1" /> Save</button>}
        <button onClick={() => onRemove(row.id)} className="p-2 text-red-400" data-testid={`${testid}-delete`}><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// ---- Post-Subscription Config ----
function PostSubSection({ http, toast }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setConfig((await http.get('/api/super-admin/pricing/post-sub')).data); }
    catch (e) { toast(e.message, 'err'); }
    setLoading(false);
  }, [http, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try { await http.put('/api/super-admin/pricing/post-sub', config); toast('Post-sub config saved'); }
    catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };

  if (loading || !config) return <Skeleton />;

  return (
    <div data-testid="post-sub-section">
      <SectionHeader
        title="Post-Subscription Credit Pricing"
        blurb="When the photographer's monthly credits run out, this rate applies. Toggle between a flat per-credit rate or a list of top-up packs."
      />
      <div className="p-4 rounded-lg border border-yellow-200/15 bg-black/40 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-sm">Mode:</span>
          <button
            onClick={() => setConfig({ ...config, mode: 'per_credit' })}
            className={`px-3 py-1.5 rounded text-sm ${config.mode === 'per_credit' ? 'bg-yellow-300 text-black' : 'bg-black/40 text-yellow-200 border border-yellow-200/20'}`}
            data-testid="post-sub-mode-rate"
          >
            Per-Credit Rate
          </button>
          <button
            onClick={() => setConfig({ ...config, mode: 'packs' })}
            className={`px-3 py-1.5 rounded text-sm ${config.mode === 'packs' ? 'bg-yellow-300 text-black' : 'bg-black/40 text-yellow-200 border border-yellow-200/20'}`}
            data-testid="post-sub-mode-packs"
          >
            Top-Up Packs
          </button>
        </div>

        {config.mode === 'per_credit' ? (
          <div className="flex items-center gap-3">
            <span className="text-white/70 text-sm">₹</span>
            <NumberInput value={config.per_credit_rate} onChange={(v) => setConfig({ ...config, per_credit_rate: v })} testid="post-sub-rate" />
            <span className="text-white/70 text-sm">per credit (after monthly run out)</span>
          </div>
        ) : (
          <div className="space-y-3">
            {(config.packs || []).map((p, idx) => (
              <div key={idx} className="flex items-center gap-3" data-testid={`post-sub-pack-${idx}`}>
                <NumberInput value={p.credits} onChange={(v) => {
                  const np = [...config.packs]; np[idx] = { ...p, credits: v }; setConfig({ ...config, packs: np });
                }} testid={`post-sub-pack-${idx}-credits`} />
                <span className="text-white/40 text-sm">credits =</span>
                <NumberInput value={p.base_price} onChange={(v) => {
                  const np = [...config.packs]; np[idx] = { ...p, base_price: v }; setConfig({ ...config, packs: np });
                }} testid={`post-sub-pack-${idx}-price`} />
                <span className="text-white/40 text-sm">₹</span>
                <button onClick={() => {
                  const np = config.packs.filter((_, i) => i !== idx); setConfig({ ...config, packs: np });
                }} className="text-red-400" data-testid={`post-sub-pack-${idx}-delete`}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button
              onClick={() => setConfig({
                ...config, packs: [...(config.packs || []), {
                  id: `ps_${Date.now()}`, audience: 'photographer',
                  credits: 100, base_price: 400, label: '', is_active: true,
                  discount_enabled: false, discount_price: null,
                }],
              })}
              className="px-3 py-2 border border-yellow-300/40 text-yellow-200 rounded text-sm"
              data-testid="post-sub-add-pack"
            ><Plus className="inline w-4 h-4 mr-1" /> Add Pack</button>
          </div>
        )}

        <button onClick={save} className="mt-4 px-5 py-2.5 bg-yellow-300 text-black rounded font-medium" data-testid="post-sub-save">
          <Save className="inline w-4 h-4 mr-1" /> Save Configuration
        </button>
      </div>
    </div>
  );
}

// ---- Photographer Loyalty Tiers ----
function PhotographerTiersSection({ http, toast }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setConfig((await http.get('/api/super-admin/pricing/photographer-tiers')).data); }
    catch (e) { toast(e.message || 'Failed to load tiers', 'err'); }
    setLoading(false);
  }, [http, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await http.put('/api/super-admin/pricing/photographer-tiers', config);
      toast('Loyalty tiers saved');
      load();
    } catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };

  const patchTier = (idx, patch) => {
    const tiers = [...config.tiers];
    tiers[idx] = { ...tiers[idx], ...patch };
    setConfig({ ...config, tiers });
  };

  if (loading || !config) return <Skeleton />;

  return (
    <div data-testid="loyalty-tiers-section">
      <SectionHeader
        title="Photographer Loyalty Tiers"
        blurb="As photographers publish more paid links they climb the loyalty ladder — Starter → Pro → Elite → Partner. Each tier unlocks a discount on credit packs AND on per-link publishing, plus bonus credits on every pack purchase. Tiers auto-upgrade server-side as `paid_links_count` crosses each threshold."
      />

      <div className="p-4 rounded-lg border border-yellow-200/15 bg-black/40 mb-5 flex items-center gap-4">
        <ToggleSwitch
          on={config.enabled}
          onChange={(v) => setConfig({ ...config, enabled: v })}
          testid="tiers-enabled-toggle"
        />
        <div>
          <div className="text-yellow-200 text-sm font-medium">
            Loyalty system {config.enabled ? 'enabled' : 'disabled'}
          </div>
          <div className="text-white/55 text-xs">
            {config.enabled
              ? 'Photographers see their tier badge and progress toward the next tier.'
              : 'All photographers are treated as Starter — no discounts applied anywhere.'}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {config.tiers.map((t, idx) => (
          <div
            key={t.key}
            className="p-4 rounded-lg border border-yellow-200/15 bg-black/30 flex flex-wrap items-end gap-4"
            data-testid={`tier-row-${t.key}`}
          >
            <div className="min-w-[110px]">
              <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Tier</div>
              <div className="text-yellow-200 font-medium flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" /> {t.label}
              </div>
              <div className="text-white/40 text-xs mt-0.5">key: {t.key}</div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Label</div>
              <TextInput
                value={t.label}
                onChange={(v) => patchTier(idx, { label: v })}
                width="w-32"
                testid={`tier-${t.key}-label`}
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Min paid links</div>
              <NumberInput
                value={t.min_paid_links}
                onChange={(v) => patchTier(idx, { min_paid_links: Number(v ?? 0) })}
                testid={`tier-${t.key}-min-links`}
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Discount %</div>
              <NumberInput
                value={t.discount_pct}
                onChange={(v) => patchTier(idx, { discount_pct: Math.min(100, Math.max(0, Number(v ?? 0))) })}
                testid={`tier-${t.key}-discount-pct`}
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Bonus credits %</div>
              <NumberInput
                value={t.bonus_pct}
                onChange={(v) => patchTier(idx, { bonus_pct: Math.min(100, Math.max(0, Number(v ?? 0))) })}
                testid={`tier-${t.key}-bonus-pct`}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        className="mt-6 px-5 py-2.5 bg-yellow-300 text-black rounded font-medium"
        data-testid="tiers-save"
      >
        <Save className="inline w-4 h-4 mr-1" /> Save loyalty tiers
      </button>
    </div>
  );
}

// ---- Theme Prices ----
function ThemePricesSection({ audience, http, toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await http.get(`/api/super-admin/pricing/themes?audience=${audience}`)).data); }
    catch (e) { toast(e.message, 'err'); }
    setLoading(false);
  }, [audience, http, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (row) => {
    try { await http.post('/api/super-admin/pricing/themes', row); toast(`${row.theme_name || row.theme_id} saved`); load(); }
    catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };

  return (
    <div data-testid="themes-section">
      <SectionHeader title="Theme Prices (Whole Theme)" blurb={`Per-theme credit cost when a ${audience === 'photographer' ? 'photographer' : 'user'} buys the entire theme bundle.`} />
      {loading ? <Skeleton /> : (
        <div className="space-y-3">
          {rows.map((row) => <ThemeRow key={row.theme_id} row={row} onSave={save} />)}
        </div>
      )}
    </div>
  );
}

function ThemeRow({ row, onSave }) {
  const [local, setLocal] = useState(row);
  useEffect(() => { setLocal(row); }, [row]);
  const dirty = JSON.stringify(local) !== JSON.stringify(row);
  const testid = `theme-${row.theme_id}`;
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-yellow-200/15 bg-black/40" data-testid={testid}>
      <div className="min-w-[200px] text-yellow-50 font-medium">{row.theme_name}</div>
      <NumberInput value={local.base_price} onChange={(v) => setLocal({ ...local, base_price: v })} testid={`${testid}-base`} />
      <span className="text-white/50 text-sm">credits</span>
      <DiscountControls row={local} onPatch={(p) => setLocal({ ...local, ...p })} suffix=" cr" testid={testid} />
      <div className="ml-auto flex items-center gap-2">
        <PriceCell
          value={local.discount_enabled && local.discount_price != null ? local.discount_price : local.base_price}
          oldValue={local.discount_enabled && local.discount_price != null ? local.base_price : null}
          suffix=" cr"
        />
        {dirty && <button onClick={() => onSave(local)} className="px-3 py-2 bg-emerald-600 text-white rounded text-sm" data-testid={`${testid}-save`}><Save className="inline w-4 h-4 mr-1" /> Save</button>}
      </div>
    </div>
  );
}

// ---- Design Prices ----
// Each theme is a collapsible accordion containing every exact design
// (e.g. mughal_engagement_1). A "Set price for ALL designs in this theme"
// bulk control sits at the top of each accordion.
function DesignPricesSection({ audience, http, toast }) {
  const [themes, setThemes] = useState([]);
  const [openThemes, setOpenThemes] = useState({}); // theme_id -> bool
  const [pricesByDesign, setPricesByDesign] = useState({}); // design_id -> row
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, pricesRes] = await Promise.all([
        http.get('/api/super-admin/pricing/designs/catalog'),
        http.get(`/api/super-admin/pricing/designs?audience=${audience}`),
      ]);
      setThemes(catRes.data?.themes || []);
      const map = {};
      for (const r of (pricesRes.data || [])) {
        map[r.design_id] = r;
      }
      setPricesByDesign(map);
    } catch (e) {
      toast(e.response?.data?.detail || e.message || 'Load failed', 'err');
    }
    setLoading(false);
  }, [http, audience, toast]);

  useEffect(() => { load(); }, [load]);

  const saveDesign = async (row) => {
    try {
      const payload = {
        audience,
        design_id: row.design_id,
        base_price: Number(row.base_price ?? 0),
        discount_enabled: !!row.discount_enabled,
        discount_price: row.discount_price === null || row.discount_price === undefined || row.discount_price === ''
          ? null
          : Number(row.discount_price),
      };
      const r = await http.post('/api/super-admin/pricing/designs', payload);
      setPricesByDesign((prev) => ({ ...prev, [row.design_id]: { ...prev[row.design_id], ...r.data } }));
      toast(`${row.label || row.design_id} saved`);
    } catch (e) {
      toast(e.response?.data?.detail || 'Save failed', 'err');
    }
  };

  const bulkApplyToTheme = async (themeId, basePrice, discountEnabled, discountPrice) => {
    if (basePrice === null || basePrice === undefined || basePrice === '') {
      return toast('Enter a base credits value first', 'err');
    }
    if (!window.confirm(`Apply ${basePrice} credits to EVERY design in this theme? This overwrites any per-design prices already set for this theme.`)) {
      return;
    }
    try {
      await http.post('/api/super-admin/pricing/designs/bulk-theme', {
        audience,
        theme_id: themeId,
        base_price: Number(basePrice),
        discount_enabled: !!discountEnabled,
        discount_price: discountPrice === null || discountPrice === undefined || discountPrice === ''
          ? null
          : Number(discountPrice),
      });
      toast(`Applied to entire theme`);
      load();
    } catch (e) {
      toast(e.response?.data?.detail || 'Bulk apply failed', 'err');
    }
  };

  const toggle = (themeId) => setOpenThemes((o) => ({ ...o, [themeId]: !o[themeId] }));

  return (
    <div data-testid="designs-section">
      <SectionHeader
        title="Design Prices (Per Design)"
        blurb={`Credit cost when a ${audience === 'photographer' ? 'photographer' : 'user'} picks ONE specific design (e.g. "mughal_engagement_1"). Unconfigured designs are FREE (0 credits).`}
      />
      {loading ? <Skeleton /> : (
        <div className="space-y-3">
          {themes.map((t) => (
            <ThemeDesignsAccordion
              key={t.theme_id}
              theme={t}
              isOpen={!!openThemes[t.theme_id]}
              onToggle={() => toggle(t.theme_id)}
              pricesByDesign={pricesByDesign}
              onSaveDesign={saveDesign}
              onBulkApply={(bp, de, dp) => bulkApplyToTheme(t.theme_id, bp, de, dp)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeDesignsAccordion({ theme, isOpen, onToggle, pricesByDesign, onSaveDesign, onBulkApply }) {
  const [bulkBase, setBulkBase] = useState('');
  const [bulkDiscountEnabled, setBulkDiscountEnabled] = useState(false);
  const [bulkDiscountPrice, setBulkDiscountPrice] = useState('');

  const testid = `designs-theme-${theme.theme_id}`;
  const designCount = theme.designs?.length || 0;

  // Group designs by event for nicer rendering
  const grouped = useMemo(() => {
    const g = {};
    for (const d of (theme.designs || [])) {
      const key = d.event_label || d.event || 'Other';
      if (!g[key]) g[key] = [];
      g[key].push(d);
    }
    return g;
  }, [theme.designs]);

  return (
    <div className="rounded-lg border border-yellow-200/15 bg-black/40" data-testid={testid}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        data-testid={`${testid}-toggle`}
      >
        <div className="flex items-center gap-3">
          <span className="text-yellow-50 font-medium">{theme.theme_name}</span>
          <span className="text-xs text-white/50">({designCount} designs)</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-yellow-200" /> : <ChevronDown className="w-4 h-4 text-yellow-200" />}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-yellow-200/10 pt-4">
          {/* Bulk apply to all designs in this theme */}
          <div
            className="flex flex-wrap items-center gap-3 p-3 rounded-md bg-yellow-200/5 border border-yellow-200/20"
            data-testid={`${testid}-bulk`}
          >
            <span className="text-xs uppercase tracking-wider text-yellow-200">
              Apply to ALL {designCount} designs
            </span>
            <NumberInput
              value={bulkBase}
              onChange={setBulkBase}
              testid={`${testid}-bulk-base`}
              placeholder="credits"
            />
            <span className="text-white/50 text-sm">credits</span>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-white/60">Discount</span>
              <ToggleSwitch
                on={bulkDiscountEnabled}
                onChange={(v) => {
                  setBulkDiscountEnabled(v);
                  if (!v) setBulkDiscountPrice('');
                }}
                testid={`${testid}-bulk-discount-toggle`}
              />
              {bulkDiscountEnabled && (
                <NumberInput
                  value={bulkDiscountPrice}
                  onChange={setBulkDiscountPrice}
                  testid={`${testid}-bulk-discount-input`}
                  placeholder="new cr"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => onBulkApply(bulkBase, bulkDiscountEnabled, bulkDiscountPrice)}
              className="ml-auto px-3 py-2 bg-yellow-300 text-black text-sm font-semibold rounded hover:bg-yellow-200"
              data-testid={`${testid}-bulk-apply`}
            >
              Apply to whole theme
            </button>
          </div>

          {/* Per-design rows grouped by event */}
          {Object.entries(grouped).map(([eventLabel, items]) => (
            <div key={eventLabel} data-testid={`${testid}-event-${eventLabel}`}>
              <div className="text-xs uppercase tracking-wider text-yellow-200/80 mb-2">{eventLabel}</div>
              <div className="space-y-2">
                {items.map((entry) => {
                  const row = pricesByDesign[entry.design_id] || {
                    audience: undefined,
                    design_id: entry.design_id,
                    base_price: 0,
                    discount_enabled: false,
                    discount_price: null,
                    label: entry.label,
                  };
                  return (
                    <DesignRow
                      key={entry.design_id}
                      row={{ ...row, label: entry.label }}
                      onSave={onSaveDesign}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DesignRow({ row, onSave }) {
  const [local, setLocal] = useState(row);
  useEffect(() => { setLocal(row); }, [row]);
  const dirty = JSON.stringify(local) !== JSON.stringify(row);
  const testid = `design-${row.design_id}`;
  return (
    <div
      className="flex flex-wrap items-center gap-3 p-3 rounded-md border border-yellow-200/10 bg-black/30"
      data-testid={testid}
    >
      <div className="min-w-[220px]">
        <div className="text-yellow-50 text-sm font-medium">{row.label || row.design_id}</div>
        <div className="text-white/40 text-xs font-mono">{row.design_id}</div>
      </div>
      <NumberInput
        value={local.base_price}
        onChange={(v) => setLocal({ ...local, base_price: v })}
        testid={`${testid}-base`}
      />
      <span className="text-white/50 text-sm">credits</span>
      <DiscountControls
        row={local}
        onPatch={(p) => setLocal({ ...local, ...p })}
        suffix=" cr"
        testid={testid}
      />
      <div className="ml-auto flex items-center gap-2">
        <PriceCell
          value={local.discount_enabled && local.discount_price != null ? local.discount_price : (local.base_price ?? 0)}
          oldValue={local.discount_enabled && local.discount_price != null ? local.base_price : null}
          suffix=" cr"
        />
        {dirty && (
          <button
            onClick={() => onSave(local)}
            className="px-3 py-2 bg-emerald-600 text-white rounded text-sm"
            data-testid={`${testid}-save`}
          >
            <Save className="inline w-4 h-4 mr-1" /> Save
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Invitation Options ----
function OptionsSection({ audience, http, toast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await http.get(`/api/super-admin/pricing/options?audience=${audience}`)).data); }
    catch (e) { toast(e.message, 'err'); }
    setLoading(false);
  }, [audience, http, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (row) => {
    try { await http.post('/api/super-admin/pricing/options', row); toast(`${row.label || row.option_key} saved`); load(); }
    catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };

  return (
    <div data-testid="options-section">
      <SectionHeader title="Invitation Option Prices" blurb="Per-option credit cost. Toggle 'Free' to make the option free for this audience (cost = 0 regardless of base/discount)." />
      {loading ? <Skeleton /> : (
        <div className="space-y-3">
          {rows.map((row) => <OptionRow key={row.option_key} row={row} onSave={save} />)}
        </div>
      )}
    </div>
  );
}


/* ────────────────────────────────────────────────────────────────────
   EVENT PRICING (Ganesh Chaturthi) — the same three knobs as weddings:
     • per-design price (base + optional discount, or one bulk price)
     • per-plan price   (name, price, granted features, link active days)
     • per-feature price (a-la-carte add-ons on top of any plan)
   Backed by /api/admin/event-pricing/<event_type> (event_pricing.py). Defaults
   seed themselves, so the buy panel is never empty.
   ──────────────────────────────────────────────────────────────────── */
function EventPricingSection({ view, http, toast }) {
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState({});          // local edits keyed by row id
  const [bulk, setBulk] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSheet((await http.get(`/api/admin/event-pricing/${EVENT_TYPE}`)).data); }
    catch (e) { toast(e.response?.data?.detail || 'Failed to load event pricing', 'err'); }
    setLoading(false);
  }, [http, toast]);
  useEffect(() => { load(); }, [load]);

  const edit = (id, patch) => setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }));
  const val = (id, row, field) => {
    const d = draft[id] || {};
    return d[field] !== undefined ? d[field] : row[field];
  };

  const post = async (path, body, okMsg) => {
    try {
      await http.post(`/api/admin/event-pricing/${EVENT_TYPE}/${path}`, body);
      toast(okMsg); setDraft({}); load();
    } catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };

  if (loading || !sheet) return <Skeleton />;

  if (view === 'event_designs') {
    return (
      <div data-testid="event-designs-section">
        <SectionHeader
          title={`${sheet.event_name} · Design Prices`}
          blurb="What this artwork costs on top of the plan. Leave 0 to include the design free with any plan. Enable a discount to show a struck-through price."
        />
        <div className="mb-4 flex items-end gap-3 rounded-lg border border-yellow-200/15 bg-black/30 p-4">
          <div>
            <div className="text-xs text-white/50 mb-1">Apply one price to all {sheet.designs.length} designs</div>
            <NumberInput value={bulk} onChange={setBulk} testid="event-bulk-price" placeholder="₹" />
          </div>
          <button
            onClick={() => post('design/bulk', { base_price: bulk || 0 }, 'Applied to every design')}
            disabled={bulk == null}
            className="px-3 py-2 rounded bg-yellow-300 text-black text-sm font-medium disabled:opacity-40"
            data-testid="event-bulk-apply">
            Apply to all
          </button>
        </div>
        <div className="space-y-2">
          {sheet.designs.map((d) => (
            <div key={d.template_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-yellow-200/12 bg-black/25 p-3"
              data-testid={`event-design-row-${d.template_id}`}>
              {d.thumbnail_url && (
                <img src={d.thumbnail_url} alt="" className="h-14 w-9 rounded object-cover" loading="lazy" />
              )}
              <div className="min-w-[10rem] flex-1">
                <div className="text-sm text-yellow-100">{d.name}</div>
                <div className="text-[11px] text-white/40">{d.palette}</div>
              </div>
              <label className="text-xs text-white/50">Base ₹
                <NumberInput value={val(d.template_id, d, 'base_price')}
                  onChange={(v) => edit(d.template_id, { base_price: v })}
                  testid={`event-design-base-${d.template_id}`} />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50">Discount</span>
                <ToggleSwitch
                  on={!!val(d.template_id, d, 'discount_enabled')}
                  onChange={(v) => edit(d.template_id, { discount_enabled: v })}
                  testid={`event-design-disc-${d.template_id}`} />
                {val(d.template_id, d, 'discount_enabled') && (
                  <NumberInput value={val(d.template_id, d, 'discount_price')}
                    onChange={(v) => edit(d.template_id, { discount_price: v })}
                    testid={`event-design-discprice-${d.template_id}`} />
                )}
              </div>
              <PriceCell
                value={val(d.template_id, d, 'discount_enabled') && val(d.template_id, d, 'discount_price')
                  ? val(d.template_id, d, 'discount_price')
                  : (val(d.template_id, d, 'base_price') || 0)}
                oldValue={val(d.template_id, d, 'discount_enabled') && val(d.template_id, d, 'discount_price')
                  ? (val(d.template_id, d, 'base_price') || 0) : null}
                suffix=" ₹" />
              <button
                onClick={() => post('design', {
                  template_id: d.template_id,
                  base_price: val(d.template_id, d, 'base_price') || 0,
                  discount_enabled: !!val(d.template_id, d, 'discount_enabled'),
                  discount_price: val(d.template_id, d, 'discount_price') || 0,
                }, `${d.name} saved`)}
                className="px-3 py-2 rounded bg-yellow-300 text-black text-sm flex items-center gap-1"
                data-testid={`event-design-save-${d.template_id}`}>
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'event_plans') {
    return (
      <div data-testid="event-plans-section">
        <SectionHeader
          title={`${sheet.event_name} · Plans`}
          blurb={`What each plan costs and exactly which features it unlocks. Buyers pay design + plan (+ any add-ons). Publishing allows ${sheet.free_edits} free edits.`}
        />
        <div className="space-y-3">
          {sheet.plans.map((p) => (
            <div key={p.key} className="rounded-lg border border-yellow-200/12 bg-black/25 p-4" data-testid={`event-plan-${p.key}`}>
              <div className="flex flex-wrap items-center gap-3">
                <TextInput value={val(p.key, p, 'name')} onChange={(v) => edit(p.key, { name: v })}
                  testid={`event-plan-name-${p.key}`} placeholder="Plan name" />
                <label className="text-xs text-white/50">Price ₹
                  <NumberInput value={val(p.key, p, 'price')} onChange={(v) => edit(p.key, { price: v })}
                    testid={`event-plan-price-${p.key}`} />
                </label>
                <label className="text-xs text-white/50">Link days
                  <NumberInput value={val(p.key, p, 'active_days')} onChange={(v) => edit(p.key, { active_days: v })}
                    testid={`event-plan-days-${p.key}`} />
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Popular</span>
                  <ToggleSwitch on={!!val(p.key, p, 'featured')} onChange={(v) => edit(p.key, { featured: v })}
                    testid={`event-plan-featured-${p.key}`} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Active</span>
                  <ToggleSwitch on={val(p.key, p, 'is_active') !== false} onChange={(v) => edit(p.key, { is_active: v })}
                    testid={`event-plan-active-${p.key}`} />
                </div>
                <button
                  onClick={() => post('plan', {
                    key: p.key,
                    name: val(p.key, p, 'name'),
                    tagline: val(p.key, p, 'tagline') || '',
                    price: val(p.key, p, 'price') || 0,
                    sort: p.sort || 0,
                    featured: !!val(p.key, p, 'featured'),
                    active_days: val(p.key, p, 'active_days') || 0,
                    is_active: val(p.key, p, 'is_active') !== false,
                    features: val(p.key, p, 'features') || [],
                  }, `${p.name} saved`)}
                  className="ml-auto px-3 py-2 rounded bg-yellow-300 text-black text-sm flex items-center gap-1"
                  data-testid={`event-plan-save-${p.key}`}>
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
              </div>
              <div className="mt-2">
                <TextInput value={val(p.key, p, 'tagline')} onChange={(v) => edit(p.key, { tagline: v })}
                  testid={`event-plan-tagline-${p.key}`} placeholder="One-line description" width="w-full md:w-2/3" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sheet.feature_keys.map((f) => {
                  const list = val(p.key, p, 'features') || [];
                  const on = list.includes(f.key);
                  return (
                    <button key={f.key}
                      onClick={() => edit(p.key, {
                        features: on ? list.filter((x) => x !== f.key) : [...list, f.key],
                      })}
                      className={`px-2.5 py-1 rounded-full text-xs border ${on
                        ? 'bg-yellow-300/20 text-yellow-100 border-yellow-300/50'
                        : 'text-white/45 border-white/15'}`}
                      data-testid={`event-plan-feat-${p.key}-${f.key}`}>
                      {on ? '✓ ' : '+ '}{f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // event_features
  return (
    <div data-testid="event-features-section">
      <SectionHeader
        title={`${sheet.event_name} · Feature Prices`}
        blurb="What a single feature costs when a buyer adds it on top of their plan. A feature already inside the chosen plan is never charged twice."
      />
      <div className="space-y-2">
        {sheet.features.map((f) => (
          <div key={f.feature_key} className="flex flex-wrap items-center gap-3 rounded-lg border border-yellow-200/12 bg-black/25 p-3"
            data-testid={`event-feature-row-${f.feature_key}`}>
            <div className="min-w-[12rem] flex-1">
              <div className="text-sm text-yellow-100">{f.label}</div>
              <div className="text-[11px] text-white/40">{f.feature_key}</div>
            </div>
            <label className="text-xs text-white/50">Price ₹
              <NumberInput value={val(f.feature_key, f, 'price')}
                onChange={(v) => edit(f.feature_key, { price: v })}
                testid={`event-feature-price-${f.feature_key}`} />
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">Sellable</span>
              <ToggleSwitch on={val(f.feature_key, f, 'is_active') !== false}
                onChange={(v) => edit(f.feature_key, { is_active: v })}
                testid={`event-feature-active-${f.feature_key}`} />
            </div>
            <button
              onClick={() => post('feature', {
                feature_key: f.feature_key,
                label: val(f.feature_key, f, 'label'),
                price: val(f.feature_key, f, 'price') || 0,
                is_active: val(f.feature_key, f, 'is_active') !== false,
              }, `${f.label} saved`)}
              className="px-3 py-2 rounded bg-yellow-300 text-black text-sm flex items-center gap-1"
              data-testid={`event-feature-save-${f.feature_key}`}>
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ────────────────────────────────────────────────────────────────────
   FeaturePacksSection — admin CRUD for "All-Features Pack" / bundles
   ──────────────────────────────────────────────────────────────────── */
const KNOWN_FEATURE_KEYS = [
  { key: 'qr_code',            label: 'QR Code' },
  { key: 'rsvp_form',          label: 'RSVP Form' },
  { key: 'live_photo_wall',    label: 'Live Photo Wall' },
  { key: 'find_my_photos',     label: 'AI Selfie Search' },
  { key: 'music_player',       label: 'Background Music' },
  { key: 'countdown',          label: 'Countdown' },
  { key: 'maps_directions',    label: 'Maps / Directions' },
  { key: 'gift_registry',      label: 'Gift Registry' },
  { key: 'whatsapp_share',     label: 'WhatsApp Share' },
  { key: 'photo_gallery',      label: 'Post-event Gallery' },
  { key: 'calendar_add',       label: 'Calendar (.ics)' },
  { key: 'prewedding_story',   label: 'Pre-Wedding Story' },
  { key: 'ai_photo_curation',  label: 'AI Photo Curation' },
  { key: 'guest_photo_upload', label: 'Guest Pre-event Upload' },
];

function FeaturePacksSection({ audience, http, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);    // current pack being edited (or null)

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get(`/api/super-admin/pricing/feature-packs?audience=${audience}`);
      setItems(res.data.items || []);
    } catch (e) { toast(e.message || 'Failed to load packs', 'err'); }
    setLoading(false);
  }, [audience, http, toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setEditing({
    audience,
    name: '',
    label: 'All-Features Pack',
    feature_keys: [],
    base_price: 0,
    discount_enabled: false,
    discount_price: null,
    is_active: true,
  });

  const save = async () => {
    try {
      if (editing.id) {
        await http.put(`/api/super-admin/pricing/feature-packs/${editing.id}`, editing);
      } else {
        await http.post('/api/super-admin/pricing/feature-packs', editing);
      }
      toast('Feature pack saved');
      setEditing(null);
      load();
    } catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this feature pack?')) return;
    try {
      await http.delete(`/api/super-admin/pricing/feature-packs/${id}`);
      toast('Pack deleted');
      load();
    } catch (e) { toast(e.response?.data?.detail || 'Delete failed', 'err'); }
  };

  if (loading) return <Skeleton />;

  return (
    <div data-testid="feature-packs-section">
      <SectionHeader
        title={`Feature Packs · ${audience === 'photographer' ? 'Photographers' : 'Couples'}`}
        blurb="Bundle multiple invitation features at a single discounted price. Example: 'All-Features Pack' = QR + RSVP + Gallery + Music + AI Curation for 25 credits (vs 40 credits when bought individually). Shown as an upsell on the Publish step."
      />

      {/* Pack list */}
      <div className="space-y-3 mb-4">
        {items.length === 0 ? (
          <Empty label="No feature packs yet for this audience. Click 'Add pack' to create one." />
        ) : items.map((p) => (
          <div
            key={p.id}
            className="p-4 rounded-lg border border-yellow-200/15 bg-black/30 flex flex-wrap items-center gap-4"
            data-testid={`feature-pack-row-${p.id}`}
          >
            <div className="flex-1 min-w-[200px]">
              <div className="text-yellow-200 font-medium">{p.label}</div>
              <div className="text-white/55 text-xs mt-0.5">{p.name} · {p.feature_keys.length} features</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {p.feature_keys.slice(0, 6).map((k) => (
                  <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-200/10 text-yellow-200">{k}</span>
                ))}
                {p.feature_keys.length > 6 && <span className="text-[10px] text-white/40">+{p.feature_keys.length - 6}</span>}
              </div>
            </div>
            <div className="text-right">
              {p.discount_enabled && p.discount_price !== null && (
                <div className="text-white/40 line-through text-sm">{p.base_price}c</div>
              )}
              <div className="text-yellow-300 text-xl font-display">
                {p.discount_enabled && p.discount_price !== null ? p.discount_price : p.base_price}c
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(p)} className="text-xs px-3 py-1.5 rounded border border-yellow-200/30 text-yellow-200 hover:bg-yellow-200/10"
                data-testid={`feature-pack-edit-${p.id}`}>
                Edit
              </button>
              <button onClick={() => remove(p.id)} className="text-xs px-3 py-1.5 rounded border border-red-400/30 text-red-300 hover:bg-red-400/10"
                data-testid={`feature-pack-delete-${p.id}`}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={openNew} className="px-4 py-2 bg-yellow-300 text-black rounded font-medium"
        data-testid="feature-pack-add">
        + Add pack
      </button>

      {/* Edit modal — inline because we already use a side-drawer-less style */}
      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div className="bg-stone-900 border border-yellow-200/20 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" data-testid="feature-pack-editor">
            <h3 className="text-yellow-200 text-lg mb-4">{editing.id ? 'Edit Feature Pack' : 'New Feature Pack'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Internal name</div>
                <TextInput value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} width="w-full" testid="feature-pack-name" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Display label</div>
                <TextInput value={editing.label} onChange={(v) => setEditing({ ...editing, label: v })} width="w-full" testid="feature-pack-label" />
              </div>
            </div>

            <div className="text-[10px] uppercase tracking-wider text-white/55 mb-2">Features included</div>
            <div className="grid grid-cols-2 gap-2 mb-4 max-h-[300px] overflow-y-auto pr-2">
              {KNOWN_FEATURE_KEYS.map((f) => {
                const checked = editing.feature_keys.includes(f.key);
                return (
                  <label key={f.key} className="flex items-center gap-2 text-sm text-white/80 cursor-pointer" data-testid={`feature-pack-checkbox-${f.key}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...editing.feature_keys, f.key]
                          : editing.feature_keys.filter((k) => k !== f.key);
                        setEditing({ ...editing, feature_keys: next });
                      }}
                    />
                    {f.label}
                  </label>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Base price (credits)</div>
                <NumberInput value={editing.base_price} onChange={(v) => setEditing({ ...editing, base_price: Number(v ?? 0) })} testid="feature-pack-base-price" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Discount enabled</div>
                <ToggleSwitch on={editing.discount_enabled} onChange={(v) => setEditing({ ...editing, discount_enabled: v })} testid="feature-pack-discount-on" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">Discount price</div>
                <NumberInput value={editing.discount_price ?? 0} onChange={(v) => setEditing({ ...editing, discount_price: Number(v ?? 0) })} testid="feature-pack-discount-price" disabled={!editing.discount_enabled} />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-5">
              <ToggleSwitch on={editing.is_active} onChange={(v) => setEditing({ ...editing, is_active: v })} testid="feature-pack-active" />
              <span className="text-yellow-200 text-sm">{editing.is_active ? 'Active' : 'Hidden'}</span>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-white/70 hover:text-white">Cancel</button>
              <button onClick={save} className="px-5 py-2 bg-yellow-300 text-black rounded font-medium" data-testid="feature-pack-save">
                <Save className="inline w-4 h-4 mr-1" /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionRow({ row, onSave }) {
  const [local, setLocal] = useState(row);
  useEffect(() => { setLocal(row); }, [row]);
  const dirty = JSON.stringify(local) !== JSON.stringify(row);
  const testid = `option-${row.option_key}`;
  const effective = local.is_free ? 0 : (local.discount_enabled && local.discount_price != null ? local.discount_price : local.base_price);
  const showOld = !local.is_free && local.discount_enabled && local.discount_price != null;
  return (
    <div className={`flex flex-wrap items-center gap-4 p-4 rounded-lg border ${local.is_free ? 'border-emerald-400/30 bg-emerald-900/10' : 'border-yellow-200/15 bg-black/40'}`} data-testid={testid}>
      <div className="min-w-[260px] text-yellow-50 font-medium">{row.label}</div>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-white/60">Free</span>
        <ToggleSwitch on={!!local.is_free} onChange={(v) => setLocal({ ...local, is_free: v })} testid={`${testid}-free-toggle`} />
      </div>
      {!local.is_free && (
        <>
          <NumberInput value={local.base_price} onChange={(v) => setLocal({ ...local, base_price: v })} testid={`${testid}-base`} />
          <span className="text-white/50 text-sm">credits</span>
          <DiscountControls row={local} onPatch={(p) => setLocal({ ...local, ...p })} suffix=" cr" testid={testid} />
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        {local.is_free ? <span className="text-emerald-300 font-medium" data-testid={`${testid}-free-label`}>FREE</span>
          : <PriceCell value={effective} oldValue={showOld ? local.base_price : null} suffix=" cr" />
        }
        {dirty && <button onClick={() => onSave(local)} className="px-3 py-2 bg-emerald-600 text-white rounded text-sm" data-testid={`${testid}-save`}><Save className="inline w-4 h-4 mr-1" /> Save</button>}
      </div>
    </div>
  );
}

// -------------- Section header + helpers --------------
const SectionHeader = ({ title, blurb }) => (
  <div className="mb-5">
    <h2 className="text-xl font-serif text-yellow-200 mb-1 flex items-center gap-2"><Tag className="w-5 h-5" /> {title}</h2>
    <p className="text-sm text-white/60">{blurb}</p>
  </div>
);
const Skeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-white/5 animate-pulse" />)}
  </div>
);
const Empty = ({ label }) => (
  <div className="p-8 rounded-lg border border-dashed border-yellow-200/15 text-center text-white/40">{label}</div>
);

// =============================================================
// STUDIO STORAGE — Plans, global toggle + subscriptions overview
// =============================================================
function StudioStoragePlansSection({ http, toast }) {
  const [enabled, setEnabled] = useState(true);
  const [enabledLoaded, setEnabledLoaded] = useState(false);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState([]);
  const [subsOpen, setSubsOpen] = useState(false);
  const [subsLoading, setSubsLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null | {id?, ...fields}

  const blankPlan = { name: '', gb_limit: 10, duration_days: 30, grace_days: 30, price_inr: 299, is_active: true };

  const loadSettings = useCallback(async () => {
    try {
      const r = await http.get('/api/super-admin/studio-storage/settings');
      setEnabled(!!r.data?.enabled);
    } catch (e) {
      toast(e.response?.data?.detail || 'Failed to load settings', 'err');
    } finally {
      setEnabledLoaded(true);
    }
  }, [http, toast]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const r = await http.get('/api/super-admin/studio-storage/plans');
      setPlans(r.data?.items || []);
    } catch (e) {
      toast(e.response?.data?.detail || 'Failed to load plans', 'err');
    }
    setLoading(false);
  }, [http, toast]);

  const loadSubs = useCallback(async () => {
    setSubsLoading(true);
    try {
      const r = await http.get('/api/super-admin/studio-storage/subscriptions');
      setSubs(r.data?.items || []);
    } catch (e) {
      toast(e.response?.data?.detail || 'Failed to load subscriptions', 'err');
    }
    setSubsLoading(false);
  }, [http, toast]);

  useEffect(() => { loadSettings(); loadPlans(); }, [loadSettings, loadPlans]);

  const toggleEnabled = async (next) => {
    setEnabled(next); // optimistic
    try {
      await http.put('/api/super-admin/studio-storage/settings', { enabled: next });
      toast(next ? 'Studio Storage enabled' : 'Studio Storage disabled');
    } catch (e) {
      setEnabled(!next);
      toast(e.response?.data?.detail || 'Failed to save toggle', 'err');
    }
  };

  const savePlan = async (plan) => {
    try {
      const payload = {
        name: plan.name,
        gb_limit: Number(plan.gb_limit),
        duration_days: Number(plan.duration_days),
        grace_days: Number(plan.grace_days),
        price_inr: Number(plan.price_inr),
        is_active: !!plan.is_active,
      };
      if (plan.id) {
        await http.put(`/api/super-admin/studio-storage/plans/${plan.id}`, payload);
        toast('Plan updated');
      } else {
        await http.post('/api/super-admin/studio-storage/plans', payload);
        toast('Plan created');
      }
      setEditing(null);
      loadPlans();
    } catch (e) {
      toast(e.response?.data?.detail || 'Save failed', 'err');
    }
  };

  const deletePlan = async (id) => {
    if (!window.confirm('Delete this storage plan? Existing subscriptions are not affected.')) return;
    try {
      await http.delete(`/api/super-admin/studio-storage/plans/${id}`);
      toast('Plan deleted');
      loadPlans();
    } catch (e) {
      toast(e.response?.data?.detail || 'Delete failed', 'err');
    }
  };

  return (
    <div data-testid="studio-storage-section">
      <SectionHeader
        title="Studio Storage"
        blurb="Define backup storage plans for photographers. Use the master switch to globally enable / disable subscriptions and uploads when the budget runs out."
      />

      {/* Global feature toggle */}
      <div className="mb-6 p-4 rounded-lg border border-yellow-200/15 bg-black/40 flex items-center gap-4 flex-wrap" data-testid="ss-toggle-row">
        <div className="flex items-center gap-2">
          <Power className={`w-5 h-5 ${enabled ? 'text-emerald-400' : 'text-red-400'}`} />
          <span className="text-yellow-50 font-medium">Studio Storage Feature</span>
        </div>
        <span className={`text-xs uppercase tracking-wider px-2 py-1 rounded ${enabled ? 'bg-emerald-700/30 text-emerald-300' : 'bg-red-700/30 text-red-300'}`}>
          {enabledLoaded ? (enabled ? 'Enabled' : 'Disabled') : '...'}
        </span>
        <div className="ml-auto">
          <ToggleSwitch on={enabled} onChange={toggleEnabled} testid="ss-toggle" />
        </div>
        <p className="basis-full text-xs text-white/50 mt-1">
          When disabled, photographers cannot subscribe or upload, but existing files remain downloadable.
        </p>
      </div>

      {/* Plans table */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-yellow-200 font-medium">Storage Plans</h3>
        <button
          onClick={() => setEditing({ ...blankPlan })}
          className="px-3 py-2 bg-yellow-300 text-black rounded text-sm font-medium hover:bg-yellow-200 flex items-center gap-1"
          data-testid="ss-new-plan"
        >
          <Plus className="w-4 h-4" /> New plan
        </button>
      </div>

      {loading ? <Skeleton /> : plans.length === 0 ? <Empty label="No storage plans yet" /> : (
        <div className="overflow-x-auto border border-yellow-200/15 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-yellow-200/5 text-white/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-right px-4 py-3">GB</th>
                <th className="text-right px-4 py-3">Days</th>
                <th className="text-right px-4 py-3">Grace</th>
                <th className="text-right px-4 py-3">Price ₹</th>
                <th className="text-center px-4 py-3">Active</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-yellow-200/10 text-yellow-50" data-testid={`ss-plan-row-${p.id}`}>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-right">{p.gb_limit}</td>
                  <td className="px-4 py-3 text-right">{p.duration_days}</td>
                  <td className="px-4 py-3 text-right">{p.grace_days || 0}</td>
                  <td className="px-4 py-3 text-right">{Number(p.price_inr || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-center">
                    {p.is_active ? <CheckCircle2 className="w-4 h-4 text-emerald-400 inline" /> : <span className="text-white/30 text-xs">No</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing({ ...p })}
                      className="px-2 py-1 text-yellow-200 hover:text-yellow-100 text-xs mr-2"
                      data-testid={`ss-plan-edit-${p.id}`}
                    >Edit</button>
                    <button
                      onClick={() => deletePlan(p.id)}
                      className="px-2 py-1 text-red-400 hover:text-red-300"
                      data-testid={`ss-plan-delete-${p.id}`}
                      title="Delete plan"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Subscriptions overview */}
      <div className="mt-8">
        <button
          onClick={() => {
            const next = !subsOpen;
            setSubsOpen(next);
            if (next && subs.length === 0) loadSubs();
          }}
          className="flex items-center gap-2 text-yellow-200 hover:text-yellow-100"
          data-testid="ss-subs-toggle"
        >
          <HardDrive className="w-4 h-4" />
          <span className="font-medium">Subscriptions overview</span>
          {subsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {subsOpen && (
          <div className="mt-3 overflow-x-auto border border-yellow-200/15 rounded-lg" data-testid="ss-subs-table">
            {subsLoading ? <div className="p-4"><Skeleton /></div> : subs.length === 0 ? (
              <div className="p-4"><Empty label="No subscriptions yet" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-yellow-200/5 text-white/60 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3">Admin</th>
                    <th className="text-left px-4 py-3">Plan</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Used (GB)</th>
                    <th className="text-left px-4 py-3">Expires</th>
                    <th className="text-left px-4 py-3">Purge at</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id} className="border-t border-yellow-200/10 text-yellow-50" data-testid={`ss-sub-row-${s.id}`}>
                      <td className="px-4 py-3 font-mono text-xs">{s.admin_id || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{s.plan_id || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          s.status === 'active' ? 'bg-emerald-700/30 text-emerald-300' :
                          s.status === 'grace' ? 'bg-amber-700/30 text-amber-300' :
                          'bg-red-700/30 text-red-300'
                        }`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">{((s.used_bytes || 0) / 1e9).toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs">{s.expires_at ? new Date(s.expires_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-xs">{s.purge_at ? new Date(s.purge_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {editing && (
        <SSPlanEditorModal
          plan={editing}
          onClose={() => setEditing(null)}
          onSave={savePlan}
        />
      )}
    </div>
  );
}

function SSPlanEditorModal({ plan, onClose, onSave }) {
  const [local, setLocal] = useState(plan);
  const update = (k, v) => setLocal((p) => ({ ...p, [k]: v }));
  const isNew = !plan.id;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur flex items-center justify-center p-4" onClick={onClose} data-testid="ss-plan-editor">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl p-6 border border-yellow-200/30" style={{ background: '#0a0606' }}>
        <h2 className="text-yellow-200 text-lg font-medium mb-4">{isNew ? 'New storage plan' : 'Edit plan'}</h2>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-white/60">Name</span>
            <input
              type="text" value={local.name || ''}
              onChange={(e) => update('name', e.target.value)}
              className="mt-1 w-full bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 focus:outline-none focus:border-yellow-300"
              placeholder="e.g. 250 GB / 3 months"
              data-testid="ss-plan-name"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-white/60">GB limit</span>
              <input type="number" min={1} value={local.gb_limit ?? ''} onChange={(e) => update('gb_limit', e.target.value)}
                className="mt-1 w-full bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 focus:outline-none focus:border-yellow-300"
                data-testid="ss-plan-gb" />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-white/60">Price ₹</span>
              <input type="number" min={0} value={local.price_inr ?? ''} onChange={(e) => update('price_inr', e.target.value)}
                className="mt-1 w-full bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 focus:outline-none focus:border-yellow-300"
                data-testid="ss-plan-price" />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-white/60">Duration (days)</span>
              <input type="number" min={1} value={local.duration_days ?? ''} onChange={(e) => update('duration_days', e.target.value)}
                className="mt-1 w-full bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 focus:outline-none focus:border-yellow-300"
                data-testid="ss-plan-duration" />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-white/60">Grace days</span>
              <input type="number" min={0} value={local.grace_days ?? ''} onChange={(e) => update('grace_days', e.target.value)}
                className="mt-1 w-full bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 focus:outline-none focus:border-yellow-300"
                data-testid="ss-plan-grace" />
            </label>
          </div>
          <label className="flex items-center gap-2 mt-2">
            <input type="checkbox" checked={!!local.is_active} onChange={(e) => update('is_active', e.target.checked)} data-testid="ss-plan-active" />
            <span className="text-sm text-yellow-50">Active (visible to photographers)</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-yellow-200/70 hover:text-yellow-200" data-testid="ss-plan-cancel">Cancel</button>
          <button onClick={() => onSave(local)} className="px-4 py-2 bg-yellow-300 text-black font-medium rounded hover:bg-yellow-200 flex items-center gap-1" data-testid="ss-plan-save">
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// PRICING PAGE — public /pricing prices: feature add-ons + link tiers
// Add-ons  → db.user_addons  (GET/PUT /api/admin/user-addons)
// Link tiers → db.expiry_tiers (GET/PUT /api/admin/expiry-tiers)
// =============================================================
function PricingPageSection({ http, toast }) {
  const [addons, setAddons] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, t] = await Promise.all([
        http.get('/api/admin/user-addons'),
        http.get('/api/admin/expiry-tiers'),
      ]);
      setAddons(a.data.addons || []);
      setTiers(t.data.tiers || []);
    } catch (e) { toast(e.response?.data?.detail || 'Failed to load pricing page', 'err'); }
    setLoading(false);
  }, [http, toast]);
  useEffect(() => { load(); }, [load]);

  const patchAddon = (i, k, v) => setAddons((r) => r.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  const patchTier = (i, k, v) => setTiers((r) => r.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const rmAddon = (i) => setAddons((r) => r.filter((_, j) => j !== i));
  const rmTier = (i) => setTiers((r) => r.filter((_, j) => j !== i));
  const addAddon = () => setAddons((r) => [...r, { id: `addon_${r.length + 1}`, label: '', description: '', credits: 0, order: r.length + 1 }]);
  const addTier = () => setTiers((r) => [...r, { id: `tier_${r.length + 1}`, label: '', days: 30, credits: 0, order: r.length + 1 }]);

  const saveAddons = async () => {
    try {
      const payload = addons.map((a, i) => ({
        id: a.id || `addon_${i + 1}`, label: a.label || '', description: a.description || '',
        credits: Number(a.credits) || 0, order: Number(a.order ?? i + 1),
      }));
      await http.put('/api/admin/user-addons', payload);
      toast('Add-ons saved'); load();
    } catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };
  const saveTiers = async () => {
    try {
      const payload = tiers.map((t, i) => ({
        id: t.id || `tier_${i + 1}`, label: t.label || '', days: Number(t.days) || 0,
        credits: Number(t.credits) || 0, order: Number(t.order ?? i + 1),
      }));
      await http.put('/api/admin/expiry-tiers', payload);
      toast('Link tiers saved'); load();
    } catch (e) { toast(e.response?.data?.detail || 'Save failed', 'err'); }
  };

  if (loading) return <Skeleton />;

  return (
    <div data-testid="pricing-page-section">
      <SectionHeader
        title="Public Pricing Page"
        blurb="The prices shown on the public /pricing page (top-nav 'Pricing'). Feature add-ons and link-lifetime tiers — all priced in ₹."
      />

      {/* Feature add-ons */}
      <div className="text-sm uppercase tracking-wider text-yellow-200/80 mb-2">Feature add-ons</div>
      <div className="space-y-2 mb-3">
        {addons.map((a, i) => (
          <div key={i} className="rounded-lg border border-yellow-200/15 bg-black/30 p-3 flex flex-wrap items-center gap-3" data-testid={`pp-addon-${i}`}>
            <TextInput value={a.id} onChange={(v) => patchAddon(i, 'id', v)} placeholder="id" width="w-32" testid={`pp-addon-id-${i}`} />
            <TextInput value={a.label} onChange={(v) => patchAddon(i, 'label', v)} placeholder="Label" width="w-44" testid={`pp-addon-label-${i}`} />
            <TextInput value={a.description} onChange={(v) => patchAddon(i, 'description', v)} placeholder="Description" width="w-72" testid={`pp-addon-desc-${i}`} />
            <label className="text-[10px] uppercase text-white/50">₹ <NumberInput value={a.credits} onChange={(v) => patchAddon(i, 'credits', v)} testid={`pp-addon-price-${i}`} /></label>
            <label className="text-[10px] uppercase text-white/50">Sort <NumberInput value={a.order} onChange={(v) => patchAddon(i, 'order', v)} testid={`pp-addon-order-${i}`} /></label>
            <button onClick={() => rmAddon(i)} className="p-2 text-red-400 hover:text-red-300 ml-auto" data-testid={`pp-addon-del-${i}`}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {!addons.length && <Empty label="No add-ons" />}
      </div>
      <div className="flex gap-2 mb-8">
        <button onClick={addAddon} className="px-3 py-2 border border-yellow-300/40 text-yellow-200 rounded text-sm" data-testid="pp-addon-add"><Plus className="inline w-4 h-4 mr-1" /> Add add-on</button>
        <button onClick={saveAddons} className="px-4 py-2 bg-yellow-300 text-black rounded text-sm font-medium" data-testid="pp-addon-save"><Save className="inline w-4 h-4 mr-1" /> Save add-ons</button>
      </div>

      {/* Link-lifetime tiers */}
      <div className="text-sm uppercase tracking-wider text-yellow-200/80 mb-2">Link-lifetime tiers</div>
      <div className="space-y-2 mb-3">
        {tiers.map((t, i) => (
          <div key={i} className="rounded-lg border border-yellow-200/15 bg-black/30 p-3 flex flex-wrap items-center gap-3" data-testid={`pp-tier-${i}`}>
            <TextInput value={t.id} onChange={(v) => patchTier(i, 'id', v)} placeholder="id" width="w-32" testid={`pp-tier-id-${i}`} />
            <TextInput value={t.label} onChange={(v) => patchTier(i, 'label', v)} placeholder="Label" width="w-40" testid={`pp-tier-label-${i}`} />
            <label className="text-[10px] uppercase text-white/50">Days <NumberInput value={t.days} onChange={(v) => patchTier(i, 'days', v)} testid={`pp-tier-days-${i}`} /></label>
            <label className="text-[10px] uppercase text-white/50">₹ <NumberInput value={t.credits} onChange={(v) => patchTier(i, 'credits', v)} testid={`pp-tier-price-${i}`} /></label>
            <label className="text-[10px] uppercase text-white/50">Sort <NumberInput value={t.order} onChange={(v) => patchTier(i, 'order', v)} testid={`pp-tier-order-${i}`} /></label>
            <button onClick={() => rmTier(i)} className="p-2 text-red-400 hover:text-red-300 ml-auto" data-testid={`pp-tier-del-${i}`}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {!tiers.length && <Empty label="No tiers" />}
      </div>
      <div className="flex gap-2">
        <button onClick={addTier} className="px-3 py-2 border border-yellow-300/40 text-yellow-200 rounded text-sm" data-testid="pp-tier-add"><Plus className="inline w-4 h-4 mr-1" /> Add tier</button>
        <button onClick={saveTiers} className="px-4 py-2 bg-yellow-300 text-black rounded text-sm font-medium" data-testid="pp-tier-save"><Save className="inline w-4 h-4 mr-1" /> Save tiers</button>
      </div>
    </div>
  );
}

// =============================================================
// MAIN PAGE
// =============================================================
export default function SuperAdminPricingHub() {
  const navigate = useNavigate();
  const http = useAuthAxios();
  const [audience, setAudience] = useState('photographer');
  const [subTab, setSubTab] = useState('sub_plans');
  const [toastMsg, setToastMsg] = useState('');
  const [toastKind, setToastKind] = useState('ok');

  const toast = useCallback((msg, kind = 'ok') => {
    setToastMsg(msg); setToastKind(kind);
    setTimeout(() => setToastMsg(''), 2600);
  }, []);

  useEffect(() => {
    // Verify token; redirect to login otherwise
    if (!localStorage.getItem('admin_token')) navigate('/super-admin/login');
  }, [navigate]);

  const subTabsFor = (a) => (a === 'photographer' ? PHOTOG_SUBTABS : a === 'events' ? EVENT_SUBTABS : NORMAL_SUBTABS);

  // Reset sub-tab when audience changes if current sub-tab not available
  useEffect(() => {
    const allowed = subTabsFor(audience);
    if (!allowed.find((t) => t.key === subTab)) setSubTab(allowed[0].key);
  }, [audience, subTab]);

  const subTabs = subTabsFor(audience);

  const renderSection = () => {
    const props = { audience, http, toast };
    switch (subTab) {
      case 'sub_plans':    return <><SubscriptionPlansSection http={http} toast={toast} /><BillingPeriodsSection http={http} toast={toast} /></>;
      case 'alacarte':     return <AlaCarteSection http={http} toast={toast} />;
      case 'link_packages':return <LinkPackagesSection http={http} toast={toast} />;
      case 'credit_packs': return <CreditPacksSection {...props} />;
      case 'subscription': return <SubscriptionSection http={http} toast={toast} />;
      case 'post_sub':     return <PostSubSection http={http} toast={toast} />;
      case 'tiers':        return <PhotographerTiersSection http={http} toast={toast} />;
      case 'feature_packs':return <FeaturePacksSection {...props} />;
      case 'themes':       return <ThemePricesSection {...props} />;
      case 'designs':      return <DesignPricesSection {...props} />;
      case 'options':      return <OptionsSection {...props} />;
      case 'pricing_page': return <PricingPageSection http={http} toast={toast} />;
      case 'studio_storage': return <StudioStoragePlansSection http={http} toast={toast} />;
      case 'event_designs':
      case 'event_plans':
      case 'event_features': return <EventPricingSection view={subTab} http={http} toast={toast} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen text-yellow-50" style={{ background: 'radial-gradient(circle at top, #1a0f0a 0%, #0a0606 60%, #000 100%)' }} data-testid="super-admin-pricing-hub">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur border-b border-yellow-200/15" style={{ background: 'rgba(10,6,6,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/super-admin/dashboard')} className="text-yellow-200/70 hover:text-yellow-200 flex items-center gap-1 text-sm" data-testid="back-to-dashboard">
            <ChevronLeft className="w-4 h-4" /> Dashboard
          </button>
          <h1 className="text-xl md:text-2xl font-serif text-yellow-200">Pricing Hub</h1>
          <span className="text-xs uppercase tracking-wider text-white/40 ml-2">Audience-aware</span>
        </div>

        {/* Audience tabs */}
        <div className="max-w-7xl mx-auto px-6 pb-4 flex gap-2 flex-wrap">
          {AUDIENCES.map((a) => {
            const Icon = a.icon;
            const active = audience === a.key;
            return (
              <button
                key={a.key} onClick={() => setAudience(a.key)} data-testid={`audience-tab-${a.key}`}
                className={`px-4 py-2.5 rounded-lg border flex items-center gap-2 transition ${active
                  ? 'bg-yellow-300 text-black border-yellow-300 font-medium'
                  : 'bg-black/40 text-yellow-200 border-yellow-200/20 hover:border-yellow-200/40'}`}
              >
                <Icon className="w-4 h-4" />
                <span>{a.label}</span>
                <span className={`text-xs ${active ? 'text-black/60' : 'text-white/40'}`}>· {a.blurb}</span>
              </button>
            );
          })}
        </div>

        {/* Sub tabs */}
        <div className="max-w-7xl mx-auto px-6 pb-3 flex gap-2 flex-wrap border-t border-yellow-200/10 pt-3">
          {subTabs.map((t) => {
            const Icon = t.icon;
            const active = subTab === t.key;
            return (
              <button
                key={t.key} onClick={() => setSubTab(t.key)} data-testid={`subtab-${t.key}`}
                className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${active
                  ? 'bg-yellow-200/15 text-yellow-200 border border-yellow-200/30'
                  : 'text-yellow-200/60 hover:text-yellow-200'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {renderSection()}
      </main>

      <Toast msg={toastMsg} kind={toastKind} />
    </div>
  );
}
