/* ════════════════════════════════════════════════════════════════════════
 * EventPhotosPanel — drag-and-drop photo uploader for a single event
 * invitation card.
 *
 * Mounted as a modal from EventInvitationWizard.  Lets the photographer:
 *   • Drop or click-pick multiple image files at once
 *   • See real-time upload progress (per-batch)
 *   • Browse a thumbnail grid of already-uploaded photos for THIS event
 *   • Delete individual photos
 *
 * All photos are tagged with `event_invitation_id` server-side via the
 * /api/admin/profiles/{profile_id}/gallery/bulk-upload endpoint so the
 * public guest gallery can later filter by ceremony.
 * ════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import {
  X, Upload, Image as ImageIcon, Loader2, Trash2, CheckCircle2, AlertTriangle,
  HardDriveDownload,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const MAX_BATCH_BYTES = 80 * 1024 * 1024;  // 80MB per batch (UX cap, backend allows 20MB/file)

export default function EventPhotosPanel({ profileId, invitation, onClose }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);   // 0..100
  const [error, setError] = useState('');
  const [galleryEnabled, setGalleryEnabled] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [lastResult, setLastResult] = useState(null);   // { uploaded, failed, archived, archive_reason }
  // "Also keep a copy in your storage" consent — remembered per browser.
  const [archiveToStorage, setArchiveToStorage] = useState(
    () => (localStorage.getItem('gallery_archive_to_storage') ?? 'true') === 'true',
  );
  const mountedRef = useRef(true);

  const toggleArchive = () => {
    setArchiveToStorage((v) => {
      const next = !v;
      localStorage.setItem('gallery_archive_to_storage', next ? 'true' : 'false');
      return next;
    });
  };

  const headers = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
  }), []);

  const loadPhotos = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // Check gallery enabled status first
      const statsRes = await axios.get(
        `${API_URL}/api/admin/profiles/${profileId}/gallery/stats`,
        { headers: headers() },
      );
      if (!statsRes.data?.enabled) {
        setGalleryEnabled(false);
        setLoading(false);
        return;
      }
      setGalleryEnabled(true);
      const res = await axios.get(
        `${API_URL}/api/admin/profiles/${profileId}/gallery/photos`,
        {
          params: { event_invitation_id: invitation.id, limit: 200 },
          headers: headers(),
        },
      );
      if (mountedRef.current) setPhotos(res.data?.photos || []);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load photos');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [profileId, invitation.id, headers]);

  useEffect(() => {
    mountedRef.current = true;
    loadPhotos();
    return () => { mountedRef.current = false; };
  }, [loadPhotos]);

  const enableGallery = async () => {
    setEnabling(true); setError('');
    try {
      await axios.post(
        `${API_URL}/api/admin/profiles/${profileId}/gallery/enable`,
        { enabled: true },
        { headers: headers() },
      );
      setGalleryEnabled(true);
      await loadPhotos();
    } catch (e) {
      setError(e.response?.data?.detail
        || 'Failed to enable gallery. Check AWS keys in backend/.env.');
    } finally {
      setEnabling(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles?.length) return;
    const totalBytes = acceptedFiles.reduce((s, f) => s + f.size, 0);
    if (totalBytes > MAX_BATCH_BYTES) {
      setError('Batch exceeds 80MB. Upload in smaller chunks.');
      return;
    }
    setUploading(true); setError(''); setProgress(0); setLastResult(null);

    const form = new FormData();
    acceptedFiles.forEach((f) => form.append('files', f));
    form.append('event_invitation_id', invitation.id);
    form.append('archive_to_storage', archiveToStorage ? 'true' : 'false');

    try {
      const res = await axios.post(
        `${API_URL}/api/admin/profiles/${profileId}/gallery/bulk-upload`,
        form,
        {
          headers: { ...headers(), 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
          },
        },
      );
      setLastResult({
        uploaded: res.data?.uploaded || 0,
        failed: res.data?.failed || 0,
        archiveRequested: !!res.data?.archive_requested,
        archived: res.data?.archived || 0,
        archiveReason: res.data?.archive_reason || null,
      });
      await loadPhotos();
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed');
    } finally {
      if (mountedRef.current) { setUploading(false); setProgress(0); }
    }
  }, [profileId, invitation.id, headers, loadPhotos, archiveToStorage]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'] },
    disabled: uploading || !galleryEnabled,
    multiple: true,
  });

  const deletePhoto = async (photoId) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    try {
      await axios.delete(
        `${API_URL}/api/admin/profiles/${profileId}/gallery/photos/${photoId}`,
        { headers: headers() },
      );
      setPhotos((p) => p.filter((x) => x.id !== photoId));
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to delete photo');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8"
      style={{ background: 'rgba(8,5,3,0.82)', backdropFilter: 'blur(10px)' }}
      data-testid="event-photos-panel"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="lux-glass w-full max-w-5xl max-h-[92vh] overflow-y-auto p-7 md:p-9 relative"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full grid place-items-center"
          style={{ border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
          data-testid="event-photos-close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <span className="lux-eyebrow block mb-2">◆ Event Gallery</span>
          <h2 className="font-display text-3xl md:text-4xl" style={{ color: 'var(--lux-text)' }}>
            Photos for{' '}
            <span className="text-gold italic font-script">
              {(invitation.event_type || 'event').charAt(0).toUpperCase()
                + (invitation.event_type || 'event').slice(1)}
            </span>
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            Drop the wedding photos you want guests to find under this ceremony.
            Each photo is automatically face-indexed so guests can search for themselves.
          </p>
        </div>

        {!galleryEnabled && !loading && (
          <div
            className="lux-glass p-6 mb-5 flex items-center justify-between gap-4 flex-wrap"
            data-testid="gallery-disabled-banner"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#E8C766' }} />
              <div>
                <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>
                  Gallery not enabled yet
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                  Enable the live photo gallery for this wedding to start uploading.
                  Requires AWS credentials in <code>backend/.env</code>.
                </div>
              </div>
            </div>
            <button
              onClick={enableGallery}
              disabled={enabling}
              className="lux-btn"
              data-testid="enable-gallery-btn"
            >
              {enabling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {enabling ? 'Enabling…' : 'Enable Gallery'}
            </button>
          </div>
        )}

        {/* "Also keep a copy in storage" consent — asked up-front so the choice
            rides along with the upload (one request, no re-upload). */}
        {galleryEnabled && (
          <button
            type="button"
            onClick={toggleArchive}
            className="w-full mb-4 px-4 py-3 rounded-xl flex items-center gap-3 text-left transition-colors"
            style={{
              background: archiveToStorage ? 'rgba(212,175,55,0.10)' : 'var(--lux-panel)',
              border: `1px solid ${archiveToStorage ? 'rgba(212,175,55,0.45)' : 'var(--lux-border)'}`,
            }}
            data-testid="archive-to-storage-toggle"
            aria-pressed={archiveToStorage}
          >
            <span
              className="w-9 h-9 rounded-full grid place-items-center flex-shrink-0"
              style={{ background: archiveToStorage ? 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' : 'rgba(255,255,255,0.05)' }}
            >
              <HardDriveDownload className="w-4 h-4" style={{ color: archiveToStorage ? '#16110C' : 'var(--lux-text-muted)' }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-display" style={{ color: 'var(--lux-text)' }}>
                Also keep a copy in your storage
              </div>
              <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                Archives each photo to your Cloud Backup so it survives after the live gallery expires.
                {' '}Needs a storage plan.
              </div>
            </div>
            <span
              className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors"
              style={{ background: archiveToStorage ? '#D4AF37' : 'rgba(255,255,255,0.15)' }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                style={{ left: archiveToStorage ? '22px' : '2px' }}
              />
            </span>
          </button>
        )}

        {/* Dropzone */}
        {galleryEnabled && (
          <div
            {...getRootProps()}
            className="rounded-2xl p-8 md:p-12 text-center cursor-pointer transition-all"
            style={{
              border: `2px dashed ${isDragActive ? '#D4AF37' : 'rgba(212,175,55,0.4)'}`,
              background: isDragActive ? 'rgba(212,175,55,0.08)' : 'var(--lux-panel)',
              opacity: uploading ? 0.7 : 1,
            }}
            data-testid="event-photos-dropzone"
          >
            <input {...getInputProps()} data-testid="event-photos-file-input" />
            <div
              className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-4"
              style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}
            >
              {uploading
                ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#16110C' }} />
                : <Upload className="w-6 h-6" style={{ color: '#16110C' }} />
              }
            </div>
            <div className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>
              {uploading
                ? `Uploading… ${progress}%`
                : isDragActive ? 'Release to upload' : 'Drag photos here or click to choose'}
            </div>
            <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
              JPG / PNG / HEIC / WEBP · Up to 20MB per photo · 80MB per batch
            </div>
            {uploading && (
              <div className="mt-4 h-1.5 rounded-full overflow-hidden mx-auto" style={{ maxWidth: 360, background: 'var(--lux-panel)' }}>
                <div
                  className="h-full transition-all"
                  style={{ width: `${progress}%`, background: '#D4AF37' }}
                  data-testid="upload-progress-bar"
                />
              </div>
            )}
          </div>
        )}

        {/* Result banner */}
        {lastResult && (
          <div
            className="mt-4 px-4 py-3 rounded-lg flex items-center gap-3 text-sm"
            style={{
              background: lastResult.failed
                ? 'rgba(139,0,0,0.18)'
                : 'rgba(60,140,80,0.18)',
              border: `1px solid ${lastResult.failed ? 'rgba(255,120,90,0.4)' : 'rgba(120,200,140,0.4)'}`,
              color: 'var(--lux-text)',
            }}
            data-testid="upload-result-banner"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              Uploaded {lastResult.uploaded}{lastResult.failed ? ` · ${lastResult.failed} failed` : ''}
              {lastResult.archiveRequested && (
                lastResult.archived > 0
                  ? ` · ${lastResult.archived} copied to your storage ✓`
                  : lastResult.archiveReason === 'no_storage_plan'
                    ? ' · kept in the live gallery only — add a storage plan to keep copies'
                    : lastResult.archiveReason === 'quota_exceeded'
                      ? ' · storage full — upgrade your plan to keep copies'
                      : ''
              )}
            </span>
          </div>
        )}

        {error && (
          <div
            className="mt-4 px-4 py-3 rounded-lg flex items-center gap-3 text-sm"
            style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(255,120,90,0.4)', color: '#FFD7C9' }}
            data-testid="upload-error-banner"
          >
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Photo grid */}
        <div className="mt-7">
          <div className="flex items-baseline justify-between mb-3">
            <span className="lux-eyebrow">
              ◇ {photos.length} {photos.length === 1 ? 'photo' : 'photos'} in this event
            </span>
            {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#D4AF37' }} />}
          </div>

          {!loading && photos.length === 0 && (
            <div
              className="rounded-xl py-12 text-center"
              style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}
              data-testid="event-photos-empty"
            >
              <ImageIcon className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--lux-text-faint)' }} />
              <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                No photos uploaded for this ceremony yet.
              </div>
            </div>
          )}

          {photos.length > 0 && (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
              data-testid="event-photos-grid"
            >
              <AnimatePresence>
                {photos.map((p) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.25 }}
                    className="relative group rounded-lg overflow-hidden"
                    style={{
                      aspectRatio: '1 / 1',
                      background: 'var(--lux-panel)',
                      border: '1px solid var(--lux-border)',
                    }}
                    data-testid={`event-photo-${p.id}`}
                  >
                    <img
                      src={p.thumb_url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    {p.face_count > 0 && (
                      <span
                        className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[9px] tracking-[0.15em] uppercase"
                        style={{ background: 'rgba(0,0,0,0.65)', color: '#FFE5A0', backdropFilter: 'blur(4px)' }}
                      >
                        {p.face_count} face{p.face_count > 1 ? 's' : ''}
                      </span>
                    )}
                    <button
                      onClick={() => deletePhoto(p.id)}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(139,0,0,0.7)', color: '#FFD7C9' }}
                      data-testid={`event-photo-delete-${p.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
