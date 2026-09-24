// SuperAdminFoundingPricing — the owner's control panel for Founding-100 pricing.
//
//   • Toggle founding pricing on/off, set the seat limit + auto-switch.
//   • Watch the live counter (X of N seats claimed) and the current mode.
//   • "Apply approved catalogue" — write the spec's regular + founding numbers.
//   • Edit any portfolio plan's regular / founding price for every cycle.
//
// Everything is honest: the public pages only ever strike out the REAL regular price.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, Timer, Check, RefreshCw, Save } from 'lucide-react';
import '@/styles/luxury.css';

const API = process.env.REACT_APP_BACKEND_URL || '';
const CYCLES = [['1', 'Monthly'], ['3', 'Quarterly'], ['6', 'Half-Yearly'], ['12', 'Yearly']];
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function SuperAdminFoundingPricing() {
  const navigate = useNavigate();
  const api = useMemo(() => {
    const token = localStorage.getItem('admin_token');
    const i = axios.create({ baseURL: API });
    if (token) i.defaults.headers.common.Authorization = `Bearer ${token}`;
    return i;
  }, []);

  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [edits, setEdits] = useState({});          // {tier: {reg:{c:val}, fnd:{c:val}}}

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/super-admin/founding/status');
      setData(data);
      // seed the editable grid from the returned plan prices
      const e = {};
      (data.plans || []).forEach((p) => {
        e[p.tier] = { reg: {}, fnd: {} };
        Object.entries(p.cycles || {}).forEach(([c, v]) => {
          e[p.tier].reg[c] = v.regular_price;
          e[p.tier].fnd[c] = v.founding_price;
        });
      });
      setEdits(e);
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) navigate('/super-admin/login');
    }
  }, [api, navigate]);

  useEffect(() => { load(); }, [load]);

  const patchSettings = async (patch) => {
    setBusy(true);
    try { const { data } = await api.patch('/api/super-admin/founding/settings', patch); setData(data); flash('Saved'); }
    catch (e) { flash(e?.response?.data?.detail || 'Could not save'); }
    setBusy(false);
  };

  const applyCatalogue = async () => {
    if (!window.confirm('Write the approved regular + founding prices to all portfolio plans? This sets your live regular prices to the approved numbers.')) return;
    setBusy(true);
    try { await api.post('/api/super-admin/founding/apply-catalogue'); await load(); flash('Catalogue applied'); }
    catch (e) { flash(e?.response?.data?.detail || 'Could not apply'); }
    setBusy(false);
  };

  const savePlan = async (tier) => {
    const e = edits[tier]; if (!e) return;
    setBusy(true);
    try {
      await api.patch(`/api/super-admin/founding/portfolio/${encodeURIComponent(tier)}`, {
        durations: Object.fromEntries(Object.entries(e.reg).map(([c, v]) => [c, Number(v) || 0])),
        durations_founding: Object.fromEntries(Object.entries(e.fnd).map(([c, v]) => [c, Number(v) || 0])),
      });
      await load(); flash(`${tier} saved`);
    } catch (err) { flash(err?.response?.data?.detail || 'Could not save plan'); }
    setBusy(false);
  };

  const setCell = (tier, kind, c, val) =>
    setEdits((prev) => ({ ...prev, [tier]: { ...prev[tier], [kind]: { ...prev[tier][kind], [c]: val } } }));

  if (!data) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center" style={{ background: 'var(--lux-bg)' }}>
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: '#E8C97A' }} />
      </div>
    );
  }

  const st = data.status || {};
  const s = data.settings || {};

  return (
    <div className="luxe min-h-screen" style={{ background: 'var(--lux-bg)' }} data-testid="admin-founding-pricing">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <span className="lux-eyebrow">◆ Pricing</span>
            <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Founding-100 Pricing</h1>
          </div>
          <button onClick={load} className="lux-btn lux-btn-ghost text-sm" data-testid="founding-refresh">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* live status */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="lux-glass p-4">
            <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--lux-text-faint)' }}>Live mode</div>
            <div className="mt-1 font-display text-2xl" style={{ color: st.mode === 'founding' ? '#E8C97A' : 'var(--lux-text)' }}>
              {st.mode === 'founding' ? 'Founding' : 'Regular'}
            </div>
            {st.sold_out && <div className="text-[11px]" style={{ color: '#F0607A' }}>Seats sold out → regular</div>}
          </div>
          <div className="lux-glass p-4">
            <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--lux-text-faint)' }}>Seats claimed</div>
            <div className="mt-1 font-display text-2xl" style={{ color: 'var(--lux-text)' }}>{st.count} / {st.limit}</div>
            <div className="text-[11px]" style={{ color: '#4ADE80' }}>{st.slots_left} left</div>
          </div>
          <div className="lux-glass flex items-center gap-2 p-4">
            <Timer className="h-5 w-5" style={{ color: '#E8C97A' }} />
            <span className="text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>
              Seats count the first {st.limit} paying portfolio studios; they keep their rate on renewal.
            </span>
          </div>
        </div>

        {/* settings */}
        <div className="lux-glass mb-6 p-5">
          <div className="mb-4 font-display text-lg" style={{ color: 'var(--lux-text)' }}>Settings</div>
          <div className="flex flex-col gap-4">
            <Toggle label="Founding pricing enabled" hint="When on, the public pages show founding prices until the seats run out."
              checked={!!s.founding_users_enabled} onChange={(v) => patchSettings({ founding_users_enabled: v })} testid="toggle-enabled" />
            <Toggle label="Auto-switch to regular when full" hint="At the seat limit, prices flip to regular automatically."
              checked={!!s.auto_switch_to_regular_pricing} onChange={(v) => patchSettings({ auto_switch_to_regular_pricing: v })} testid="toggle-autoswitch" />
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm" style={{ color: 'var(--lux-text)' }}>Founding seat limit</span>
              <input type="number" min="0" defaultValue={s.founding_user_limit}
                onBlur={(e) => patchSettings({ founding_user_limit: Number(e.target.value) })}
                className="w-28 rounded-lg px-3 py-2 text-sm" data-testid="input-limit"
                style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }} />
            </div>
          </div>
        </div>

        {/* apply catalogue */}
        <div className="lux-glass mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Approved catalogue</div>
            <p className="text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>Write the approved regular + founding numbers to Basic, Premium and Pro Studio.</p>
          </div>
          <button onClick={applyCatalogue} disabled={busy} className="lux-btn text-sm disabled:opacity-50" data-testid="apply-catalogue">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Apply approved catalogue
          </button>
        </div>

        {/* editable plan prices */}
        {(data.plans || []).map((p) => (
          <div key={p.tier} className="lux-glass mb-4 p-5" data-testid={`plan-editor-${p.tier.toLowerCase().replace(/\s+/g, '-')}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>
                {p.tier} {p.badge && <span className="ml-2 text-[10px]" style={{ color: '#E8C97A' }}>{p.badge}</span>}
              </div>
              <button onClick={() => savePlan(p.tier)} disabled={busy} className="lux-btn lux-btn-ghost text-xs disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> Save {p.tier}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--lux-text-faint)' }}>
                    <th className="p-2 text-left text-[11px] uppercase tracking-wide">Cycle</th>
                    <th className="p-2 text-left text-[11px] uppercase tracking-wide">Regular (strike)</th>
                    <th className="p-2 text-left text-[11px] uppercase tracking-wide">Founding (pays)</th>
                    <th className="p-2 text-left text-[11px] uppercase tracking-wide">Real % off</th>
                  </tr>
                </thead>
                <tbody>
                  {CYCLES.map(([c, label]) => {
                    const reg = Number((edits[p.tier]?.reg || {})[c] || 0);
                    const fnd = Number((edits[p.tier]?.fnd || {})[c] || 0);
                    const pct = reg > 0 && fnd < reg ? Math.round((reg - fnd) * 100 / reg) : 0;
                    return (
                      <tr key={c} style={{ borderTop: '1px solid var(--lux-border)' }}>
                        <td className="p-2" style={{ color: 'var(--lux-text-muted)' }}>{label}</td>
                        <td className="p-2"><PriceInput value={reg} onChange={(v) => setCell(p.tier, 'reg', c, v)} /></td>
                        <td className="p-2"><PriceInput value={fnd} onChange={(v) => setCell(p.tier, 'fnd', c, v)} /></td>
                        <td className="p-2" style={{ color: pct > 0 ? '#4ADE80' : 'var(--lux-text-faint)' }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4" role="status">
          <span className="lux-glass px-4 py-2 text-[13px]" style={{ color: 'var(--lux-text)' }}>{toast}</span>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, testid }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{label}</div>
        {hint && <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>{hint}</div>}
      </div>
      <button onClick={() => onChange(!checked)} data-testid={testid} role="switch" aria-checked={checked}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: checked ? '22px' : '2px' }} />
      </button>
    </div>
  );
}

function PriceInput({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span style={{ color: 'var(--lux-text-faint)' }}>₹</span>
      <input type="number" min="0" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded-lg px-2 py-1.5 text-sm"
        style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }} />
    </div>
  );
}
