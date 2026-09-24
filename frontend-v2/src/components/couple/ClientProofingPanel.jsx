import { useCallback, useEffect, useState } from 'react';
import { clientPrintOrder, clientProofing, clientSelectPhoto } from '@/lib/clientAuth';
import { resolveMediaUrl } from '@/lib/mediaUrl';

// GET  /api/client/proofing                        -> { galleries: [{id,title,photo_count,selected_count,
//        photos:[{id,image_url,thumb_url,filename,selected,select_note}]}] }
// POST /api/client/proofing/photos/{photo_id}/select -> { ok, selected }  (body: {selected, note})
// POST /api/client/print-orders                      -> { order:{...} }  (body: {gallery_id, kind, note})
//   400s "Select at least one photo first." if selected_count is 0 (client_studio_service.py ~148-238).
// Grid is thumb_url-first; the lightbox is the only place `image_url` (full
// size) loads.

function Lightbox({ photo, onClose, onToggle, busy }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(9,5,20,.86)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ maxWidth: 'min(92vw,900px)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <img
          src={resolveMediaUrl(photo.image_url || photo.thumb_url)}
          alt={photo.filename || 'Proof photo'}
          style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 14, objectFit: 'contain' }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            disabled={busy}
            onClick={onToggle}
            className={`cap-btn ${photo.selected ? 'cap-btn-solid' : 'cap-btn-outline'}`}
            style={{ minHeight: 44, padding: '0 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {photo.selected ? 'Selected as favourite ✓' : 'Select as favourite'}
          </button>
          <button type="button" onClick={onClose} className="cap-btn cap-btn-outline" style={{ minHeight: 44, padding: '0 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientProofingPanel() {
  const [galleries, setGalleries] = useState(null);
  const [err, setErr] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { galleryId, photo }
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    clientProofing()
      .then(({ data }) => setGalleries(data.galleries || []))
      .catch(() => { setErr(true); setGalleries([]); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (galleryId, photo) => {
    setBusyId(photo.id);
    try {
      await clientSelectPhoto(photo.id, !photo.selected);
      setGalleries((gs) => gs.map((g) => (g.id !== galleryId ? g : {
        ...g,
        selected_count: g.selected_count + (photo.selected ? -1 : 1),
        photos: g.photos.map((p) => (p.id === photo.id ? { ...p, selected: !p.selected } : p)),
      })));
      setLightbox((lb) => (lb && lb.photo.id === photo.id ? { ...lb, photo: { ...lb.photo, selected: !photo.selected } } : lb));
    } catch (_e) { /* leave state as-is, button just stays clickable */ }
    setBusyId(null);
  };

  const request = async (galleryId, kind) => {
    setBusyId(`order-${galleryId}`);
    setNotice('');
    try {
      await clientPrintOrder(galleryId, kind);
      setNotice(kind === 'print' ? 'Print request sent to your studio.' : 'Download request sent to your studio.');
    } catch (e) {
      setNotice(e?.response?.data?.detail || 'Could not send the request.');
    }
    setBusyId(null);
  };

  if (err) {
    return <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>Proofing isn&rsquo;t available for this invitation right now.</p>;
  }
  if (galleries === null) {
    return <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>Loading proofs…</p>;
  }
  if (galleries.length === 0) {
    return <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>No proofing galleries yet. Your studio will share photos here for you to pick favourites.</p>;
  }

  return (
    <div data-mj-stagger style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {notice && (
        <div style={{ background: 'rgba(109,40,217,.18)', border: '1px solid rgba(196,181,253,.3)', color: '#ede9fe', borderRadius: 14, padding: '12px 16px', fontSize: 13 }}>{notice}</div>
      )}
      {galleries.map((g) => (
        <div key={g.id} data-reveal className="cap-card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <h3 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 17, margin: 0 }}>{g.title}</h3>
            <span style={{ fontSize: 12.5, color: '#c4b5fd' }}>{g.selected_count}/{g.photo_count} selected</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => request(g.id, 'download')}
                disabled={busyId === `order-${g.id}` || g.selected_count === 0}
                className="cap-btn cap-btn-outline"
                style={{ minHeight: 40, padding: '0 16px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Request download
              </button>
              <button
                type="button"
                onClick={() => request(g.id, 'print')}
                disabled={busyId === `order-${g.id}` || g.selected_count === 0}
                className="cap-btn cap-btn-outline"
                style={{ minHeight: 40, padding: '0 16px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Request prints
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
            {g.photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLightbox({ galleryId: g.id, photo: p })}
                aria-label={p.selected ? `${p.filename || 'Photo'}, selected as favourite` : `${p.filename || 'Photo'}, view and select`}
                disabled={busyId === p.id}
                style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', border: p.selected ? '2px solid #e5a93c' : '1px solid rgba(196,181,253,.22)', padding: 0, cursor: 'pointer' }}
              >
                <img
                  src={resolveMediaUrl(p.thumb_url || p.image_url)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {p.selected && (
                  <span aria-hidden="true" style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: '#e5a93c', color: '#190f33', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      {lightbox && (
        <Lightbox
          photo={lightbox.photo}
          busy={busyId === lightbox.photo.id}
          onClose={() => setLightbox(null)}
          onToggle={() => toggle(lightbox.galleryId, lightbox.photo)}
        />
      )}
    </div>
  );
}
