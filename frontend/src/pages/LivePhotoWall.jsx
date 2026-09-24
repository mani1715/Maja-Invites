import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Camera, Heart, X, Download, Share2 } from 'lucide-react';
import { PxSpinner } from '../components/px';
import { resolveMediaUrl } from '../utils/mediaUrl';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Persistent guest device id (for favorites)
const getDeviceId = () => {
  let id = localStorage.getItem('mh_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('mh_device_id', id);
  }
  return id;
};

const fadeUp = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] },
  }),
};

const LivePhotoWall = () => {
  const { slug } = useParams();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [total, setTotal] = useState(0);
  const sinceRef = useRef(null);
  const deviceId = useRef(getDeviceId());

  // Record a QR scan once when a guest opens the gallery (Phase 8 analytics).
  // Fire-and-forget + server-throttled; never blocks or affects the gallery.
  useEffect(() => {
    if (!slug) return;
    axios.post(`${API_URL}/api/public/qr-scan/${slug}`).catch(() => {});
  }, [slug]);

  const fetchPhotos = useCallback(async (initial = false) => {
    try {
      const params = {};
      if (!initial && sinceRef.current) params.since = sinceRef.current;
      const res = await axios.get(`${API_URL}/api/invite/${slug}/live-gallery`, { params });
      const newPhotos = res.data.photos || [];
      setTotal(res.data.total || 0);
      sinceRef.current = res.data.fetched_at;
      if (initial) {
        setPhotos(newPhotos);
      } else if (newPhotos.length > 0) {
        setPhotos((prev) => [...newPhotos, ...prev]);
      }
    } catch (e) {
      console.error('Live gallery error', e);
    } finally {
      if (initial) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchPhotos(true);
    const interval = setInterval(() => fetchPhotos(false), 8000);
    return () => clearInterval(interval);
  }, [fetchPhotos]);

  const toggleFavorite = async (photo) => {
    try {
      const res = await axios.post(`${API_URL}/api/invite/${slug}/live-gallery/favorite`, {
        photo_id: photo.id, device_id: deviceId.current,
      });
      setPhotos((p) => p.map((x) => x.id === photo.id
        ? { ...x, favorite_count: x.favorite_count + (res.data.favorited ? 1 : -1) }
        : x));
    } catch (e) { /* ignore */ }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--px-bg)', color: 'var(--px-ink)', fontFamily: 'var(--px-font-body)' }} data-testid="live-photo-wall">
      {/* Hero */}
      <div className="px-aurora">
        <motion.div
          initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
          className="px-6 md:px-12 pt-12 md:pt-16 pb-8 max-w-[1400px] mx-auto"
        >
          <motion.span variants={fadeUp} className="px-eyebrow block mb-4">◆ Live Photo Wall</motion.span>
          <motion.h1 variants={fadeUp} custom={1}
            className="text-[2.2rem] md:text-[3.6rem] leading-[1.05] tracking-tight"
            style={{ color: 'var(--px-ink)', fontFamily: 'var(--px-font-display)', fontWeight: 500 }}>
            Moments from the <span style={{ color: 'var(--px-primary)', fontStyle: 'italic' }}>celebration</span>
          </motion.h1>
          <motion.p variants={fadeUp} custom={2} className="mt-4 max-w-xl text-[0.98rem]"
            style={{ color: 'var(--px-muted)' }}>
            As our photographer captures the day, the gallery updates here in real time.
            Tap a photo to open it, then download the ones you want to keep.
          </motion.p>
          <motion.div variants={fadeUp} custom={3} className="mt-6 flex flex-wrap items-center gap-3">
            <span className="px-chip">
              <Camera className="w-3.5 h-3.5" /> {total} photos
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* Grid */}
      <div className="px-6 md:px-12 py-10 max-w-[1400px] mx-auto">
        {loading ? (
          <div className="grid place-items-center py-32"><PxSpinner style={{ width: 36, height: 36, borderWidth: 3 }} /></div>
        ) : photos.length === 0 ? (
          <div className="px-card p-14 text-center">
            <Camera className="w-7 h-7 mx-auto mb-4" style={{ color: 'var(--px-primary)' }} />
            <h3 className="px-section-title mb-2" style={{ fontSize: '1.5rem' }}>The wall is awake</h3>
            <p className="px-section-sub">
              Photos will appear here the moment the photographer captures them.
            </p>
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
            <AnimatePresence>
              {photos.map((p, i) => (
                <motion.div key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0)' }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.55, delay: Math.min(i, 12) * 0.025, ease: [0.22, 1, 0.36, 1] }}
                  className="px-card lpw-tile break-inside-avoid relative group cursor-pointer overflow-hidden"
                  style={{ borderRadius: 'var(--px-r-media)' }}
                  onClick={() => setLightbox(p)}
                  data-testid={`lpw-photo-${p.id}`}
                >
                  <img src={resolveMediaUrl(p.thumb_url)} alt={p.caption || 'wedding moment'}
                    loading="lazy"
                    className="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.04]" />
                  <div className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center justify-between"
                    style={{ background: 'linear-gradient(to top, rgba(17,24,39,0.65), transparent)' }}>
                    <span className="text-[10px] tracking-[0.15em] uppercase truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
                      {p.uploader_name || 'Photographer'}
                    </span>
                    <span className="inline-flex items-center gap-2.5">
                      {/* Download right on the tile — a guest shouldn't have to
                          open a photo to discover they're allowed to keep it. */}
                      <button onClick={(e) => { e.stopPropagation(); toggleFavorite(p); }}
                        className="inline-flex items-center gap-1 text-xs min-h-[44px] min-w-[28px] justify-center"
                        style={{ color: '#fff' }}
                        data-testid={`lpw-fav-${p.id}`}>
                        <Heart className="w-3.5 h-3.5" /> {p.favorite_count || 0}
                      </button>
                      <a href={resolveMediaUrl(p.url)} download onClick={(e) => e.stopPropagation()}
                        title="Download this photo" aria-label="Download this photo"
                        className="inline-flex items-center min-h-[44px] min-w-[28px] justify-center" style={{ color: '#fff' }}
                        data-testid={`lpw-tile-download-${p.id}`}>
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <style>{`
        .lpw-tile{transition:transform .25s var(--px-ease,cubic-bezier(.22,.61,.36,1)),box-shadow .25s var(--px-ease,cubic-bezier(.22,.61,.36,1))}
        .lpw-tile:hover{transform:translateY(-3px);box-shadow:var(--px-shadow-hover)}
        @media (prefers-reduced-motion: reduce){.lpw-tile{transition:none}.lpw-tile:hover{transform:none}}
      `}</style>

      <AnimatePresence>
        {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} slug={slug} />}
      </AnimatePresence>

    </div>
  );
};

const Lightbox = ({ photo, onClose, slug }) => {
  const share = async () => {
    const url = `${window.location.origin}/invite/${slug}/live-gallery`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Live Wedding Gallery', url }); } catch (_) {}
    } else {
      try { await navigator.clipboard.writeText(url); } catch (_) {}
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(17,24,39,0.92)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
      data-testid="lpw-lightbox"
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-5xl max-h-[90vh]"
      >
        <img src={resolveMediaUrl(photo.url)} alt={photo.caption || ''}
          className="max-w-full max-h-[85vh]" style={{ borderRadius: 'var(--px-r-media)', boxShadow: 'var(--px-shadow-hover)' }} />
        <div className="absolute top-2 right-2 flex items-center gap-2 flex-wrap justify-end">
          <button onClick={share} className="px-btn px-btn-secondary text-xs" style={{ background: 'rgba(255,255,255,.92)' }} data-testid="lpw-share">
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
          <a href={resolveMediaUrl(photo.url)} download className="px-btn px-btn-secondary text-xs" style={{ background: 'rgba(255,255,255,.92)' }} data-testid="lpw-download">
            <Download className="w-3.5 h-3.5" /> Download
          </a>
          <button onClick={onClose} className="px-btn px-btn-secondary text-xs" style={{ background: 'rgba(255,255,255,.92)' }} data-testid="lpw-lightbox-close">
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
        {photo.caption && (
          <p className="absolute -bottom-10 left-0 right-0 text-center text-sm" style={{ color: '#fff' }}>
            &ldquo;{photo.caption}&rdquo; &mdash; {photo.uploader_name}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};

// The guest uploader that used to live here was removed on the owner's
// instruction: the wall is for viewing and downloading, and photos come from the
// photographer. The server endpoint (POST /api/invite/:slug/live-gallery/guest-upload)
// and its photos-only guard are untouched, so the paid `guest_uploads` add-on can be
// given a home again without redoing the backend.

export default LivePhotoWall;
