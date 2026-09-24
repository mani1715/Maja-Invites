import React, { useState } from 'react';
import axios from 'axios';
import { Search, ShieldAlert, Monitor, LogIn, KeyRound, Globe, CreditCard, Crown, Flag, Gavel, ChevronLeft } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * SuperAdminUserInvestigation — read-only 360° account view (Phase 5).
 * Search a couple/photographer, then see devices, login history, failed logins,
 * OTP failures, IP history, payments, subscriptions, reports they filed, and
 * moderation actions taken against them. Backed by /api/admin/investigation/*.
 * (Opening a report is itself audit-logged on the server.)
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function SuperAdminUserInvestigation() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true); setErr('');
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/investigation/search`, { params: { q } });
      setResults(data.results || []);
    } catch (_) { setErr('Search failed.'); }
    setSearching(false);
  };

  const open = async (r) => {
    setLoading(true); setErr(''); setReport(null);
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/investigation/subject/${r.kind}/${encodeURIComponent(r.id)}`);
      setReport(data);
    } catch (e) { setErr(e?.response?.status === 404 ? 'Subject not found.' : 'Could not load report.'); }
    setLoading(false);
  };

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1050, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <ShieldAlert style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>User investigation</h1>
        </div>

        {!report && (
          <>
            <form onSubmit={search} className="lux-glass p-3 mb-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
                <input className="lux-input pl-9" placeholder="Search by name, email, phone or id…"
                  value={q} onChange={(e) => setQ(e.target.value)} data-testid="investigation-search" />
              </div>
              <button type="submit" className="lux-btn">Search</button>
            </form>
            {err && <div className="lux-glass p-3 mb-3" style={{ color: '#ff9a9a' }}>{err}</div>}
            <div className="grid gap-2">
              {searching ? <div className="lux-glass p-6 text-center" style={{ color: 'var(--lux-text-muted)' }}>Searching…</div>
                : results.map((r) => (
                  <button key={`${r.kind}:${r.id}`} onClick={() => open(r)}
                    className="lux-glass p-4 text-left flex items-center gap-3 hover:opacity-90"
                    data-testid={`investigation-result-${r.id}`}>
                    <span className="text-[10px] uppercase px-2 py-1 rounded-full shrink-0"
                      style={{ color: r.kind === 'photographer' ? '#E8C97A' : '#8Fb3ff', border: '1px solid var(--lux-border)' }}>
                      {r.kind}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate" style={{ color: 'var(--lux-text)' }}>{r.name || r.id}</div>
                      <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>{r.email || '—'} · {r.phone || '—'}</div>
                    </div>
                    <span className="text-xs" style={{ color: r.status === 'active' ? '#7BD88F' : '#ff9a9a' }}>{r.status}</span>
                  </button>
                ))}
              {!searching && results.length === 0 && q && <div className="lux-glass p-6 text-center" style={{ color: 'var(--lux-text-muted)' }}>No matches.</div>}
            </div>
          </>
        )}

        {loading && <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading report…</div>}

        {report && (
          <div>
            <button onClick={() => setReport(null)} className="lux-btn lux-btn-ghost mb-4"><ChevronLeft className="w-4 h-4" /> New search</button>

            {/* Identity + counts */}
            <div className="lux-glass p-5 mb-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>{report.subject.name || report.subject.id}</h2>
                <span className="text-[10px] uppercase px-2 py-1 rounded-full"
                  style={{ color: report.subject.kind === 'photographer' ? '#E8C97A' : '#8Fb3ff', border: '1px solid var(--lux-border)' }}>{report.subject.kind}</span>
                <span className="text-xs" style={{ color: report.subject.status === 'active' ? '#7BD88F' : '#ff9a9a' }}>{report.subject.status}</span>
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                {report.subject.email || '—'} · {report.subject.phone || '—'} · id {report.subject.id}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mt-4">
                {Object.entries(report.counts).map(([k, v]) => (
                  <div key={k} className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="font-display text-xl" style={{ color: (k.includes('failed') || k.includes('moderation')) && v > 0 ? '#E8C97A' : 'var(--lux-text)' }}>{v}</div>
                    <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>{k.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
            </div>

            <Section icon={Monitor} title="Devices & browsers" rows={report.devices}
              render={(d) => `${d.ua || 'unknown'} · ${d.ip || '—'} · ${d.revoked ? 'revoked' : 'active'} · ${fmt(d.last_active)}`} />
            <Section icon={LogIn} title="Login history" rows={report.login_history}
              render={(a) => `${a.action} · ${a.ip || '—'} · ${fmt(a.created_at)}`} />
            <Section icon={KeyRound} title="Failed logins & OTP" rows={report.failed_logins} danger
              render={(a) => `${a.kind} · ${a.reason || 'failed'} · ${a.ip || '—'} · ${fmt(a.created_at)}`} />
            <Section icon={Globe} title="IP history" rows={report.ip_history}
              render={(e) => `${e.ip} · seen ${e.count}× · last ${fmt(e.last_seen)}`} />
            <Section icon={CreditCard} title="Payments" rows={report.payments}
              render={(p) => `₹${((p.amount || 0) / 100).toFixed(0)} · ${p.status || p.product || ''} · ${fmt(p.created_at)}`} />
            <Section icon={Crown} title="Subscriptions" rows={report.subscriptions}
              render={(s) => `${s.product || 'plan'} · ${s.status || ''} · ${fmt(s.created_at)}`} />
            <Section icon={Flag} title="Reports filed" rows={report.reports_filed}
              render={(r) => `${r.target_type} ${r.target_id} · ${r.reason} · ${r.status}`} />
            <Section icon={Gavel} title="Moderation actions (against this account)" rows={report.moderation_actions} danger
              render={(a) => `${a.action} · by ${a.actor_id || '—'} · ${fmt(a.created_at)}`} />
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(iso) { try { return iso ? new Date(iso).toLocaleString() : '—'; } catch (_) { return '—'; } }

function Section({ icon: Icon, title, rows, render, danger }) {
  const [open, setOpen] = useState(true);
  const list = rows || [];
  return (
    <div className="lux-glass mb-3 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-4 py-3 flex items-center gap-2 text-left">
        <Icon className="w-4 h-4" style={{ color: danger && list.length ? '#E8C97A' : 'var(--lux-text-muted)' }} />
        <span className="font-heading" style={{ color: 'var(--lux-text)' }}>{title}</span>
        <span className="ml-auto text-xs" style={{ color: 'var(--lux-text-muted)' }}>{list.length}</span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          {list.length === 0 ? <div className="text-xs py-2" style={{ color: 'var(--lux-text-muted)' }}>None.</div>
            : list.map((r, i) => (
              <div key={r.id || i} className="text-xs py-1.5 border-t" style={{ color: 'var(--lux-text)', borderColor: 'var(--lux-border)' }}>
                {render(r)}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
