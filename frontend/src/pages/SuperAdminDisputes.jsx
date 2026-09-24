import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Gavel, Plus, ChevronLeft, Paperclip, RefreshCw } from 'lucide-react';
import '@/styles/luxury.css';

/** SuperAdminDisputes — refund disputes & chargebacks (Phase 4). */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const STATUSES = ['', 'open', 'under_review', 'evidence_submitted', 'won', 'lost', 'refunded', 'closed'];
const SC = { open: '#E8C97A', under_review: '#8Fb3ff', evidence_submitted: '#8Fb3ff', won: '#7BD88F', refunded: '#7BD88F', lost: '#ff7a7a', closed: 'var(--lux-text-muted)' };

export default function SuperAdminDisputes() {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ kind: '', status: '', q: '' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ kind: 'chargeback', payment_id: '', amount_paise: 0, reason: '' });
  const [ev, setEv] = useState({ note: '', url: '' });
  const [busy, setBusy] = useState(false);

  const loadStats = useCallback(async () => { try { setStats((await axios.get(`${API_URL}/api/admin/disputes/stats`)).data); } catch (_) {} }, []);
  const loadList = useCallback(async () => {
    const params = { page, page_size: 20 };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    try { const { data } = await axios.get(`${API_URL}/api/admin/disputes`, { params }); setRows(data.items || []); setMeta({ total: data.total, page: data.page, pages: data.pages }); } catch (_) {}
  }, [page, filters]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadList(); }, [loadList]);

  const open = async (id) => { setOpenId(id); setDetail(null); try { setDetail((await axios.get(`${API_URL}/api/admin/disputes/${id}`)).data); } catch (_) {} };
  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data } = await axios.post(`${API_URL}/api/admin/disputes`, { ...form, amount_paise: Number(form.amount_paise) * 100 }); setCreating(false); setForm({ kind: 'chargeback', payment_id: '', amount_paise: 0, reason: '' }); loadList(); loadStats(); open(data.id); }
    catch (e2) { window.alert(e2?.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };
  const addEvidence = async () => { if (!ev.note && !ev.url) return; setBusy(true); try { await axios.post(`${API_URL}/api/admin/disputes/${openId}/evidence`, ev); setEv({ note: '', url: '' }); open(openId); loadList(); } catch (_) {} setBusy(false); };
  const patch = async (changes) => { setBusy(true); try { await axios.patch(`${API_URL}/api/admin/disputes/${openId}`, changes); open(openId); loadList(); loadStats(); } catch (_) {} setBusy(false); };

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1050, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <Gavel style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Disputes & chargebacks</h1>
          <button onClick={() => { loadList(); loadStats(); }} className="lux-btn lux-btn-ghost ml-auto !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Tile label="Open" value={stats.open} />
            <Tile label="Total" value={stats.total} />
            <Tile label="At risk" value={`₹${stats.amount_at_risk_inr}`} warn={stats.amount_at_risk_paise > 0} />
          </div>
        )}

        {!openId && (
          <>
            <div className="lux-glass p-3 mb-4 flex flex-wrap items-center gap-2">
              <input className="lux-input flex-1 min-w-[160px]" placeholder="Search payment id / reason"
                value={filters.q} onChange={(e) => { setPage(1); setFilters({ ...filters, q: e.target.value }); }} />
              <select className="lux-input" style={{ width: 'auto' }} value={filters.kind} onChange={(e) => { setPage(1); setFilters({ ...filters, kind: e.target.value }); }}>
                <option value="">All kinds</option><option value="chargeback">Chargeback</option><option value="refund_dispute">Refund dispute</option>
              </select>
              <select className="lux-input" style={{ width: 'auto' }} value={filters.status} onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}>
                {STATUSES.map((s) => <option key={s} value={s}>{s || 'All status'}</option>)}
              </select>
              <button onClick={() => setCreating((v) => !v)} className="lux-btn"><Plus className="w-4 h-4" /> New</button>
            </div>
            {creating && (
              <form onSubmit={create} className="lux-glass p-4 mb-4 grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <select className="lux-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                    <option value="chargeback">Chargeback</option><option value="refund_dispute">Refund dispute</option>
                  </select>
                  <input className="lux-input" placeholder="Amount (₹)" type="number" value={form.amount_paise} onChange={(e) => setForm({ ...form, amount_paise: e.target.value })} />
                </div>
                <input className="lux-input" placeholder="Razorpay payment id" value={form.payment_id} onChange={(e) => setForm({ ...form, payment_id: e.target.value })} />
                <textarea className="lux-input" rows={2} placeholder="Reason / notes" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                <div className="flex gap-2"><button type="submit" disabled={busy} className="lux-btn">Create</button><button type="button" onClick={() => setCreating(false)} className="lux-btn lux-btn-ghost">Cancel</button></div>
              </form>
            )}
            <div className="lux-glass overflow-hidden">
              {rows.length === 0 ? <div className="p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>No disputes.</div>
                : rows.map((d) => (
                  <button key={d.id} onClick={() => open(d.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 border-b hover:opacity-90" style={{ borderColor: 'var(--lux-border)' }}>
                    <span className="text-[10px] uppercase px-2 py-1 rounded-full shrink-0" style={{ color: SC[d.status], border: '1px solid var(--lux-border)' }}>{d.status}</span>
                    <div className="min-w-0 flex-1"><div className="truncate" style={{ color: 'var(--lux-text)' }}>{d.kind} · {d.payment_id}</div><div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>₹{(d.amount_paise / 100).toFixed(0)} · {d.reason?.slice(0, 60)}</div></div>
                  </button>
                ))}
            </div>
            <div className="flex items-center justify-between mt-4 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              <span>{meta.total} · page {meta.page}/{meta.pages}</span>
              <div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="lux-btn lux-btn-ghost !px-3 !py-1.5">Prev</button><button disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)} className="lux-btn lux-btn-ghost !px-3 !py-1.5">Next</button></div>
            </div>
          </>
        )}

        {openId && detail && (
          <div>
            <button onClick={() => { setOpenId(null); setDetail(null); }} className="lux-btn lux-btn-ghost mb-4"><ChevronLeft className="w-4 h-4" /> Back</button>
            <div className="lux-glass p-5 mb-4">
              <h2 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{detail.kind} · ₹{(detail.amount_paise / 100).toFixed(0)}</h2>
              <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>{detail.payment_id} · {detail.id}</div>
              <p className="text-sm mt-2" style={{ color: 'var(--lux-text)' }}>{detail.reason}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <select className="lux-input" style={{ width: 'auto' }} value={detail.status} onChange={(e) => patch({ status: e.target.value })}>
                  {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="lux-glass p-4 mb-4">
              <h3 className="font-heading text-sm uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}>Evidence</h3>
              {(detail.evidence || []).length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>None yet.</div>
                : detail.evidence.map((e) => (
                  <div key={e.id} className="text-sm py-1.5 border-t" style={{ color: 'var(--lux-text)', borderColor: 'var(--lux-border)' }}>
                    {e.note} {e.url && <a href={e.url} target="_blank" rel="noreferrer" style={{ color: '#E8C97A' }}><Paperclip className="inline w-3 h-3" /> file</a>}
                    <span className="text-[10px] ml-2" style={{ color: 'var(--lux-text-muted)' }}>{new Date(e.at).toLocaleString()}</span>
                  </div>
                ))}
              <div className="mt-3 grid gap-2">
                <input className="lux-input" placeholder="Evidence note" value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} />
                <div className="flex gap-2">
                  <input className="lux-input flex-1" placeholder="Evidence URL (optional)" value={ev.url} onChange={(e) => setEv({ ...ev, url: e.target.value })} />
                  <button onClick={addEvidence} disabled={busy} className="lux-btn">Add</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Tile({ label, value, warn }) {
  return <div className="lux-glass p-4"><div className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div><div className="font-display text-2xl" style={{ color: warn ? '#ff9a9a' : 'var(--lux-text)' }}>{value}</div></div>;
}
