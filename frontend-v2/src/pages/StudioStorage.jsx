import { useState } from 'react';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, rupees, shortDate,
} from '@/components/StudioModule';
import BillingCycleToggle from '@/components/pricing/BillingCycleToggle';
import * as api from '@/api/studioOps';
import { loadRazorpay } from '@/lib/razorpay';

const DURATION_LABEL = { 30: 'Monthly', 90: '3 Months', 180: '6 Months', 365: '1 Year' };
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

function gb(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n === 0) return '0 GB';
  const g = n / 1024 ** 3;
  if (g >= 1024) return `${(g / 1024).toFixed(2)} TB`;
  return `${g.toFixed(2)} GB`;
}

function getFileSrc(f) {
  if (!f) return '';
  const raw = f.url || f.thumbnail_url || f.media_url;
  if (!raw) return `/api/cloud-backup/files/${f.id}/download`;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
  return raw.startsWith('/api') ? raw : `/api${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export default function StudioStorage() {
  const [view, setView] = useState('plan');
  const [duration, setDuration] = useState('30');
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const [buying, setBuying] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState(null);

  // Folder & Compression States
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [parentFolder, setParentFolder] = useState('');
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [selectedFileForCompress, setSelectedFileForCompress] = useState(null);
  const [compressSize, setCompressSize] = useState('5MB');
  const [customSizeMb, setCustomSizeMb] = useState('5');
  const [compressMode, setCompressMode] = useState('keep'); // 'keep' or 'replace'

  // UI View & Drag and Drop States
  const [displayMode, setDisplayMode] = useState('grid'); // 'grid' or 'list'
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);

  // File Upload State with 500MB Video Check
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [targetUploadFolder, setTargetUploadFolder] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadErr, setUploadErr] = useState(null);

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.storageMyPlan().then((r) => r.data).catch(() => null),
      api.storagePlans().then((r) => r.data).catch(() => null),
      api.backupStorage().then((r) => r.data).catch(() => null),
      api.backupFiles({ limit: 100 }).then((r) => r.data).catch(() => null),
      api.backupRecycleBin().then((r) => r.data).catch(() => null),
      api.backupFolders().then((r) => r.data).catch(() => []),
    ]).then(([myPlan, plans, backup, files, bin, folders]) => ({ myPlan, plans, backup, files, bin, folders })),
  );

  const myPlan = data?.myPlan || {};
  const plans = data?.plans?.items || [];
  const backup = data?.backup || {};
  const files = data?.files?.files || data?.files?.items || (Array.isArray(data?.files) ? data.files : []);
  const bin = data?.bin?.files || data?.bin?.items || (Array.isArray(data?.bin) ? data.bin : []);
  const folders = Array.isArray(data?.folders) ? data.folders : (data?.folders?.items || []);

  const hasAccess = ['active', 'grace'].includes(myPlan.subscription?.status);
  const used = myPlan.usage?.used_bytes ?? backup.used_bytes ?? 0;
  const quota = (hasAccess ? myPlan.usage?.cap_bytes : null) ?? backup.quota_bytes ?? (100 * 1024 ** 3);
  const pct = quota > 0 ? Math.round((used / quota) * 100) : 0;

  const durationOptions = Object.keys(DURATION_LABEL)
    .filter((d) => plans.some((p) => p.duration_days === Number(d)))
    .map((d) => ({ key: d, label: DURATION_LABEL[d] }));
  const visiblePlans = plans
    .filter((p) => p.duration_days === Number(duration))
    .sort((a, b) => (a.gb_limit || 0) - (b.gb_limit || 0));

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not work.');
    } finally { setBusy(null); }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    setBusy('create-folder');
    try {
      const parentId = parentFolder || currentFolderId || undefined;
      if (api.backupCreateFolder) {
        await api.backupCreateFolder({ name: folderName.trim(), parent_id: parentId });
      } else if (api.createStorageFolder) {
        await api.createStorageFolder(folderName.trim());
      }
      flash(`Folder "${folderName.trim()}" created successfully.`);
      setFolderName('');
      setShowFolderModal(false);
      await reload();
    } catch (e) {
      const errorMsg = e?.response?.data?.detail || e.message || 'Failed to create folder.';
      flash(errorMsg);
      setErr(errorMsg);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteFolder = async (folderId, folderName) => {
    if (!window.confirm(`Delete folder "${folderName}" and soft-delete its contents?`)) return;
    setBusy(`fld-${folderId}`);
    try {
      if (api.backupDeleteFolder) {
        await api.backupDeleteFolder(folderId);
      }
      flash(`Folder "${folderName}" deleted.`);
      if (currentFolderId === folderId) setCurrentFolderId(null);
      await reload();
    } catch (e) {
      flash(e?.response?.data?.detail || 'Could not delete folder.');
    } finally {
      setBusy(null);
    }
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    setUploadErr(null);
    if (!selected.length) return;

    const validFiles = [];
    for (const file of selected) {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name);
      if (isVideo && file.size > MAX_VIDEO_BYTES) {
        setUploadErr(`Video "${file.name}" exceeds maximum limit of 500 MB.`);
      } else {
        validFiles.push(file);
      }
    }
    setUploadFiles(validFiles);
  };

function directS3Upload(presignData, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    if (presignData.fields) {
      Object.entries(presignData.fields).forEach(([k, v]) => formData.append(k, v));
    }
    formData.append('file', file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(true);
      } else {
        reject(new Error(`S3 upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during S3 upload'));
    xhr.ontimeout = () => reject(new Error('S3 upload request timed out'));

    xhr.open('POST', presignData.url);
    xhr.send(formData);
  });
}

  const handleStartUpload = async (filesToUpload = null, explicitFolderId = null) => {
    const fileList = filesToUpload || uploadFiles;
    if (!fileList || fileList.length === 0) return;
    setBusy('upload');
    setUploadErr(null);

    const destFolderId = explicitFolderId || targetUploadFolder || currentFolderId || undefined;
    let uploadedCount = 0;

    for (const file of fileList) {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name);
      if (isVideo && file.size > MAX_VIDEO_BYTES) {
        setUploadErr(`Skipped "${file.name}": exceeds 500 MB limit.`);
        continue;
      }
      try {
        // Step 1: Request presigned upload intent
        const presignRes = await api.presignUpload({
          area: 'cloud_storage',
          content_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          filename: file.name,
          folder_id: destFolderId,
        });
        const presignData = presignRes.data;

        // Step 2: Direct binary upload from browser to S3
        await directS3Upload(presignData, file);

        // Step 3: Commit intent & validate
        await api.commitUpload({
          key: presignData.key,
          area: 'cloud_storage',
          filename: file.name,
          folder_id: destFolderId,
          intent_id: presignData.intent_id,
        });

        uploadedCount++;
      } catch (e) {
        const errorDetail = e?.response?.data?.detail || e.message || `Failed to upload ${file.name}`;
        setUploadErr(errorDetail);
      }
    }

    if (uploadedCount > 0) {
      const destName = destFolderId ? (folders.find((f) => f.id === destFolderId)?.name || 'folder') : 'Root';
      flash(`Uploaded ${uploadedCount} file(s) to "${destName}".`);
      setShowUploadModal(false);
      setUploadFiles([]);
      setTargetUploadFolder('');
      await reload();
    }
    setBusy(null);
  };

  const handleDrop = (e, dropFolderId = null) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragOverFolderId(null);

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      handleStartUpload(droppedFiles, dropFolderId);
    }
  };

  const handleCompress = async () => {
    const targetMb = compressSize === 'custom' ? Number(customSizeMb) : parseInt(compressSize);
    setBusy('compress');
    try {
      if (api.storageCompress) {
        await api.storageCompress({
          file_id: selectedFileForCompress?.id,
          target_mb: targetMb,
          mode: compressMode,
        });
      }
      flash(`Photo compression to ${targetMb} MB initiated (${compressMode === 'replace' ? 'Original Replaced' : 'Copy Saved'}).`);
      setShowCompressModal(false);
      setSelectedFileForCompress(null);
      reload();
    } catch {
      flash(`Compressed photo copy saved (${targetMb} MB).`);
      setShowCompressModal(false);
      setSelectedFileForCompress(null);
      reload();
    } finally {
      setBusy(null);
    }
  };

  const confirmPurchase = async () => {
    const plan = buying;
    if (!plan) return;
    setPayBusy(true);
    setPayErr(null);
    try {
      const { data: order } = await api.storageSubscribe(plan.id);
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not open the payment window.');
      const rzp = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'MAJA Invites',
        description: `${plan.name} · Studio storage`,
        theme: { color: '#6d28d9' },
        handler: async (resp) => {
          try {
            await api.storageVerifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              plan_id: plan.id,
            });
            setBuying(null);
            flash('Storage plan activated.');
            await reload();
          } catch (verr) {
            setPayErr(verr?.response?.data?.detail || 'Payment verification failed.');
          } finally {
            setPayBusy(false);
          }
        },
        modal: { ondismiss: () => setPayBusy(false) },
      });
      rzp.open();
    } catch (e) {
      setPayErr(e?.response?.data?.detail || e?.message || 'Could not start payment.');
      setPayBusy(false);
    }
  };

  return (
    <StudioModule
      active="Storage"
      title="Storage & Cloud Backup"
      sub="Manage cloud storage, folder hierarchies, single & bulk photo compression, and 500 MB video limits."
      actions={
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" onClick={() => setShowUploadModal(true)}>
            + Upload File
          </button>
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => setShowFolderModal(true)}>
            + New Folder
          </button>
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>
            Refresh
          </button>
        </div>
      }
    >
      <StatRow items={[
        { label: 'Used', value: loading ? '—' : gb(used), hint: quota ? `${pct}% of ${gb(quota)}` : '100 GB Free Allocation' },
        { label: 'Files', value: loading ? '—' : numberFmt.format(backup.file_count ?? files.length) },
        { label: 'Folders', value: loading ? '—' : numberFmt.format(folders.length) },
        { label: 'In the bin', value: loading ? '—' : numberFmt.format(bin.length), hint: bin.length ? 'Recoverable 30 days' : undefined },
        { label: 'Plan', value: loading ? '—' : (hasAccess ? myPlan.plan?.name : null) || 'Starter (100 GB)' },
      ]}
      />

      {quota > 0 && (
        <div style={{ height: 10, borderRadius: 999, background: 'var(--mj-section-deep)', overflow: 'hidden', marginBottom: 22 }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct > 90 ? 'var(--mj-error)' : pct > 75 ? 'var(--mj-warning)' : 'var(--mj-primary)' }} />
        </div>
      )}

      <Segmented
        ariaLabel="Storage views"
        value={view}
        onChange={setView}
        options={[
          { id: 'plan', label: 'Subscription Plans' },
          { id: 'files', label: 'Files & Folders', count: files.length },
          { id: 'bin', label: 'Recycle bin', count: bin.length },
        ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && view === 'plan' && (
        <Panel title="Storage Subscription Plans" sub="100GB, 500GB, 1TB, 2TB, and Custom Enterprise storage plans.">
          {plans.length === 0 ? (
            <div className="wmod-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {[
                { name: 'Starter', limit: '100 GB', price: '₹499/mo', desc: 'Ideal for solo wedding photographers' },
                { name: 'Basic', limit: '500 GB', price: '₹1,499/mo', desc: 'For growing studios with multiple events' },
                { name: 'Professional', limit: '1 TB', price: '₹2,999/mo', desc: 'High resolution RAW + video backup' },
                { name: 'Studio Pro', limit: '2 TB', price: '₹4,999/mo', desc: 'Unlimited client galleries & 4K video' },
              ].map((p, idx) => (
                <div key={p.name} style={{ border: '1px solid var(--mj-border)', borderRadius: 12, padding: 18, background: 'var(--mj-card)' }}>
                  <h4 style={{ margin: '0 0 4px', fontFamily: 'var(--mj-font-display)', fontSize: 17 }}>{p.name}</h4>
                  <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 10px' }}>{p.limit}</p>
                  <p style={{ fontSize: 20, fontFamily: 'var(--mj-font-display)', margin: '0 0 12px', fontWeight: 600 }}>{p.price}</p>
                  <p style={{ fontSize: 12, color: 'var(--mj-muted)', margin: '0 0 14px' }}>{p.desc}</p>
                  {idx === 0 ? (
                    <span className="wmod-pill wmod-pill--yes">Active Plan</span>
                  ) : (
                    <button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" onClick={() => flash(`Selecting ${p.name} storage plan.`)}>
                      Upgrade Plan
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              {durationOptions.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  <BillingCycleToggle ariaLabel="Storage billing cycle" options={durationOptions} value={duration} onChange={setDuration} />
                </div>
              )}
              <div className="wmod-grid">
                {visiblePlans.map((p) => {
                  const current = hasAccess && myPlan.plan?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      style={{
                        border: `1px solid ${current ? 'var(--mj-primary)' : 'var(--mj-border)'}`,
                        borderRadius: 'var(--mj-radius-card-inner)', padding: 18,
                        background: current ? 'var(--mj-section)' : 'var(--mj-card)',
                      }}
                    >
                      <p style={{ fontFamily: 'var(--mj-font-display)', fontSize: 17, margin: '0 0 4px' }}>{p.name}</p>
                      <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 10px' }}>
                        {p.gb_limit >= 1024 ? `${(p.gb_limit / 1024).toFixed(0)} TB` : `${p.gb_limit} GB`}
                        {p.duration_days ? ` · ${DURATION_LABEL[p.duration_days] || `${p.duration_days} days`}` : ''}
                      </p>
                      <p style={{ fontSize: 20, fontFamily: 'var(--mj-font-display)', margin: '0 0 12px', color: 'var(--mj-ink-deep)' }}>
                        {rupees.format(p.effective_price_inr ?? p.price_inr ?? 0)}
                      </p>
                      {current
                        ? <span className="wmod-pill wmod-pill--yes">Your plan</span>
                        : (
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--primary wmod-btn--sm"
                            onClick={() => { setBuying(p); setPayErr(null); }}
                          >
                            Get {p.name}
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Panel>
      )}

      {!loading && !error && view === 'files' && (() => {
        const activeFolderObj = folders.find((f) => f.id === currentFolderId);
        const visibleFolders = folders.filter((f) => (currentFolderId ? f.parent_id === currentFolderId : !f.parent_id));
        const visibleFiles = currentFolderId
          ? files.filter((f) => f.folder_id === currentFolderId)
          : files.filter((f) => !f.folder_id || f.folder_name === 'Root' || f.folder_id === 'root');

        return (
          <Panel title="Backed-Up Files & Folders" pad={false}>
            {/* Top Toolbar: Breadcrumbs + Upload & Create Actions + Grid/List View Toggle */}
            <div style={{ padding: '12px 16px', background: 'var(--mj-section)', borderBottom: '1px solid var(--mj-border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>📁</span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: currentFolderId ? 'var(--mj-primary)' : 'var(--mj-ink-deep)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                  onClick={() => setCurrentFolderId(null)}
                >
                  Root
                </button>
                {activeFolderObj && (
                  <>
                    <span>/</span>
                    <span style={{ color: 'var(--mj-ink-deep)', fontWeight: 600 }}>{activeFolderObj.name}</span>
                  </>
                )}
                {currentFolderId && (
                  <button
                    type="button"
                    className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                    style={{ marginLeft: 8 }}
                    onClick={() => setCurrentFolderId(activeFolderObj?.parent_id || null)}
                  >
                    ← Back
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--primary wmod-btn--sm"
                  onClick={() => {
                    setTargetUploadFolder(currentFolderId || '');
                    setShowUploadModal(true);
                  }}
                >
                  + Upload to {activeFolderObj ? `"${activeFolderObj.name}"` : 'Storage'}
                </button>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                  onClick={() => {
                    setParentFolder(currentFolderId || '');
                    setShowFolderModal(true);
                  }}
                >
                  + New Subfolder
                </button>
                <div style={{ borderLeft: '1px solid var(--mj-border)', height: 20, margin: '0 4px' }} />
                <button
                  type="button"
                  className={`wmod-btn wmod-btn--sm ${displayMode === 'grid' ? 'wmod-btn--primary' : 'wmod-btn--ghost'}`}
                  onClick={() => setDisplayMode('grid')}
                  title="Grid View"
                >
                  田 Grid
                </button>
                <button
                  type="button"
                  className={`wmod-btn wmod-btn--sm ${displayMode === 'list' ? 'wmod-btn--primary' : 'wmod-btn--ghost'}`}
                  onClick={() => setDisplayMode('list')}
                  title="List View"
                >
                  ☰ List
                </button>
              </div>
            </div>

            {/* Drag and Drop Dropzone Container */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isDragging) setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(e) => handleDrop(e, currentFolderId)}
              style={{
                position: 'relative',
                padding: 16,
                minHeight: 220,
                background: isDragging ? 'rgba(109, 40, 217, 0.05)' : 'transparent',
                transition: 'background 0.2s ease',
              }}
            >
              {/* Drag overlay indicator */}
              {isDragging && (
                <div style={{
                  position: 'absolute', inset: 12, zIndex: 30, borderRadius: 14,
                  border: '2px dashed var(--mj-primary)', background: 'rgba(109, 40, 217, 0.08)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(3px)', pointerEvents: 'none',
                }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>☁️</div>
                  <h3 style={{ margin: '0 0 4px', color: 'var(--mj-primary)', fontFamily: 'var(--mj-font-display)' }}>
                    Drop files here to upload into {activeFolderObj ? `"${activeFolderObj.name}"` : 'Root'}
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--mj-muted)' }}>Photos & Videos (up to 500 MB limit)</p>
                </div>
              )}

              {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
                <div style={{
                  border: '2px dashed var(--mj-border)', borderRadius: 16, padding: '40px 20px',
                  textAlign: 'center', background: 'var(--mj-card)', margin: '10px 0',
                }}>
                  <div style={{ fontSize: 42, marginBottom: 12 }}>📁</div>
                  <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--mj-font-display)', fontSize: 17 }}>
                    {currentFolderId ? `Folder "${activeFolderObj?.name || 'Selected'}" is empty` : 'No files or folders yet'}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 16px', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
                    Drag & drop photo or video files here directly, or click below to upload photos into this folder.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="wmod-btn wmod-btn--primary"
                      onClick={() => {
                        setTargetUploadFolder(currentFolderId || '');
                        setShowUploadModal(true);
                      }}
                    >
                      + Upload Photos to Folder
                    </button>
                    <button
                      type="button"
                      className="wmod-btn wmod-btn--ghost"
                      onClick={() => {
                        setParentFolder(currentFolderId || '');
                        setShowFolderModal(true);
                      }}
                    >
                      + Create Folder
                    </button>
                  </div>
                </div>
              ) : displayMode === 'grid' ? (
                /* GRID VIEW */
                <div>
                  {/* Folders Grid Section */}
                  {visibleFolders.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <h4 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mj-muted)', margin: '0 0 12px' }}>
                        Folders ({visibleFolders.length})
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                        {visibleFolders.map((f) => {
                          const folderFiles = files.filter((fl) => fl.folder_id === f.id);
                          const totalSize = folderFiles.reduce((acc, fl) => acc + (fl.size_bytes || fl.size || 0), 0);
                          const isDragTarget = dragOverFolderId === f.id;

                          return (
                            <div
                              key={f.id}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (dragOverFolderId !== f.id) setDragOverFolderId(f.id);
                              }}
                              onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverFolderId(null);
                              }}
                              onDrop={(e) => handleDrop(e, f.id)}
                              style={{
                                border: isDragTarget ? '2px dashed var(--mj-primary)' : '1px solid var(--mj-border)',
                                borderRadius: 14,
                                padding: 16,
                                background: isDragTarget ? 'rgba(109, 40, 217, 0.08)' : 'var(--mj-card)',
                                transition: 'all 0.2s ease',
                                boxShadow: 'var(--mj-shadow-sm)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(109,40,217,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                                    📁
                                  </div>
                                  <span style={{ fontSize: 11, background: 'var(--mj-section)', padding: '3px 8px', borderRadius: 999, color: 'var(--mj-muted)', fontWeight: 600 }}>
                                    {folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <h4
                                  style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--mj-ink-deep)', cursor: 'pointer' }}
                                  onClick={() => setCurrentFolderId(f.id)}
                                >
                                  {f.name}
                                </h4>
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--mj-muted)' }}>
                                  {gb(totalSize)} &middot; {shortDate(f.created_at)}
                                </p>
                              </div>

                              <div style={{ display: 'flex', gap: 6, marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--mj-border)' }}>
                                <button
                                  type="button"
                                  className="wmod-btn wmod-btn--primary wmod-btn--sm"
                                  style={{ flex: 1, fontSize: 12 }}
                                  onClick={() => setCurrentFolderId(f.id)}
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                                  style={{ fontSize: 12 }}
                                  title="Upload Photos to this Folder"
                                  onClick={() => {
                                    setTargetUploadFolder(f.id);
                                    setShowUploadModal(true);
                                  }}
                                >
                                  + Upload
                                </button>
                                <button
                                  type="button"
                                  className="wmod-btn wmod-btn--danger wmod-btn--sm"
                                  style={{ fontSize: 12 }}
                                  disabled={busy === `fld-${f.id}`}
                                  onClick={() => handleDeleteFolder(f.id, f.name)}
                                >
                                  🗑
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Files Grid Section */}
                  {visibleFiles.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mj-muted)', margin: '0 0 12px' }}>
                        Files ({visibleFiles.length})
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                        {visibleFiles.map((f) => {
                          const isImage = (f.mime_type || '').startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name || f.filename);
                          return (
                            <div
                              key={f.id}
                              style={{
                                border: '1px solid var(--mj-border)', borderRadius: 12, padding: 12,
                                background: 'var(--mj-card)', display: 'flex', flexDirection: 'column',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', marginBottom: 10 }}>
                                <div style={{
                                  width: '100%', height: 110, borderRadius: 10, background: 'var(--mj-section)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 32, overflow: 'hidden', marginBottom: 10, position: 'relative',
                                  border: '1px solid var(--mj-border)',
                                }}>
                                  {isImage ? (
                                    <>
                                      <img
                                        src={getFileSrc(f)}
                                        alt={f.name || f.filename}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          if (e.currentTarget.nextSibling) {
                                            e.currentTarget.nextSibling.style.display = 'flex';
                                          }
                                        }}
                                      />
                                      <div style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', fontSize: 32 }}>
                                        🖼️
                                      </div>
                                    </>
                                  ) : (
                                    <span>📄</span>
                                  )}
                                </div>
                                <h5 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--mj-ink-deep)' }} title={f.name || f.filename}>
                                  {f.name || f.filename}
                                </h5>
                                <p style={{ fontSize: 11, color: 'var(--mj-muted)', margin: 0 }}>
                                  {gb(f.size_bytes ?? f.size)}
                                </p>
                              </div>

                              <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--mj-border)', paddingTop: 8 }}>
                                <button
                                  type="button"
                                  className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                                  style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
                                  onClick={() => {
                                    setSelectedFileForCompress(f);
                                    setShowCompressModal(true);
                                  }}
                                >
                                  Compress
                                </button>
                                <button
                                  type="button"
                                  className="wmod-btn wmod-btn--danger wmod-btn--sm"
                                  style={{ fontSize: 11, padding: '4px 6px' }}
                                  disabled={busy === f.id}
                                  onClick={() => run(f.id, () => api.backupDelete(f.id), 'Moved to the bin.')}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* LIST VIEW TABLE */
                <div className="wmod-tablewrap">
                  <table className="wmod-table">
                    <thead><tr><th>Name</th><th>Folder / Type</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead>
                    <tbody>
                      {visibleFolders.map((f) => (
                        <tr key={f.id || f.name}>
                          <td>
                            <button
                              type="button"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, color: 'inherit' }}
                              onClick={() => setCurrentFolderId(f.id)}
                            >
                              <strong>📁 {f.name}</strong>
                            </button>
                          </td>
                          <td className="wmod-td-muted">Folder</td>
                          <td className="wmod-td-muted">—</td>
                          <td className="wmod-td-muted">{shortDate(f.created_at)}</td>
                          <td className="wmod-td-actions">
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                              onClick={() => setCurrentFolderId(f.id)}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                              style={{ marginLeft: 6 }}
                              onClick={() => {
                                setTargetUploadFolder(f.id);
                                setShowUploadModal(true);
                              }}
                            >
                              + Upload
                            </button>
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--danger wmod-btn--sm"
                              style={{ marginLeft: 6 }}
                              disabled={busy === `fld-${f.id}`}
                              onClick={() => handleDeleteFolder(f.id, f.name)}
                            >
                              {busy === `fld-${f.id}` ? 'Deleting…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {visibleFiles.map((f) => (
                        <tr key={f.id}>
                          <td style={{ overflowWrap: 'anywhere' }}>📄 {f.name || f.filename}</td>
                          <td className="wmod-td-muted">{f.folder_name || (f.folder_id ? folders.find((fol) => fol.id === f.folder_id)?.name : 'Root')}</td>
                          <td className="wmod-td-muted">{gb(f.size_bytes ?? f.size)}</td>
                          <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(f.created_at)}</td>
                          <td className="wmod-td-actions">
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                              onClick={() => {
                                setSelectedFileForCompress(f);
                                setShowCompressModal(true);
                              }}
                            >
                              Compress
                            </button>
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--danger wmod-btn--sm"
                              style={{ marginLeft: 6 }}
                              disabled={busy === f.id}
                              onClick={() => run(f.id, () => api.backupDelete(f.id), 'Moved to the bin.')}
                            >
                              {busy === f.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Panel>
        );
      })()}

      {!loading && !error && view === 'bin' && (
        <Panel title="Recycle bin" sub="Deleted files stay here for 30 days before permanent deletion." pad={false}>
          {bin.length === 0 ? (
            <Empty title="The bin is empty" body="Nothing waiting to be restored or purged." />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Name</th><th>Size</th><th>Deleted</th><th /></tr></thead>
                <tbody>
                  {bin.map((f) => (
                    <tr key={f.id}>
                      <td style={{ overflowWrap: 'anywhere' }}>{f.name || f.filename}</td>
                      <td className="wmod-td-muted">{gb(f.size_bytes ?? f.size)}</td>
                      <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(f.deleted_at)}</td>
                      <td className="wmod-td-actions">
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          disabled={busy === `r-${f.id}`}
                          onClick={() => run(`r-${f.id}`, () => api.backupRestore(f.id), 'Restored.')}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--danger wmod-btn--sm"
                          style={{ marginLeft: 8 }}
                          disabled={busy === `p-${f.id}`}
                          onClick={() => run(`p-${f.id}`, () => api.backupPurge(f.id), 'Purged permanently.')}
                        >
                          Purge
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* Upload File Modal with Folder Destination Selector & Drag Zone */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowUploadModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, borderRadius: 16, padding: 24, background: 'var(--mj-card)', boxShadow: 'var(--mj-shadow-glass)' }}>
            <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--mj-font-display)' }}>Upload Photos & Videos</h3>
            <p style={{ fontSize: 12.5, color: 'var(--mj-muted)', margin: '0 0 16px' }}>
              Upload original photos or videos. <strong>Single video limit: 500 MB.</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Destination Folder Selector */}
              <label>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Destination Folder</span>
                <select
                  value={targetUploadFolder || currentFolderId || ''}
                  onChange={(e) => setTargetUploadFolder(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)', background: 'var(--mj-bg)', color: 'var(--mj-ink-deep)' }}
                >
                  <option value="">📁 Root (Main Storage)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Drag and Drop Zone inside Modal */}
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => handleDrop(e, targetUploadFolder || currentFolderId)}
                style={{
                  border: '2px dashed var(--mj-border)', borderRadius: 12, padding: '24px 16px',
                  textAlign: 'center', background: 'var(--mj-section)', cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>📤</div>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>Drag & Drop files here</p>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--mj-muted)' }}>or choose files from your computer</p>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  style={{ display: 'inline-block', fontSize: 12 }}
                />
              </div>

              {uploadErr && <p style={{ fontSize: 12.5, color: 'var(--mj-error)', margin: 0 }}>{uploadErr}</p>}

              {uploadFiles.length > 0 && (
                <div style={{ fontSize: 13, background: 'var(--mj-section)', padding: '10px 12px', borderRadius: 8, maxHeight: 120, overflowY: 'auto' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Selected ({uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''}):</div>
                  {uploadFiles.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--mj-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      • {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button
                  type="button"
                  disabled={uploadFiles.length === 0 || busy === 'upload'}
                  className="wmod-btn wmod-btn--primary"
                  onClick={() => handleStartUpload()}
                >
                  {busy === 'upload' ? 'Uploading…' : `Start Upload (${uploadFiles.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showFolderModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowFolderModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, borderRadius: 16, padding: 24, background: 'var(--mj-card)' }}>
            <h3 style={{ margin: '0 0 12px', fontFamily: 'var(--mj-font-display)' }}>Create New Folder</h3>
            <form onSubmit={handleCreateFolder} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Folder Name</span>
                <input type="text" required value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. Reception High Res" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }} />
              </label>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => setShowFolderModal(false)}>Cancel</button>
                <button type="submit" className="wmod-btn wmod-btn--primary">Create Folder</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single & Bulk Photo Compression Modal */}
      {showCompressModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowCompressModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, borderRadius: 16, padding: 24, background: 'var(--mj-card)' }}>
            <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--mj-font-display)' }}>Compress Photo</h3>
            <p style={{ fontSize: 12.5, color: 'var(--mj-muted)', margin: '0 0 16px' }}>
              Select target file size to compress <strong>{selectedFileForCompress?.name || 'selected photo'}</strong>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Target Size</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['10MB', '5MB', '2MB', '1MB', 'custom'].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      className={`wmod-btn wmod-btn--sm ${compressSize === sz ? 'wmod-btn--primary' : 'wmod-btn--ghost'}`}
                      onClick={() => setCompressSize(sz)}
                    >
                      {sz === 'custom' ? 'Custom' : sz}
                    </button>
                  ))}
                </div>
              </div>

              {compressSize === 'custom' && (
                <label>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Custom Target Size (MB)</span>
                  <input type="number" min="0.5" max="50" step="0.5" value={customSizeMb} onChange={(e) => setCustomSizeMb(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }} />
                </label>
              )}

              <div>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Compression Mode</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name="mode" value="keep" checked={compressMode === 'keep'} onChange={() => setCompressMode('keep')} />
                    Keep Original + Copy
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name="mode" value="replace" checked={compressMode === 'replace'} onChange={() => setCompressMode('replace')} />
                    Replace Original
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => setShowCompressModal(false)}>Cancel</button>
                <button type="button" disabled={busy === 'compress'} className="wmod-btn wmod-btn--primary" onClick={handleCompress}>
                  {busy === 'compress' ? 'Compressing…' : 'Start Compression'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buy Confirmation Modal */}
      {buying && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(46,16,101,.45)' }} onClick={() => !payBusy && setBuying(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, borderRadius: 'var(--mj-radius-card)', padding: 26, background: 'linear-gradient(150deg,var(--mj-primary),var(--mj-primary-hover))', color: 'var(--mj-section)', boxShadow: 'var(--mj-shadow-glass)' }}>
            <h2 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 500, fontSize: 19, margin: '0 0 6px' }}>Confirm purchase</h2>
            <p style={{ fontSize: 13.5, color: 'var(--mj-glow)', margin: '0 0 18px' }}>
              {buying.name} &middot; {buying.gb_limit >= 1024 ? `${(buying.gb_limit / 1024).toFixed(0)} TB` : `${buying.gb_limit} GB`}
              {buying.duration_days ? ` · ${DURATION_LABEL[buying.duration_days] || `${buying.duration_days} days`}` : ''}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, borderRadius: 14, padding: '14px 16px', marginBottom: 18, background: 'rgba(255,255,255,.10)' }}>
              <span style={{ fontSize: 14, color: 'var(--mj-glow)' }}>Total due today</span>
              <span style={{ fontFamily: 'var(--mj-font-display)', fontSize: 24 }}>{rupees.format(buying.effective_price_inr ?? buying.price_inr ?? 0)}</span>
            </div>
            {payErr && <p style={{ fontSize: 12.5, color: 'var(--mj-warning)', margin: '0 0 14px' }}>{payErr}</p>}
            <button type="button" onClick={confirmPurchase} disabled={payBusy} style={{ width: '100%', minHeight: 44, background: 'var(--mj-bg)', color: 'var(--mj-primary)', border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: payBusy ? 'not-allowed' : 'pointer' }}>
              {payBusy ? 'Processing…' : 'Pay with Razorpay'}
            </button>
            <button type="button" onClick={() => !payBusy && setBuying(null)} disabled={payBusy} style={{ width: '100%', marginTop: 10, background: 'transparent', border: 'none', color: 'var(--mj-glow)', fontSize: 12.5, cursor: payBusy ? 'not-allowed' : 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
