// CommunityMedia (Phase 8, CRITICAL-4) — Reels & Stories creation UI, using the
// EXISTING backend endpoints (no backend rebuild):
//   upload:  POST /api/pixora/media/upload   (multipart) -> {url, size_bytes, kind}
//   reel:    POST /api/pixora/reels          {url, size_bytes, caption}
//   story:   POST /api/pixora/stories        {url, size_bytes, caption}
// Premium is enforced server-side; a 403 shows an upgrade prompt (no UI removed).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Film, CirclePlay, Upload, Loader2, Trash2, Lock, Plus, Clock } from 'lucide-react';
import StorageMeter from '@/components/StorageMeter';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

function UpgradeNote({ what }) {
  return (
    <div className="lux-glass p-6 text-center" data-testid={`upgrade-${what}`}>
      <Lock className="w-6 h-6 mx-auto mb-2" style={{ color: '#E8C97A' }} />
      <div className="font-display text-lg mb-1" style={{ color: 'var(--lux-text)' }}>{what} are a Premium feature</div>
      <p className="text-sm mb-3" style={{ color: 'var(--lux-text-muted)' }}>
        Upgrade to Premium to publish {what.toLowerCase()}.
      </p>
      <a href="/studio/plans" className="lux-btn inline-flex text-sm">Upgrade plan</a>
    </div>
  );
}

// Shared composer: pick a file → upload → create. `kind`: 'reel' | 'story'.
function Composer({ kind, accept, onCreated }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [locked, setLocked] = useState(false);

  const submit = useCallback(async () => {
    if (!file || busy) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await axios.post(`${API_URL}/api/pixora/media/upload`, fd, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
      });
      const { url, size_bytes } = up.data;
      const endpoint = kind === 'reel' ? 'reels' : 'stories';
      // A reel's category + tags (+ any #hashtags in the caption) power the adaptive
      // Reels feed — viewers who watch this kind of reel get shown more like it.
      const tagList = tags.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
      const body = kind === 'reel'
        ? { url, size_bytes, caption, category, tags: tagList }
        : { url, size_bytes, caption, type: /^video\//.test(file.type) || /\.(mp4|mov|webm|m4v|avi)$/i.test(file.name) ? 'video' : 'photo' };
      const { data } = await axios.post(`${API_URL}/api/pixora/${endpoint}`,
        body, { headers: authHeaders() });
      setFile(null); setCaption(''); setCategory(''); setTags(''); if (fileRef.current) fileRef.current.value = '';
      onCreated(data[kind] || data);
    } catch (e) {
      const code = e?.response?.status;
      if (code === 403) setLocked(true);
      else setErr(e?.response?.data?.detail || 'Upload failed. Please try again.');
    } finally { setBusy(false); }
  }, [file, caption, category, tags, busy, kind, onCreated]);

  if (locked) return <UpgradeNote what={kind === 'reel' ? 'Reels' : 'Stories'} />;

  return (
    <div className="lux-glass p-4" data-testid={`composer-${kind}`}>
      <div className="flex items-center gap-2 mb-3">
        <Plus className="w-4 h-4" style={{ color: '#E8C97A' }} />
        <span className="lux-eyebrow">New {kind}</span>
      </div>
      <input ref={fileRef} type="file" accept={accept} data-testid={`file-${kind}`}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="block w-full text-sm mb-2" style={{ color: 'var(--lux-text-muted)' }} />
      <input value={caption} onChange={(e) => setCaption(e.target.value)}
        placeholder={kind === 'reel' ? 'Caption — add #candid #haldi to help it reach the right couples' : 'Caption (optional)'}
        className="w-full mb-2 px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
        style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid={`caption-${kind}`} />
      {kind === 'reel' && (
        <>
          <input value={category} onChange={(e) => setCategory(e.target.value)} list="reel-category-suggestions"
            placeholder="Category (e.g. candid, pre-wedding, cinematic) — optional"
            className="w-full mb-2 px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
            style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid="reel-category" />
          <datalist id="reel-category-suggestions">
            {['wedding', 'candid', 'pre-wedding', 'haldi', 'mehndi', 'sangeet', 'reception',
              'engagement', 'cinematic', 'portrait', 'traditional', 'drone', 'maternity', 'baby'].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <input value={tags} onChange={(e) => setTags(e.target.value)}
            placeholder="Tags — space or comma separated (e.g. candid haldi hyderabad)"
            className="w-full mb-2 px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
            style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid="reel-tags" />
        </>
      )}
      {err && <div className="text-xs mb-2" style={{ color: '#e5484d' }}>{err}</div>}
      <button onClick={submit} disabled={!file || busy} data-testid={`publish-${kind}`}
        className="lux-btn text-sm disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {busy ? 'Publishing…' : `Publish ${kind}`}
      </button>
    </div>
  );
}

