import React, { useState, useEffect } from 'react';

/**
 * Shared full-screen photo lightbox. Any image anywhere can open it by calling
 * openLightbox(src) — no prop-drilling. Mount <PhotoLightbox /> once per page.
 * Tap the image (or any invite/preview photo) -> opens full, like a WhatsApp DP.
 * object-contain = no crop, full resolution; close on click / Esc.
 */
export const openLightbox = (src) => {
  if (!src) return;
  try { window.dispatchEvent(new CustomEvent('maja:lightbox', { detail: { src } })); } catch (_e) {}
};

export const PhotoLightbox = () => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const onOpen = (e) => setSrc(e?.detail?.src || null);
    const onKey = (e) => { if (e.key === 'Escape') setSrc(null); };
    window.addEventListener('maja:lightbox', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('maja:lightbox', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  if (!src) return null;
  return (
    <div
      onClick={() => setSrc(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,4,2,0.94)',
        backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center',
        padding: '1.5rem', cursor: 'zoom-out',
      }}
      data-testid="photo-lightbox"
    >
      <img
        src={src} alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
          borderRadius: 6, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', cursor: 'default',
        }}
      />
      <button
        onClick={(e) => { e.stopPropagation(); setSrc(null); }}
        aria-label="Close"
        style={{
          position: 'absolute', top: 18, right: 18, width: 44, height: 44, borderRadius: 999,
          background: 'rgba(255,248,220,0.12)', color: '#FFF8DC',
          border: '1px solid rgba(212,175,55,0.4)', fontSize: 22, lineHeight: 1, cursor: 'pointer',
        }}
      >×</button>
    </div>
  );
};

export default PhotoLightbox;
