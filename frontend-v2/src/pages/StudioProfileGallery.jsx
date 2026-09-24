import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import * as studioApi from '@/api/studio';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { pickConcurrency } from '@/lib/multipartUploader';
import { reportUploadKbps } from '@/lib/performanceProfile';
import usePerformanceProfile from '@/lib/usePerformanceProfile';
import UploadMethodsPanel from '@/components/gallery/UploadMethodsPanel';
import CameraUploadPanel from '@/components/gallery/CameraUploadPanel';
import PrivacyPanel from '@/components/gallery/PrivacyPanel';
import GallerySettingsPanel from '@/components/gallery/GallerySettingsPanel';
import FaceQuotaPanel, { QuotaExceededNotice } from '@/components/gallery/FaceQuotaPanel';
import './StudioGallery.css';

const TABS = [
  { id: 'photos', label: 'Photos' },
  { id: 'methods', label: 'Upload methods' },
  { id: 'camera', label: 'Camera' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'settings', label: 'Settings' },
];

// Ported from "MAJA Studio Gallery.dc.html" — the photographer's AI face-match
// gallery for a single wedding profile (route carries :profileId).
function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

const numberFmt = new Intl.NumberFormat('en-IN');

// L1 -- direct-to-S3 presign upload for one file: presign -> PUT straight to
// S3 -> commit. Returns { fallback: true } when the caller should silently
// retry via the multipart path (S3 not configured, or the PUT itself failed
// -- e.g. offline, CORS, expired policy); otherwise { fallback: false, result }
// where `result` is commit-upload's response body (ok / duplicate / error).
async function uploadFileViaPresign(profileId, file, onPutStart, reservationId) {
  let presign;
  try {
    const { data } = await studioApi.galleryPresignUpload(profileId, {
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      reservation_id: reservationId,
    });
    presign = data;
  } catch (e) {
    if (e?.response?.status === 503) return { fallback: true };
    throw e;
  }
  if (onPutStart) onPutStart();
  try {
    // Timed so the performance policy adapts to the connection this studio
    // actually has right now, not the one navigator.connection last guessed at.
    const startedAt = (typeof performance !== 'undefined' ? performance : Date).now();
    const putRes = await fetch(presign.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!putRes.ok) return { fallback: true };
    const seconds = ((typeof performance !== 'undefined' ? performance : Date).now() - startedAt) / 1000;
    // Sub-100ms samples are dominated by connection setup, not throughput.
    if (seconds > 0.1) reportUploadKbps((file.size * 8) / 1000 / seconds);
  } catch (_networkErr) {
    return { fallback: true };
  }
  const { data: result } = await studioApi.galleryCommitUpload(profileId, {
    s3_key: presign.s3_key,
    original_name: file.name,
    reservation_id: reservationId,
  });
  return { fallback: false, result };
}

// Files at/above this go multipart (parallel parts). Kept in sync with the
// server's GALLERY_MULTIPART_THRESHOLD; a mismatch is harmless (either path is
// valid for any size), it just changes which lane a borderline file takes.
const MULTIPART_THRESHOLD = 8 * 1024 * 1024;