// Text / poll story composer (C4) — no upload, so it's free of storage cost.
function TextPollComposer({ type, onCreated }) {
  const [text, setText] = useState('');
  const [bg, setBg] = useState('linear-gradient(135deg,#2A2016,#0E0A06)');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [locked, setLocked] = useState(false);

  const setOpt = (i, v) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const body = type === 'text'
        ? { type: 'text', text, bg }
        : { type: 'poll', question, bg, options: options.map((o) => o.trim()).filter(Boolean) };
      const { data } = await axios.post(`${API_URL}/api/pixora/stories`, body, { headers: authHeaders() });
      setText(''); setQuestion(''); setOptions(['', '']);
      onCreated(data.story || data);
    } catch (e) {
      if (e?.response?.status === 403) setLocked(true);
      else setErr(e?.response?.data?.detail || 'Could not publish. Please try again.');
    } finally { setBusy(false); }
  }, [type, text, bg, question, options, busy, onCreated]);

  if (locked) return <UpgradeNote what="Stories" />;
  const disabled = busy || (type === 'text' ? !text.trim() : (!question.trim() || options.filter((o) => o.trim()).length < 2));

  return (
    <div className="lux-glass p-4" data-testid={`composer-${type}`}>
      <div className="flex items-center gap-2 mb-3">
        <Plus className="w-4 h-4" style={{ color: '#E8C97A' }} />
        <span className="lux-eyebrow">New {type} story</span>
      </div>
      {type === 'text' ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={280}
          placeholder="What's on your mind?" data-testid="story-text-input"
          className="w-full mb-2 px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
          style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
      ) : (
        <>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={140}
            placeholder="Ask a question…" data-testid="story-poll-question"
            className="w-full mb-2 px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
            style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
          {options.map((o, i) => (
            <input key={i} value={o} onChange={(e) => setOpt(i, e.target.value)} maxLength={60}
              placeholder={`Option ${i + 1}`} data-testid={`story-poll-opt-${i}`}
              className="w-full mb-2 px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
              style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
          ))}
          {options.length < 4 && (
            <button onClick={() => setOptions((o) => [...o, ''])} className="lux-btn lux-btn-ghost text-xs mb-2">
              <Plus className="w-3.5 h-3.5" /> Option
            </button>
          )}
        </>
      )}
      {err && <div className="text-xs mb-2" style={{ color: '#e5484d' }}>{err}</div>}
      <button onClick={submit} disabled={disabled} data-testid={`publish-${type}`}
        className="lux-btn text-sm disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {busy ? 'Publishing…' : `Publish ${type} story`}
      </button>
    </div>
  );
}

