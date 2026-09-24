import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Support inbox. The backend and this console both existed; the shipped app
// had neither, and the contact page composed a mailto: instead — so tickets
// were created by the API and then never read by anyone (audit H4).

const STATES = [
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Waiting on us' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
];

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export default function AdminSupport() {
  const [status, setStatus] = useState('open');
  const [openId, setOpenId] = useState(null);
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.supportTickets(status === 'all' ? {} : { status }).then((r) => r.data),
      api.supportStats().then((r) => r.data).catch(() => null),
    ]).then(([tickets, stats]) => ({ tickets, stats })),
    [status],
  );

  const tickets = data?.tickets?.tickets || data?.tickets?.items || data?.tickets || [];
  const stats = data?.stats || {};

  return (
    <AdminModule
      active="Support"
      title="Support"
      sub="Tickets raised by studios and buyers. Replying here is what the requester sees."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Open', value: loading ? '—' : numberFmt.format(stats.open ?? tickets.length) },
        { label: 'Waiting on us', value: loading ? '—' : numberFmt.format(stats.pending ?? 0) },
        { label: 'Resolved', value: loading ? '—' : numberFmt.format(stats.resolved ?? 0) },
        { label: 'Urgent', value: loading ? '—' : numberFmt.format(stats.urgent ?? tickets.filter((t) => t.priority === 'urgent').length) },
      ]}
      />

      <Segmented ariaLabel="Ticket status" value={status} onChange={setStatus} options={STATES} />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (Array.isArray(tickets) && tickets.length > 0 ? (
        tickets.map((t) => (
          <Ticket
            key={t.id || t.ticket_id}
            t={t}
            open={openId === (t.id || t.ticket_id)}
            onToggle={() => setOpenId(openId === (t.id || t.ticket_id) ? null : (t.id || t.ticket_id))}
            reload={reload}
            flash={flash}
          />
        ))
      ) : (
        <Panel>
          <Empty
            title={status === 'open' ? 'No open tickets' : 'Nothing here'}
            body={status === 'open'
              ? 'Nobody is waiting on a reply. New tickets appear here as soon as they are raised.'
              : 'No tickets in this state.'}
          />
        </Panel>
      ))}

      <Toast message={toast} />
    </AdminModule>
  );
}

function Ticket({ t, open, onToggle, reload, flash }) {
  const id = t.id || t.ticket_id;
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [thread, setThread] = useState(null);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not go through.');
    } finally { setBusy(null); }
  };

  const loadThread = async () => {
    onToggle();
    if (open || thread) return;
    setBusy('thread');
    try {
      const { data } = await api.supportTicket(id);
      setThread(data?.ticket || data);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not open the conversation.');
    } finally { setBusy(null); }
  };

  const sendReply = () => run('reply', async () => {
    await api.supportReply(id, reply.trim());
    setReply('');
    const { data } = await api.supportTicket(id);
    setThread(data?.ticket || data);
  }, 'Reply sent.');

  const messages = thread?.messages || t.messages || [];
  const resolved = t.status === 'resolved' || t.status === 'closed';

  return (
    <Panel
      title={t.subject || `Ticket ${id}`}
      sub={`${t.requester_name || t.user_name || t.email || 'Unknown requester'} · ${t.category || 'general'} · opened ${relTime(t.created_at)}`}
      actions={(
        <>
          <span className={`wmod-pill wmod-pill--${resolved ? 'yes' : t.priority === 'urgent' ? 'no' : 'maybe'}`}>
            {resolved ? 'Resolved' : t.status || 'open'}
          </span>
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={loadThread} disabled={busy === 'thread'}>
            {open ? 'Collapse' : busy === 'thread' ? 'Opening…' : 'Open'}
          </button>
        </>
      )}
    >
      <InlineError message={err} />

      {!open ? (
        <p style={{ fontSize: 13.5, color: 'var(--mj-muted)', margin: 0, overflowWrap: 'anywhere' }}>
          {(t.body || t.message || t.last_message || '').slice(0, 220) || 'No message body.'}
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            {messages.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'var(--mj-muted)', margin: 0 }}>{t.body || t.message || 'No messages.'}</p>
            ) : messages.map((m, i) => {
              const staff = m.author_role === 'admin' || m.is_staff || m.from === 'admin';
              return (
                <div
                  key={m.id || i}
                  style={{
                    padding: '12px 14px', marginBottom: 8, borderRadius: 'var(--mj-radius-card-inner)',
                    background: staff ? 'var(--mj-section)' : 'var(--mj-card)',
                    border: `1px solid ${staff ? 'var(--mj-border-accent)' : 'var(--mj-border)'}`,
                  }}
                >
                  <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: staff ? 'var(--mj-primary)' : 'var(--mj-muted)', margin: '0 0 6px' }}>
                    {staff ? 'MAJA' : (m.author_name || 'Requester')} · {relTime(m.created_at)}
                  </p>
                  <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, overflowWrap: 'anywhere' }}>{m.message || m.body}</p>
                </div>
              );
            })}
          </div>

          <div className="wmod-field" style={{ marginBottom: 12 }}>
            <label className="wmod-label" htmlFor={`reply-${id}`}>Reply</label>
            <textarea
              id={`reply-${id}`}
              data-mj-field
              className="wmod-input"
              rows={3}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write back to the requester…"
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="wmod-btn wmod-btn--primary" onClick={sendReply} disabled={busy === 'reply' || !reply.trim()}>
              {busy === 'reply' ? 'Sending…' : 'Send reply'}
            </button>

            <select
              data-mj-field
              className="wmod-input"
              style={{ minHeight: 44, width: 'auto' }}
              value={t.priority || 'normal'}
              onChange={(e) => run('prio', () => api.supportUpdate(id, { priority: e.target.value }), 'Priority updated.')}
              disabled={busy === 'prio'}
              aria-label="Priority"
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            {resolved ? (
              <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => run('reopen', () => api.supportReopen(id), 'Ticket reopened.')} disabled={busy === 'reopen'}>
                Reopen
              </button>
            ) : (
              <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => run('resolve', () => api.supportUpdate(id, { status: 'resolved' }), 'Ticket resolved.')} disabled={busy === 'resolve'}>
                Mark resolved
              </button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
