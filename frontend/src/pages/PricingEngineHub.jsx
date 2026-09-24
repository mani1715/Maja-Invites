/**
 * PricingEngineHub.jsx — unified Pricing Engine admin (super-admin).
 * Route: /super-admin/pricing-engine
 *
 * 9 sections, all reading/writing the unified pricing collections via
 * pricing_hub_service.py. No hardcoded prices anywhere — every value here is
 * DB-backed and instantly saveable. The Simulator uses the SAME resolver as
 * production checkout (/api/admin/pricing/simulate).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Palette, FolderTree, Tag, Package, Clock, Crown, HardDrive, Users, Calculator, Plus, Trash2, Save,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';
const http = axios.create({ baseURL: API });
http.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('admin_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const SECTIONS = [
  { key: 'designs', label: 'Design Pricing', icon: Palette },
  { key: 'categories', label: 'Design Categories', icon: FolderTree },
  { key: 'campaigns', label: 'Discount Campaigns', icon: Tag },
  { key: 'packs', label: 'Feature Packs', icon: Package },
  { key: 'durations', label: 'Link Duration', icon: Clock },
  { key: 'portfolio', label: 'Portfolio Plans', icon: Crown },
  { key: 'storage', label: 'Storage Plans', icon: HardDrive },
  { key: 'community', label: 'Community Settings', icon: Users },
  { key: 'simulator', label: 'Pricing Simulator', icon: Calculator },
];

// ---- shared tiny UI ------------------------------------------------------
const Input = ({ value, onChange, placeholder, type = 'text', className = '' }) => (
  <input type={type} value={value ?? ''} placeholder={placeholder}
    onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
    className={`bg-black/30 border border-white/15 rounded px-2 py-1 text-sm text-white w-full ${className}`} />
);
const Toggle = ({ on, onClick, label }) => (
  <button type="button" onClick={onClick}
    className={`px-2 py-1 rounded text-xs border ${on ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-white/5 border-white/15 text-white/50'}`}>
    {label}
  </button>
);
const Btn = ({ children, onClick, tone = 'default' }) => (
  <button type="button" onClick={onClick}
    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium ${
      tone === 'primary' ? 'bg-amber-500 text-black' : tone === 'danger' ? 'bg-red-500/20 text-red-300 border border-red-400/30' : 'bg-white/10 text-white border border-white/15'}`}>
    {children}
  </button>
);

function useToast() {
  const [msg, setMsg] = useState(null);
  const toast = useCallback((m, err) => { setMsg({ m, err }); setTimeout(() => setMsg(null), 2500); }, []);
  const node = msg ? (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg text-sm ${msg.err ? 'bg-red-600' : 'bg-emerald-600'} text-white shadow-xl`}>{msg.m}</div>
  ) : null;
  return [toast, node];
}

// ---- sections ------------------------------------------------------------
function DesignPricing({ toast }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    try { const r = await http.get('/api/admin/pricing/designs'); setRows(r.data.designs || []); }
    catch { toast('Load failed', true); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const patch = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async (d) => {
    try {
      const r = await http.put(`/api/admin/pricing/designs/${d.design_id}`, d);
      toast(`Saved · final ₹${r.data.final_price}`); load();
    } catch (e) { toast(e?.response?.data?.detail || 'Save failed', true); }
  };
  return (
    <div className="space-y-2">
      <p className="text-white/50 text-sm">Every design priced independently. Final = Base − Discount%/₹ (or an explicit Sale price).</p>
      <div className="overflow-x-auto border border-white/10 rounded-lg">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="text-[11px] uppercase tracking-wide text-white/50 bg-white/5">
            <tr><th className="text-left p-2">Name</th><th className="p-2">Category</th><th className="p-2">Base</th><th className="p-2">Disc%</th><th className="p-2">Disc₹</th><th className="p-2">Sale</th><th className="p-2">Flags</th><th className="p-2">Active</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={d.design_id} className="border-t border-white/5">
                <td className="p-2"><Input value={d.name} onChange={(v) => patch(i, 'name', v)} /></td>
                <td className="p-2"><Input value={d.category_id} onChange={(v) => patch(i, 'category_id', v)} /></td>
                <td className="p-2 w-20"><Input type="number" value={d.base_price} onChange={(v) => patch(i, 'base_price', v)} /></td>
                <td className="p-2 w-16"><Input type="number" value={d.discount_pct} onChange={(v) => patch(i, 'discount_pct', v)} /></td>
                <td className="p-2 w-20"><Input type="number" value={d.discount_amount} onChange={(v) => patch(i, 'discount_amount', v)} /></td>
                <td className="p-2 w-20"><Input type="number" value={d.sale_price} onChange={(v) => patch(i, 'sale_price', v)} /></td>
                <td className="p-2">
                  <div className="flex gap-1 flex-wrap">
                    <Toggle on={d.featured} onClick={() => patch(i, 'featured', !d.featured)} label="⭐" />
                    <Toggle on={d.trending} onClick={() => patch(i, 'trending', !d.trending)} label="🔥" />
                    <Toggle on={d.best_seller} onClick={() => patch(i, 'best_seller', !d.best_seller)} label="🏆" />
                    <Toggle on={d.new_arrival} onClick={() => patch(i, 'new_arrival', !d.new_arrival)} label="🆕" />
                  </div>
                </td>
                <td className="p-2 text-center"><Toggle on={d.active} onClick={() => patch(i, 'active', !d.active)} label={d.active ? 'On' : 'Off'} /></td>
                <td className="p-2"><Btn tone="primary" onClick={() => save(d)}><Save size={13} />Save</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CrudList({ toast, title, listUrl, listKey, blank, fields, idKey = 'id', createUrl, itemUrl }) {
  const [rows, setRows] = useState([]);
  const [nw, setNw] = useState(blank);
  const load = useCallback(async () => {
    try { const r = await http.get(listUrl); setRows(r.data[listKey] || []); } catch { toast('Load failed', true); }
  }, [listUrl, listKey, toast]);
  useEffect(() => { load(); }, [load]);
  const patch = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async (row) => {
    try { await http.put(itemUrl(row[idKey]), row); toast('Saved'); load(); }
    catch (e) { toast(e?.response?.data?.detail || 'Save failed', true); }
  };
  const create = async () => {
    try { await http.post(createUrl, nw); setNw(blank); toast('Created'); load(); }
    catch (e) { toast(e?.response?.data?.detail || 'Create failed', true); }
  };
  const del = async (row) => {
    try { await http.delete(itemUrl(row[idKey])); toast('Deleted'); load(); }
    catch (e) { toast(e?.response?.data?.detail || 'Delete failed', true); }
  };
  return (
    <div className="space-y-3">
      <h3 className="text-white font-medium">{title}</h3>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row[idKey]} className="flex flex-wrap items-center gap-2 border border-white/10 rounded p-2 bg-white/[.03]">
            {fields.map((f) => (
              <div key={f.k} className="min-w-[120px] flex-1">
                <div className="text-[10px] uppercase text-white/40">{f.label}</div>
                {f.type === 'bool'
                  ? <Toggle on={row[f.k]} onClick={() => patch(i, f.k, !row[f.k])} label={row[f.k] ? 'On' : 'Off'} />
                  : <Input type={f.type || 'text'} value={row[f.k]} onChange={(v) => patch(i, f.k, v)} />}
              </div>
            ))}
            <Btn tone="primary" onClick={() => save(row)}><Save size={13} />Save</Btn>
            {createUrl && <Btn tone="danger" onClick={() => del(row)}><Trash2 size={13} /></Btn>}
          </div>
        ))}
      </div>
      {createUrl && (
        <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
          {fields.filter((f) => f.k !== idKey).map((f) => (
            <div key={f.k} className="min-w-[120px]">
              <div className="text-[10px] uppercase text-white/40">{f.label}</div>
              {f.type === 'bool'
                ? <Toggle on={nw[f.k]} onClick={() => setNw({ ...nw, [f.k]: !nw[f.k] })} label={nw[f.k] ? 'On' : 'Off'} />
                : <Input type={f.type || 'text'} value={nw[f.k]} onChange={(v) => setNw({ ...nw, [f.k]: v })} />}
            </div>
          ))}
          <Btn onClick={create}><Plus size={13} />Add</Btn>
        </div>
      )}
    </div>
  );
}

function Campaigns({ toast }) {
  const [rows, setRows] = useState([]);
  const blank = { name: '', banner_text: '', discount_type: 'percentage', discount_value: 10, start_at: '', end_at: '', scope: { mode: 'all', ids: [] } };
  const [nw, setNw] = useState(blank);
  const load = useCallback(async () => { try { const r = await http.get('/api/admin/pricing/campaigns'); setRows(r.data.campaigns || []); } catch { toast('Load failed', true); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const toggle = async (c) => { try { await http.post(`/api/admin/pricing/campaigns/${c.id}/toggle`); load(); } catch { toast('Failed', true); } };
  const create = async () => { try { await http.post('/api/admin/pricing/campaigns', nw); setNw(blank); toast('Campaign created'); load(); } catch (e) { toast(e?.response?.data?.detail || 'Failed', true); } };
  const del = async (c) => { try { await http.delete(`/api/admin/pricing/campaigns/${c.id}`); load(); } catch { toast('Failed', true); } };
  return (
    <div className="space-y-3">
      <p className="text-white/50 text-sm">Only the single best in-scope active campaign applies — never stacked.</p>
      {rows.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 border border-white/10 rounded p-3 bg-white/[.03]">
          <div className="flex-1 min-w-[180px]">
            <div className="text-white font-medium">{c.name}</div>
            <div className="text-white/40 text-xs">{c.banner_text}</div>
            <div className="text-amber-300 text-xs">{c.discount_type === 'percentage' ? `${c.discount_value}%` : `₹${c.discount_value}`} · scope: {c.scope?.mode}</div>
          </div>
          <Toggle on={c.active} onClick={() => toggle(c)} label={c.active ? 'Active' : 'Inactive'} />
          <Btn tone="danger" onClick={() => del(c)}><Trash2 size={13} /></Btn>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
        <div className="min-w-[140px]"><div className="text-[10px] uppercase text-white/40">Name</div><Input value={nw.name} onChange={(v) => setNw({ ...nw, name: v })} /></div>
        <div className="min-w-[180px] flex-1"><div className="text-[10px] uppercase text-white/40">Banner text</div><Input value={nw.banner_text} onChange={(v) => setNw({ ...nw, banner_text: v })} /></div>
        <div><div className="text-[10px] uppercase text-white/40">Type</div>
          <select value={nw.discount_type} onChange={(e) => setNw({ ...nw, discount_type: e.target.value })} className="bg-black/30 border border-white/15 rounded px-2 py-1 text-sm text-white">
            <option value="percentage">%</option><option value="fixed">₹</option>
          </select></div>
        <div className="w-20"><div className="text-[10px] uppercase text-white/40">Value</div><Input type="number" value={nw.discount_value} onChange={(v) => setNw({ ...nw, discount_value: v })} /></div>
        <div><div className="text-[10px] uppercase text-white/40">Scope</div>
          <select value={nw.scope.mode} onChange={(e) => setNw({ ...nw, scope: { mode: e.target.value, ids: [] } })} className="bg-black/30 border border-white/15 rounded px-2 py-1 text-sm text-white">
            {['all', 'designs', 'categories', 'feature_packs', 'portfolio', 'storage'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select></div>
        <div><div className="text-[10px] uppercase text-white/40">Start</div><Input type="date" value={nw.start_at} onChange={(v) => setNw({ ...nw, start_at: v })} /></div>
        <div><div className="text-[10px] uppercase text-white/40">End</div><Input type="date" value={nw.end_at} onChange={(v) => setNw({ ...nw, end_at: v })} /></div>
        <Btn onClick={create}><Plus size={13} />Add</Btn>
      </div>
    </div>
  );
}

function FeaturePacks({ toast }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => { try { const r = await http.get('/api/admin/pricing/feature-packs'); setRows(r.data.feature_packs || []); } catch { toast('Load failed', true); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const patch = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async (p) => { try { await http.put(`/api/admin/pricing/feature-packs/${p.id}`, { price: p.price, name: p.name, active: p.active, features: p.features }); toast('Saved'); load(); } catch (e) { toast(e?.response?.data?.detail || 'Failed', true); } };
  const setFeatures = (i, txt) => patch(i, 'features', txt.split(',').map((s) => s.trim()).filter(Boolean));
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {rows.map((p, i) => (
        <div key={p.id} className="border border-white/10 rounded-lg p-3 bg-white/[.03] space-y-2">
          <Input value={p.name} onChange={(v) => patch(i, 'name', v)} />
          <div className="flex items-center gap-2"><span className="text-white/50 text-sm">₹</span><Input type="number" value={p.price} onChange={(v) => patch(i, 'price', v)} /></div>
          <div className="text-[10px] uppercase text-white/40">Features (comma-separated, order kept)</div>
          <textarea value={(p.features || []).join(', ')} onChange={(e) => setFeatures(i, e.target.value)} rows={4}
            className="bg-black/30 border border-white/15 rounded px-2 py-1 text-xs text-white w-full" />
          <div className="flex items-center justify-between">
            <Toggle on={p.active} onClick={() => patch(i, 'active', !p.active)} label={p.active ? 'Active' : 'Off'} />
            <Btn tone="primary" onClick={() => save(p)}><Save size={13} />Save</Btn>
          </div>
        </div>
      ))}
    </div>
  );
}

function Plans({ toast, product }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => { try { const r = await http.get(`/api/admin/pricing/plans?product=${product}`); setRows(r.data.plans || []); } catch { toast('Load failed', true); } }, [product, toast]);
  useEffect(() => { load(); }, [load]);
  const patchDur = (i, cyc, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, durations: { ...(x.durations || {}), [cyc]: v } } : x)));
  const patch = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async (p) => { try { await http.put(`/api/admin/pricing/plans/${p.id}`, p); toast('Saved'); load(); } catch (e) { toast(e?.response?.data?.detail || 'Failed', true); } };
  return (
    <div className="overflow-x-auto border border-white/10 rounded-lg">
      <table className="w-full text-sm min-w-[720px]">
        <thead className="text-[11px] uppercase text-white/50 bg-white/5"><tr>
          <th className="text-left p-2">Plan</th>{['1', '3', '6', '12'].map((c) => <th key={c} className="p-2">{c}mo</th>)}
          {product === 'portfolio' ? <th className="p-2">Storage GB</th> : <th className="p-2">Capacity GB</th>}
          <th className="p-2">Active</th><th /></tr></thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id} className="border-t border-white/5">
              <td className="p-2 text-white">{p.name || p.tier}</td>
              {['1', '3', '6', '12'].map((c) => (
                <td key={c} className="p-2 w-20"><Input type="number" value={(p.durations || {})[c]} onChange={(v) => patchDur(i, c, v)} /></td>
              ))}
              <td className="p-2 w-24"><Input type="number" value={product === 'portfolio' ? p.storage_gb : p.capacity_gb} onChange={(v) => patch(i, product === 'portfolio' ? 'storage_gb' : 'capacity_gb', v)} /></td>
              <td className="p-2 text-center"><Toggle on={p.active !== false} onClick={() => patch(i, 'active', !(p.active !== false))} label={p.active !== false ? 'On' : 'Off'} /></td>
              <td className="p-2"><Btn tone="primary" onClick={() => save(p)}><Save size={13} />Save</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Community({ toast }) {
  const [caps, setCaps] = useState([]);
  const [tiers, setTiers] = useState({});
  const load = useCallback(async () => { try { const r = await http.get('/api/admin/pricing/community'); setCaps(r.data.capabilities || []); setTiers(r.data.tiers || {}); } catch { toast('Load failed', true); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  const toggle = (tier, cap) => setTiers((t) => ({ ...t, [tier]: { ...(t[tier] || {}), [cap]: !(t[tier] || {})[cap] } }));
  const save = async () => { try { await http.put('/api/admin/pricing/community', { tiers }); toast('Community settings saved'); } catch (e) { toast(e?.response?.data?.detail || 'Failed', true); } };
  const TIERS = ['free', 'basic', 'premium', 'pro'];
  return (
    <div className="space-y-3">
      <p className="text-white/50 text-sm">Portfolio plan controls community access. Toggle each capability per tier.</p>
      <div className="overflow-x-auto border border-white/10 rounded-lg">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="text-[11px] uppercase text-white/50 bg-white/5"><tr><th className="text-left p-2">Capability</th>{TIERS.map((t) => <th key={t} className="p-2 capitalize">{t}</th>)}</tr></thead>
          <tbody>
            {caps.map((cap) => (
              <tr key={cap} className="border-t border-white/5">
                <td className="p-2 text-white/70">{cap.replace(/_/g, ' ')}</td>
                {TIERS.map((t) => (
                  <td key={t} className="p-2 text-center"><Toggle on={(tiers[t] || {})[cap]} onClick={() => toggle(t, cap)} label={(tiers[t] || {})[cap] ? '✓' : '—'} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Btn tone="primary" onClick={save}><Save size={14} />Save matrix</Btn>
    </div>
  );
}

function Simulator({ toast }) {
  const [cat, setCat] = useState({ designs: [], feature_packs: [], link_durations: [] });
  const [sel, setSel] = useState({ design_id: '', feature_pack_key: '', duration_id: '' });
  const [out, setOut] = useState(null);
  useEffect(() => { http.get('/api/pricing/catalog').then((r) => setCat(r.data)).catch(() => {}); }, []);
  const run = async () => {
    try { const r = await http.post('/api/admin/pricing/simulate', { kind: 'wedding', ...sel }); setOut(r.data); }
    catch (e) { toast(e?.response?.data?.detail || 'Simulate failed', true); setOut(null); }
  };
  const Sel = ({ label, val, onChange, opts, ok, ov }) => (
    <div><div className="text-[10px] uppercase text-white/40">{label}</div>
      <select value={val} onChange={(e) => onChange(e.target.value)} className="bg-black/30 border border-white/15 rounded px-2 py-1 text-sm text-white min-w-[180px]">
        <option value="">— choose —</option>{opts.map((o) => <option key={o[ok]} value={o[ok]}>{o[ov]}</option>)}
      </select></div>
  );
  return (
    <div className="space-y-4">
      <p className="text-white/50 text-sm">Same resolver as production checkout — verify a price before it goes live.</p>
      <div className="flex flex-wrap gap-3 items-end">
        <Sel label="Design" val={sel.design_id} onChange={(v) => setSel({ ...sel, design_id: v })} opts={cat.designs} ok="design_id" ov="name" />
        <Sel label="Feature pack" val={sel.feature_pack_key} onChange={(v) => setSel({ ...sel, feature_pack_key: v })} opts={cat.feature_packs} ok="key" ov="name" />
        <Sel label="Link duration" val={sel.duration_id} onChange={(v) => setSel({ ...sel, duration_id: v })} opts={cat.link_durations} ok="id" ov="name" />
        <Btn tone="primary" onClick={run}><Calculator size={14} />Calculate</Btn>
      </div>
      {out && (
        <div className="border border-amber-400/30 rounded-lg p-4 bg-amber-500/5 max-w-sm space-y-1 text-sm">
          <div className="flex justify-between text-white/70"><span>Design</span><span>₹{out.design_price}</span></div>
          <div className="flex justify-between text-white/70"><span>Feature pack</span><span>₹{out.feature_pack_price}</span></div>
          <div className="flex justify-between text-white/70"><span>Link duration</span><span>₹{out.link_duration_price}</span></div>
          <div className="flex justify-between text-white/50 border-t border-white/10 pt-1"><span>Subtotal</span><span>₹{out.subtotal}</span></div>
          {out.discount > 0 && <div className="flex justify-between text-emerald-300"><span>Discount{out.campaign ? ` (${out.campaign.name})` : ''}</span><span>−₹{out.discount}</span></div>}
          <div className="flex justify-between text-amber-200 text-lg font-semibold border-t border-white/10 pt-1"><span>Total</span><span>₹{out.total}</span></div>
        </div>
      )}
    </div>
  );
}

export default function PricingEngineHub() {
  const [tab, setTab] = useState('designs');
  const [toast, toastNode] = useToast();
  const body = useMemo(() => {
    switch (tab) {
      case 'designs': return <DesignPricing toast={toast} />;
      case 'categories': return <CrudList toast={toast} title="Design Categories"
        listUrl="/api/admin/pricing/categories" listKey="categories"
        blank={{ name: '', active: true, sort: 1 }}
        fields={[{ k: 'name', label: 'Name' }, { k: 'sort', label: 'Sort', type: 'number' }, { k: 'active', label: 'Active', type: 'bool' }]}
        createUrl="/api/admin/pricing/categories" itemUrl={(id) => `/api/admin/pricing/categories/${id}`} />;
      case 'campaigns': return <Campaigns toast={toast} />;
      case 'packs': return <FeaturePacks toast={toast} />;
      case 'durations': return <CrudList toast={toast} title="Link Duration Tiers"
        listUrl="/api/admin/pricing/link-durations" listKey="link_durations"
        blank={{ name: '', duration_days: 90, lifetime: false, price: 0, description: '', active: true }}
        fields={[{ k: 'name', label: 'Name' }, { k: 'duration_days', label: 'Days', type: 'number' }, { k: 'lifetime', label: 'Lifetime', type: 'bool' }, { k: 'price', label: 'Price ₹', type: 'number' }, { k: 'active', label: 'Active', type: 'bool' }]}
        createUrl="/api/admin/pricing/link-durations" itemUrl={(id) => `/api/admin/pricing/link-durations/${id}`} />;
      case 'portfolio': return <Plans toast={toast} product="portfolio" />;
      case 'storage': return <Plans toast={toast} product="storage" />;
      case 'community': return <Community toast={toast} />;
      case 'simulator': return <Simulator toast={toast} />;
      default: return null;
    }
  }, [tab, toast]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6" data-testid="pricing-engine-hub">
      <h1 className="text-2xl font-semibold mb-1">Pricing Engine</h1>
      <p className="text-white/40 text-sm mb-5">One source of truth — every price DB-backed and editable. New checkout stays off until you flip <code className="text-amber-300">new_pricing_enabled</code>.</p>
      <div className="flex flex-wrap gap-2 mb-6">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.key} type="button" onClick={() => setTab(s.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${tab === s.key ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 text-white/70 border-white/10'}`}>
              <Icon size={14} />{s.label}
            </button>
          );
        })}
      </div>
      <div className="bg-white/[.02] border border-white/10 rounded-xl p-5">{body}</div>
      {toastNode}
    </div>
  );
}
