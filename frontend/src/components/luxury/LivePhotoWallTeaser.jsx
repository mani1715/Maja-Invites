import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import { Camera, Lock, QrCode, Sparkles, ExternalLink, Wifi } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// ponytail: mirrors useGalleryAccess.js's loadStored() semantics inline —
// this teaser doesn't need the full hook (privacy fetch, unlock flow), just
// the trusted-device token so the WS can pass a protected gallery's 4401 check.
const getStoredGalleryToken = (slug) => {
  try {
    const tok = localStorage.getItem(`gallery_device_token_${slug}`);
    const exp = localStorage.getItem(`gallery_device_exp_${slug}`);
    if (tok && exp && Date.parse(exp) > Date.now()) return tok;
  } catch (_) { /* Safari private mode / SSR — ignore */ }
  return null;
};

/**
 * Live Photo Wall — access is now GATED per owner request. Instead of showing the
 * event photos openly on the invitation, guests get two clear options:
 *   1. "View all event photos" — asks for the album password, then reveals a QR
 *      (and a direct link) to the full live gallery, which enforces the passcode.
 *   2. "Get your photos" — upload a selfie (+ email & WhatsApp) to receive the
 *      photos they appear in (opens the parent's FindMyPhotosModal via onSelfie).
 */
const LivePhotoWallTeaser = ({ slug, onSelfie, showGallery = true, showSelfie = true }) => {
  const [count, setCount] = useState(null);
  const [connected, setConnected] = useState(false);
  const [asking, setAsking] = useState(false);   // password prompt open
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const deadRef = useRef(false);

  // Lightweight count only (we no longer render the open grid).
  const fetchCount = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/public/gallery/${slug}/photos?limit=1`);
      const j = await r.json();
      setCount(typeof j.total === 'number' ? j.total : (j.photos ? j.photos.length : 0));
    } catch (_) { /* ignore */ }
  }, [slug]);

  // Keep the "Live" pill honest via the same WebSocket, without holding photos.
  const connectWs = useCallback(() => {
    if (deadRef.current) return;
    try {
      const wsBase = API_URL.replace(/^https?:/, API_URL.startsWith('https') ? 'wss:' : 'ws:');
      // Protected galleries (gallery_privacy.enabled) close with 4401 unless
      // a valid unlocked-device token rides along as ?token=.
      const token = getStoredGalleryToken(slug);
      const wsUrl = `${wsBase}/api/ws/gallery/${slug}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'photo_added') setCount((c) => (c || 0) + 1);
          else if (msg.type === 'photo_deleted') setCount((c) => Math.max(0, (c || 1) - 1));
        } catch (_) { /* ignore */ }
      };
      ws.onerror = () => setConnected(false);
      ws.onclose = (evt) => {
        setConnected(false);
        // 4401 = locked gallery / no valid token — retrying would just loop
        // against a closed door forever, so stop instead of scheduling.
        if (!deadRef.current && evt?.code !== 4401) timerRef.current = setTimeout(connectWs, 3000);
      };
    } catch (_) {
      timerRef.current = setTimeout(connectWs, 3000);
    }
  }, [slug]);

  useEffect(() => {
    deadRef.current = false;
    fetchCount();
    connectWs();
    return () => {
      deadRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      try { wsRef.current?.close(); } catch (_) {}
    };
  }, [fetchCount, connectWs]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // The passcode is passed through to the gallery, which enforces it.
  const galleryUrl = `${origin}/invite/${slug}/live-gallery${pin ? `?pin=${encodeURIComponent(pin)}` : ''}`;

  const unlock = (e) => {
    e?.preventDefault?.();
    if (!pin.trim()) return;
    setUnlocked(true);
  };

  return (
    <section className="px-4 md:px-12 py-20 md:py-24 relative" data-testid="public-live-wall">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex-1">
            <motion.span initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.1 }}
              className="lux-eyebrow block mb-3">◆ Live Photo Wall</motion.span>
            <motion.h2 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
              className="font-display text-[2rem] md:text-[3.2rem] leading-[1.05]" style={{ color: '#FFF8DC' }}>
              Every moment <span className="font-script italic text-gold">of the day</span>
            </motion.h2>
            <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.1 }} transition={{ delay: 0.2 }}
              className="mt-3 max-w-xl text-sm md:text-base italic" style={{ color: 'rgba(255,248,220,0.85)' }}>
              The full event gallery is private. Unlock it with the album password, or upload a selfie to get just the photos you're in.
            </motion.p>
          </div>
          <LivePill connected={connected} count={count} />
        </div>

        <div className={`grid grid-cols-1 ${showGallery && showSelfie ? 'md:grid-cols-2' : ''} gap-4`}>
          {/* Option 1 — password-gated QR to the full gallery (qr_live_gallery) */}
          {showGallery && (
          <div className="lux-glass p-6 flex flex-col" data-testid="live-wall-qr-card">
            <div className="flex items-center gap-2 mb-2">
              <QrCode className="w-5 h-5 text-gold" />
              <h3 className="font-display text-xl" style={{ color: '#FFF8DC' }}>View all event photos</h3>
            </div>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,248,220,0.8)' }}>
              Scan the QR (or open the link) to see every photo from the celebration.
            </p>

            {!unlocked ? (
              !asking ? (
                <button onClick={() => setAsking(true)} className="lux-btn inline-flex items-center gap-2 mt-auto self-start"
                  data-testid="live-wall-unlock">
                  <Lock className="w-4 h-4" /> Unlock with password
                </button>
              ) : (
                <form onSubmit={unlock} className="mt-auto flex flex-col gap-2" data-testid="live-wall-pin-form">
                  <label className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'rgba(255,248,220,0.7)' }}>
                    Album password
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus
                      placeholder="Shared by the couple"
                      className="flex-1 px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
                      style={{ color: '#FFF8DC', border: '1px solid var(--lux-border, rgba(212,175,55,0.25))', caretColor: '#D4AF37' }}
                      data-testid="live-wall-pin"
                    />
                    <button type="submit" className="lux-btn !px-4" data-testid="live-wall-pin-submit">Open</button>
                  </div>
                </form>
              )
            ) : (
              <div className="mt-auto flex flex-col items-center gap-3" data-testid="live-wall-qr">
                <div className="p-3 rounded-xl bg-white">
                  <QRCodeCanvas value={galleryUrl} size={148} includeMargin={false} level="M" />
                </div>
                <a href={galleryUrl} target="_blank" rel="noopener noreferrer"
                  className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5" data-testid="live-wall-open-gallery">
                  <ExternalLink className="w-3.5 h-3.5" /> Open the gallery
                </a>
              </div>
            )}
          </div>
          )}

          {/* Option 2 — selfie → your photos (email + WhatsApp collected in the modal).
              AI face-match feature (ai_face_match / selfie_search). */}
          {showSelfie && (
          <div className="lux-glass p-6 flex flex-col" data-testid="live-wall-selfie-card">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-gold" />
              <h3 className="font-display text-xl" style={{ color: '#FFF8DC' }}>Get your photos</h3>
            </div>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,248,220,0.8)' }}>
              Upload a quick selfie and share your email &amp; WhatsApp — we'll send you every photo you appear in.
            </p>
            <button onClick={() => onSelfie && onSelfie()} className="lux-btn inline-flex items-center gap-2 mt-auto self-start"
              data-testid="live-wall-selfie">
              <Camera className="w-4 h-4" /> Upload a selfie
            </button>
          </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes livepulse { 0%,100% { opacity:1 } 50% { opacity: 0.55 } }
        .live-dot { animation: livepulse 1.4s ease-in-out infinite; }
      `}</style>
    </section>
  );
};

const LivePill = ({ connected, count }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] tracking-[0.25em] uppercase whitespace-nowrap shrink-0"
    style={{
      background: connected ? 'rgba(220, 38, 38, 0.18)' : 'rgba(255,248,220,0.08)',
      border: `1px solid ${connected ? 'rgba(220,38,38,0.45)' : 'rgba(255,248,220,0.2)'}`,
      color: connected ? '#fca5a5' : 'rgba(255,248,220,0.78)',
    }}
    data-testid="live-pill"
  >
    {connected ? (
      <>
        <span className="w-2 h-2 rounded-full live-dot" style={{ background: '#ef4444' }} />
        Live{typeof count === 'number' ? ` · ${count}` : ''}
      </>
    ) : (
      <>
        <Wifi className="w-3 h-3 opacity-70" />
        Connecting…
      </>
    )}
  </div>
);

export default React.memo(LivePhotoWallTeaser);
