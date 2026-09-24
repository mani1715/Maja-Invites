import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { QRCodeSVG } from 'qrcode.react';
import {
  Camera, ArrowLeft, Upload, Smartphone, Wifi, HardDrive, Users, ToggleLeft, ToggleRight,
  Copy, Check, RefreshCw, Trash2, ExternalLink, Loader2, AlertCircle, BarChart3,
  ImageIcon, Sparkles, Clock, Shield, Eye, Settings, Download,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const GalleryManager = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  // BUG 15 FIX: redirect logged-out visitors to /admin/login instead of
  // letting the page hang on silent 401s.
  const { admin, loading: authLoading } = useAuth();
  const [tab, setTab] = useState('photos');
  const [config, setConfig] = useState(null);
  const [creds, setCreds] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [stats, setStats] = useState(null);
  const [awsHealth, setAwsHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain');
    return () => document.body.classList.remove('luxe', 'luxe-grain');
  }, []);

  useEffect(() => {
    if (!authLoading && !admin) {
      navigate('/studio/login', { replace: true });
    }
  }, [authLoading, admin, navigate]);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_token')}` });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, sRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/gallery/aws/health`, { headers: headers() }),
        axios.get(`${API_URL}/api/admin/profiles/${profileId}/gallery/stats`, { headers: headers() }),
      ]);
      setAwsHealth(hRes.data);
      setStats(sRes.data);
      if (sRes.data?.enabled) {
        const [cRes, pRes] = await Promise.all([
          axios.get(`${API_URL}/api/admin/profiles/${profileId}/gallery/credentials`, { headers: headers() }),
          axios.get(`${API_URL}/api/admin/profiles/${profileId}/gallery/photos`, { headers: headers() }),
        ]);
        setCreds(cRes.data);
        setPhotos(pRes.data?.photos || []);
        setConfig({ enabled: true });
      } else {
        setConfig({ enabled: false });
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.detail || 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const enableGallery = async () => {
    setEnabling(true); setMsg(null);
    try {
      await axios.post(`${API_URL}/api/admin/profiles/${profileId}/gallery/enable`,
        { enabled: true, confidence_threshold: 90 }, { headers: headers() });
      setMsg({ type: 'ok', text: 'Gallery enabled! AWS face collection ready.' });
      await loadAll();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.detail || 'Failed to enable' });
    } finally { setEnabling(false); }
  };

  const updateMethods = async (methods) => {
    try {
      await axios.patch(`${API_URL}/api/admin/profiles/${profileId}/gallery/upload-methods`,
        { upload_methods: methods }, { headers: headers() });
      setCreds((p) => p ? { ...p, upload_methods: methods } : p);
      setMsg({ type: 'ok', text: 'Methods saved' });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: 'err', text: 'Save failed' });
    }
  };

  const regenToken = async () => {
    try {
      await axios.post(`${API_URL}/api/admin/profiles/${profileId}/gallery/regenerate-token`,
        {}, { headers: headers() });
      await loadAll();
      setMsg({ type: 'ok', text: 'New 24h token generated' });
      setTimeout(() => setMsg(null), 2400);
    } catch (e) {
      setMsg({ type: 'err', text: 'Regen failed' });
    }
  };

  const deletePhoto = async (id) => {
    if (!window.confirm('Permanently delete this photo? It will also be removed from face recognition.')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/profiles/${profileId}/gallery/photos/${id}`,
        { headers: headers() });
      setPhotos((p) => p.filter((x) => x.id !== id));
    } catch (e) { setMsg({ type: 'err', text: 'Delete failed' }); }
  };

  // Aug 2026 — backend no longer streams a ZIP; download-all now returns a
  // JSON manifest of signed URLs ({ files: [{ name, url }] }). We trigger one
  // <a download> click per file, sequentially, 300ms apart, so the browser
  // doesn't treat a burst of clicks as a popup flood.
  const [downloadingAll, setDownloadingAll] = useState(false);
  const downloadAllPhotos = async () => {
    if (downloadingAll) return;
    if (!photos.length) {
      setMsg({ type: 'err', text: 'No photos in this gallery yet.' });
      return;
    }
    setDownloadingAll(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(
        `${API_URL}/api/admin/profiles/${profileId}/gallery/download-all`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const files = data?.files || [];
      if (!files.length) {
        setMsg({ type: 'err', text: 'No photos in this gallery yet.' });
        return;
      }
      for (let i = 0; i < files.length; i++) {
        const { name, url } = files[i];
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', name || `photo-${i + 1}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        setMsg({ type: 'ok', text: `Downloading ${i + 1}/${files.length}…` });
        if (i < files.length - 1) await new Promise((r) => setTimeout(r, 300));
      }
      setMsg({ type: 'ok', text: `Downloaded ${files.length} photos.` });
    } catch (e) {
      setMsg({ type: 'err', text: 'Download failed. Please try again.' });
    } finally {
      setDownloadingAll(false);
    }
  };

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1800); } catch {}
  };

  if (loading) {
    return <div className="luxe min-h-screen grid place-items-center"><Loader2 className="w-7 h-7 text-gold animate-spin" /></div>;
  }

  return (
    <div className="luxe min-h-screen pb-20">
      <header className="px-6 md:px-12 py-6 flex items-center justify-between border-b" style={{ borderColor: 'var(--lux-border)' }}>
        <button onClick={() => navigate('/studio/dashboard')} className="inline-flex items-center gap-2 text-sm tracking-[0.15em] uppercase opacity-80 hover:opacity-100" data-testid="back-dashboard">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <div className="flex items-center gap-3">
          <Camera className="w-5 h-5 text-gold" />
          <h1 className="font-display text-lg md:text-2xl" style={{ color: 'var(--lux-text)' }}>Live AI Gallery</h1>
        </div>
        <div className="text-[10px] tracking-[0.2em] uppercase opacity-60">
          {awsHealth?.s3_reachable && awsHealth?.rekognition_reachable ? (
            <span className="text-green-400">● AWS connected</span>
          ) : <span className="text-red-400">● AWS error</span>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-12 py-10">
        <AnimatePresence>
          {msg && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-6 px-4 py-3 rounded-lg text-sm inline-flex items-center gap-2"
              style={{
                background: msg.type === 'ok' ? 'rgba(0,170,80,0.12)' : 'rgba(139,0,0,0.15)',
                border: `1px solid ${msg.type === 'ok' ? 'rgba(67,224,127,0.3)' : 'rgba(255,90,90,0.3)'}`,
                color: msg.type === 'ok' ? '#86EFAC' : '#FFD7C9',
              }} data-testid="gal-msg">
              {msg.type === 'ok' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        {!config?.enabled ? (
          <EnableHero onEnable={enableGallery} enabling={enabling} awsHealth={awsHealth} />
        ) : (
          <>
            {/* Stats banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat icon={ImageIcon} label="Photos" value={stats?.total_photos || 0} />
              <Stat icon={Users}     label="With faces" value={stats?.photos_with_faces || 0} />
              <Stat icon={Clock}     label="Last upload" value={stats?.last_upload_at ? new Date(stats.last_upload_at).toLocaleTimeString() : '—'} />
              <Stat icon={Shield}    label="Auto-delete" value={stats?.auto_delete_at ? new Date(stats.auto_delete_at).toLocaleDateString() : '—'} accent />
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              <TabBtn id="photos" icon={ImageIcon}   active={tab} onClick={setTab} label="Photos"  testid="tab-photos" />
              <TabBtn id="upload" icon={Upload}      active={tab} onClick={setTab} label="Upload methods" testid="tab-upload" />
              <TabBtn id="bulk"   icon={Sparkles}    active={tab} onClick={setTab} label="Bulk upload" testid="tab-bulk" />
              <TabBtn id="settings" icon={Settings}  active={tab} onClick={setTab} label="Settings" testid="tab-settings" />
            </div>

            {tab === 'photos'   && <PhotosTab photos={photos} onDelete={deletePhoto} onDownloadAll={downloadAllPhotos} downloading={downloadingAll} />}
            {tab === 'upload'   && <UploadMethodsTab creds={creds} onUpdate={updateMethods} onRegen={regenToken} onCopy={copy} copied={copied} />}
            {tab === 'bulk'     && <BulkTab profileId={profileId} onUploaded={loadAll} />}
            {tab === 'settings' && <SettingsTab stats={stats} creds={creds} />}
          </>
        )}
      </main>
    </div>
  );
};

// ----- Subviews -----

const EnableHero = ({ onEnable, enabling, awsHealth }) => (
  <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
    className="lux-glass p-8 md:p-12 text-center max-w-3xl mx-auto">
    <Camera className="w-12 h-12 text-gold mx-auto mb-4 opacity-80" />
    <h2 className="font-display text-3xl md:text-4xl mb-3" style={{ color: 'var(--lux-text)' }}>
      Enable <span className="font-script italic text-gold">Live AI Gallery</span>
    </h2>
    <p className="text-sm md:text-base leading-relaxed max-w-xl mx-auto mb-6" style={{ color: 'var(--lux-text)' }}>
      Photographers upload photos in real-time. Guests find theirs by uploading a single selfie — AWS Rekognition matches faces with 90%+ accuracy. Everything auto-deletes 1 day after the wedding link expires.
    </p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-left">
      <Feature icon={Smartphone} text="Phone Live mode (QR scan)" />
      <Feature icon={Upload}     text="Bulk drag-drop" />
      <Feature icon={Sparkles}   text="Guest QR upload" />
      <Feature icon={Shield}     text="Auto-delete after wedding" />
    </div>
    {!awsHealth?.configured && (
      <div className="text-xs px-3 py-2 rounded mb-4 inline-block"
        style={{ background: 'rgba(139,0,0,0.15)', color: '#FFD7C9' }}>
        ⚠️ AWS not configured. Add AWS_* env vars and restart backend.
      </div>
    )}
    <button onClick={onEnable} disabled={enabling || !awsHealth?.configured}
      className="lux-btn inline-flex items-center gap-2 disabled:opacity-50" data-testid="enable-gallery">
      {enabling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
      Enable Gallery
    </button>
    <p className="text-[10px] mt-4 opacity-60 tracking-widest uppercase">
      Est. cost ~₹70 per wedding (500 photos · 200 searches)
    </p>
  </motion.div>
);

const Stat = ({ icon: Icon, label, value, accent }) => (
  <div className="lux-glass p-4">
    <div className="flex items-center gap-2 mb-1">
      <Icon className="w-3.5 h-3.5" style={{ color: accent ? '#D4AF37' : 'var(--lux-text-muted)' }} />
      <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
    </div>
    <div className="font-display text-xl md:text-2xl" style={{ color: accent ? '#D4AF37' : 'var(--lux-text)' }}>{value}</div>
  </div>
);

const Feature = ({ icon: Icon, text }) => (
  <div className="flex items-center gap-2 p-3 rounded-lg" style={{ border: '1px solid var(--lux-border)' }}>
    <Icon className="w-4 h-4 text-gold flex-shrink-0" />
    <span className="text-xs" style={{ color: 'var(--lux-text)' }}>{text}</span>
  </div>
);

const TabBtn = ({ id, icon: Icon, active, onClick, label, testid }) => (
  <button onClick={() => onClick(id)} type="button" data-testid={testid}
    className="px-4 py-2 rounded-full text-xs tracking-[0.15em] uppercase inline-flex items-center gap-2 transition-all"
    style={active === id
      ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
      : { background: 'transparent', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}>
    <Icon className="w-3.5 h-3.5" /> {label}
  </button>
);

const PhotosTab = ({ photos, onDelete, onDownloadAll, downloading }) => {
  if (!photos || photos.length === 0) {
    return (
      <div className="lux-glass p-12 text-center">
        <ImageIcon className="w-10 h-10 mx-auto text-gold opacity-60 mb-3" />
        <p className="text-sm" style={{ color: 'var(--lux-text)' }}>No photos yet. Go to <strong>Upload methods</strong> or <strong>Bulk upload</strong> to add some.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={onDownloadAll}
          disabled={downloading}
          className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
          data-testid="gallery-download-all"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? 'Downloading…' : `Download All Photos (${photos.length})`}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {photos.map((p) => (
        <div key={p.id} className="relative group lux-glass p-1 rounded-lg overflow-hidden" data-testid={`photo-${p.id}`}>
          <img src={p.thumb_url} alt="" className="w-full h-40 object-cover rounded" loading="lazy" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
            <a href={p.original_url} target="_blank" rel="noopener noreferrer"
              className="lux-btn-ghost text-xs inline-flex items-center gap-1" data-testid={`view-${p.id}`}>
              <Eye className="w-3 h-3" /> View
            </a>
            <button onClick={() => onDelete(p.id)}
              className="text-xs text-red-300 inline-flex items-center gap-1 hover:text-red-200" data-testid={`delete-${p.id}`}>
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
          {p.face_count > 0 && (
            <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(212,175,55,0.85)', color: '#16110C' }}>
              {p.face_count} face{p.face_count > 1 ? 's' : ''}
            </span>
          )}
        </div>
      ))}
      </div>
    </div>
  );
};

const UploadMethodsTab = ({ creds, onUpdate, onRegen, onCopy, copied }) => {
  if (!creds) return <div className="text-sm opacity-70">Loading credentials…</div>;
  const m = creds.upload_methods || {};
  const toggle = (key) => onUpdate({ ...m, [key]: !m[key] });

  // BUG K FIX: backend builds `live_upload_url` as `${FRONTEND_URL}/live/...`,
  // but when FRONTEND_URL is unset the value comes back as a relative path
  // (`/live/{id}?token=...`). The QR code library renders a blank/invalid QR
  // for relative URLs, and the "Copy" button copies an unusable link. Prefix
  // with the current origin so the QR is always scan-able even without env.
  const liveRaw = creds.live_upload_url || '';
  const liveUrl = liveRaw && liveRaw.startsWith('/')
    ? `${window.location.origin}${liveRaw}`
    : liveRaw;
  return (
    <div className="space-y-5">
      {/* Phone Live */}
      <section className="lux-glass p-6 space-y-3">
        <Header icon={Smartphone} title="Phone Live Mode (Recommended)" subtitle="Photographer scans the QR, opens the live page on phone, takes photos that auto-upload." />
        <MethodToggle active={m.phone_live_enabled} onClick={() => toggle('phone_live_enabled')} testid="toggle-phone-live" />
        {m.phone_live_enabled && (
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5 pt-3">
            <div className="bg-white p-3 rounded-lg flex items-center justify-center">
              <QRCodeSVG value={liveUrl} size={170} level="M" />
            </div>
            <div className="space-y-2">
              <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>Live URL (24h)</div>
              <div className="flex gap-2 items-center">
                <code className="text-xs flex-1 px-3 py-2 rounded-lg overflow-x-auto font-mono"
                  style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}>
                  {liveUrl}
                </code>
                <button onClick={() => onCopy(liveUrl, 'live')} className="lux-btn-ghost inline-flex items-center gap-1 text-xs" data-testid="copy-live-url">
                  {copied === 'live' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[10px] opacity-60 mt-2">
                Expires: {creds.live_token_expires_at ? new Date(creds.live_token_expires_at).toLocaleString() : '—'}
              </div>
              <button onClick={onRegen} className="lux-btn-ghost inline-flex items-center gap-2 text-xs mt-2" data-testid="regen-token">
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate 24h token
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Phone tether — DSLR via brand app */}
      <section className="lux-glass p-6 space-y-3">
        <Header icon={Camera} title="Phone + DSLR Tether" subtitle="Pair your DSLR to your phone via Canon Camera Connect / Sony Imaging Edge / Nikon SnapBridge. Then use Phone Live mode above to forward photos to the website." />
        <MethodToggle active={m.phone_tether_enabled} onClick={() => toggle('phone_tether_enabled')} testid="toggle-tether" />
      </section>

      {/* WiFi SD Card */}
      <section className="lux-glass p-6 space-y-3">
        <Header icon={HardDrive} title="WiFi SD Card (FlashAir / EzShare)" subtitle="Configure your WiFi SD card to POST every new photo to the URL below." />
        <MethodToggle active={m.wifi_sd_card_enabled} onClick={() => toggle('wifi_sd_card_enabled')} testid="toggle-sd" />
        {m.wifi_sd_card_enabled && (
          <div className="pt-3 space-y-2">
            <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>POST URL</div>
            <div className="flex gap-2 items-center">
              <code className="text-xs flex-1 px-3 py-2 rounded-lg overflow-x-auto font-mono"
                style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}>
                {creds.sd_card_post_url}
              </code>
              <button onClick={() => onCopy(creds.sd_card_post_url, 'sd')} className="lux-btn-ghost inline-flex items-center gap-1 text-xs" data-testid="copy-sd-url">
                {copied === 'sd' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-[10px] opacity-60">Method: POST · field name: <code className="text-gold">files</code> · accepts multiple JPEGs</div>
          </div>
        )}
      </section>

      {/* DSLR FTP — skipped on K8s */}
      <section className="lux-glass p-6 space-y-3 opacity-70">
        <Header icon={Wifi} title="DSLR WiFi FTP (coming soon)" subtitle="Direct camera→server FTP. Requires self-hosting on a VPS. Skipped in this preview build." />
        <div className="text-[10px] tracking-[0.2em] uppercase text-yellow-200/70">Disabled — needs port 2121 exposed</div>
      </section>

      {/* Bulk */}
      <section className="lux-glass p-6 space-y-3">
        <Header icon={Upload} title="Bulk Upload (Web)" subtitle="Drag & drop hundreds of photos from your laptop. Best for post-event archiving." />
        <MethodToggle active={m.bulk_upload_enabled} onClick={() => toggle('bulk_upload_enabled')} testid="toggle-bulk" />
      </section>

      {/* Guest contributions */}
      <section className="lux-glass p-6 space-y-3">
        <Header icon={Users} title="Guest Contributions" subtitle="Let guests upload their candid photos to the same gallery." />
        <MethodToggle active={m.guest_contributions_enabled} onClick={() => toggle('guest_contributions_enabled')} testid="toggle-guest" />
      </section>
    </div>
  );
};

const Header = ({ icon: Icon, title, subtitle }) => (
  <div className="flex items-start gap-3">
    <div className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.12)' }}>
      <Icon className="w-4 h-4 text-gold" />
    </div>
    <div className="flex-1">
      <h3 className="font-display text-base md:text-lg" style={{ color: 'var(--lux-text)' }}>{title}</h3>
      <p className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>{subtitle}</p>
    </div>
  </div>
);

const MethodToggle = ({ active, onClick, testid }) => (
  <button type="button" onClick={onClick} data-testid={testid}
    className="inline-flex items-center gap-2 text-xs"
    style={{ color: active ? '#D4AF37' : 'var(--lux-text-muted)' }}>
    {active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
    <span className="tracking-[0.15em] uppercase">{active ? 'Enabled' : 'Disabled'}</span>
  </button>
);

const BulkTab = ({ profileId, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, results: [] });

  const onDrop = useCallback(async (accepted) => {
    if (!accepted.length) return;
    setUploading(true);
    setProgress({ done: 0, total: accepted.length, results: [] });
    const headers = { Authorization: `Bearer ${localStorage.getItem('admin_token')}` };
    // upload in chunks of 5 to avoid huge multipart
    const chunkSize = 5;
    const results = [];
    for (let i = 0; i < accepted.length; i += chunkSize) {
      const chunk = accepted.slice(i, i + chunkSize);
      const fd = new FormData();
      chunk.forEach((f) => fd.append('files', f));
      try {
        const r = await axios.post(
          `${API_URL}/api/admin/profiles/${profileId}/gallery/bulk-upload`,
          fd, { headers });
        results.push(...(r.data?.results || []));
      } catch (e) {
        results.push(...chunk.map((f) => ({ ok: false, filename: f.name, error: e.message })));
      }
      setProgress({ done: Math.min(i + chunk.length, accepted.length), total: accepted.length, results: [...results] });
    }
    setUploading(false);
    onUploaded?.();
  }, [profileId, onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'] }, multiple: true,
  });

  return (
    <div className="space-y-5">
      <div {...getRootProps()}
        className="lux-glass p-12 text-center cursor-pointer transition-all"
        style={{ border: isDragActive ? '2px dashed #D4AF37' : '2px dashed rgba(212,175,55,0.3)' }}
        data-testid="bulk-dropzone">
        <input {...getInputProps()} data-testid="bulk-file-input" />
        <Upload className="w-10 h-10 mx-auto text-gold opacity-70 mb-3" />
        <p className="text-sm md:text-base" style={{ color: 'var(--lux-text)' }}>
          {isDragActive ? 'Drop your photos here…' : 'Drag & drop photos here, or click to browse'}
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--lux-text-muted)' }}>
          JPG / PNG / HEIC — up to 20 MB each — uploaded in batches of 5
        </p>
      </div>

      {uploading && (
        <div className="lux-glass p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span style={{ color: 'var(--lux-text)' }}>Uploading {progress.done} / {progress.total}</span>
            <span className="text-gold">{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--lux-panel)' }}>
            <div className="h-full bg-gold transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {progress.results.length > 0 && !uploading && (
        <div className="lux-glass p-4 max-h-60 overflow-y-auto">
          <div className="text-xs mb-2 tracking-widest uppercase opacity-70">Results</div>
          {progress.results.map((r, i) => (
            <div key={i} className="text-xs py-1 flex items-center gap-2">
              {r.ok ? <Check className="w-3 h-3 text-green-400" /> : <AlertCircle className="w-3 h-3 text-red-400" />}
              <span style={{ color: 'var(--lux-text)' }}>{r.filename}</span>
              {r.ok && r.face_count > 0 && <span className="text-gold text-[10px]">· {r.face_count} face(s)</span>}
              {!r.ok && <span className="text-red-300 text-[10px]">· {r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SettingsTab = ({ stats, creds }) => (
  <div className="space-y-5">
    <div className="lux-glass p-6">
      <Header icon={Shield} title="Auto-delete schedule" subtitle="All photos, faces, and selfies are wiped exactly 1 day after your wedding link expires. No refunds possible after this." />
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div>
          <div className="opacity-60 tracking-widest uppercase">Wedding photos delete on</div>
          <div className="font-display text-lg text-gold">{stats?.auto_delete_at ? new Date(stats.auto_delete_at).toLocaleString() : '—'}</div>
        </div>
        <div>
          <div className="opacity-60 tracking-widest uppercase">Rekognition collection</div>
          <div className="font-mono text-xs break-all" style={{ color: 'var(--lux-text)' }}>{creds?.aws_collection_id || '—'}</div>
        </div>
      </div>
    </div>
    <div className="lux-glass p-6">
      <Header icon={BarChart3} title="Usage by upload method" subtitle="How photos got into the gallery." />
      <div className="mt-3 space-y-1 text-sm">
        {Object.entries(stats?.by_method || {}).map(([k, v]) => (
          <div key={k} className="flex justify-between" style={{ color: 'var(--lux-text)' }}>
            <span className="capitalize">{k.replace('_', ' ')}</span><span>{v}</span>
          </div>
        ))}
        {Object.keys(stats?.by_method || {}).length === 0 && <div className="text-xs opacity-60">No uploads yet.</div>}
      </div>
    </div>
  </div>
);

export default GalleryManager;
