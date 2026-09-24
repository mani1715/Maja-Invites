import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import WeddingModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
} from '@/components/WeddingModule';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import * as api from '@/api/weddings';

// The final wedding album — the curated set the studio delivers, as distinct
// from the guest gallery (which is whatever guests uploaded on the day). The
// backend has stored this since Phase 27 and the v2 app never showed it, so
// albums that had been uploaded were invisible to the studio that owns them.
//
// Contract:
//   GET    /admin/profiles/{id}/album-media  -> { media[], total }
//   POST   /admin/profiles/{id}/upload-album-media  (multipart: files[],
//          captions = JSON string positionally matched to files)
//   DELETE /admin/profiles/{id}/album-media/{mediaId}
// Rows: { id, media_type: photo|video, media_url, thumbnail_url, caption,
//         order, file_size, created_at }. Server caps the album at 50 items.

const MAX_ITEMS = 50;
const numberFmt = new Intl.NumberFormat('en-IN');

function mb(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return null;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WeddingAlbum() {
  const { weddingId } = useParams();
  return (
    <WeddingModule weddingId={weddingId} active="Album" title="Album">
      {(profile) => <AlbumBody profileId={profile.id} />}
    </WeddingModule>
  );
}

function AlbumBody({ profileId }) {
  const [media, setMedia] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [queued, setQueued] = useState([]);      // File[]
  const [captions, setCaptions] = useState([]);  // string[], index-matched
  const [toast, flash] = useFlash();
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.albumMedia(profileId);
      setMedia(data.media || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load the album.');
      setMedia([]);
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const rows = media || [];
  const photos = rows.filter((m) => m.media_type === 'photo').length;
  const videos = rows.filter((m) => m.media_type === 'video').length;
  const totalBytes = rows.reduce((sum, m) => sum + (Number(m.file_size) || 0), 0);
  const remaining = Math.max(0, MAX_ITEMS - rows.length);

  const pick = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    const allowed = picked.slice(0, remaining);
    if (allowed.length < picked.length) {
      flash(`Only ${remaining} more item${remaining === 1 ? '' : 's'} fit in this album.`);
    }
    setQueued(allowed);
    setCaptions(allowed.map(() => ''));
  };

  const clearQueue = () => {
    setQueued([]);
    setCaptions([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = async () => {
    if (queued.length === 0) return;
    setBusy('upload');
    setError(null);
    try {
      await api.uploadAlbumMedia(profileId, queued, captions);
      flash(`${queued.length} item${queued.length === 1 ? '' : 's'} added.`);
      clearQueue();
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || 'The upload did not go through.');
    } finally { setBusy(null); }
  };

  const remove = async (m) => {
    if (!window.confirm('Remove this from the album? The couple will no longer see it.')) return;
    setBusy(m.id);
    setError(null);
    try {
      await api.deleteAlbumMedia(profileId, m.id);
      flash('Removed.');
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not remove it.');
    } finally { setBusy(null); }
  };

  return (
    <>
      <StatRow items={[
        { label: 'In the album', value: media === null ? '—' : `${numberFmt.format(rows.length)} / ${MAX_ITEMS}` },
        { label: 'Photos', value: media === null ? '—' : numberFmt.format(photos) },
        { label: 'Videos', value: media === null ? '—' : numberFmt.format(videos) },
        { label: 'Size', value: media === null ? '—' : (mb(totalBytes) || '—') },
      ]}
      />

      <InlineError message={error} />

      <Panel
        title="Add to the album"
        sub={remaining === 0
          ? `This album is full at ${MAX_ITEMS} items. Remove something to add more.`
          : `Photos and video the couple receives as their finished album. ${remaining} slot${remaining === 1 ? '' : 's'} left.`}
      >
        <input
          ref={fileRef}
          className="wmod-input"
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={pick}
          disabled={remaining === 0 || busy === 'upload'}
          aria-label="Choose album files"
        />

        {queued.length > 0 && (
          <>
            <p className="wmod-hint" style={{ marginTop: 12 }}>
              Captions are optional — they show under each item in the couple's album.
            </p>
            <ul className="wmod-list" style={{ marginTop: 8 }}>
              {queued.map((f, i) => (
                <li className="wmod-item" key={`${f.name}-${i}`}>
                  <div className="wmod-item-head">
                    <span className="wmod-item-title">{f.name}</span>
                    <span className="wmod-item-meta">{mb(f.size) || ''}</span>
                  </div>
                  <input
                    className="wmod-input"
                    style={{ marginTop: 8 }}
                    value={captions[i] || ''}
                    onChange={(e) => setCaptions((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                    placeholder="Caption (optional)"
                    aria-label={`Caption for ${f.name}`}
                  />
                </li>
              ))}
            </ul>

            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="button" className="wmod-btn wmod-btn--primary" onClick={upload} disabled={busy === 'upload'}>
                {busy === 'upload' ? 'Uploading…' : `Upload ${queued.length} item${queued.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" className="wmod-btn wmod-btn--ghost" onClick={clearQueue} disabled={busy === 'upload'}>
                Clear
              </button>
            </div>
          </>
        )}
      </Panel>

      <Panel title="The album" sub="Shown in the order below. Removing an item takes it out of the couple's album immediately.">
        {media === null ? (
          <div className="wmod-skel" style={{ height: 120 }} />
        ) : rows.length === 0 ? (
          <Empty
            title="Nothing in the album yet"
            body="This is the finished set you hand over — separate from whatever guests uploaded on the day."
          />
        ) : (
          <div className="wmod-gallery-grid">
            {rows.map((m) => (
              <figure className="wmod-gallery-item" key={m.id}>
                {m.media_type === 'video' ? (
                  <video
                    src={resolveMediaUrl(m.media_url)}
                    poster={m.thumbnail_url ? resolveMediaUrl(m.thumbnail_url) : undefined}
                    controls
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={resolveMediaUrl(m.thumbnail_url || m.media_url)}
                    alt={m.caption || 'Album photo'}
                    loading="lazy"
                  />
                )}
                <figcaption>
                  <span>{m.caption || (m.media_type === 'video' ? 'Video' : 'Photo')}</span>
                  <button
                    type="button"
                    className="wmod-btn wmod-btn--danger wmod-btn--sm"
                    disabled={busy === m.id}
                    onClick={() => remove(m)}
                  >
                    {busy === m.id ? 'Removing…' : 'Remove'}
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </Panel>

      <Toast message={toast} />
    </>
  );
}