// Story Highlights manager (C4) — group active stories into a permanent, on-profile
// highlight. The backend snapshots each story's media so it survives the 24h expiry.
function HighlightsManager({ activeStories }) {
  const [highlights, setHighlights] = useState([]);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    axios.get(`${API_URL}/api/pixora/highlights`, { headers: authHeaders() })
      .then(({ data }) => setHighlights(data.highlights || [])).catch(() => setHighlights([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const create = async () => {
    if (!title.trim() || picked.length === 0 || busy) return;
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/pixora/highlights`, { title: title.trim(), story_ids: picked },
        { headers: authHeaders() });
      setTitle(''); setPicked([]); load();
    } catch (_) { /* ignore */ } finally { setBusy(false); }
  };
  const del = (id) => axios.delete(`${API_URL}/api/pixora/highlights/${id}`, { headers: authHeaders() }).then(load).catch(() => {});

  return (
    <div className="lux-glass p-4" data-testid="highlights-manager">
      <div className="lux-eyebrow mb-2">◆ Highlights (permanent)</div>
      {highlights.length > 0 && (
        <div className="flex gap-3 overflow-x-auto no-scrollbar mb-3">
          {highlights.map((h) => (
            <div key={h.id} className="shrink-0 w-20 text-center" data-testid={`highlight-${h.id}`}>
              <div className="aspect-square rounded-full overflow-hidden mx-auto" style={{ width: 56, height: 56, border: '2px solid rgba(212,175,55,0.5)', background: '#000' }}>
                {h.cover_url && <img src={h.cover_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--lux-text-muted)' }}>{h.title}</div>
              <button onClick={() => del(h.id)} className="text-[10px]" style={{ color: '#e5484d' }} data-testid={`del-highlight-${h.id}`}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {activeStories.length === 0 ? (
        <div className="text-[12px]" style={{ color: 'var(--lux-text-faint)' }}>Post a story first, then group it into a highlight here.</div>
      ) : (
        <>
          <div className="text-[12px] mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>Pick active stories to save:</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-2">
            {activeStories.map((s) => (
              <button key={s.id} onClick={() => toggle(s.id)} data-testid={`hl-pick-${s.id}`}
                className="shrink-0 w-16 aspect-[9/16] rounded-lg overflow-hidden"
                style={{ border: picked.includes(s.id) ? '2px solid #E8C97A' : '2px solid transparent', background: '#000' }}>
                {s.url ? <img src={s.url} alt="" className="w-full h-full object-cover" />
                  : <span className="grid place-items-center h-full text-[10px]" style={{ color: 'var(--lux-text-muted)' }}>{s.type}</span>}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Highlight title" maxLength={60}
              className="flex-1 px-3 py-2 rounded-lg bg-transparent outline-none text-sm" data-testid="highlight-title"
              style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
            <button onClick={create} disabled={!title.trim() || picked.length === 0 || busy} data-testid="create-highlight"
              className="lux-btn text-sm disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</button>
          </div>
        </>
      )}
    </div>
  );
}

export function ReelsStudio() {
  const [reels, setReels] = useState([]);
  const load = useCallback(() => {
    axios.get(`${API_URL}/api/pixora/reels`, { headers: authHeaders() })
      .then(({ data }) => setReels(data.reels || [])).catch(() => setReels([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const del = (id) => axios.delete(`${API_URL}/api/pixora/reels/${id}`, { headers: authHeaders() }).then(load).catch(() => {});

  return (
    <div className="space-y-4" data-testid="reels-studio">
      <StorageMeter compact />
      <Composer kind="reel" accept="video/*" onCreated={load} />
      {reels.length === 0 ? (
        <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>
          <Film className="w-6 h-6 mx-auto mb-2" style={{ color: '#E8C97A' }} />
          <div className="text-sm">No reels yet. Publish your first above.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {reels.map((r) => (
            <div key={r.id} className="lux-glass p-2" data-testid={`reel-${r.id}`}>
              <div className="aspect-[9/16] rounded-lg overflow-hidden mb-1" style={{ background: '#000' }}>
                <video src={r.url} poster={r.thumbnail_url || undefined} controls playsInline className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs truncate" style={{ color: 'var(--lux-text-muted)' }}>{r.caption || 'Reel'}</span>
                <button onClick={() => del(r.id)} aria-label="Delete" data-testid={`del-reel-${r.id}`}><Trash2 className="w-3.5 h-3.5" style={{ color: '#e5484d' }} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StoriesStudio() {
  const [stories, setStories] = useState([]);
  const load = useCallback(() => {
    axios.get(`${API_URL}/api/pixora/stories`, { headers: authHeaders() })
      .then(({ data }) => setStories(data.stories || [])).catch(() => setStories([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const del = (id) => axios.delete(`${API_URL}/api/pixora/stories/${id}`, { headers: authHeaders() }).then(load).catch(() => {});
  const isVideo = (u) => /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u || '');
  const [storyType, setStoryType] = useState('media');   // media | text | poll

  return (
    <div className="space-y-4" data-testid="stories-studio">
      <StorageMeter compact />
      {/* C4 — story type selector: photo/video upload, a text card, or a poll. */}
      <div className="flex gap-1.5" data-testid="story-type-tabs">
        {[['media', 'Photo / Video'], ['text', 'Text'], ['poll', 'Poll']].map(([k, label]) => (
          <button key={k} onClick={() => setStoryType(k)} data-testid={`story-type-${k}`}
            className="rounded-lg px-3 py-1.5 text-[12px]"
            style={storyType === k ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06', fontWeight: 600 }
              : { border: '1px solid var(--lux-border)', color: 'var(--lux-text-muted)' }}>{label}</button>
        ))}
      </div>
      {storyType === 'media'
        ? <Composer kind="story" accept="image/*,video/*" onCreated={load} />
        : <TextPollComposer type={storyType} onCreated={load} />}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--lux-text-faint)' }}>
        <Clock className="w-3.5 h-3.5" /> Stories disappear after 24 hours.
      </div>
      <HighlightsManager activeStories={stories} />
      {stories.length === 0 ? (
        <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>
          <CirclePlay className="w-6 h-6 mx-auto mb-2" style={{ color: '#E8C97A' }} />
          <div className="text-sm">No active stories.</div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto no-scrollbar">
          {stories.map((s) => (
            <div key={s.id} className="shrink-0 w-28" data-testid={`story-${s.id}`}>
              <div className="aspect-[9/16] rounded-lg overflow-hidden" style={{ background: '#000', border: '2px solid rgba(212,175,55,0.4)' }}>
                {isVideo(s.url)
                  ? <video src={s.url} controls playsInline className="w-full h-full object-cover" />
                  : <img src={s.url} alt={s.caption || ''} className="w-full h-full object-cover" />}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] truncate" style={{ color: 'var(--lux-text-muted)' }}>{s.author || 'You'}</span>
                <button onClick={() => del(s.id)} aria-label="Delete" data-testid={`del-story-${s.id}`}><Trash2 className="w-3 h-3" style={{ color: '#e5484d' }} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
