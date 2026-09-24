import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import PanelTabs from '@/components/PanelTabs';
import { MessageSquare, Send, RefreshCw, Plus, Loader2, ArrowLeft } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * StudioMessages — 1:1 direct messages between studios in the community.
 * Reads /api/pixora/dm/*. You can open any existing conversation and reply, or
 * start a new one with any of your accepted connections.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function StudioMessages() {
  const [threads, setThreads] = useState([]);
  const [sel, setSel] = useState(null);          // { id, other_id, other_name }
  const [conv, setConv] = useState(null);         // { messages: [...] }
  const [connections, setConnections] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  const loadThreads = useCallback(async () => {
    try { setThreads((await axios.get(`${API_URL}/api/pixora/dm/threads`)).data.threads || []); } catch (_) {}
    setLoading(false);
  }, []);

  const openThread = useCallback(async (t) => {
    setSel(t);
    try { setConv((await axios.get(`${API_URL}/api/pixora/dm/threads/${t.id}`)).data); } catch (_) { setConv({ messages: [] }); }
    loadThreads(); // refresh unread badges after marking read
  }, [loadThreads]);

  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/connections`).then((r) => setConnections(r.data.accepted || [])).catch(() => {});
  }, []);
  // light polling so a new reply appears without a manual refresh
  useEffect(() => {
    const iv = setInterval(() => { loadThreads(); if (sel) openThread(sel); }, 20000);
    return () => clearInterval(iv);
  }, [sel, loadThreads, openThread]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv]);

  const send = async () => {
    const txt = body.trim();
    if (!txt || !sel) return;
    setSending(true);
    try {
      await axios.post(`${API_URL}/api/pixora/dm/send`, { recipient_id: sel.other_id, body: txt });
      setBody('');
      await openThread(sel);
    } catch (_) {}
    setSending(false);
  };

  const startWith = async (c) => {
    setShowNew(false);
    // find an existing thread for this connection, else open a virtual one
    const existing = threads.find((t) => t.other_id === c.other_id);
    if (existing) { openThread(existing); return; }
    setSel({ id: null, other_id: c.other_id, other_name: c.other_name });
    setConv({ messages: [], other_name: c.other_name });
  };

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <PanelTabs active="/studio/messages" />
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Messages</h1>
          <button onClick={() => setShowNew((v) => !v)} className="ml-auto lux-btn lux-btn-ghost !px-3 !py-2 text-xs flex items-center gap-1">
            <Plus className="w-4 h-4" /> New
          </button>
          <button onClick={loadThreads} className="lux-btn lux-btn-ghost !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
        </div>

        {showNew && (
          <div className="lux-glass p-3 mb-4">
            <div className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--lux-text-muted)' }}>Message a connection</div>
            {connections.length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Connect with other studios first — accepted connections appear here.</div>
              : <div className="flex flex-wrap gap-2">
                  {connections.map((c) => (
                    <button key={c.other_id} onClick={() => startWith(c)} className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(212,175,55,0.14)', color: '#E8C97A' }}>{c.other_name}</button>
                  ))}
                </div>}
          </div>
        )}

        <div className="grid md:grid-cols-[300px_1fr] gap-4">
          {/* thread list */}
          <div className={`lux-glass p-2 ${sel ? 'hidden md:block' : ''}`} style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {loading ? <div className="p-6 text-center text-xs" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div>
              : threads.length === 0 ? <div className="p-6 text-center text-xs" style={{ color: 'var(--lux-text-muted)' }}>No conversations yet. Tap “New”.</div>
              : threads.map((t) => (
                <button key={t.id} onClick={() => openThread(t)} className="w-full text-left px-3 py-2.5 rounded-xl mb-1 transition"
                  style={{ background: sel?.id === t.id ? 'rgba(212,175,55,0.12)' : 'transparent' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--lux-text)' }}>{t.other_name}</span>
                    {t.unread > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#E8C97A', color: '#0E0A06' }}>{t.unread}</span>}
                  </div>
                  {t.last_body && <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--lux-text-muted)' }}>{t.last_sender === t.other_id ? '' : 'You: '}{t.last_body}</div>}
                </button>
              ))}
          </div>

          {/* conversation */}
          <div className="lux-glass p-3 flex flex-col" style={{ minHeight: '60vh', maxHeight: '60vh' }}>
            {!sel ? <div className="flex-1 grid place-items-center text-xs" style={{ color: 'var(--lux-text-muted)' }}>Select a conversation</div>
              : (
                <>
                  <div className="flex items-center gap-2 pb-2 mb-2 border-b" style={{ borderColor: 'var(--lux-border)' }}>
                    <button onClick={() => { setSel(null); setConv(null); }} className="md:hidden"><ArrowLeft className="w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} /></button>
                    <span className="font-medium" style={{ color: 'var(--lux-text)' }}>{sel.other_name}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                    {(conv?.messages || []).length === 0 ? <div className="flex-1 grid place-items-center text-xs" style={{ color: 'var(--lux-text-muted)' }}>Say hello 👋</div>
                      : conv.messages.map((m) => (
                        <div key={m.id} className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm ${m.mine ? 'self-end' : 'self-start'}`}
                          style={{ background: m.mine ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'rgba(255,255,255,0.06)', color: m.mine ? '#0E0A06' : 'var(--lux-text)' }}>
                          {m.body}
                        </div>
                      ))}
                    <div ref={endRef} />
                  </div>
                  <div className="flex items-center gap-2 pt-2 mt-2 border-t" style={{ borderColor: 'var(--lux-border)' }}>
                    <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                      placeholder="Write a message…" className="lux-input flex-1" data-testid="dm-input" />
                    <button onClick={send} disabled={sending || !body.trim()} className="lux-btn !px-4 !py-2 disabled:opacity-50" data-testid="dm-send">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