// L1b -- multipart direct-to-S3 for one big file: create -> presign parts ->
// PUT parts in parallel -> complete. Same { fallback } contract as the presign
// helper: a failure aborts the S3 multipart and signals the caller to retry via
// the server multipart path. Parallel parts are the win on a high-latency link
// where one PUT stream can't saturate the uploader's bandwidth.
async function uploadFileViaMultipart(profileId, file, onPutStart, reservationId) {
  let created;
  try {
    const { data } = await studioApi.galleryMultipartCreate(profileId, {
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      reservation_id: reservationId,
    });
    created = data;
  } catch (e) {
    if (e?.response?.status === 503) return { fallback: true };
    throw e;
  }
  const { s3_key: s3Key, upload_id: uploadId, part_size: partSize } = created;
  const totalParts = Math.max(1, Math.ceil(file.size / partSize));
  const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
  if (onPutStart) onPutStart();
  try {
    const urls = {};
    for (let i = 0; i < partNumbers.length; i += 1000) {
      const batch = partNumbers.slice(i, i + 1000);
      // eslint-disable-next-line no-await-in-loop
      const { data } = await studioApi.galleryMultipartPresign(profileId, {
        s3_key: s3Key, upload_id: uploadId, part_numbers: batch,
      });
      Object.assign(urls, data.urls);
    }

    const done = new Array(totalParts);
    const startedAt = (typeof performance !== 'undefined' ? performance : Date).now();
    let idx = 0;
    const worker = async () => {
      while (idx < partNumbers.length) {
        const n = partNumbers[idx];
        idx += 1;
        const start = (n - 1) * partSize;
        const blob = file.slice(start, Math.min(start + partSize, file.size));
        let attempt = 0;
        let ok = false;
        let lastStatus = 0;
        while (attempt < 3 && !ok) {
          // eslint-disable-next-line no-await-in-loop
          const res = await fetch(urls[String(n)], { method: 'PUT', body: blob });
          if (res.ok) {
            const etag = (res.headers.get('ETag') || '').replace(/"/g, '');
            if (!etag) throw new Error('S3 CORS must expose ETag');
            done[n - 1] = { part_number: n, etag };
            ok = true;
          } else {
            lastStatus = res.status;
            attempt += 1;
          }
        }
        if (!ok) throw new Error(`Part ${n} failed: ${lastStatus}`);
      }
    };
    // Parallel parts, bounded by the shared perf policy (and the browser's own
    // ~6-per-host connection cap). For one big file this is the whole speedup.
    const pool = Math.max(1, Math.min(pickConcurrency(), totalParts));
    await Promise.all(Array.from({ length: pool }, worker));

    const seconds = ((typeof performance !== 'undefined' ? performance : Date).now() - startedAt) / 1000;
    if (seconds > 0.1) reportUploadKbps((file.size * 8) / 1000 / seconds);

    const { data: result } = await studioApi.galleryMultipartComplete(profileId, {
      s3_key: s3Key, upload_id: uploadId, parts: done,
      original_name: file.name, reservation_id: reservationId,
    });
    return { fallback: false, result };
  } catch (_e) {
    // Discard the orphaned S3 parts, then let the caller retry via the server
    // multipart path (slower, but a guaranteed way through).
    try { await studioApi.galleryMultipartAbort(profileId, { s3_key: s3Key, upload_id: uploadId }); } catch (_a) { /* best effort */ }
    return { fallback: true };
  }
}

export default function StudioProfileGallery() {
  const { profileId } = useParams();
  const perf = usePerformanceProfile();
  const vw = useViewportWidth();
  const isPhone = vw < 640;
  const isMobile = vw < 900;
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('photos');
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  // Per-file upload-in-progress stage, keyed by a throwaway client id --
  // 'uploading' | 'processing'. Cleared once the file's row shows up in
  // `photos` with a processing_status (the poll effect below takes it from
  // there: indexing / ready / failed).
  const [fileStages, setFileStages] = useState({});
  const [retryingId, setRetryingId] = useState(null);
  const [quota, setQuota] = useState(null);
  const [quotaError, setQuotaError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Quota is loaded on its own so a slow/failed quota read never blocks the
  // gallery, and so it can be refreshed after every batch without refetching
  // the photo list.
  const loadQuota = useCallback(() => {
    studioApi.galleryQuota(profileId)
      .then(({ data }) => setQuota(data))
      .catch(() => setQuota(null));
  }, [profileId]);

  // One listing page, sized by the shared policy. A 4 GB phone pulling 200 rows
  // of signed URLs at once is the memory spike that makes the grid stutter;
  // this is the knob to turn, not the CSS.
  const photoPageLimit = perf.galleryBatchSize * 4;

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    loadQuota();
    Promise.all([
      studioApi.getProfile(profileId),
      studioApi.galleryStats(profileId),
    ]).then(async ([profileRes, statsRes]) => {
      setProfile(profileRes.data);
      setStats(statsRes.data);
      if (statsRes.data.enabled) {
        const { data } = await studioApi.galleryPhotos(profileId, { limit: photoPageLimit });
        setPhotos(data.photos);
      } else {
        setPhotos([]);
      }
    }).catch((e) => setLoadError(e?.response?.data?.detail || 'Could not load this gallery.'))
      .finally(() => setLoading(false));
  }, [profileId, loadQuota, photoPageLimit]);

  useEffect(() => { load(); }, [load]);

  // Poll the listing every 4s while any photo is still 'indexing' (Rekognition
  // running async on the worker); stop as soon as none are. Re-running this
  // effect off `photos` itself (rather than a persistent setInterval) means it
  // naturally stops rescheduling once the last photo finishes indexing.
  useEffect(() => {
    if (!photos || !photos.some((p) => p.processing_status === 'indexing')) return undefined;
    const t = setTimeout(async () => {
      try {
        const { data } = await studioApi.galleryPhotos(profileId, { limit: photoPageLimit });
        setPhotos(data.photos);
      } catch (_e) { /* transient -- next poll (if still indexing) will retry */ }
    }, 4000);
    return () => clearTimeout(t);
  }, [photos, profileId]);

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await studioApi.galleryEnable(profileId, { enabled: true });
      showToast('AI gallery enabled.');
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Could not enable the gallery.');
    } finally {
      setEnabling(false);
    }
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setQuotaError(null);

    // The WHOLE batch is authorised before a single byte reaches S3. A batch
    // that does not fit is refused outright — uploading part of a wedding and
    // rejecting the rest is worse than uploading none of it, and the studio
    // needs the real numbers to decide what to buy.
    let reservationId = null;
    try {
      const { data } = await studioApi.galleryReserveQuota(profileId, files.length);
      reservationId = data.reservation_id;
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 409 && detail?.code === 'QUOTA_EXCEEDED') {
        setQuotaError(detail);
        loadQuota();
        return;                       // nothing uploaded, nothing half-done
      }
      showToast(typeof detail === 'string' ? detail : 'Could not start the upload.');
      return;
    }

    setUploading(true);
    let uploaded = 0;
    let duplicates = 0;
    let failed = 0;
    const uploadOne = async (file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      setFileStages((prev) => ({ ...prev, [key]: { name: file.name, stage: 'uploading' } }));
      try {
        const markProcessing = () =>
          setFileStages((prev) => ({ ...prev, [key]: { name: file.name, stage: 'processing' } }));
        // Big originals go multipart (parallel parts) so one slow stream can't
        // cap throughput; smaller files stay single-PUT.
        const outcome = file.size >= MULTIPART_THRESHOLD
          ? await uploadFileViaMultipart(profileId, file, markProcessing, reservationId)
          : await uploadFileViaPresign(profileId, file, markProcessing, reservationId);
        if (outcome.fallback) {
          // Presign unavailable (S3 unconfigured) or the direct PUT failed --
          // same multipart path this page always used, silently.
          setFileStages((prev) => ({ ...prev, [key]: { name: file.name, stage: 'processing' } }));
          const { data } = await studioApi.galleryBulkUploadMultipart(profileId, [file]);
          uploaded += data.uploaded || 0;
          failed += data.failed || 0;
        } else if (outcome.result?.duplicate) {
          duplicates += 1;
        } else if (outcome.result?.ok) {
          uploaded += 1;
        } else {
          failed += 1;
        }
      } catch (_e) {
        failed += 1;
      } finally {
        setFileStages((prev) => { const next = { ...prev }; delete next[key]; return next; });
      }
    };
    // ponytail: N-at-a-time pool (N = pickConcurrency, adaptive to
    // connection/device) instead of one file at a time -- was strictly
    // sequential before, same idea as the server's own _BULK_CONCURRENCY
    // does for multipart.
    const pool = Math.max(1, Math.min(pickConcurrency(), files.length));   // canonical policy
    let idx = 0;
    const worker = async () => {
      while (idx < files.length) {
        const file = files[idx];
        idx += 1;
        await uploadOne(file); // eslint-disable-line no-await-in-loop
      }
    };
    await Promise.all(Array.from({ length: pool }, worker));

    // Hand back whatever the batch did not use (duplicates and failures never
    // became photos, so they never consumed a purchased slot). The server
    // expires an abandoned hold anyway; this just returns it immediately.
    if (reservationId && uploaded < files.length) {
      try { await studioApi.galleryReleaseQuota(profileId, reservationId); } catch (_e) { /* swept later */ }
    }

    setUploading(false);
    const parts = [];
    if (uploaded) parts.push(`Uploaded ${uploaded} photo${uploaded === 1 ? '' : 's'}`);
    if (duplicates) parts.push(`${duplicates} already in gallery`);
    if (failed) parts.push(`${failed} failed`);
    showToast(parts.length ? `${parts.join(', ')}.` : 'No photos uploaded.');
    load();
  };

  const handleRetryPhoto = async (photoId) => {
    setRetryingId(photoId);
    try {
      await studioApi.galleryRetryPhoto(photoId);
      showToast('Retrying...');
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Could not retry this photo.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDelete = async (photoId) => {
    if (!window.confirm('Delete this photo? This also removes it from face-search matching.')) return;
    setDeletingId(photoId);
    try {
      await studioApi.galleryDeletePhoto(profileId, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Could not delete this photo.');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelected = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll = () => setSelected(new Set((photos || []).map((p) => p.id)));
  const clearSelection = () => setSelected(new Set());
  const exitSelect = () => { setSelectMode(false); clearSelection(); };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected photo${ids.length === 1 ? '' : 's'}? This also removes them from face-search matching.`)) return;
    setBulkDeleting(true);
    try {
      await studioApi.galleryBulkDeletePhotos(profileId, ids);
      const removed = new Set(ids);
      setPhotos((prev) => prev.filter((p) => !removed.has(p.id)));
      exitSelect();
      loadQuota();
      showToast(`Deleted ${ids.length} photo${ids.length === 1 ? '' : 's'}.`);
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Could not delete the selected photos.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDownloadAll = async () => {
    setDownloadingAll(true);
    try {
      const { data } = await studioApi.galleryDownloadAll(profileId);
      const files = data.files || [];
      for (let i = 0; i < files.length; i += 1) {
        const a = document.createElement('a');
        a.href = files[i].url;
        a.download = files[i].name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
      }
      showToast(`Started ${files.length} download${files.length === 1 ? '' : 's'}.`);
    } catch (e) {
      showToast(e?.response?.data?.detail || 'No photos to download yet.');
    } finally {
      setDownloadingAll(false);
    }
  };

  const shellCols = isMobile ? '1fr' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px 1fr');
  const mainPadding = isPhone ? '20px 16px 40px' : (isMobile ? '28px 24px 44px' : '40px 48px 56px');
  const heroPad = isPhone ? '22px 18px' : (isMobile ? '26px 24px' : '30px 30px');
  const h1Size = isMobile ? 'clamp(26px,6.4vw,30px)' : 'clamp(28px,3.2vw,38px)';
  const gridCols = isPhone ? 'repeat(2, 1fr)' : (isMobile ? 'repeat(3, 1fr)' : (vw < 1200 ? 'repeat(4, 1fr)' : 'repeat(auto-fill,minmax(150px,1fr))'));
  const gridGap = isPhone ? '10px' : '14px';

  const coupleLine = profile ? [profile.bride_name, profile.groom_name].filter(Boolean).join(' & ') : '';

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <MobileNav panel="studio" active="Dashboard" />
      <div style={{ background: '#ffffff', color: '#111827', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols }}>
        {!isMobile && <StudioNav active="Dashboard" />}

        <main id="main-content" className="stgal-main" style={{ padding: mainPadding, minWidth: 0 }}>
          <Link to={`/studio/wedding/${profileId}`} data-mj-link style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#4b5563', fontSize: 12.5, marginBottom: 14, minHeight: 44 }}>&larr; {coupleLine || 'Back to wedding'}</Link>

          <section className="stgal-wash" style={{ borderRadius: 20, padding: heroPad, marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: h1Size, lineHeight: 1.15, margin: '0 0 4px' }}>Gallery</h1>
                {coupleLine && <p style={{ fontSize: 13.5, color: '#4b5563', margin: 0 }}>{coupleLine}</p>}
              </div>
              <button
                type="button"
                className="stgal-btn"
                disabled={!stats?.enabled || uploading}
                onClick={() => fileInputRef.current?.click()}
                style={{ background: '#6d28d9', color: '#ffffff', border: 'none', padding: '0 20px', minHeight: 46, borderRadius: 14, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}
              >
                {uploading ? 'Uploading…' : 'Upload photos'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                hidden
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            <div role="tablist" aria-label="Gallery sections" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  onClick={() => setActiveTab(t.id)}
                  className="stgal-chip"
                  style={{
                    borderRadius: 999, padding: '0 18px', minHeight: 44, display: 'flex', alignItems: 'center',
                    fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                    background: activeTab === t.id ? '#6d28d9' : 'rgba(255,255,255,.66)',
                    color: activeTab === t.id ? '#ffffff' : '#4b5563',
                    boxShadow: activeTab === t.id ? '0 10px 26px rgba(109,40,217,.24)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === 'methods' && (
            <UploadMethodsPanel profileId={profileId} galleryEnabled={!!stats?.enabled} isPhone={isPhone} />
          )}
          {activeTab === 'camera' && (
            <CameraUploadPanel profileId={profileId} />
          )}
          {activeTab === 'privacy' && (
            <PrivacyPanel profileId={profileId} />
          )}
          {activeTab === 'settings' && (
            <GallerySettingsPanel profileId={profileId} stats={stats} />
          )}

          {activeTab === 'photos' && (
            <div style={{ display: 'grid', gap: 16, marginBottom: 20,
                          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(300px,380px)' }}>
              <div
                onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (stats?.enabled && !uploading) handleFiles(e.dataTransfer?.files);
                }}
                onClick={() => { if (stats?.enabled && !uploading) fileInputRef.current?.click(); }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && stats?.enabled && !uploading) {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={stats?.enabled ? 0 : -1}
                aria-disabled={!stats?.enabled || uploading}
                aria-label="Drop photos here or browse to upload"
                className="stgal-glass"
                style={{
                  borderRadius: 16, padding: isPhone ? 22 : 34, textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  cursor: stats?.enabled && !uploading ? 'pointer' : 'not-allowed',
                  outline: dragOver ? '2px dashed #6d28d9' : '1px dashed rgba(17,24,39,.16)',
                  outlineOffset: -6,
                  opacity: stats?.enabled ? 1 : .55,
                  transition: 'outline-color .15s ease',
                }}
              >
                <span style={{ fontFamily: "'Spectral',serif", fontSize: isPhone ? 16 : 18, color: '#111827' }}>
                  {dragOver ? 'Release to upload' : 'Drop photos here'}
                </span>
                <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                  or click to browse &middot; JPEG, PNG, WebP, HEIC
                </span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  Originals upload straight to storage at full resolution.
                </span>
              </div>

              <FaceQuotaPanel quota={quota} isPhone={isPhone} />
            </div>
          )}

          {activeTab === 'photos' && (
            <QuotaExceededNotice
              detail={quotaError}
              isPhone={isPhone}
              onDismiss={() => setQuotaError(null)}
            />
          )}

          {activeTab === 'photos' && Object.keys(fileStages).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {Object.entries(fileStages).map(([key, s]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#6b7280' }}>
                  <span className="stgal-skel" style={{ width: 14, height: 14, borderRadius: 999, flexShrink: 0 }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#6d28d9' }}>{s.stage === 'uploading' ? 'Uploading...' : 'Processing...'}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'photos' && loading && (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: gridGap }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="stgal-skel" style={{ aspectRatio: 1, borderRadius: 16 }} />
              ))}
            </div>
          )}

          {activeTab === 'photos' && !loading && loadError && (
            <div style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', textAlign: 'center', padding: '56px 24px' }}>
              <p style={{ fontFamily: "'Spectral',serif", fontSize: 18, margin: '0 0 8px' }}>Couldn&rsquo;t load this gallery.</p>
              <p style={{ fontSize: 13.5, color: '#dc2626', margin: '0 0 18px' }}>{loadError}</p>
              <button type="button" onClick={load} className="stgal-btn" style={{ background: '#6d28d9', color: '#fff', border: 'none', padding: '0 22px', minHeight: 44, borderRadius: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
            </div>
          )}

          {activeTab === 'photos' && !loading && !loadError && stats && !stats.enabled && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', textAlign: 'center', padding: '72px 24px' }}>
              <p style={{ fontFamily: "'Spectral',serif", fontSize: 19, color: '#111827', margin: '0 0 10px' }}>AI gallery isn&rsquo;t enabled for this wedding yet.</p>
              <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 22px' }}>Turn it on to let guests find their own photos with face search.</p>
              <button type="button" onClick={handleEnable} disabled={enabling} className="stgal-btn" style={{ background: '#6d28d9', color: '#fff', border: 'none', padding: '0 24px', minHeight: 46, borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {enabling ? 'Enabling…' : 'Enable AI gallery'}
              </button>
            </div>
          )}

          {activeTab === 'photos' && !loading && !loadError && stats?.enabled && (
            <>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20, fontSize: 13, color: '#6b7280' }}>
                <span>{numberFmt.format(stats.total_photos)} photos</span>
                <span>&middot;</span>
                <span>{numberFmt.format(stats.photos_with_faces)} face-matched</span>
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={downloadingAll || !stats.total_photos}
                  className="stgal-btn stgal-btn-outline"
                  style={{ marginLeft: 'auto', minHeight: 36, padding: '0 16px', borderRadius: 999, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  {downloadingAll ? 'Preparing…' : 'Download all'}
                </button>
                <button
                  type="button"
                  onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                  disabled={!photos || !photos.length}
                  className="stgal-btn stgal-btn-outline"
                  style={{ minHeight: 36, padding: '0 16px', borderRadius: 999, border: '1px solid #6d28d9', background: selectMode ? '#6d28d9' : '#ffffff', color: selectMode ? '#fff' : '#6d28d9', fontSize: 12.5, fontWeight: 600, cursor: (!photos || !photos.length) ? 'not-allowed' : 'pointer' }}
                >
                  {selectMode ? 'Done' : 'Select'}
                </button>
              </div>

              {selectMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 14px', padding: '10px 14px', borderRadius: 14, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#5b21b6' }}>{selected.size} selected</span>
                  <button type="button" onClick={selectAll} style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, border: '1px solid #c4b5fd', background: '#fff', color: '#6d28d9', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Select all</button>
                  <button type="button" onClick={clearSelection} style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, border: '1px solid #c4b5fd', background: '#fff', color: '#6d28d9', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                  <button type="button" onClick={handleBulkDelete} disabled={bulkDeleting || !selected.size}
                    style={{ marginLeft: 'auto', minHeight: 34, padding: '0 16px', borderRadius: 999, border: 'none', background: selected.size ? '#dc2626' : '#f0cccc', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: selected.size ? 'pointer' : 'not-allowed' }}>
                    {bulkDeleting ? 'Deleting…' : `Delete selected${selected.size ? ` (${selected.size})` : ''}`}
                  </button>
                </div>
              )}

              {photos && photos.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: gridGap }}>
                  {photos.map((p) => (
                    <div key={p.id} className="stgal-photo"
                      onClick={selectMode ? () => toggleSelected(p.id) : undefined}
                      style={{ aspectRatio: 1, borderRadius: 16, overflow: 'hidden', border: selectMode && selected.has(p.id) ? '2px solid #6d28d9' : '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(124,58,237,.10)', cursor: selectMode ? 'pointer' : 'default' }}>
                      <img src={resolveMediaUrl(p.thumb_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {/* processing_status: 'ready' renders no badge at all -- the default,
                          unremarkable state; only the states worth flagging get one. */}
                      {p.processing_status === 'indexing' && (
                        <span style={{ position: 'absolute', left: 8, top: 8, fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'rgba(109,40,217,.78)', color: '#fff' }}>Indexing...</span>
                      )}
                      {p.processing_status === 'failed' && (
                        <span style={{ position: 'absolute', left: 8, top: 8, fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'rgba(220,38,38,.85)', color: '#fff' }}>Failed</span>
                      )}
                      {p.processing_status === 'missing' && (
                        <span style={{ position: 'absolute', left: 8, top: 8, fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'rgba(107,114,128,.85)', color: '#fff' }}>Missing</span>
                      )}
                      {p.processing_status === 'indexed_no_face' && (
                        <span style={{ position: 'absolute', left: 8, top: 8, fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'rgba(107,114,128,.72)', color: '#fff' }}>No face</span>
                      )}
                      {p.face_count > 0 && (
                        <span style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'rgba(46,16,101,.78)', color: '#fff' }}>{p.face_count} face{p.face_count === 1 ? '' : 's'}</span>
                      )}
                      {p.processing_status === 'failed' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRetryPhoto(p.id); }}
                          disabled={retryingId === p.id}
                          style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999, border: 'none', background: '#111827', color: '#fff', cursor: 'pointer' }}
                        >
                          {retryingId === p.id ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                      {selectMode ? (
                        <span aria-hidden style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 999, border: '2px solid #fff', background: selected.has(p.id) ? '#6d28d9' : 'rgba(46,16,101,.42)', color: '#fff', fontSize: 15, lineHeight: '22px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }}>
                          {selected.has(p.id) ? '✓' : ''}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="stgal-del"
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          aria-label="Delete photo"
                          style={{ position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 999, border: 'none', background: 'rgba(46,16,101,.78)', color: '#fff', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}
                        >
                          {deletingId === p.id ? '…' : '✕'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', textAlign: 'center', padding: '72px 24px' }}>
                  <p style={{ fontFamily: "'Spectral',serif", fontSize: 19, color: '#111827', margin: 0 }}>No photos yet.</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <div style={{ display: toast ? 'flex' : 'none', position: 'fixed', left: 0, right: 0, bottom: 26, justifyContent: 'center', pointerEvents: 'none', zIndex: 80 }}>
        <div className="stgal-toast" style={{ background: '#2e1065', color: '#ffffff', fontSize: 13, padding: '12px 20px', borderRadius: 14, boxShadow: '0 18px 40px rgba(109,40,217,.30)' }}>{toast}</div>
      </div>
    </div>
  );
}
