import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ShieldOff, Trash2, CheckCheck, UserX, RefreshCw } from 'lucide-react';
import '@/styles/luxury.css';

/** SuperAdminModeration — report queue + bulk moderation tools (Phase 10). */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function SuperAdminModeration() {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState('open');
  const [sel, setSel] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [del, setDel] = useState({ target_type: 'post', ids: '' });
  const [acct, setAcct] = useState({ kind: 'photographer', ids: '', status: 'suspended' });
  const [auto, setAuto] = useState(null);

  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/admin/moderation/reports`, { params: { status } }); setReports(data.items || []); setSel(new Set()); } catch (_) {}
  }, [status]);
  const loadAuto = useCallback(async () => {
    try { setAuto((await axios.get(`${API_URL}/api/admin/moderation/auto/status`)).data); } catch (_) {}
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAuto(); }, [loadAuto]);

  const runAutoScreen = async () => {
    setBusy(true);
    try { const { data } = await axios.post(`${API_URL}/api/admin/moderation/auto/rescreen`); setMsg(`Auto-screen: scanned ${data.scanned}, flagged ${data.flagged}.`); load(); loadAuto(); }
    catch (_) { setMsg('Auto-screen failed.'); }
    setBusy(false);
  };

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const resolveSelected = async () => {
    if (!sel.size) return; setBusy(true);
    try { const { data } = await axios.post(`${API_URL}/api/admin/moderation/bulk-resolve-reports`, { report_ids: [...sel] }); setMsg(`Resolved ${data.resolved} report(s).`); load(); }
    catch (_) { setMsg('Bulk resolve failed.'); }
    setBusy(false);
  };
  const bulkDelete = async () => {
    const ids = del.ids.split(/[\s,]+/).filter(Boolean); if (!ids.length) return; setBusy(true);
    try { const { data } = await axios.post(`${API_URL}/api/admin/moderation/bulk-delete`, { target_type: del.target_type, ids }); setMsg(`Deleted ${data.deleted}/${data.requested} ${del.target_type}(s).`); setDel({ ...del, ids: '' }); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Delete failed.'); }
    setBusy(false);
  };
  const bulkStatus = async () => {
    const ids = acct.ids.split(/[\s,]+/).filter(Boolean); if (!ids.length) return; setBusy(true);
    try { const { data } = await axios.post(`${API_URL}/api/admin/moderation/bulk-account-status`, { kind: acct.kind, ids, status: acct.status }); setMsg(`Updated ${data.updated} account(s) → ${data.status}.`); setAcct({ ...acct, ids: '' }); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Update failed.'); }
    setBusy(false);
  };

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <ShieldOff style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Moderation</h1>
          <button onClick={runAutoScreen} disabled={busy} className="lux-btn ml-auto" data-testid="auto-screen-btn"
            title={auto ? `Text screening ${auto.text_screening}; image screening ${auto.image_screening}; ${auto.open_auto_reports} open auto-reports` : 'Run auto-screen'}>
            <ShieldOff className="w-4 h-4" /> Run auto-screen{auto && auto.open_auto_reports > 0 ? ` (${auto.open_auto_reports})` : ''}
          </button>
          <button onClick={load} className="lux-btn lux-btn-ghost !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {msg && <div className="lux-glass p-3 mb-4" style={{ color: '#E8C97A' }}>{msg}</div>}

        {/* Reports queue */}
        <div className="lux-glass p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-heading text-sm uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>Reports</h2>
            <select className="lux-input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option>
            </select>
            <button onClick={resolveSelected} disabled={busy || !sel.size} className="lux-btn ml-auto !px-3 !py-2 !text-xs"><CheckCheck className="w-4 h-4" /> Resolve selected ({sel.size})</button>
          </div>
          {reports.length === 0 ? <div className="text-sm py-3" style={{ color: 'var(--lux-text-muted)' }}>No reports.</div>
            : reports.map((r) => (
              <label key={r.id} className="flex items-center gap-3 py-2 border-t cursor-pointer" style={{ borderColor: 'var(--lux-border)' }}>
                <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: 'var(--lux-text)' }}>{r.target_type} {r.target_id} · {r.reason}</div>
                  <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>by {r.reporter_name || r.reporter} · {r.status}</div>
                </div>
              </label>
            ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Bulk delete content */}
          <div className="lux-glass p-4">
            <h3 className="font-heading text-sm uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}><Trash2 className="inline w-4 h-4" /> Bulk delete content</h3>
            <select className="lux-input mb-2" value={del.target_type} onChange={(e) => setDel({ ...del, target_type: e.target.value })}>
              {['post', 'reel', 'story', 'comment'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea className="lux-input mb-2" rows={2} placeholder="ids (comma or space separated)" value={del.ids} onChange={(e) => setDel({ ...del, ids: e.target.value })} />
            <button onClick={bulkDelete} disabled={busy} className="lux-btn">Delete</button>
          </div>
          {/* Bulk account status */}
          <div className="lux-glass p-4">
            <h3 className="font-heading text-sm uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}><UserX className="inline w-4 h-4" /> Bulk account action</h3>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select className="lux-input" value={acct.kind} onChange={(e) => setAcct({ ...acct, kind: e.target.value })}>
                <option value="photographer">Photographers</option><option value="user">Couples</option>
              </select>
              <select className="lux-input" value={acct.status} onChange={(e) => setAcct({ ...acct, status: e.target.value })}>
                <option value="suspended">Suspend</option><option value="blocked">Block</option><option value="active">Restore</option>
              </select>
            </div>
            <textarea className="lux-input mb-2" rows={2} placeholder="account ids" value={acct.ids} onChange={(e) => setAcct({ ...acct, ids: e.target.value })} />
            <button onClick={bulkStatus} disabled={busy} className="lux-btn">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}
