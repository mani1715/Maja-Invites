import { useState } from 'react';
import * as portfolioApi from '@/api/portfolio';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import MediaDrop from './MediaDrop';

// PUT /api/portfolio/works/{id} does a FULL replace of the WorkIn shape (no
// exclude_unset on the backend) — sending just {featured: true} would blank
// out image_url/tags/gallery/etc. This rebuilds the complete payload from the
// work record on every write, so a "toggle featured" click can never lose
// the rest of the work's data.
function workPayload(work, patch = {}) {
  return {
    title: work.title || 'Untitled',
    album_id: work.album_id ?? null,
    event_category: work.event_category ?? null,
    image_url: work.image_url ?? null,
    video_url: work.video_url ?? null,
    thumbnail_url: work.thumbnail_url ?? null,
    description: work.description ?? null,
    date: work.date ?? null,
    venue: work.venue ?? null,
    location: work.location ?? null,
    camera: work.camera ?? null,
    lens: work.lens ?? null,
    settings: work.settings ?? null,
    story: work.story ?? null,
    tags: work.tags || [],
    featured: !!work.featured,
    gallery: work.gallery || [],
    ...patch,
  };
}

const chipStyle = (on) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px',
  borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? '#6d28d9' : '#e5e7eb'}`,
  cursor: 'pointer', background: on ? '#6d28d9' : '#ffffff', color: on ? '#ffffff' : '#4b5563',
});

// Album + work management for the Portfolio page — was a dead-end message
// ("Full album management is not on this page yet"). Reuses the parent's
// albums/works state + reload() so this stays the one source of truth rather
// than fetching a second copy.
export default function PortfolioGallery({ albums, works, eventCategories, reload, showToast }) {
  const [activeAlbum, setActiveAlbum] = useState(null); // null = "All"
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [albumName, setAlbumName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [addingWork, setAddingWork] = useState(false);
  const [newWork, setNewWork] = useState({ title: '', event_category: '', image_url: '', video_url: '' });
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');

  const shownWorks = activeAlbum ? works.filter((w) => w.album_id === activeAlbum) : works;
  const activeAlbumObj = albums.find((a) => a.id === activeAlbum) || null;

  const withBusy = async (key, fn, okMsg) => {
    setBusy(key); setErr('');
    try { await fn(); if (okMsg) showToast?.(okMsg); await reload(); }
    catch (e) { setErr(e?.response?.data?.detail || 'That did not work.'); }
    finally { setBusy(null); }
  };

  const submitCreateAlbum = async (e) => {
    e.preventDefault();
    const title = albumName.trim();
    if (!title) return;
    await withBusy('album-create', () => portfolioApi.createAlbum({ title }), 'Album created.');
    setAlbumName(''); setCreatingAlbum(false);
  };

  const startRename = (album) => { setRenamingId(album.id); setRenameVal(album.title || ''); };
  const saveRename = async (id) => {
    const title = renameVal.trim();
    if (!title) { setRenamingId(null); return; }
    await withBusy(`rename-${id}`, () => portfolioApi.renameAlbum(id, { title }), 'Album renamed.');
    setRenamingId(null);
  };

  const removeAlbum = async (album) => {
    const count = works.filter((w) => w.album_id === album.id).length;
    const detail = count
      ? ` This permanently deletes ${count} work${count === 1 ? '' : 's'} inside it too.`
      : ' It is empty.';
    if (!window.confirm(`Delete the album "${album.title}"?${detail} This cannot be undone.`)) return;
    if (activeAlbum === album.id) setActiveAlbum(null);
    await withBusy(`album-del-${album.id}`, () => portfolioApi.deleteAlbum(album.id), 'Album deleted.');
  };

  const submitWork = async (e) => {
    e.preventDefault();
    const title = newWork.title.trim();
    if (!title || (!newWork.image_url && !newWork.video_url)) {
      setErr('Add a title and a photo or video first.');
      return;
    }
    await withBusy('work-create', () => portfolioApi.createWork({
      title,
      album_id: activeAlbum || null,
      event_category: newWork.event_category || null,
      image_url: newWork.image_url || null,
      video_url: newWork.video_url || null,
    }), 'Added.');
    setNewWork({ title: '', event_category: '', image_url: '', video_url: '' });
    setAddingWork(false);
  };

  const toggleFeatured = (work) => withBusy(
    `feat-${work.id}`,
    () => portfolioApi.updateWork(work.id, workPayload(work, { featured: !work.featured })),
  );

  const removeWork = (work) => {
    if (!window.confirm(`Delete "${work.title || 'this work'}"? This cannot be undone.`)) return;
    withBusy(`work-del-${work.id}`, () => portfolioApi.deleteWork(work.id), 'Deleted.');
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <button type="button" style={chipStyle(!activeAlbum)} onClick={() => setActiveAlbum(null)}>
          All works ({works.length})
        </button>
        {albums.map((a) => (
          <button key={a.id} type="button" style={chipStyle(activeAlbum === a.id)} onClick={() => setActiveAlbum(a.id)}>
            {a.title} ({works.filter((w) => w.album_id === a.id).length})
          </button>
        ))}
        <button type="button" onClick={() => setCreatingAlbum((s) => !s)}
          style={{ minHeight: 36, padding: '0 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
            border: '1px dashed #6d28d9', background: '#ffffff', color: '#6d28d9', cursor: 'pointer' }}>
          + New album
        </button>
      </div>

      {creatingAlbum && (
        <form onSubmit={submitCreateAlbum} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={albumName} onChange={(e) => setAlbumName(e.target.value)} placeholder="Album name" autoFocus
            data-mj-field style={{ minHeight: 40, padding: '0 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, background: '#f5f3ff', outline: 'none', maxWidth: 260 }} />
          <button type="submit" disabled={busy === 'album-create' || !albumName.trim()}
            style={{ minHeight: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: '#6d28d9', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Create
          </button>
          <button type="button" onClick={() => { setCreatingAlbum(false); setAlbumName(''); }}
            style={{ minHeight: 40, padding: '0 16px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#4b5563', fontSize: 12.5, cursor: 'pointer' }}>
            Cancel
          </button>
        </form>
      )}

      {activeAlbumObj && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: '#f5f3ff', borderRadius: 12 }}>
          {renamingId === activeAlbumObj.id ? (
            <>
              <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} autoFocus
                data-mj-field style={{ minHeight: 36, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' }} />
              <button type="button" onClick={() => saveRename(activeAlbumObj.id)} disabled={busy === `rename-${activeAlbumObj.id}`}
                style={{ fontSize: 12, color: '#6d28d9', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
              <button type="button" onClick={() => setRenamingId(null)} style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#111827', flex: 1 }}>{activeAlbumObj.title}</span>
              <button type="button" onClick={() => startRename(activeAlbumObj)} style={{ fontSize: 12, color: '#6d28d9', background: 'none', border: 'none', cursor: 'pointer' }}>Rename</button>
              <button type="button" onClick={() => removeAlbum(activeAlbumObj)} disabled={busy === `album-del-${activeAlbumObj.id}`}
                style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Delete album</button>
            </>
          )}
        </div>
      )}

      {err && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{err}</p>}

      {shownWorks.length === 0 && !addingWork && (
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13.5, marginBottom: 16 }}>
          {activeAlbumObj ? 'No works in this album yet.' : 'No works uploaded yet.'}
        </div>
      )}

      {shownWorks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
          {shownWorks.map((w) => (
            <div key={w.id} style={{ border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
              <div style={{ position: 'relative', aspectRatio: '1', background: '#f5f3ff' }}>
                {w.image_url || w.thumbnail_url ? (
                  <img src={resolveMediaUrl(w.thumbnail_url || w.image_url)} alt={w.title || ''}
                    loading="lazy" decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#9ca3af' }}>Video</div>
                )}
                <button type="button" onClick={() => toggleFeatured(w)} disabled={busy === `feat-${w.id}`}
                  title={w.featured ? 'Remove from Featured' : 'Mark as Featured'}
                  style={{ position: 'absolute', top: 6, right: 6, minHeight: 26, padding: '0 8px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: w.featured ? '#6d28d9' : 'rgba(255,255,255,.9)', color: w.featured ? '#fff' : '#6d28d9', fontSize: 11, fontWeight: 700 }}>
                  {w.featured ? '★ Featured' : '☆ Feature'}
                </button>
              </div>
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.title || 'Untitled'}
                </span>
                <button type="button" onClick={() => removeWork(w)} disabled={busy === `work-del-${w.id}`}
                  style={{ alignSelf: 'flex-start', fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {busy === `work-del-${w.id}` ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addingWork ? (
        <form onSubmit={submitWork} style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MediaDrop
            label="Photo or video"
            accept="image/*,video/*"
            value={newWork.image_url || newWork.video_url}
            onUploaded={(d) => setNewWork((s) => (d.kind === 'video'
              ? { ...s, video_url: d.url, image_url: '' }
              : { ...s, image_url: d.url, video_url: '' }))}
            onClear={() => setNewWork((s) => ({ ...s, image_url: '', video_url: '' }))}
          />
          <input value={newWork.title} onChange={(e) => setNewWork((s) => ({ ...s, title: e.target.value }))}
            placeholder="Title — e.g. Mandap Vows" data-mj-field
            style={{ minHeight: 42, padding: '0 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, background: '#f5f3ff', outline: 'none' }} />
          <select value={newWork.event_category} onChange={(e) => setNewWork((s) => ({ ...s, event_category: e.target.value }))}
            style={{ minHeight: 42, padding: '0 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, background: '#f5f3ff' }}>
            <option value="">Event category (optional)</option>
            {(eventCategories || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy === 'work-create'}
              style={{ minHeight: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: '#6d28d9', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {busy === 'work-create' ? 'Adding…' : 'Add work'}
            </button>
            <button type="button" onClick={() => { setAddingWork(false); setNewWork({ title: '', event_category: '', image_url: '', video_url: '' }); }}
              style={{ minHeight: 42, padding: '0 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#4b5563', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAddingWork(true)}
          style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Add {activeAlbumObj ? `work to "${activeAlbumObj.title}"` : 'work'}
        </button>
      )}
    </div>
  );
}
