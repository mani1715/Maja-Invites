import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Upload, Check, Loader2, Image as ImageIcon } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * PROMPT 13 — Floating "Share your photo" button for guests on the
 * public invitation page. Opens a modal with name, file picker, optional
 * caption. Uploads to /api/invite/{slug}/gallery/guest-upload which
 * auto-publishes and broadcasts to the live wall via WebSocket.
 */
const GuestUploadButton = ({ slug }) => {
  const [open, setOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null); setPreview(null); setCaption(''); setError(''); setBusy(false); setDone(false);
  };

  const handleFile = (f) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      setError('Please choose an image file.');
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError('File is too large (max 20 MB).');
      return;
    }
    setError('');
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result || null);
    reader.readAsDataURL(f);
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!file || !guestName.trim()) {
      setError('Name and a photo are required.');
      return;
    }
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('guest_name', guestName.trim());
      if (caption.trim()) fd.append('caption', caption.trim());

      const res = await fetch(`${API_URL}/api/invite/${slug}/gallery/guest-upload`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || 'Upload failed');
      }
      setDone(true);
      try { localStorage.setItem(`guest_name_${slug}`, guestName.trim()); } catch (_) {}
      setTimeout(() => { setOpen(false); reset(); }, 2000);
    } catch (err) {
      setError(err?.message || 'Could not upload photo');
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    try {
      const cached = localStorage.getItem(`guest_name_${slug}`);
      if (cached) setGuestName(cached);
    } catch (_) {}
  }, [slug]);

  return (
    <>
      {/* Floating button */}
      <motion.button
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 1.2, type: 'spring', stiffness: 220, damping: 18 }}
        whileHover={{ scale: 1.06, y: -2 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-safe right-4 md:right-8 z-[80] inline-flex items-center gap-2 pl-3 pr-4 py-3 md:pl-4 md:pr-5 md:py-3.5 rounded-full shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #D4AF37 0%, #B8941F 100%)',
          color: '#16110C',
          boxShadow: '0 12px 32px rgba(212,175,55,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
          fontFamily: 'DM Sans, sans-serif',
        }}
        data-testid="guest-upload-fab"
      >
        <Camera className="w-4 h-4 md:w-5 md:h-5" />
        <span className="text-xs md:text-sm font-semibold tracking-wide">Share your photo</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-0 md:p-6"
            style={{ background: 'rgba(8,6,4,0.85)', backdropFilter: 'blur(10px)' }}
            onClick={() => { if (!busy) { setOpen(false); reset(); } }}
            data-testid="guest-upload-modal"
          >
            <motion.div
              initial={{ y: 60, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full md:max-w-lg lux-glass overflow-hidden"
              style={{
                borderRadius: '1.5rem 1.5rem 0 0',
                padding: '1.75rem',
                background: 'linear-gradient(180deg, rgba(26,20,15,0.98) 0%, rgba(15,11,8,0.99) 100%)',
                border: '1px solid rgba(212,175,55,0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <span className="lux-eyebrow block mb-1.5">◆ Share a moment</span>
                  <h3 className="font-display text-2xl md:text-3xl" style={{ color: '#FFF8DC' }}>
                    Your <span className="font-script italic text-gold">photo</span> on the wall
                  </h3>
                </div>
                <button onClick={() => { if (!busy) { setOpen(false); reset(); } }}
                  className="w-9 h-9 rounded-full grid place-items-center shrink-0"
                  style={{ background: 'rgba(255,248,220,0.08)', color: 'rgba(255,248,220,0.8)' }}
                  data-testid="guest-upload-close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {done ? (
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="py-10 text-center" data-testid="guest-upload-success">
                  <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 0.7, ease: 'backOut' }}
                    className="w-16 h-16 mx-auto rounded-full grid place-items-center mb-4"
                    style={{ background: 'linear-gradient(135deg,#D4AF37,#8C6A1A)' }}>
                    <Check className="w-7 h-7" style={{ color: '#FFF8DC' }} />
                  </motion.div>
                  <h4 className="font-display text-xl mb-1.5" style={{ color: '#FFF8DC' }}>
                    Beautifully done.
                  </h4>
                  <p className="text-sm italic" style={{ color: 'rgba(255,248,220,0.85)' }}>
                    Your photo is now on the live wall.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>Your name</label>
                    <input
                      type="text" required maxLength={60}
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="e.g. Anaya from Mumbai"
                      className="w-full px-4 py-3 rounded-lg bg-transparent outline-none"
                      style={{ color: '#FFF8DC', border: '1px solid var(--lux-border, rgba(212,175,55,0.18))', caretColor: '#D4AF37' }}
                      data-testid="guest-upload-name"
                    />
                  </div>

                  {/* File picker */}
                  <div>
                    <label className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>Choose a photo</label>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="w-full rounded-lg overflow-hidden"
                      style={{
                        border: '1px dashed rgba(212,175,55,0.4)',
                        background: 'rgba(212,175,55,0.04)',
                        minHeight: preview ? 'auto' : '140px',
                      }}
                      data-testid="guest-upload-picker"
                    >
                      {preview ? (
                        <img src={preview} alt="" className="w-full max-h-72 object-contain" />
                      ) : (
                        <div className="py-8 px-4 text-center">
                          <ImageIcon className="w-7 h-7 mx-auto mb-2" style={{ color: '#D4AF37' }} />
                          <div className="text-sm" style={{ color: 'rgba(255,248,220,0.85)' }}>Tap to pick from your gallery</div>
                          <div className="text-[11px] mt-1" style={{ color: 'rgba(255,248,220,0.7)' }}>JPG · PNG · HEIC · up to 20 MB</div>
                        </div>
                      )}
                    </button>
                    <input ref={inputRef} type="file" accept="image/*" capture="environment"
                      onChange={(e) => handleFile(e.target.files?.[0])}
                      className="hidden" data-testid="guest-upload-file-input" />
                  </div>

                  {/* Caption */}
                  <div>
                    <label className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>A short caption (optional)</label>
                    <input
                      type="text" maxLength={150}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="What a magical moment…"
                      className="w-full px-4 py-3 rounded-lg bg-transparent outline-none"
                      style={{ color: '#FFF8DC', border: '1px solid var(--lux-border, rgba(212,175,55,0.18))', caretColor: '#D4AF37' }}
                      data-testid="guest-upload-caption"
                    />
                  </div>

                  {error && (
                    <div className="text-sm px-3 py-2 rounded-md" data-testid="guest-upload-error"
                      style={{ background: 'rgba(139,0,0,0.18)', color: '#FFD7C9' }}>{error}</div>
                  )}

                  <button
                    type="submit" disabled={busy || !file || !guestName.trim()}
                    className="lux-btn w-full justify-center"
                    style={{ opacity: (busy || !file || !guestName.trim()) ? 0.55 : 1 }}
                    data-testid="guest-upload-submit"
                  >
                    {busy ? (<><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>) : (<><Upload className="w-4 h-4" /> Upload & share</>)}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default GuestUploadButton;
