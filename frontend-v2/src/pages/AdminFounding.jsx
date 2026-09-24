import { useCallback, useEffect, useState } from 'react';
import AdminModule, { Panel, StatRow, useFlash } from '@/components/AdminModule';
import { Toast, InlineError } from '@/components/WeddingModule';
import ConfirmModal from '@/components/adminpricing/ConfirmModal';
import * as api from '@/api/adminPricing';

// AdminFounding — founding_admin.py. The public pricing page already reads
// founding state (pricing_engine.price_display via founding_pricing.py); this
// was the missing admin side. Every mutating action here confirms explicitly,
// because founding mode changes what the LIVE public pricing page shows the
// instant it saves — there is no draft/staging step on the backend.

const CYCLES = [['1', 'Monthly'], ['3', 'Quarterly'], ['6', 'Half-Yearly'], ['12', 'Yearly']];
const rupee = (v) => (v === null || v === undefined ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

export default function AdminFounding() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();
  const [edits, setEdits] = useState({});
  const [limitInput, setLimitInput] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.foundingStatus()
      .then((r) => {
        setData(r.data);
        setLimitInput(String(r.data?.settings?.founding_user_limit ?? ''));
        const e = {};
        (r.data?.plans || []).forEach((p) => {
          e[p.tier] = { reg: {}, fnd: {} };
          Object.entries(p.cycles || {}).forEach(([c, v]) => {
            e[p.tier].reg[c] = v.regular_price;
            e[p.tier].fnd[c] = v.founding_price ?? '';
          });
        });
        setEdits(e);
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load founding pricing.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const st = data?.status || {};
  const s = data?.settings || {};

  const runSettingsPatch = (patch, confirmRows, title, note) => {
    setConfirm({
      title, rows: confirmRows, note, danger: true,
      run: async () => {
        setBusy(true);
        try {
          const { data: d } = await api.foundingSettings(patch);
          setData(d);
          setConfirm(null);
          flash('Saved.');
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not save that setting.');
        } finally { setBusy(false); }
      },
    });
  };

  const toggleEnabled = () => runSettingsPatch(
    { founding_users_enabled: !s.founding_users_enabled },
    [{ label: 'Founding pricing', from: s.founding_users_enabled ? 'On' : 'Off', to: !s.founding_users_enabled ? 'On' : 'Off' }],
    !s.founding_users_enabled ? 'Turn founding pricing ON' : 'Turn founding pricing OFF',
    !s.founding_users_enabled
      ? 'The public pricing page will show founding rates immediately, for as long as seats remain.'
      : 'The public pricing page will fall back to regular prices immediately.',
  );

  const toggleAutoSwitch = () => runSettingsPatch(
    { auto_switch_to_regular_pricing: !s.auto_switch_to_regular_pricing },
    [{ label: 'Auto-switch at limit', from: s.auto_switch_to_regular_pricing ? 'On' : 'Off', to: !s.auto_switch_to_regular_pricing ? 'On' : 'Off' }],
    'Change auto-switch behaviour',
    'When on, prices flip to regular automatically once the seat limit is reached.',
  );

  const saveLimit = () => {
    const n = Number(limitInput);
    if (!Number.isFinite(n) || n < 0) { setError('Seat limit must be a number ≥ 0.'); return; }
    if (n === s.founding_user_limit) return;
    runSettingsPatch(
      { founding_user_limit: n },
      [{ label: 'Founding seat limit', from: s.founding_user_limit, to: n }],
      'Change the founding seat limit',
      'How many paying studios can claim the founding rate before auto-switch (if on) takes over.',
    );
  };

  const applyCatalogue = () => {
    setConfirm({
      title: 'Apply the approved founding catalogue',
      rows: [],
      danger: true,
      note: 'Writes the approved regular + founding prices to Basic, Premium and Pro Studio portfolio plans — this sets your LIVE regular price, not just a founding discount. Owner-invoked only; nothing auto-runs this.',
      run: async () => {
        setBusy(true);
        try {
          const { data: d } = await api.foundingApplyCatalogue();
          setData(d);
          setConfirm(null);
          flash(`Catalogue applied — ${d.applied?.updated || 0} updated, ${d.applied?.created || 0} created.`);
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not apply the catalogue.');
        } finally { setBusy(false); }
      },
    });
  };

  const setCell = (tier, kind, c, val) => setEdits((prev) => ({ ...prev, [tier]: { ...prev[tier], [kind]: { ...prev[tier][kind], [c]: val } } }));

  const savePlan = (plan) => {
    const e = edits[plan.tier];
    if (!e) return;
    const changedRows = [];
    CYCLES.forEach(([c, label]) => {
      const origReg = plan.cycles?.[c]?.regular_price;
      const origFnd = plan.cycles?.[c]?.founding_price;
      const newReg = Number(e.reg[c]) || 0;
      const newFnd = e.fnd[c] === '' ? null : Number(e.fnd[c]);
      if (newReg !== origReg) changedRows.push({ label: `${label} — regular`, from: rupee(origReg), to: rupee(newReg) });
      if (newFnd !== (origFnd ?? null)) changedRows.push({ label: `${label} — founding`, from: rupee(origFnd), to: rupee(newFnd) });
    });
    if (changedRows.length === 0) { flash('Nothing changed.'); return; }
    setConfirm({
      title: `Save "${plan.tier}" pricing`,
      rows: changedRows,
      danger: true,
      note: 'The regular price is the honest strike-through shown to every buyer; the founding price is what founding-mode buyers pay. Live at checkout the instant this saves.',
      run: async () => {
        setBusy(true);
        try {
          await api.foundingPlanPrices(plan.plan_id || plan.tier, {
            durations: Object.fromEntries(CYCLES.map(([c]) => [c, Number(e.reg[c]) || 0])),
            durations_founding: Object.fromEntries(CYCLES.map(([c]) => [c, e.fnd[c] === '' ? 0 : Number(e.fnd[c]) || 0])),
          });
          setConfirm(null);
          flash(`${plan.tier} saved.`);
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not save that plan.');
        } finally { setBusy(false); }
      },
    });
  };

  return (
    <AdminModule
      active="Pricing hub"
      title="Founding-100 Pricing"
      sub="The first N paying portfolio studios get a genuine launch rate and keep it on renewal. Toggling this or editing a price changes the live public pricing page immediately."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={load}>Refresh</button>}
    >
      <InlineError message={error} />
      {loading ? <p className="wmod-hint">Loading…</p> : (
        <>
          <StatRow items={[
            { label: 'Live mode', value: st.mode === 'founding' ? 'Founding' : 'Regular', hint: st.sold_out ? 'Seats sold out → regular' : undefined },
            { label: 'Seats claimed', value: `${st.count ?? 0} / ${st.limit ?? 0}` },
            { label: 'Slots left', value: st.slots_left ?? 0 },
          ]}
          />

          <Panel title="Settings">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ToggleRow label="Founding pricing enabled" hint="When on, the public pricing page shows founding rates until seats run out." checked={!!s.founding_users_enabled} onChange={toggleEnabled} />
              <ToggleRow label="Auto-switch to regular when full" hint="At the seat limit, prices flip to regular automatically." checked={!!s.auto_switch_to_regular_pricing} onChange={toggleAutoSwitch} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="wmod-label" style={{ marginBottom: 0 }}>Founding seat limit</span>
                <input className="wmod-input" type="number" min="0" style={{ width: 120 }} value={limitInput} onChange={(e) => setLimitInput(e.target.value)} />
                <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={saveLimit}>Save limit</button>
              </div>
            </div>
          </Panel>

          <Panel title="Approved catalogue" sub="Write the approved regular + founding numbers to Basic, Premium and Pro Studio in one action."
            actions={<button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" onClick={applyCatalogue}>Apply approved catalogue</button>}
          />

          {(data?.plans || []).map((p) => (
            <Panel key={p.plan_id || p.tier} title={`${p.tier}${p.badge ? ` — ${p.badge}` : ''}`} pad={false}
              actions={<button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" onClick={() => savePlan(p)}>Save {p.tier}</button>}
            >
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr><th>Cycle</th><th>Regular (strike)</th><th>Founding (pays)</th></tr></thead>
                  <tbody>
                    {CYCLES.map(([c, label]) => (
                      <tr key={c}>
                        <td className="wmod-td-muted">{label}</td>
                        <td>
                          <input className="wmod-input" type="number" min="0" style={{ minHeight: 36, width: 110 }}
                            value={edits[p.tier]?.reg?.[c] ?? ''} onChange={(e) => setCell(p.tier, 'reg', c, e.target.value)}
                          />
                        </td>
                        <td>
                          <input className="wmod-input" type="number" min="0" style={{ minHeight: 36, width: 110 }}
                            value={edits[p.tier]?.fnd?.[c] ?? ''} onChange={(e) => setCell(p.tier, 'fnd', c, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </>
      )}

      {confirm && (
        <ConfirmModal title={confirm.title} rows={confirm.rows} note={confirm.note} danger={confirm.danger} busy={busy}
          confirmLabel="Confirm" onConfirm={confirm.run} onCancel={() => setConfirm(null)}
        />
      )}
      <Toast message={toast} />
    </AdminModule>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--mj-faint)', marginTop: 2 }}>{hint}</div>}
      </div>
      <button type="button" role="switch" aria-checked={checked} onClick={onChange}
        style={{
          position: 'relative', width: 44, height: 26, borderRadius: 999, flexShrink: 0,
          border: '1px solid var(--mj-border)', background: checked ? 'var(--mj-primary)' : 'var(--mj-section)', cursor: 'pointer',
        }}
      >
        <span style={{ position: 'absolute', top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </button>
    </div>
  );
}
