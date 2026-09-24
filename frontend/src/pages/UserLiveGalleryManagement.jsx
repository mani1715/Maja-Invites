/**
 * UserLiveGalleryManagement
 * -----------------------------------------------------------------------------
 * Host-side live photo management for the logged-in customer/host.
 * Mirrors /admin/profile/:profileId/live-gallery (LiveGalleryManagement.jsx)
 * 1:1 in look-and-feel, but uses the cookie-authenticated user routes
 * exposed by `live_gallery_features.py`:
 *
 *    GET    /api/users/profiles/:profileId/live-gallery/photos
 *    POST   /api/users/profiles/:profileId/live-gallery/upload
 *    DELETE /api/users/profiles/:profileId/live-gallery/:photoId
 *
 * Drag-and-drop or click-to-select multiple photos. Each one uploads with
 * its own progress bar and instantly appears on the public invitation
 * link via the same WebSocket broadcast the wedding side uses.
 *
 * Route: /user/profile/:profileId/live-gallery
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import {
  ArrowLeft, Camera, Upload, Loader2, Trash2, HardDrive,
  Image as ImageIcon, Users, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { useUserAuth } from '@/context/UserAuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const AXIOS_CFG = { withCredentials: true };

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] } }),
};

const fmtBytes = (b) => {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const UserLiveGalleryManagement = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  // BUG 15 FIX: redirect logged-out users back to the landing page sign-in.
  // BUG 25 FIX (bonus): align the back-button target with the actual entry
  // point (/user/dashboard) — handled in the JSX below.
  const { user, loading: authLoading } = useUserAuth();
  const [photos, setPhotos] = useState([]);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ total: 0, storage_bytes: 0, host_count: 0, guest_count: 0 });
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/?signin=1&return=' + encodeURIComponent(window.location.pathname), { replace: true });
    }
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, pr] = await Promise.all([
        axios.get(`${API_URL}/api/users/profiles/${profileId}/live-gallery/photos`, AXIOS_CFG),
        axios.get(`${API_URL}/api/users/profiles`, AXIOS_CFG).catch(() => null),
      ]);
      setPhotos(r.data?.photos || []);
      setStats({
        total: r.data?.total || 0,
        storage_bytes: r.data?.storage_bytes || 0,
        host_count: r.data?.host_count || 0,
        guest_count: r.data?.guest_count || 0,
      });
      if (pr?.data?.profiles) {
        const me = pr.data.profiles.find((p) => p.id === profileId);
        if (me) setProfile(me);
      }
    } catch (e) {
      if (e.response?.status === 401) navigate('/?signin=1');
    } finally {
      setLoading(false);
    }
  }, [profileId, navigate]);

  useEffect(() => { load(); }, [load]);

  const uploadOne = async (file, id) => {
    const fd = new FormData();
    fd.append('files', file);
    try {
      await axios.post(
        `${API_URL}/api/users/profiles/${profileId}/live-gallery/upload`,
        fd,
        {
          ...AXIOS_CFG,
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            const p = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            setUploads((arr) => arr.map((u) => u.id === id ? { ...u, progress: p } : u));
          },
        }
      );
      setUploads((arr) => arr.map((u) => u.id === id ? { ...u, progress: 100, done: true } : u));
    } catch (_) {
      setUploads((arr) => arr.map((u) => u.id === id ? { ...u, error: 'Failed' } : u));
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles?.length) return;
    const queued = acceptedFiles.map((f) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: f.name, progress: 0, done: false, error: null, file: f,
    }));
    setUploads((arr) => [...queued, ...arr]);
    // Upload up to 3 in parallel
    const queue = [...queued];
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item) await uploadOne(item.file, item.id);
      }
    });
    await Promise.all(workers);
    await load();
    setTimeout(() => setUploads((arr) => arr.filter((u) => !u.done)), 3000);
  }, [profileId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'] },
    multiple: true,
  });

  const deletePhoto = async (id) => {
    if (!window.confirm('Remove this photo from the live gallery?')) return;
    try {
      await axios.delete(`${API_URL}/api/users/profiles/${profileId}/live-gallery/${id}`, AXIOS_CFG);
      setPhotos((arr) => arr.filter((p) => p.id !== id));
      setStats((s) => ({ ...s, total: Math.max(0, s.total - 1) }));
    } catch (_) {
      alert('Could not delete photo');
    }
  };

  return (
    <div className="luxe min-h-screen" data-testid="user-live-gallery-management">
      <div className="px-4 md:px-12 py-8 md:py-10 max-w-[1500px] mx-auto">
        <button onClick={() => navigate('/user/dashboard')} className="lux-btn lux-btn-ghost mb-6 inline-flex items-center gap-2" data-testid="ulg-back">
          <ArrowLeft className="w-4 h-4" /> Back to my invitations
        </button>

        {/* Hero */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-10">
          <span className="lux-eyebrow block mb-3">◆ Live Photo Wall</span>
          <h1 className="font-display text-[2.2rem] md:text-[3.6rem] leading-[1.05]" style={{ color: 'var(--lux-text)' }}>
            Live <span className="font-script italic text-gold">photos</span> for your event
          </h1>
          {profile && (
            <p className="mt-3 text-sm tracking-[0.18em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
              {profile.bride_name}{profile.groom_name ? ` & ${profile.groom_name}` : ''} · {profile.event_type}
            </p>
          )}
          <p className="mt-3 text-sm md:text-base max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>
            Drop photos to push them instantly to every guest&apos;s phone. Guests can also share their own — they appear here in real time.
          </p>
          {profile?.invitation_link && (
            <a href={profile.invitation_link} target="_blank" rel="noreferrer"
              className="lux-btn inline-flex items-center gap-2 mt-4 !text-[11px]"
              data-testid="ulg-view-public-link">
              <ExternalLink className="w-3 h-3" /> View public invitation
            </a>
          )}
        </motion.div>

        {/* Stat tiles */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8" data-testid="ulg-stats">
          <Stat icon={<ImageIcon className="w-4 h-4" />} label="Photos" value={stats.total} />
          <Stat icon={<Camera className="w-4 h-4" />} label="By you" value={stats.host_count} />
          <Stat icon={<Users className="w-4 h-4" />} label="By guests" value={stats.guest_count} />
          <Stat icon={<HardDrive className="w-4 h-4" />} label="Storage" value={fmtBytes(stats.storage_bytes)} />
        </motion.div>

        {/* Drop zone */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={2}
          {...getRootProps()}
          className="rounded-xl p-10 md:p-14 mb-8 text-center cursor-pointer transition-all"
          style={{
            border: `2px dashed ${isDragActive ? '#D4AF37' : 'rgba(212,175,55,0.35)'}`,
            background: isDragActive ? 'rgba(212,175,55,0.08)' : 'rgba(212,175,55,0.03)',
          }}
          data-testid="ulg-dropzone"
        >
          <input {...getInputProps()} data-testid="ulg-file-input" />
          <Upload className="w-9 h-9 mx-auto mb-3" style={{ color: '#D4AF37' }} />
          <div className="font-display text-2xl mb-1" style={{ color: 'var(--lux-text)' }}>
            {isDragActive ? 'Drop to upload…' : 'Drop photos here'}
          </div>
          <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            or click to select · JPG, PNG, WebP, HEIC · multiple at once
          </div>
        </motion.div>

        {/* Upload progress queue */}
        {uploads.length > 0 && (
          <div className="space-y-2 mb-8" data-testid="ulg-upload-queue">
            <AnimatePresence>
              {uploads.map((u) => (
                <motion.div key={u.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                  className="lux-glass p-3 flex items-center gap-3" data-testid={`ulg-upload-row-${u.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate" style={{ color: 'var(--lux-text)' }}>{u.name}</div>
                    <div className="h-1 mt-1.5 rounded-full overflow-hidden" style={{ background: 'var(--lux-border)' }}>
                      <div className="h-full transition-all" style={{
                        width: `${u.progress}%`,
                        background: u.error ? '#dc2626' : 'linear-gradient(90deg,#D4AF37,#E8C766)',
                      }} />
                    </div>
                  </div>
                  <div className="text-xs w-12 text-right" style={{ color: u.error ? '#fca5a5' : 'var(--lux-text-muted)' }}>
                    {u.error ? 'Failed' : u.done ? <CheckCircle2 className="w-4 h-4 inline" style={{ color: '#D4AF37' }} /> : `${u.progress}%`}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Photo grid */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3} data-testid="ulg-photos">
          <h3 className="font-display text-2xl mb-5 flex items-center gap-2" style={{ color: 'var(--lux-text)' }}>
            <Camera className="w-5 h-5 text-gold" /> Gallery ({photos.length})
          </h3>
          {loading ? (
            <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#D4AF37' }} /></div>
          ) : photos.length === 0 ? (
            <div className="lux-glass p-10 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              No photos yet. Drop some above — they&apos;ll appear here and on every guest&apos;s invitation instantly.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {photos.map((p) => (
                <motion.div
                  key={p.id} layout
                  initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 22 }}
                  className="relative group rounded-lg overflow-hidden aspect-square"
                  style={{ border: '1px solid var(--lux-border, rgba(212,175,55,0.18))' }}
                  data-testid={`ulg-photo-${p.id}`}
                >
                  <img src={`${API_URL}${p.thumb_url}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}>
                    <span className="self-start px-2 py-0.5 text-[9px] tracking-widest uppercase rounded-full"
                      style={{
                        background: p.source === 'guest' ? 'rgba(232,196,184,0.2)' : 'rgba(212,175,55,0.2)',
                        color: p.source === 'guest' ? '#E8C4B8' : '#E8C766',
                      }}>
                      {p.source}
                    </span>
                    <button onClick={() => deletePhoto(p.id)}
                      className="self-end px-2.5 py-1.5 rounded-md text-xs inline-flex items-center gap-1"
                      style={{ background: 'rgba(139,0,0,0.7)', color: '#FFD7C9' }}
                      data-testid={`ulg-delete-${p.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {p.guest_name && (
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] truncate"
                      style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,248,220,0.85)' }}>
                      {p.guest_name}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

const Stat = ({ icon, label, value }) => (
  <div className="lux-glass p-4 md:p-5">
    <div className="flex items-center gap-1.5 text-[10px] tracking-[0.25em] uppercase mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>
      <span className="text-gold">{icon}</span> {label}
    </div>
    <div className="font-display text-2xl md:text-3xl text-gold leading-none">{value}</div>
  </div>
);

export default UserLiveGalleryManagement;
