import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import PixoraNav from '@/components/nav/PixoraNav';
import * as pixoraApi from '@/api/pixoraStudio';
import './StudioCommunity.css';

// Ported from "MAJA Pixora Community.dc.html" (shell/feed/reels layout) +
// "MAJA Pixora Home.dc.html" (composer pattern), curated to the 4 views this
// lane actually builds: Feed / Reels / Stories / My Profile. The other M12
// groups (Connect, Studio Tools, Growth, Marketplace, Learning Hub, …) are
// out of scope here — see PixoraNav.jsx for the matching nav curation.
//
// Route: /studio/community (RequireStudio). View switching is a `?view=`
// query param on this same route — bookmarkable, and what the sidebar's
// curated links point at.

function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

const VIEWS = ['feed', 'reels', 'stories', 'profile'];
const VIEW_LABEL = { feed: 'Feed', reels: 'Reels', stories: 'Stories', profile: 'My Profile' };

const fieldStyle = {
  width: '100%', padding: '11px 14px', border: '1px solid #e5e7eb', borderRadius: 14,
  fontSize: 13.5, background: '#ffffff', fontFamily: 'inherit', boxSizing: 'border-box',
};

export default function StudioCommunity() {
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view');
  const view = VIEWS.includes(rawView) ? rawView : 'feed';
  const vw = useViewportWidth();
  const isMobile = vw < 900;

  const [myId, setMyId] = useState(null);
  useEffect(() => {
    pixoraApi.me().then(({ data }) => setMyId(data.studio_id)).catch(() => {});
  }, []);

  const goView = (v) => setParams(v === 'feed' ? {} : { view: v });

  const shellCols = isMobile ? '1fr' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const mainPadding = vw < 400 ? '20px 16px 40px' : (isMobile ? '24px 22px 44px' : (vw < 1200 ? '32px 30px 48px' : '40px 48px 56px'));
  const heroPad = isMobile ? '28px 20px' : '34px 28px';

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <MobileNav panel="studio" active="Community" />
      <div style={{ background: '#ffffff', color: '#111827', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols }}>
        {!isMobile && <PixoraNav active={VIEW_LABEL[view]} />}

        <main id="main-content" className="pxc-main" style={{ padding: mainPadding, minWidth: 0 }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ background: 'linear-gradient(165deg,#f5f3ff,#ede9fe 55%,#f5f3ff)', borderRadius: 20, padding: heroPad, marginBottom: 24, textAlign: 'center' }}>
              <p style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 8px' }}>Pixora Community</p>
              <h1 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 'clamp(24px,4vw,34px)', lineHeight: 1.15, color: '#111827', margin: 0 }}>{VIEW_LABEL[view]}</h1>
            </div>

            {isMobile && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 22 }} data-testid="pxc-mobile-tabs">
                {VIEWS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => goView(v)}
                    className="pxc-tab"
                    data-testid={`pxc-tab-${v}`}
                    style={{
                      minHeight: 40, padding: '0 16px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
                      border: `1px solid ${v === view ? '#a78bfa' : '#ddd6fe'}`,
                      background: v === view ? '#a78bfa' : '#ffffff',
                      color: v === view ? '#2e1065' : '#4b5563',
                      fontSize: 12.5, fontWeight: 600,
                    }}
                  >
                    {VIEW_LABEL[v]}
                  </button>
                ))}
              </div>
            )}

            {view === 'feed' && <FeedView myId={myId} />}
            {view === 'reels' && <ReelsView myId={myId} />}
            {view === 'stories' && <StoriesView myId={myId} />}
            {view === 'profile' && <ProfileView />}
          </div>
        </main>
      </div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, textAlign: 'center', padding: '48px 24px', color: '#6b7280', fontSize: 14 }}>
      {children}
    </div>
  );
}

function UpgradeNote({ message }) {
  return (
    <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 16, padding: '20px 18px', textAlign: 'center' }} data-testid="pxc-upgrade-note">
      <p style={{ fontSize: 13.5, color: '#4b5563', margin: '0 0 14px' }}>{message}</p>
      <a
        href="/studio/plans"
        className="pxc-btn"
        style={{ background: '#6d28d9', color: '#ffffff', textDecoration: 'none', display: 'inline-flex', minHeight: 40, alignItems: 'center', padding: '0 18px', borderRadius: 14, fontSize: 13, fontWeight: 600 }}
      >
        Upgrade plan
      </a>
    </div>
  );
}

