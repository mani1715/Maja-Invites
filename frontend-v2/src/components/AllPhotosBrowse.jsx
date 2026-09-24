import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { getAllPhotos, grantDownload } from '@/api/gallery';

// QR "all photos" browse: every event photo as thumbnails; tap opens a
// lightbox with a Download button. Full-res is fetched through the capped
// grant endpoint (scope 'all', keyed by a per-browser device id), so the
// 5-download limit is enforced server-side, not here.
function getDeviceId() {
  try {
    let id = localStorage.getItem('mj_gallery_device');
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem('mj_gallery_device', id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

const detailText = (e, fallback) => {
  const d = e?.response?.data?.detail;
  return (d && (d.message || (typeof d === 'string' ? d : ''))) || fallback;
};

export default function AllPhotosBrowse({ slug, deviceHeader }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cap, setCap] = useState(5);
  const [remaining, setRemaining] = useState(null);
  const [downloadedIds, setDownloadedIds] = useState(() => new Set());
  const [lightbox, setLightbox] = useState(null);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlError, setDlError] = useState('');
  const deviceId = useMemo(getDeviceId, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const token = deviceHeader?.['X-Gallery-Device-Token'];
        const r = await getAllPhotos(slug, { limit: 500, deviceToken: token });
        if (!alive) return;
        setPhotos(r.data.photos || []);
        if (r.data.download_cap) setCap(r.data.download_cap);
      } catch (e) {
        if (alive) setError(detailText(e, 'Could not load the gallery. Please try again.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug, deviceHeader]);

  const download = useCallback(async (m) => {
    if (dlBusy) return;
    setDlBusy(true);
    setDlError('');
    try {
      const r = await grantDownload(slug, { photo_id: m.id, scope: 'all', device_id: deviceId }, deviceHeader);
      setRemaining(r.data.remaining);
      setDownloadedIds((prev) => new Set(prev).add(m.id));
      const a = document.createElement('a');
      a.href = resolveMediaUrl(r.data.url);
      a.download = `photo_${m.id}.jpg`;
      a.rel = 'noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setDlError(detailText(e, 'Could not download. Please try again.'));
    } finally {
      setDlBusy(false);
    }
  }, [slug, deviceId, deviceHeader, dlBusy]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '26px 0' }}><div className="lpw-spinner" /></div>;
  }
  if (error) {
    return <p style={{ fontSize: 13.5, color: '#fca5a5', textAlign: 'center', lineHeight: 1.7 }}>{error}</p>;
  }
  if (!photos.length) {
    return <p style={{ fontSize: 13.5, color: '#c9c0e4', textAlign: 'center', lineHeight: 1.7 }}>No photos have been added yet. Please check back soon.</p>;
  }

  return (
    <>
      <p style={{ fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 6px', fontWeight: 600 }}>Event gallery</p>
      <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 21, margin: '0 0 6px' }}>{photos.length} photos</h2>
      <p style={{ fontSize: 12.5, color: '#a396c4', margin: '0 0 12px', lineHeight: 1.6 }}>
        Tap a photo to open it, then Download. {remaining != null ? `${remaining} download${remaining === 1 ? '' : 's'} left.` : `You can download up to ${cap}.`}
      </p>
      {dlError && <p style={{ fontSize: 13, color: '#fca5a5', margin: '0 0 10px' }}>{dlError}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {photos.map((m) => {
          const saved = downloadedIds.has(m.id);
          return (
            <button key={m.id} type="button" data-mj-tile onClick={() => setLightbox(m)}
              style={{ aspectRatio: '1', borderRadius: 16, overflow: 'hidden', display: 'block', position: 'relative', background: '#241a3d', border: 'none', padding: 0, cursor: 'pointer' }}>
              <img src={resolveMediaUrl(m.thumb_url)} alt="Event photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
              {saved && <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'rgba(25,15,51,.82)', color: '#86efac' }}>✓ Saved</span>}
            </button>
          );
        })}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,6,22,.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 }}>
          <img src={resolveMediaUrl(lightbox.thumb_url)} alt="Event photo" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '68vh', borderRadius: 16, objectFit: 'contain' }} />
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="lpw-solid-btn" style={{ minHeight: 46, padding: '0 22px' }} disabled={dlBusy} onClick={() => download(lightbox)}>
              {dlBusy ? 'Saving…' : downloadedIds.has(lightbox.id) ? 'Download again' : 'Download'}
            </button>
            <button type="button" className="lpw-ghost-btn" style={{ minHeight: 46, padding: '0 18px' }} onClick={() => setLightbox(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
