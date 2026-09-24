import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Camera, ImageIcon, Upload, Check, AlertCircle, Loader2, Wifi, WifiOff,
  RefreshCw, Eye, Sparkles,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * PhotographerLiveMode — token-gated phone uploader page.
 *  /live/:profileId?token=...
 * Photographer scans QR → opens this on phone → takes photos → auto-upload to S3.
 */
const PhotographerLiveMode = () => {
  const { profileId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [status, setStatus] = useState(null);
  const [queue, setQueue] = useState([]); // [{id, file, status: queued|uploading|done|failed, thumb_url?}]
  const [online, setOnline] = useState(navigator.onLine);
  const fileRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    document.body.classList.add('luxe');
    return () => document.body.classList.remove('luxe');
  }, []);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/live-upload/${profileId}/status`,
        { params: { token } });
      setStatus(r.data);
    } catch (e) {
      setStatus({ error: e.response?.data?.detail || 'Invalid token' });
    }
  }, [profileId, token]);

  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 10000); // refresh every 10s
    return () => clearInterval(t);
  }, [loadStatus]);

  // Upload one file
  const uploadOne = async (item) => {
    setQueue((q) => q.map((x) => x.id === item.id ? { ...x, status: 'uploading' } : x));
    try {
      const fd = new FormData();
      fd.append('files', item.file);
      const r = await axios.post(
        `${API_URL}/api/live-upload/${profileId}`,
        fd, { params: { token } }
      );
      const res = (r.data?.results || [])[0];
      setQueue((q) => q.map((x) => x.id === item.id
        ? { ...x, status: res?.ok ? 'done' : 'failed',
            thumb_url: res?.thumb_url, face_count: res?.face_count, error: res?.error }
        : x));
    } catch (e) {
      setQueue((q) => q.map((x) => x.id === item.id ? { ...x, status: 'failed', error: e.message } : x));
    }
  };

  // Process queue
  useEffect(() => {
    if (!online) return;
    const queued = queue.find((x) => x.status === 'queued');
    if (queued) uploadOne(queued);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, online]);

  const onPicked = (files) => {
    const arr = Array.from(files || []);
    const items = arr.map((f) => ({ id: `${Date.now()}-${Math.random()}`, file: f, status: 'queued' }));
    setQueue((q) => [...items, ...q]);
    // refresh server status after a moment
    setTimeout(loadStatus, 4000);
  };

  if (status?.error) {
    return (
      <div className="luxe min-h-screen grid place-items-center px-6 text-center">
        <div className="max-w-md">
          <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
          <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>Link expired</h1>
          <p className="text-sm opacity-70">{status.error}. Ask your studio admin to regenerate a fresh 24h link.</p>
        </div>
      </div>
    );
  }

  const doneCount = queue.filter((x) => x.status === 'done').length;
  const failedCount = queue.filter((x) => x.status === 'failed').length;
  const uploadingCount = queue.filter((x) => x.status === 'uploading' || x.status === 'queued').length;

  return (
    <div className="luxe min-h-screen" data-testid="live-mode-page">
      <header className="px-5 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--lux-border)' }}>
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-gold" />
          <span className="text-xs tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>Live · {status?.couple || '...'}</span>
        </div>
        <div className="text-[10px] inline-flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{ background: online ? 'rgba(67,224,127,0.12)' : 'rgba(255,90,90,0.12)',
                   color: online ? '#86EFAC' : '#FFD7C9' }}>
          {online ? <><Wifi className="w-3 h-3" /> Online</> : <><WifiOff className="w-3 h-3" /> Offline (queue saved)</>}
        </div>
      </header>

      <main className="px-5 py-6 max-w-2xl mx-auto pb-32">
        {/* Counter */}
        <div className="lux-glass p-6 mb-5 text-center">
          <div className="font-display text-5xl mb-1" style={{ color: '#D4AF37' }} data-testid="upload-count">
            {status?.total_photos ?? 0}
          </div>
          <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>Photos on the wall</div>
          {(uploadingCount > 0 || failedCount > 0) && (
            <div className="mt-3 text-xs flex justify-center gap-3" style={{ color: 'var(--lux-text)' }}>
              {uploadingCount > 0 && <span><Loader2 className="w-3 h-3 animate-spin inline" /> {uploadingCount} pending</span>}
              {doneCount > 0 && <span className="text-green-400">✓ {doneCount} done</span>}
              {failedCount > 0 && <span className="text-red-300">✗ {failedCount} failed</span>}
            </div>
          )}
        </div>

        {/* Big buttons */}
        <div className="grid grid-cols-1 gap-3 mb-6">
          <BigBtn icon={Camera} label="Take Photo Now" hint="Opens your camera"
            onClick={() => fileRef.current?.click()} testid="take-photo-btn" primary />
          <BigBtn icon={ImageIcon} label="Pick from Gallery" hint="Select multiple"
            onClick={() => galleryRef.current?.click()} testid="pick-gallery-btn" />
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment"
          style={{ display: 'none' }} onChange={(e) => onPicked(e.target.files)} data-testid="camera-input" />
        <input ref={galleryRef} type="file" accept="image/*" multiple
          style={{ display: 'none' }} onChange={(e) => onPicked(e.target.files)} data-testid="gallery-input" />

        {/* Recent uploads */}
        {status?.recent?.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>
              Last uploads
            </div>
            <div className="grid grid-cols-3 gap-2">
              {status.recent.slice(0, 9).map((r) => (
                <a key={r.id} href={r.thumb_url} target="_blank" rel="noopener noreferrer"
                  className="block rounded overflow-hidden" data-testid={`recent-${r.id}`}>
                  <img src={r.thumb_url} alt="" className="w-full h-24 object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Queue */}
        {queue.length > 0 && (
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>
              This session
            </div>
            <div className="grid grid-cols-3 gap-2">
              {queue.map((q) => (
                <div key={q.id} className="relative rounded overflow-hidden" data-testid={`queue-${q.status}`}>
                  {q.thumb_url ? (
                    <img src={q.thumb_url} alt="" className="w-full h-24 object-cover" />
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center" style={{ background: 'var(--lux-panel)' }}>
                      <ImageIcon className="w-5 h-5 opacity-40" />
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: q.status === 'done' ? 'rgba(67,224,127,0.85)' :
                                   q.status === 'failed' ? 'rgba(255,90,90,0.85)' :
                                   'rgba(212,175,55,0.85)',
                      color: '#16110C',
                    }}>
                    {q.status === 'done' ? '✓' :
                     q.status === 'failed' ? '✗' :
                     q.status === 'uploading' ? '…' : 'queued'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <button onClick={loadStatus} aria-label="Refresh"
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full grid place-items-center shadow-lg"
        style={{ background: '#D4AF37', color: '#16110C' }} data-testid="refresh-btn">
        <RefreshCw className="w-5 h-5" />
      </button>
    </div>
  );
};

const BigBtn = ({ icon: Icon, label, hint, onClick, testid, primary }) => (
  <button type="button" onClick={onClick} data-testid={testid}
    className="w-full text-left p-5 rounded-2xl flex items-center gap-4 transition-all hover:scale-[1.01]"
    style={primary
      ? { background: '#D4AF37', color: '#16110C' }
      : { background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}>
    <div className="p-3 rounded-xl"
      style={{ background: primary ? 'rgba(22,17,12,0.15)' : 'rgba(212,175,55,0.1)' }}>
      <Icon className="w-6 h-6" />
    </div>
    <div className="flex-1">
      <div className="font-display text-lg">{label}</div>
      <div className="text-xs opacity-70">{hint}</div>
    </div>
  </button>
);

export default PhotographerLiveMode;
