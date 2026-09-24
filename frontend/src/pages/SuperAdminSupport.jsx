import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { LifeBuoy, Search, ChevronLeft, Send, RefreshCw, UserCheck } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * SuperAdminSupport — the admin support queue (Phase 3). Filters + search +
 * pagination over /api/admin/support/tickets, stat tiles, a thread view with
 * internal notes, and assign / priority / status / reopen / merge controls.
 * Uses the admin bearer axios default (set by AuthContext).
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const STATUSES = ['', 'open', 'reopened', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['', 'low', 'normal', 'high', 'urgent'];
const CATEGORIES = ['', 'billing', 'refund', 'dispute', 'technical', 'account',
  'invitation', 'gallery', 'portfolio', 'community', 'other'];
const SC = { open: '#E8C97A', reopened: '#E8C97A', pending: '#8Fb3ff', resolved: '#7BD88F', closed: 'var(--lux-text-muted)' };

export default function SuperAdminSupport() {
  const { admin } = useAuth();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ status: '', priority: '', category: '', assignee: '', q: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadStats = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/admin/support/stats`); setStats(data); } catch (_) {}
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: 20 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await axios.get(`${API_URL}/api/admin/support/tickets`, { params });
      setRows(data.items || []);
      setMeta({ total: data.total, page: data.page, pages: data.pages });
    } catch (_) {}
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadList(); }, [loadList]);

  const openTicket = async (id) => {
    setOpenId(id); setDetail(null); setReply(''); setInternal(false);
    try { const { data } = await axios.get(`${API_URL}/api/admin/support/tickets/${id}`); setDetail(data); } catch (_) {}
  };

  const patch = async (changes) => {
    setBusy(true);
    try {
      await axios.patch(`${API_URL}/api/admin/support/tickets/${openId}`, changes);
      await openTicket(openId); loadList(); loadStats();
    } catch (_) {}
    setBusy(false);
  };

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/admin/support/tickets/${openId}/messages`, { body: reply, internal });
      setReply(''); await openTicket(openId); loadList(); loadStats();
    } catch (_) {}
    setBusy(false);
  };

  const doMerge = async () => {
    const into = window.prompt('Merge THIS ticket into which ticket id?');
    if (!into) return;
    setBusy(true);
    try { await axios.post(`${API_URL}/api/admin/support/tickets/${openId}/merge`, { into_ticket_id: into.trim() }); setOpenId(null); loadList(); }
    catch (e) { window.alert(e?.response?.data?.detail || 'Merge failed'); }
    setBusy(false);
  };

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <LifeBuoy style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Support queue</h1>
          <button onClick={() => { loadList(); loadStats(); }} className="lux-btn lux-btn-ghost ml-auto !px-3 !py-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Stat tiles */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Tile label="Open" value={stats.open} />
            <Tile label="Avg first response" value={stats.avg_first_response_hours != null ? `${stats.avg_first_response_hours}h` : '—'} />
            <Tile label="Avg resolution" value={stats.avg_resolution_hours != null ? `${stats.avg_resolution_hours}h` : '—'} />
            <Tile label="SLA breaches" value={stats.sla_breaches} warn={stats.sla_breaches > 0} />
          </div>
        )}

        {!openId && (
          <>
            {/* Filters */}
            <div className="lux-glass p-3 mb-4 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
                <input className="lux-input pl-9" placeholder="Search subject / name / email / id"
                  value={filters.q} onChange={(e) => { setPage(1); setFilters({ ...filters, q: e.target.value }); }} />
              </div>
              <Sel value={filters.status} onChange={(v) => { setPage(1); setFilters({ ...filters, status: v }); }} opts={STATUSES} label="status" />
              <Sel value={filters.priority} onChange={(v) => { setPage(1); setFilters({ ...filters, priority: v }); }} opts={PRIORITIES} label="priority" />
              <Sel value={filters.category} onChange={(v) => { setPage(1); setFilters({ ...filters, category: v }); }} opts={CATEGORIES} label="category" />
              <button onClick={() => { setPage(1); setFilters({ ...filters, assignee: filters.assignee === 'unassigned' ? '' : 'unassigned' }); }}
                className={`lux-chip ${filters.assignee === 'unassigned' ? 'is-active' : ''}`}>Unassigned</button>
            </div>

            <div className="lux-glass overflow-hidden">
              {loading ? (
                <div className="p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div>
              ) : rows.length === 0 ? (
                <div className="p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>No tickets match.</div>
              ) : rows.map((t) => (
                <button key={t.id} onClick={() => openTicket(t.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 border-b hover:opacity-90"
                  style={{ borderColor: 'var(--lux-border)' }} data-testid={`admin-ticket-${t.id}`}>
                  <span className="text-[10px] uppercase px-2 py-1 rounded-full shrink-0"
                    style={{ color: SC[t.status], border: '1px solid var(--lux-border)' }}>{t.status}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ color: 'var(--lux-text)' }}>{t.subject}</div>
                    <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                      {(t.requester?.name || t.requester_kind)} · {t.category} · {t.priority}
                      {t.assignee_name ? ` · ${t.assignee_name}` : ' · unassigned'}
                    </div>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--lux-text-muted)' }}>
                    {new Date(t.last_message_at || t.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              <span>{meta.total} tickets · page {meta.page}/{meta.pages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="lux-btn lux-btn-ghost !px-3 !py-1.5">Prev</button>
                <button disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)} className="lux-btn lux-btn-ghost !px-3 !py-1.5">Next</button>
              </div>
            </div>
          </>
        )}

        {openId && (
          <div>
            <button onClick={() => { setOpenId(null); setDetail(null); }} className="lux-btn lux-btn-ghost mb-4">
              <ChevronLeft className="w-4 h-4" /> Back to queue
            </button>
            {!detail ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : (
              <div className="grid md:grid-cols-3 gap-4">
                {/* Thread */}
                <div className="md:col-span-2">
                  <div className="lux-glass p-4 mb-3">
                    <h2 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{detail.subject}</h2>
                    <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                      {detail.requester?.name} ({detail.requester?.email || detail.requester_kind}) · {detail.id}
                    </div>
                  </div>
                  <div className="grid gap-2 mb-3">
                    {(detail.messages || []).map((m) => (
                      <div key={m.id} className="lux-glass p-3"
                        style={{ borderColor: m.internal ? 'rgba(255,180,80,0.5)' : m.author?.kind === 'admin' ? 'rgba(212,175,55,0.4)' : 'var(--lux-border)',
                                 background: m.internal ? 'rgba(255,180,80,0.06)' : undefined }}>
                        <div className="text-[11px] mb-1" style={{ color: m.internal ? '#ffb450' : m.author?.kind === 'admin' ? '#E8C97A' : 'var(--lux-text-muted)' }}>
                          {m.internal ? '🔒 Internal note' : m.author?.kind === 'admin' ? 'Support' : (m.author?.name || 'Requester')} · {new Date(m.created_at).toLocaleString()}
                        </div>
                        <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--lux-text)' }}>{m.body}</div>
                      </div>
                    ))}
                  </div>
                  <div className="lux-glass p-3">
                    <textarea className="lux-input" rows={3} placeholder={internal ? 'Internal note (not shown to requester)…' : 'Reply to requester…'}
                      value={reply} onChange={(e) => setReply(e.target.value)} data-testid="admin-reply" />
                    <div className="mt-2 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                        <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note
                      </label>
                      <button onClick={send} disabled={busy || !reply.trim()} className="lux-btn"><Send className="w-4 h-4" /> Send</button>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="lux-glass p-4 h-fit grid gap-3">
                  <Field label="Status">
                    <select className="lux-input" value={detail.status} onChange={(e) => patch({ status: e.target.value })} disabled={busy}>
                      {['open', 'pending', 'resolved', 'closed', 'reopened'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select className="lux-input" value={detail.priority} onChange={(e) => patch({ priority: e.target.value })} disabled={busy}>
                      {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Assignee">
                    <div className="text-sm mb-2" style={{ color: 'var(--lux-text)' }}>{detail.assignee_name || 'Unassigned'}</div>
                    <div className="flex gap-2">
                      <button onClick={() => patch({ assignee_admin_id: admin?.id })} disabled={busy || !admin?.id} className="lux-btn !px-3 !py-1.5 !text-xs">
                        <UserCheck className="w-3.5 h-3.5" /> Assign me
                      </button>
                      {detail.assignee_admin_id && (
                        <button onClick={() => patch({ assignee_admin_id: null })} disabled={busy} className="lux-btn lux-btn-ghost !px-3 !py-1.5 !text-xs">Unassign</button>
                      )}
                    </div>
                  </Field>
                  <div className="border-t pt-3 flex flex-wrap gap-2" style={{ borderColor: 'var(--lux-border)' }}>
                    <button onClick={() => patch({ status: 'reopened' })} disabled={busy} className="lux-btn lux-btn-ghost !px-3 !py-1.5 !text-xs">Reopen</button>
                    <button onClick={doMerge} disabled={busy} className="lux-btn lux-btn-ghost !px-3 !py-1.5 !text-xs">Merge…</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, warn }) {
  return (
    <div className="lux-glass p-4">
      <div className="text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
      <div className="font-display text-2xl" style={{ color: warn ? '#ff9a9a' : 'var(--lux-text)' }}>{value}</div>
    </div>
  );
}
function Sel({ value, onChange, opts, label }) {
  return (
    <select className="lux-input" style={{ width: 'auto' }} value={value} onChange={(e) => onChange(e.target.value)}>
      {opts.map((o) => <option key={o} value={o}>{o || `All ${label}`}</option>)}
    </select>
  );
}
function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
      {children}
    </div>
  );
}
