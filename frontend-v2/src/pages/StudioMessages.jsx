import { useCallback, useEffect, useRef, useState } from 'react';
import StudioModule, {
  Panel, Empty, Toast, InlineError, useFlash, useAsync, Loading, ErrorPanel, relTime,
} from '@/components/StudioModule';
import client from '@/api/client';
import './StudioMessages.css';

// Studio-to-studio direct messages (Pixora DM). One of 54 Pixora capability
// groups the shipped app never surfaced — this is the one photographers
// actually asked for, since it is how referrals and second-shooter bookings
// get arranged.

const dm = {
  threads: () => client.get('/api/pixora/dm/threads'),
  thread: (id) => client.get(`/api/pixora/dm/threads/${id}`),
  send: (payload) => client.post('/api/pixora/dm/send', payload),
  connections: () => client.get('/api/pixora/connections'),
};

export default function StudioMessages() {
  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, flash] = useFlash();
  const endRef = useRef(null);

  const { data, error, loading, reload } = useAsync(
    () => dm.threads().then((r) => r.data).catch(() => ({ threads: [] })),
  );

  const threads = data?.threads || data?.items || (Array.isArray(data) ? data : []);

  const openThread = useCallback(async (id) => {
    setOpenId(id);
    setThread(null);
    setErr(null);
    try {
      const { data: t } = await dm.thread(id);
      setThread(t?.thread || t);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not open that conversation.');
    }
  }, []);

  useEffect(() => {
    if (!openId && threads.length > 0) openThread(threads[0].id);
  }, [threads, openId, openThread]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim() || !openId) return;
    setBusy(true);
    setErr(null);
    try {
      await dm.send({ thread_id: openId, message: body.trim() });
      setBody('');
      const { data: t } = await dm.thread(openId);
      setThread(t?.thread || t);
      flash('Sent.');
      reload();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'That message did not send.');
    } finally { setBusy(false); }
  };

  const messages = thread?.messages || [];

  return (
    <StudioModule
      active="Messages"
      title="Messages"
      sub="Direct conversations with other studios on the community. Couples never appear here — they use the couple access portal."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      {loading && <Loading rows={1} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (threads.length === 0 ? (
        <Panel>
          <Empty
            title="No conversations yet"
            body="Follow a studio in the community and start a conversation from their profile. Messages you receive land here."
            action={<a className="wmod-btn wmod-btn--primary" href="/studio/community">Open community</a>}
          />
        </Panel>
      ) : (
        <div className="smsg-grid">
          <aside className="smsg-list" aria-label="Conversations">
            {threads.map((t) => {
              const on = t.id === openId;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`smsg-thread${on ? ' smsg-thread--on' : ''}`}
                  onClick={() => openThread(t.id)}
                  aria-current={on ? 'true' : undefined}
                >
                  <span className="smsg-thread-name">
                    {t.other_name || t.participant_name || t.title || 'A studio'}
                    {t.unread > 0 && <span className="smsg-unread">{t.unread}</span>}
                  </span>
                  <span className="smsg-thread-last">{String(t.last_message || '').slice(0, 60) || 'No messages yet'}</span>
                  <span className="smsg-thread-time">{relTime(t.updated_at || t.last_message_at)}</span>
                </button>
              );
            })}
          </aside>

          <section className="smsg-pane">
            <InlineError message={err} />
            {!thread ? (
              <div className="wmod-skel" style={{ height: 300 }} />
            ) : (
              <>
                <div className="smsg-messages">
                  {messages.length === 0 ? (
                    <Empty title="No messages yet" body="Say hello." />
                  ) : messages.map((m, i) => {
                    const mine = m.mine ?? m.is_self ?? m.direction === 'out';
                    return (
                      <div key={m.id || i} className={`smsg-bubble${mine ? ' smsg-bubble--mine' : ''}`}>
                        <p className="smsg-bubble-body">{m.message || m.body}</p>
                        <span className="smsg-bubble-time">{relTime(m.created_at)}</span>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>

                <form className="smsg-composer" onSubmit={send}>
                  <label className="wmod-label" htmlFor="smsg-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    Message
                  </label>
                  <input
                    id="smsg-input"
                    data-mj-field
                    className="wmod-input"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write a message…"
                    autoComplete="off"
                  />
                  <button type="submit" className="wmod-btn wmod-btn--primary" disabled={busy || !body.trim()}>
                    {busy ? 'Sending…' : 'Send'}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      ))}

      <Toast message={toast} />
    </StudioModule>
  );
}