// ---------------------------------------------------------------- Feed ----

const KINDS = [
  { key: 'showcase', label: 'Showcase' },
  { key: 'critique_request', label: 'Ask for critique' },
  { key: 'tip', label: 'Share a tip' },
  { key: 'discussion', label: 'Discussion' },
];

function FeedSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="pxc-skel" style={{ height: 220 }} />
      {Array.from({ length: 3 }).map((_, i) => <div key={i} className="pxc-skel" style={{ height: 260 }} />)}
    </div>
  );
}

function FeedView({ myId }) {
  const [posts, setPosts] = useState(null);
  const [cats, setCats] = useState([]);
  const [kind, setKind] = useState('showcase');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [tagText, setTagText] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState('');
  const [openComments, setOpenComments] = useState(null);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ title: '', body: '' });
  const fileRef = useRef(null);

  const load = useCallback(() => {
    pixoraApi.getFeed().then(({ data }) => setPosts(data.posts || [])).catch(() => setPosts([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    pixoraApi.postMeta().then(({ data }) => setCats(data.categories || [])).catch(() => setCats([]));
  }, []);

  const submit = async () => {
    if (!title.trim() && !body.trim() && !file) return;
    setBusy(true); setError(''); setUpgrade('');
    try {
      let image_url = null;
      let video_url = null;
      let size_bytes = 0;
      const isVideo = !!(file && /^video\//.test(file.type || ''));
      if (file) {
        const up = await pixoraApi.uploadMedia(file);
        if (isVideo) video_url = up.data.url; else image_url = up.data.url;
        size_bytes = up.data.size_bytes;
      }
      const tags = [...new Set(String(tagText || '').split(/[,\s]+/)
        .map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 12);
      await pixoraApi.createPost({
        kind: isVideo ? 'reel' : kind, title, body,
        image_url, video_url, tags, size_bytes,
        category: category || null,
      });
      setTitle(''); setBody(''); setFile(null); setTagText(''); setCategory('');
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) {
      if (e?.response?.status === 403) setUpgrade(e.response.data?.detail || 'Adding media to a post is a paid feature.');
      else setError(e?.response?.data?.detail || 'Could not post. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const like = async (id) => { try { await pixoraApi.likePost(id); load(); } catch (_e) { /* transient */ } };
  const save = async (id) => { try { await pixoraApi.savePost(id); load(); } catch (_e) { /* transient */ } };
  const startEdit = (p) => { setEditId(p.id); setEdit({ title: p.title || '', body: p.body || '' }); };
  const saveEdit = async (id) => {
    try { await pixoraApi.updatePost(id, edit); setEditId(null); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not update post.'); }
  };
  const removePost = async (id) => {
    if (!window.confirm('Delete this post? This also removes its comments.')) return;
    try { await pixoraApi.deletePost(id); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not delete post.'); }
  };

  if (posts === null) return <FeedSkeleton />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }} data-testid="pxc-composer">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {KINDS.map((k) => (
            <button
              key={k.key} type="button" onClick={() => setKind(k.key)} className="pxc-chip" data-testid={`pxc-kind-${k.key}`}
              style={{
                minHeight: 36, padding: '0 14px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                border: `1px solid ${kind === k.key ? '#a78bfa' : '#ddd6fe'}`,
                background: kind === k.key ? '#a78bfa' : '#ffffff',
                color: kind === k.key ? '#2e1065' : '#4b5563',
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <input className="pxc-field" style={{ ...fieldStyle, marginBottom: 10 }} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="pxc-post-title" />
        <textarea className="pxc-field" style={{ ...fieldStyle, marginBottom: 10, minHeight: 70, resize: 'vertical' }} placeholder="Share your work, ask for a critique, or drop a tip…" value={body} onChange={(e) => setBody(e.target.value)} data-testid="pxc-post-body" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <label className="pxc-btn pxc-btn-ghost" style={{ minHeight: 40, padding: '0 16px', borderRadius: 14, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {file ? 'Change photo/video' : 'Add photo/video'}
            <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="pxc-post-file" />
          </label>
          {file && <span style={{ fontSize: 12, color: '#6b7280' }}>{file.name}{/^video\//.test(file.type || '') ? ' (becomes a Reel)' : ''}</span>}
          {file && <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}>remove</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <select className="pxc-field" value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...fieldStyle, flex: '1 1 140px', width: 'auto' }} data-testid="pxc-post-category">
            <option value="">Category…</option>
            {cats.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
          </select>
          <input className="pxc-field" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Tags — candid, hyderabad" style={{ ...fieldStyle, flex: '1 1 180px', width: 'auto' }} data-testid="pxc-post-tags" />
          <button
            type="button" onClick={submit} disabled={busy} className="pxc-btn" data-testid="pxc-post-submit"
            style={{ background: '#6d28d9', color: '#ffffff', border: 'none', minHeight: 44, padding: '0 22px', borderRadius: 14, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}
          >
            {busy ? 'Posting…' : 'Post to Spotlight'}
          </button>
        </div>
        {error && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '10px 0 0' }}>{error}</p>}
        {upgrade && <div style={{ marginTop: 14 }}><UpgradeNote message={upgrade} /></div>}
      </div>

      {posts.length === 0 ? <Empty>No posts yet. Be the first to share.</Empty> : posts.map((p) => (
        <PostCard
          key={p.id} p={p} myId={myId} onLike={like} onSave={save}
          editing={editId === p.id} edit={edit} setEdit={setEdit}
          onStartEdit={() => startEdit(p)} onCancelEdit={() => setEditId(null)} onSaveEdit={() => saveEdit(p.id)}
          onDelete={() => removePost(p.id)}
          commentsOpen={openComments === p.id} onToggleComments={() => setOpenComments(openComments === p.id ? null : p.id)}
        />
      ))}
    </div>
  );
}

function PostCard({ p, myId, onLike, onSave, editing, edit, setEdit, onStartEdit, onCancelEdit, onSaveEdit, onDelete, commentsOpen, onToggleComments }) {
  const mine = !!(myId && p.studio_id === myId);
  return (
    <div className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, overflow: 'hidden' }} data-testid={`pxc-post-${p.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#ede9fe', border: '1.5px solid #a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Spectral',serif", fontSize: 13, color: '#4b5563', flexShrink: 0 }}>
          {(p.author || '?')[0]?.toUpperCase()}
        </div>
        <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>
          {p.author}{p.author_verified_level > 0 && <span title="Verified" style={{ marginLeft: 5, color: '#6d28d9' }}>✓</span>}
        </p>
        <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9' }}>
          {(p.kind || '').replace(/_/g, ' ')}
        </span>
        {mine && !editing && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button type="button" onClick={onStartEdit} className="pxc-icon-btn" style={{ background: 'none', border: 'none', fontSize: 14 }} title="Edit" data-testid={`pxc-post-edit-${p.id}`}>✎</button>
            <button type="button" onClick={onDelete} className="pxc-icon-btn" style={{ background: 'none', border: 'none', fontSize: 14, color: '#dc2626' }} title="Delete" data-testid={`pxc-post-delete-${p.id}`}>✕</button>
          </span>
        )}
      </div>

      {editing ? (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="pxc-field" style={fieldStyle} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} data-testid={`pxc-post-edit-title-${p.id}`} />
          <textarea className="pxc-field" style={{ ...fieldStyle, minHeight: 60 }} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} data-testid={`pxc-post-edit-body-${p.id}`} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onSaveEdit} className="pxc-btn" style={{ background: '#6d28d9', color: '#ffffff', border: 'none', minHeight: 36, padding: '0 16px', borderRadius: 12, fontSize: 12.5, fontWeight: 600 }} data-testid={`pxc-post-save-${p.id}`}>Save</button>
            <button type="button" onClick={onCancelEdit} className="pxc-btn pxc-btn-ghost" style={{ minHeight: 36, padding: '0 16px', borderRadius: 12, fontSize: 12.5 }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {(p.title || p.body) && (
            <div style={{ padding: '0 16px 12px' }}>
              {p.title && <p style={{ fontFamily: "'Spectral',serif", fontSize: 17, fontWeight: 500, margin: '0 0 4px' }}>{p.title}</p>}
              {p.body && <p style={{ fontSize: 13.5, color: '#4b5563', margin: 0, lineHeight: 1.5 }}>{p.body}</p>}
            </div>
          )}
          {p.image_url && <img src={p.image_url} alt="" loading="lazy" style={{ width: '100%', maxHeight: 420, objectFit: 'cover', display: 'block' }} />}
          {p.video_url && (
            <video src={p.video_url} controls playsInline preload="metadata" poster={p.image_url || undefined}
              style={{ width: '100%', maxHeight: 420, background: '#000', display: 'block' }} data-testid={`pxc-video-${p.id}`} />
          )}
        </>
      )}

      {(p.category || (p.tags || []).length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 12px' }}>
          {p.category && <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, background: '#f5f3ff', color: '#6d28d9' }}>{p.category}</span>}
          {(p.tags || []).map((t) => <span key={t} style={{ fontSize: 11.5, color: '#6d28d9' }}>#{t}</span>)}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '6px 16px 16px', fontSize: 13, color: '#4b5563' }}>
        <button type="button" onClick={() => onLike(p.id)} className="pxc-icon-btn" style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5, color: p.viewer_liked ? '#dc2626' : '#4b5563' }} data-testid={`pxc-like-${p.id}`}>
          <span style={{ fontSize: 17 }}>{p.viewer_liked ? '♥' : '♡'}</span> {p.like_count}
        </button>
        <button type="button" onClick={onToggleComments} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5, color: '#4b5563', cursor: 'pointer' }} data-testid={`pxc-comments-${p.id}`}>
          <span style={{ fontSize: 15 }}>✉</span> {p.comment_count}
        </button>
        <button type="button" onClick={() => onSave(p.id)} className="pxc-icon-btn" style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5, color: p.viewer_saved ? '#6d28d9' : '#4b5563' }} data-testid={`pxc-save-${p.id}`}>
          <span style={{ fontSize: 15 }}>{p.viewer_saved ? '★' : '☆'}</span> {p.save_count ?? 0}
        </button>
      </div>

      {commentsOpen && <CommentsBox postId={p.id} myId={myId} postOwnerId={p.studio_id} />}
    </div>
  );
}

function CommentsBox({ postId, myId, postOwnerId }) {
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    pixoraApi.listComments(postId).then(({ data }) => setRows(data.comments || [])).catch(() => setRows([]));
  }, [postId]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await pixoraApi.addComment(postId, text); setText(''); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not add comment.'); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this comment?')) return;
    try { await pixoraApi.deleteComment(id); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not delete comment.'); }
  };
  return (
    <div style={{ borderTop: '1px solid #e5e7eb', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows === null ? (
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0 }}>No comments yet.</p>
      ) : rows.map((c) => {
        const canDelete = (myId && c.studio_id === myId) || (myId && postOwnerId === myId);
        return (
          <div key={c.id} style={{ display: 'flex', gap: 8, fontSize: 12.5 }} data-testid={`pxc-comment-${c.id}`}>
            <span style={{ flex: 1 }}><b style={{ color: '#6d28d9' }}>{c.author}</b> <span style={{ color: '#4b5563' }}>{c.body}</span></span>
            {canDelete && <button type="button" onClick={() => remove(c.id)} className="pxc-x" style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 12 }} data-testid={`pxc-comment-delete-${c.id}`}>✕</button>}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="pxc-field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" style={{ ...fieldStyle, flex: 1, minHeight: 38, padding: '8px 12px' }} data-testid={`pxc-comment-input-${postId}`} />
        <button type="button" onClick={send} disabled={busy} className="pxc-btn pxc-btn-ghost" style={{ minHeight: 38, padding: '0 14px', borderRadius: 12, fontSize: 12.5 }}>Send</button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- Reels ----

function ReelsView({ myId }) {
  const [reels, setReels] = useState(null);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(() => {
    pixoraApi.listReels().then(({ data }) => setReels(data.reels || [])).catch(() => setReels([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true); setError(''); setUpgrade('');
    try {
      const up = await pixoraApi.uploadMedia(file);
      const tagList = tags.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
      await pixoraApi.createReel({ url: up.data.url, size_bytes: up.data.size_bytes, caption, category, tags: tagList });
      setFile(null); setCaption(''); setCategory(''); setTags('');
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) {
      if (e?.response?.status === 403) setUpgrade(e.response.data?.detail || 'Reels are a Premium feature.');
      else setError(e?.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const del = async (id) => {
    if (!window.confirm('Delete this reel?')) return;
    try { await pixoraApi.deleteReel(id); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not delete reel.'); }
  };

  // Own reels only — this is the studio's management view, not the public feed.
  const mine = (reels || []).filter((r) => !myId || r.studio_id === myId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }} data-testid="pxc-reel-composer">
        <p style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 600, margin: '0 0 12px' }}>New reel</p>
        <label className="pxc-btn pxc-btn-ghost" style={{ display: 'inline-flex', minHeight: 40, padding: '0 16px', borderRadius: 14, fontSize: 12.5, marginBottom: 10 }}>
          {file ? file.name : 'Choose a video'}
          <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="pxc-reel-file" />
        </label>
        <input className="pxc-field" style={{ ...fieldStyle, marginBottom: 8 }} placeholder="Caption — add #candid #haldi to help it reach the right couples" value={caption} onChange={(e) => setCaption(e.target.value)} data-testid="pxc-reel-caption" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input className="pxc-field" style={{ ...fieldStyle, flex: '1 1 160px', width: 'auto' }} placeholder="Category (e.g. candid, cinematic)" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="pxc-reel-category" />
          <input className="pxc-field" style={{ ...fieldStyle, flex: '1 1 160px', width: 'auto' }} placeholder="Tags — space or comma separated" value={tags} onChange={(e) => setTags(e.target.value)} data-testid="pxc-reel-tags" />
        </div>
        <button type="button" onClick={submit} disabled={!file || busy} className="pxc-btn" data-testid="pxc-reel-submit"
          style={{ background: '#6d28d9', color: '#ffffff', border: 'none', minHeight: 44, padding: '0 22px', borderRadius: 14, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}>
          {busy ? 'Publishing…' : 'Publish reel'}
        </button>
        {error && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '10px 0 0' }}>{error}</p>}
        {upgrade && <div style={{ marginTop: 14 }}><UpgradeNote message={upgrade} /></div>}
      </div>

      {reels === null ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="pxc-skel" style={{ aspectRatio: '9/16' }} />)}
        </div>
      ) : mine.length === 0 ? <Empty>No reels yet. Publish your first above.</Empty> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
          {mine.map((r) => (
            <div key={r.id} className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 8 }} data-testid={`pxc-reel-${r.id}`}>
              <div style={{ aspectRatio: '9/16', borderRadius: 12, overflow: 'hidden', background: '#111827', marginBottom: 6 }}>
                <video src={r.url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.caption || 'Reel'}</span>
                <button type="button" onClick={() => del(r.id)} aria-label="Delete" className="pxc-x" style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 13 }} data-testid={`pxc-reel-delete-${r.id}`}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- Stories ---

function StoryMediaComposer({ onCreated }) {
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState('');
  const fileRef = useRef(null);
  const submit = async () => {
    if (!file || busy) return;
    setBusy(true); setError(''); setUpgrade('');
    try {
      const up = await pixoraApi.uploadMedia(file);
      const type = /^video\//.test(file.type || '') || /\.(mp4|mov|webm|m4v|avi)$/i.test(file.name) ? 'video' : 'photo';
      await pixoraApi.createStory({ url: up.data.url, size_bytes: up.data.size_bytes, caption, type });
      setFile(null); setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      onCreated();
    } catch (e) {
      if (e?.response?.status === 403) setUpgrade(e.response.data?.detail || 'Stories are a Premium feature.');
      else setError(e?.response?.data?.detail || 'Could not publish. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }} data-testid="pxc-story-composer-media">
      <label className="pxc-btn pxc-btn-ghost" style={{ display: 'inline-flex', minHeight: 40, padding: '0 16px', borderRadius: 14, fontSize: 12.5, marginBottom: 10 }}>
        {file ? file.name : 'Choose a photo or video'}
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="pxc-story-file" />
      </label>
      <input className="pxc-field" style={fieldStyle} placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} data-testid="pxc-story-caption" />
      <button type="button" onClick={submit} disabled={!file || busy} className="pxc-btn" data-testid="pxc-story-publish-media"
        style={{ marginTop: 12, background: '#6d28d9', color: '#ffffff', border: 'none', minHeight: 44, padding: '0 22px', borderRadius: 14, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}>
        {busy ? 'Publishing…' : 'Publish story'}
      </button>
      {error && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '10px 0 0' }}>{error}</p>}
      {upgrade && <div style={{ marginTop: 14 }}><UpgradeNote message={upgrade} /></div>}
    </div>
  );
}

function StoryTextPollComposer({ type, onCreated }) {
  const [text, setText] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState('');
  const setOpt = (i, v) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const disabled = busy || (type === 'text' ? !text.trim() : (!question.trim() || options.filter((o) => o.trim()).length < 2));
  const submit = async () => {
    if (disabled) return;
    setBusy(true); setError(''); setUpgrade('');
    try {
      const payload = type === 'text' ? { type: 'text', text } : { type: 'poll', question, options: options.map((o) => o.trim()).filter(Boolean) };
      await pixoraApi.createStory(payload);
      setText(''); setQuestion(''); setOptions(['', '']);
      onCreated();
    } catch (e) {
      if (e?.response?.status === 403) setUpgrade(e.response.data?.detail || 'Stories are a Premium feature.');
      else setError(e?.response?.data?.detail || 'Could not publish. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }} data-testid={`pxc-story-composer-${type}`}>
      {type === 'text' ? (
        <textarea className="pxc-field" style={{ ...fieldStyle, minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder="What's on your mind?" data-testid="pxc-story-text-input" />
      ) : (
        <>
          <input className="pxc-field" style={{ ...fieldStyle, marginBottom: 8 }} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={140} placeholder="Ask a question…" data-testid="pxc-story-poll-question" />
          {options.map((o, i) => (
            <input key={i} className="pxc-field" style={{ ...fieldStyle, marginBottom: 8 }} value={o} onChange={(e) => setOpt(i, e.target.value)} maxLength={60} placeholder={`Option ${i + 1}`} data-testid={`pxc-story-poll-opt-${i}`} />
          ))}
          {options.length < 4 && (
            <button type="button" onClick={() => setOptions((o) => [...o, ''])} className="pxc-btn pxc-btn-ghost" style={{ minHeight: 34, padding: '0 14px', borderRadius: 12, fontSize: 12 }}>+ Option</button>
          )}
        </>
      )}
      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={submit} disabled={disabled} className="pxc-btn" data-testid={`pxc-story-publish-${type}`}
          style={{ background: '#6d28d9', color: '#ffffff', border: 'none', minHeight: 44, padding: '0 22px', borderRadius: 14, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}>
          {busy ? 'Publishing…' : `Publish ${type} story`}
        </button>
      </div>
      {error && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '10px 0 0' }}>{error}</p>}
      {upgrade && <div style={{ marginTop: 14 }}><UpgradeNote message={upgrade} /></div>}
    </div>
  );
}

function StoriesView({ myId }) {
  const [stories, setStories] = useState(null);
  const [storyType, setStoryType] = useState('media');
  const load = useCallback(() => {
    pixoraApi.listStories().then(({ data }) => setStories(data.stories || [])).catch(() => setStories([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const del = async (id) => {
    try { await pixoraApi.deleteStory(id); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not delete story.'); }
  };
  const mine = (stories || []).filter((s) => !myId || s.studio_id === myId);
  const isVideo = (u) => /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 8 }} data-testid="pxc-story-type-tabs">
        {[['media', 'Photo / Video'], ['text', 'Text'], ['poll', 'Poll']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setStoryType(k)} className="pxc-tab" data-testid={`pxc-story-type-${k}`}
            style={{
              minHeight: 36, padding: '0 16px', borderRadius: 12, fontSize: 12.5, fontWeight: 600,
              border: `1px solid ${storyType === k ? '#a78bfa' : '#ddd6fe'}`,
              background: storyType === k ? '#a78bfa' : '#ffffff',
              color: storyType === k ? '#2e1065' : '#4b5563',
            }}>
            {label}
          </button>
        ))}
      </div>
      {storyType === 'media' ? <StoryMediaComposer onCreated={load} /> : <StoryTextPollComposer type={storyType} onCreated={load} />}
      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Stories disappear after 24 hours.</p>

      {stories === null ? (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="pxc-skel" style={{ width: 110, aspectRatio: '9/16', flexShrink: 0 }} />)}
        </div>
      ) : mine.length === 0 ? <Empty>No active stories.</Empty> : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {mine.map((s) => (
            <div key={s.id} style={{ width: 110, flexShrink: 0 }} data-testid={`pxc-story-${s.id}`}>
              <div style={{ aspectRatio: '9/16', borderRadius: 14, overflow: 'hidden', background: '#111827', border: '2px solid #a78bfa' }}>
                {s.type === 'text' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10, background: s.bg || '#2e1065', color: '#fff', fontSize: 12, textAlign: 'center' }}>{s.text}</div>
                ) : s.type === 'poll' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10, background: s.bg || '#2e1065', color: '#fff', fontSize: 11.5, textAlign: 'center' }}>{s.question}</div>
                ) : isVideo(s.url) ? (
                  <video src={s.url} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <img src={s.url} alt={s.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>{s.type}</span>
                <button type="button" onClick={() => del(s.id)} aria-label="Delete" className="pxc-x" style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11.5 }} data-testid={`pxc-story-delete-${s.id}`}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- Profile ---

function ProfileView() {
  const [me, setMe] = useState(null);
  const [slug, setSlug] = useState(null);
  useEffect(() => {
    pixoraApi.me().then(({ data }) => setMe(data)).catch(() => setMe(false));
    pixoraApi.portfolioProfile().then(({ data }) => setSlug(data?.profile?.slug || null)).catch(() => {});
  }, []);

  if (me === null) return <div className="pxc-skel" style={{ height: 220 }} />;
  if (me === false) return <Empty>Could not load your community profile.</Empty>;

  const breakdown = [
    ['profile_completion', 'Profile'], ['portfolio_published', 'Published'],
    ['posts', 'Posts'], ['followers', 'Followers'], ['daily_logins', 'Daily logins'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: '28px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'Spectral',serif", fontSize: 34, color: '#6d28d9', margin: '0 0 4px' }}>{me.reputation}</p>
        <p style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b7280', margin: '0 0 6px' }}>Reputation &middot; {me.tier}</p>
        <p style={{ fontSize: 14, color: '#111827', margin: 0 }}>
          {me.name}{me.verification?.level > 0 && <span style={{ marginLeft: 6, color: '#6d28d9' }} title={me.verification.level_label}>✓</span>}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 14, fontSize: 12.5, color: '#6b7280', flexWrap: 'wrap' }}>
          <span>{me.stats.posts} posts</span><span>{me.stats.likes_received} likes</span><span>{me.stats.comments_made} comments</span><span>{me.stats.challenge_wins} wins</span>
        </div>
      </div>

      {me.community_score && (
        <div className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }} data-testid="pxc-community-score">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 600, margin: 0 }}>Community score</p>
            <p style={{ fontFamily: "'Spectral',serif", fontSize: 24, color: '#6d28d9', margin: 0 }}>{me.community_score.score}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, fontSize: 12 }}>
            {breakdown.map(([k, label]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 10, background: '#f5f3ff' }}>
                <span style={{ color: '#6b7280' }}>{label}</span><span style={{ color: '#111827' }}>+{me.community_score.breakdown?.[k] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
        {(me.achievements || []).map((a) => (
          <div key={a.key} className="pxc-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, textAlign: 'center', opacity: a.unlocked ? 1 : 0.45 }} data-testid={`pxc-ach-${a.key}`}>
            <p style={{ fontSize: 13.5, color: '#111827', margin: '0 0 4px', fontWeight: 600 }}>{a.label}</p>
            <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{a.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {slug && (
          <a href={`/p/${slug}`} className="pxc-btn pxc-btn-ghost" data-testid="pxc-view-public"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 20px', borderRadius: 14, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            View public profile
          </a>
        )}
        <a href="/studio/portfolio" className="pxc-btn"
          style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 20px', borderRadius: 14, fontSize: 13, fontWeight: 600, background: '#6d28d9', color: '#ffffff', textDecoration: 'none', boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}>
          Open portfolio builder
        </a>
      </div>
    </div>
  );
}
