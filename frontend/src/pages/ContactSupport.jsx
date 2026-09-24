import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { LifeBuoy, Send, ChevronLeft, Plus } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * ContactSupport — the in-app support entry for BOTH couples (cookie session)
 * and photographers (bearer). Backed by /api/support/* (get_current_buyer accepts
 * either). Create a ticket, see your tickets, open a thread, reply. Public/internal
 * notes are handled server-side; requesters only ever see public messages.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const withCreds = { withCredentials: true };   // send the couple's session cookie

const CATEGORIES = [
  ['other', 'General'], ['billing', 'Billing'], ['refund', 'Refund'],
  ['invitation', 'Invitation'], ['gallery', 'Photos / gallery'],
  ['portfolio', 'Portfolio'], ['community', 'Community'], ['account', 'Account'],
  ['technical', 'Something broken'],
];
const PRIORITIES = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']];
const STATUS_COLOR = {
  open: '#E8C97A', reopened: '#E8C97A', pending: '#8Fb3ff',
  resolved: '#7BD88F', closed: 'var(--lux-text-muted)',
};

export default function ContactSupport() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'other', priority: 'normal', body: '' });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/support/tickets/mine`, withCreds);
      setTickets(data.items || []);
      setAuthed(true);
    } catch (e) {
      if (e?.response?.status === 401) setAuthed(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);

  const openTicket = async (id) => {
    setOpenId(id); setDetail(null); setReply('');
    try {
      const { data } = await axios.get(`${API_URL}/api/support/tickets/${id}`, withCreds);
      setDetail(data);
    } catch (_) { setErr('Could not load that ticket.'); }
  };

  const submitNew = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.subject.trim() || !form.body.trim()) { setErr('Please add a subject and a message.'); return; }
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/support/tickets`, form, withCreds);
      setCreating(false);
      setForm({ subject: '', category: 'other', priority: 'normal', body: '' });
      await loadMine();
      openTicket(data.id);
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not send. Please try again.');
    }
    setBusy(false);
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/support/tickets/${openId}/messages`, { body: reply }, withCreds);
      setReply('');
      await openTicket(openId);
      loadMine();
    } catch (_) { setErr('Could not send your reply.'); }
    setBusy(false);
  };

  if (!authed) {
    return (
      <Shell>
        <div className="lux-glass p-8 text-center" style={{ maxWidth: 460, margin: '10vh auto' }}>
          <LifeBuoy className="mx-auto mb-3" style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>Contact support</h1>
          <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
            Please sign in so we can link your request to your account.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/?signin=1&return=/support" className="lux-btn no-underline">Sign in</Link>
            <Link to="/studio/login" className="lux-btn lux-btn-ghost no-underline">Photographer login</Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {!openId && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="lux-eyebrow block mb-2">◆ Support</span>
                <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>How can we help?</h1>
              </div>
              <button onClick={() => setCreating((v) => !v)} className="lux-btn" data-testid="support-new">
                <Plus className="w-4 h-4" /> New request
              </button>
            </div>

            {creating && (
              <form onSubmit={submitNew} className="lux-glass p-5 mb-6 grid gap-3" data-testid="support-form">
                <input className="lux-input" placeholder="Subject" maxLength={160}
                  value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <select className="lux-input" value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <select className="lux-input" value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l} priority</option>)}
                  </select>
                </div>
                <textarea className="lux-input" rows={5} placeholder="Tell us what's happening…" maxLength={5000}
                  value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                {err && <p className="text-sm" style={{ color: '#ff9a9a' }}>{err}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="lux-btn"><Send className="w-4 h-4" /> Send</button>
                  <button type="button" onClick={() => setCreating(false)} className="lux-btn lux-btn-ghost">Cancel</button>
                </div>
              </form>
            )}

            <h2 className="font-heading text-sm tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--lux-text-muted)' }}>
              Your requests
            </h2>
            {loading ? (
              <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div>
            ) : tickets.length === 0 ? (
              <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>
                No requests yet. Tap “New request” and we’ll get back to you.
              </div>
            ) : (
              <div className="grid gap-2">
                {tickets.map((t) => (
                  <button key={t.id} onClick={() => openTicket(t.id)}
                    className="lux-glass p-4 text-left flex items-center justify-between gap-3 hover:opacity-90"
                    data-testid={`support-ticket-${t.id}`}>
                    <div className="min-w-0">
                      <div className="truncate" style={{ color: 'var(--lux-text)' }}>{t.subject}</div>
                      <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                        {t.category} · {new Date(t.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="text-[10px] tracking-wide uppercase px-2 py-1 rounded-full shrink-0"
                      style={{ color: STATUS_COLOR[t.status] || 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}>
                      {t.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {openId && (
          <div>
            <button onClick={() => { setOpenId(null); setDetail(null); }} className="lux-btn lux-btn-ghost mb-4">
              <ChevronLeft className="w-4 h-4" /> All requests
            </button>
            {!detail ? (
              <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div>
            ) : (
              <>
                <div className="lux-glass p-5 mb-4">
                  <h1 className="font-display text-2xl mb-1" style={{ color: 'var(--lux-text)' }}>{detail.subject}</h1>
                  <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                    {detail.category} · {detail.priority} priority ·{' '}
                    <span style={{ color: STATUS_COLOR[detail.status] }}>{detail.status}</span>
                  </div>
                </div>
                <div className="grid gap-3 mb-4">
                  {(detail.messages || []).map((m) => {
                    const mine = m.author?.kind !== 'admin';
                    return (
                      <div key={m.id} className="lux-glass p-4"
                        style={{ borderColor: mine ? 'var(--lux-border)' : 'rgba(212,175,55,0.4)' }}>
                        <div className="text-[11px] mb-1" style={{ color: mine ? 'var(--lux-text-muted)' : '#E8C97A' }}>
                          {mine ? 'You' : 'MAJA Support'} · {new Date(m.created_at).toLocaleString()}
                        </div>
                        <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--lux-text)' }}>{m.body}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="lux-glass p-4">
                  <textarea className="lux-input" rows={3} placeholder="Write a reply…" maxLength={5000}
                    value={reply} onChange={(e) => setReply(e.target.value)} data-testid="support-reply" />
                  <div className="mt-2 flex justify-end">
                    <button onClick={sendReply} disabled={busy || !reply.trim()} className="lux-btn">
                      <Send className="w-4 h-4" /> Send reply
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {err && !creating && <p className="text-sm mt-3" style={{ color: '#ff9a9a' }}>{err}</p>}
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-10 md:py-14">{children}</div>
    </div>
  );
}
