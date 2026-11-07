import { useState, useEffect, useRef } from 'react';
import StudioModule, {
  Loading, ErrorPanel, Toast, useFlash, useAsync, rupees, shortDate,
} from '@/components/StudioModule';
import BillingCycleToggle from '@/components/pricing/BillingCycleToggle';
import * as api from '@/api/studioOps';
import { loadRazorpay } from '@/lib/razorpay';

const DURATION_LABEL = { 30: 'Monthly', 90: '3 Months', 180: '6 Months', 365: '1 Year' };
const MAX_SINGLE_PHOTO_BYTES = 250 * 1024 * 1024; // 250 MB
const MAX_SINGLE_VIDEO_BYTES = 2048 * 1024 * 1024; // 2 GB

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${parseFloat((n / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatRupees(n) {
  try {
    if (rupees && typeof rupees.format === 'function') {
      return rupees.format(Number(n || 0));
    }
  } catch (e) {}
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

const SESSION_ASSET_VERSION = Date.now();
function mediaSrc(url, file) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  const ver = file?.updated_at ? new Date(file.updated_at).getTime() : (file?.uploaded_at ? new Date(file.uploaded_at).getTime() : SESSION_ASSET_VERSION);
  return `${url}${sep}v=${ver}_${SESSION_ASSET_VERSION}`;
}

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
        reject(new Error(`Storage server returned error code ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Your internet connection was interrupted'));
    xhr.ontimeout = () => reject(new Error('Upload connection timed out'));

    xhr.open('POST', presignData.url);
    xhr.send(formData);
  });
}

export default function StudioStorage() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);

  // Main navigation & layout views
  const [viewMode, setViewMode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('view') || sessionStorage.getItem('storage_viewMode') || 'files';
    } catch (e) {
      return 'files';
    }
  });
  const [displayMode, setDisplayMode] = useState(() => {
    try {
      return sessionStorage.getItem('storage_displayMode') || 'grid';
    } catch (e) {
      return 'grid';
    }
  });

  // Navigation & Folder Stack
  const [currentFolderId, setCurrentFolderId] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('folder') || sessionStorage.getItem('storage_currentFolderId') || null;
    } catch (e) {
      return null;
    }
  });
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState(() => {
    try {
      const saved = sessionStorage.getItem('storage_folderBreadcrumbs');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [{ id: null, name: 'Storage' }];
  });

  // Filters & Search
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [selectedFileType, setSelectedFileType] = useState(''); // '' | 'photo' | 'video'
  const [favoriteOnly, setFavoriteOnly] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('favorite') === 'true' || sessionStorage.getItem('storage_favoriteOnly') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [sortBy, setSortBy] = useState('uploaded_at_desc');
  // View Scope: 'folders' (hierarchical folder navigation) or 'all' (all photos across account)
  const [viewScope, setViewScope] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('scope') || sessionStorage.getItem('storage_viewScope') || 'folders';
    } catch (e) {
      return 'folders';
    }
  });

  // Selection state
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState(new Set());

  // Lightbox Modal
  const [lightboxFile, setLightboxFile] = useState(null);

  // Folder Modal state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderClientId, setFolderClientId] = useState('');
  const [folderEventId, setFolderEventId] = useState('');

  // Rename Modal
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [itemToRename, setItemToRename] = useState(null); // { type: 'file'|'folder', id, name }
  const [renameValue, setRenameValue] = useState('');

  // Compress Modal
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [compressFile, setCompressFile] = useState(null);
  const [compressSizeMb, setCompressSizeMb] = useState(2);
  const [compressReplace, setCompressReplace] = useState(false); // Default: Keep Original + Copy

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]); // Array of File objects
  const [uploadFolderId, setUploadFolderId] = useState('');
  const [uploadClientId, setUploadClientId] = useState('');
  const [uploadEventId, setUploadEventId] = useState('');
  const [uploadErr, setUploadErr] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // { total, done, pct, currentFile, statusMsg }
  const [isDragging, setIsDragging] = useState(false);

  // Plans & Payment State
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [duration, setDuration] = useState('30');
  const [payBusy, setPayBusy] = useState(false);

  // Custom Enterprise Modal
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  const [entStorageGb, setEntStorageGb] = useState('2048');
  const [entMonthlyUploads, setEntMonthlyUploads] = useState('5000 photos');
  const [entExpectedDownloads, setEntExpectedDownloads] = useState('200 GB/month');
  const [entStudioName, setEntStudioName] = useState('');
  const [entPhone, setEntPhone] = useState('');
  const [entEmail, setEntEmail] = useState('');
  const [entNotes, setEntNotes] = useState('');

  // Move & Assign Modals
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState('');
  const [showAssignClientModal, setShowAssignClientModal] = useState(false);
  const [assignClientId, setAssignClientId] = useState('');
  const [showAssignEventModal, setShowAssignEventModal] = useState(false);
  const [assignEventId, setAssignEventId] = useState('');

  const fileInputRef = useRef(null);

  // Async data fetching
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.storageDashboard().then(r => r.data).catch(() => null),
      api.storageMyPlan().then(r => r.data).catch(() => null),
      api.storagePlans().then(r => r.data).catch(() => null),
      api.storageFolders({
        parent_id: currentFolderId || undefined,
        client_id: selectedClient || undefined,
        event_id: selectedEvent || undefined,
        search: search || undefined,
      }).then(r => r.data).catch(() => ({ folders: [] })),
      api.storageFiles({
        folder_id: viewScope === 'all' || search.trim() ? 'all' : (currentFolderId || (selectedClient || selectedEvent || favoriteOnly ? 'all' : 'root')),
        client_id: selectedClient || undefined,
        event_id: selectedEvent || undefined,
        search: search.trim() || undefined,
        file_type: selectedFileType || undefined,
        is_favorite: favoriteOnly ? true : undefined,
        sort_by: sortBy,
        limit: 200,
      }).then(r => r.data).catch(() => ({ items: [], total: 0 })),
      api.getStorageClients().then(r => r.data).catch(() => ({ clients: [] })),
      api.getStorageEvents().then(r => r.data).catch(() => ({ events: [] })),
      api.storageTrash().then(r => r.data).catch(() => ({ items: [] })),
    ]).then(([dashboard, myPlan, plans, foldersRes, filesRes, clientsRes, eventsRes, trashRes]) => ({
      dashboard,
      myPlan,
      plans,
      folders: foldersRes?.folders || [],
      files: filesRes?.items || [],
      clients: clientsRes?.clients || [],
      events: eventsRes?.events || [],
      trash: trashRes?.items || [],
    })),
    [currentFolderId, viewScope, selectedClient, selectedEvent, search, selectedFileType, favoriteOnly, sortBy]
  );

  const dashboard = data?.dashboard || {};
  const myPlan = data?.myPlan || {};
  const plans = data?.plans?.items || [];
  const folders = data?.folders || [];
  const files = data?.files || [];
  const clients = data?.clients || [];
  const events = data?.events || [];
  const trashItems = data?.trash || [];

  const totalUsedBytes = dashboard.used_bytes || myPlan.usage?.used_bytes || 0;
  const totalCapBytes = dashboard.total_bytes || myPlan.usage?.cap_bytes || (100 * 1024 ** 3);
  const remainingBytes = Math.max(0, totalCapBytes - totalUsedBytes);
  const usagePct = totalCapBytes > 0 ? Math.min(100, Math.round((totalUsedBytes / totalCapBytes) * 100)) : 0;

  const photoCount = dashboard.photo_count ?? files.filter(f => (f.content_type || '').startsWith('image/')).length;
  const videoCount = dashboard.video_count ?? files.filter(f => (f.content_type || '').startsWith('video/')).length;
  const totalAccountFolderCount = dashboard.folder_count ?? folders.length;
  const currentViewFolderCount = folders.length;
  const trashCount = trashItems.length;

  // Clear selections when navigating
  useEffect(() => {
    setSelectedFileIds(new Set());
    setSelectedFolderIds(new Set());
  }, [currentFolderId, selectedClient, selectedEvent, viewMode]);

  // Sync navigation & filter state with sessionStorage and URL parameters
  useEffect(() => {
    try {
      sessionStorage.setItem('storage_viewMode', viewMode);
      sessionStorage.setItem('storage_viewScope', viewScope);
      if (currentFolderId) {
        sessionStorage.setItem('storage_currentFolderId', currentFolderId);
      } else {
        sessionStorage.removeItem('storage_currentFolderId');
      }
      sessionStorage.setItem('storage_folderBreadcrumbs', JSON.stringify(folderBreadcrumbs));
      sessionStorage.setItem('storage_favoriteOnly', String(favoriteOnly));
      sessionStorage.setItem('storage_displayMode', displayMode);

      const params = new URLSearchParams(window.location.search);
      if (viewMode !== 'files') params.set('view', viewMode); else params.delete('view');
      if (viewScope === 'all') params.set('scope', 'all'); else params.delete('scope');
      if (currentFolderId) params.set('folder', currentFolderId); else params.delete('folder');
      if (favoriteOnly) params.set('favorite', 'true'); else params.delete('favorite');
      const newQuery = params.toString();
      const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
      window.history.replaceState(null, '', newUrl);
    } catch (e) {}
  }, [viewMode, viewScope, currentFolderId, folderBreadcrumbs, favoriteOnly, displayMode]);

  // Navigate folder helper
  const navigateToFolder = (folderId, folderName) => {
    setViewScope('folders');
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setFolderBreadcrumbs([{ id: null, name: 'Storage' }]);
    } else {
      const idx = folderBreadcrumbs.findIndex(b => b.id === folderId);
      if (idx !== -1) {
        setFolderBreadcrumbs(folderBreadcrumbs.slice(0, idx + 1));
      } else {
        setFolderBreadcrumbs([...folderBreadcrumbs, { id: folderId, name: folderName || 'Folder' }]);
      }
    }
  };

  // Toggle selection
  const toggleSelectFile = (id) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectFolder = (id) => {
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedFileIds.size === files.length && selectedFolderIds.size === folders.length) {
      setSelectedFileIds(new Set());
      setSelectedFolderIds(new Set());
    } else {
      setSelectedFileIds(new Set(files.map(f => f.id)));
      setSelectedFolderIds(new Set(folders.map(f => f.id)));
    }
  };

  // Handle File Input Selection
  const handleSelectFiles = (incomingFiles) => {
    setUploadErr(null);
    const validList = [];
    let errText = null;

    for (const file of incomingFiles) {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name);
      if (isVideo && file.size > MAX_SINGLE_VIDEO_BYTES) {
        errText = `Video "${file.name}" is larger than the 2 GB limit.`;
      } else if (!isVideo && file.size > MAX_SINGLE_PHOTO_BYTES) {
        errText = `Photo "${file.name}" is larger than the 250 MB limit.`;
      } else {
        validList.push({
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          file,
          customName: file.name,
        });
      }
    }

    if (errText) setUploadErr(errText);
    setUploadFiles(prev => [...prev, ...validList]);

    // Reset file input element value so selecting the SAME file again triggers onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Folder creation
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    setBusy('create-folder');
    try {
      await api.createStorageFolder({
        name: folderName.trim(),
        parent_id: currentFolderId || undefined,
        client_id: folderClientId || undefined,
        event_id: folderEventId || undefined,
      });
      flash(`Folder "${folderName.trim()}" created successfully.`);
      setFolderName('');
      setFolderClientId('');
      setFolderEventId('');
      setShowFolderModal(false);
      await reload();
    } catch (e) {
      flash(e?.response?.data?.detail || 'Failed to create folder.');
    } finally {
      setBusy(null);
    }
  };

  // Rename action
  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!itemToRename || !renameValue.trim()) return;
    setBusy('rename');
    try {
      if (itemToRename.type === 'file') {
        await api.updateStorageFile(itemToRename.id, { name: renameValue.trim() });
      } else {
        // Folder rename
        await api.createStorageFolder({ id: itemToRename.id, name: renameValue.trim() });
      }
      flash('Renamed successfully.');
      setShowRenameModal(false);
      setItemToRename(null);
      await reload();
    } catch (e) {
      flash(e?.response?.data?.detail || 'Failed to rename.');
    } finally {
      setBusy(null);
    }
  };

  const handleToggleFavorite = async (fileId, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    // Optimistic in-place update so there is zero flicker or layout shift
    if (data && data.files) {
      data.files = data.files.map(f => f.id === fileId ? { ...f, is_favorite: !f.is_favorite } : f);
    }
    try {
      await api.toggleFavoriteStorageFile(fileId);
      await reload();
    } catch (err) {
      flash('Could not update favorite status.');
      await reload();
    }
  };

  const handleTrashFile = async (fileId, fileName) => {
    setBusy(`trash-${fileId}`);
    try {
      await api.trashStorageFile(fileId);
      flash(`"${fileName || 'File'}" moved to Recycle Bin.`);
      await reload();
    } catch (e) {
      flash(e?.response?.data?.detail || 'Failed to move file to Recycle Bin.');
    } finally {
      setBusy(null);
    }
  };

  const handleRestoreFile = async (fileId, fileName) => {
    setBusy(`restore-${fileId}`);
    try {
      await api.restoreStorageFile(fileId);
      flash(`"${fileName || 'File'}" restored.`);
      await reload();
    } catch (e) {
      flash('Failed to restore file.');
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteFolder = async (folderId, folderName) => {
    if (!window.confirm(`Move folder "${folderName}" to Recycle Bin?`)) return;
    setBusy(`fld-${folderId}`);
    try {
      await api.deleteStorageFolder(folderId);
      flash(`Folder "${folderName}" moved to Recycle Bin.`);
      if (currentFolderId === folderId) navigateToFolder(null);
      await reload();
    } catch (e) {
      flash('Failed to delete folder.');
    } finally {
      setBusy(null);
    }
  };

  // Bulk Operations
  const handleBulkAction = async (action, extraPayload = {}) => {
    const fileIds = Array.from(selectedFileIds);
    const folderIds = Array.from(selectedFolderIds);
    if (!fileIds.length && !folderIds.length) return;

    setBusy(`bulk-${action}`);
    try {
      await api.bulkStorageFiles({
        action,
        file_ids: fileIds,
        folder_ids: folderIds,
        ...extraPayload,
      });
      flash(`Action "${action}" completed on selected items.`);
      setSelectedFileIds(new Set());
      setSelectedFolderIds(new Set());
      setShowMoveModal(false);
      setShowAssignClientModal(false);
      setShowAssignEventModal(false);
      await reload();
    } catch (e) {
      flash(e?.response?.data?.detail || 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  // Photo Optimization
  const handleCompress = async () => {
    if (!compressFile) return;
    setBusy('compress');
    try {
      const res = await api.storageCompress({
        file_id: compressFile.id,
        target_mb: Number(compressSizeMb),
        replace_original: compressReplace,
      });
      flash(`Optimized photo successfully! (${res.data?.processed || 1} photo processed)`);
      setShowCompressModal(false);
      setCompressFile(null);
      await reload();
    } catch (e) {
      flash(e?.response?.data?.detail || 'Photo optimization failed.');
    } finally {
      setBusy(null);
    }
  };

  // Complete Direct-to-S3 Upload Flow
  const handleStartUpload = async (e) => {
    if (e) e.preventDefault();
    if (!uploadFiles.length) return;

    const targetFolder = uploadFolderId || currentFolderId || undefined;
    const firstFileName = uploadFiles[0].customName || uploadFiles[0].file?.name || uploadFiles[0].name || 'photo';
    setUploadProgress({
      total: uploadFiles.length,
      done: 0,
      pct: 0,
      currentFile: firstFileName,
      statusMsg: 'Uploading your photos…',
    });

    let completed = 0;
    for (let i = 0; i < uploadFiles.length; i++) {
      const item = uploadFiles[i];
      const file = item.file || item;
      const fileNameToUse = (item.customName && item.customName.trim()) ? item.customName.trim() : (file.name || 'photo');

      setUploadProgress({
        total: uploadFiles.length,
        done: completed,
        pct: Math.round((completed / uploadFiles.length) * 100),
        currentFile: fileNameToUse,
        statusMsg: `Uploading ${fileNameToUse}…`,
      });

      try {
        // Step 1: Presign Request
        const presignRes = await api.presignUpload({
          area: 'cloud_storage',
          filename: fileNameToUse,
          content_type: file.type || 'image/jpeg',
          size_bytes: file.size,
          folder_id: targetFolder,
          client_id: uploadClientId || selectedClient || undefined,
          event_id: uploadEventId || selectedEvent || undefined,
        });
        const presignData = presignRes.data;

        // Step 2: Direct-to-S3 Upload
        await directS3Upload(presignData, file, (filePct) => {
          const overall = Math.round(((completed + filePct / 100) / uploadFiles.length) * 100);
          setUploadProgress({
            total: uploadFiles.length,
            done: completed,
            pct: overall,
            currentFile: fileNameToUse,
            statusMsg: `Uploading ${fileNameToUse} (${filePct}%)…`,
          });
        });

        // Step 3: Commit Request
        setUploadProgress({
          total: uploadFiles.length,
          done: completed,
          pct: Math.round(((completed + 0.9) / uploadFiles.length) * 100),
          currentFile: fileNameToUse,
          statusMsg: `Checking and processing ${fileNameToUse}…`,
        });

        await api.commitUpload({
          area: 'cloud_storage',
          key: presignData.key || presignData.s3_key,
          intent_id: presignData.intent_id,
          filename: fileNameToUse,
          folder_id: targetFolder,
          client_id: uploadClientId || selectedClient || undefined,
          event_id: uploadEventId || selectedEvent || undefined,
        });

        completed++;
      } catch (err) {
        console.error('Upload failed for file', fileNameToUse, err);
        flash(`Could not upload "${fileNameToUse}": ${err.message || 'Please try again.'}`);
      }
    }

    flash(`Photo uploaded successfully! (${completed} of ${uploadFiles.length} file(s) completed)`);
    setUploadProgress(null);
    setUploadFiles([]);
    setShowUploadModal(false);
    await reload();
  };

  // Payment checkout for Plans
  const handleSubscribe = async (planId) => {
    setPayBusy(true);
    try {
      const orderRes = await api.storageSubscribe(planId);
      if (orderRes.data?.dev_activated) {
        const planName = orderRes.data?.plan?.name || `${orderRes.data?.plan?.gb_limit || ''} GB Plan`;
        flash(`Your storage plan has been upgraded successfully to ${planName}!`);
        setShowPlanModal(false);
        await reload();
        return;
      }

      const rzKey = await loadRazorpay();
      if (!rzKey) {
        flash('Payment gateway connection pending.');
        setShowPlanModal(false);
        await reload();
        return;
      }
      const { order_id, amount, currency, key_id } = orderRes.data;

      const options = {
        key: key_id,
        amount,
        currency,
        name: 'MAJA Invites Studio Storage',
        description: 'Storage Plan Subscription',
        order_id,
        handler: async (response) => {
          try {
            await api.storageVerifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan_id: planId,
            });
            flash('Your storage plan has been updated successfully!');
            setShowPlanModal(false);
            await reload();
          } catch (verErr) {
            flash('Payment verification failed. Please contact support.');
          }
        },
        theme: { color: '#6D28D9' },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      flash(e?.response?.data?.detail || 'Could not initiate purchase. Please try again.');
    } finally {
      setPayBusy(false);
    }
  };

  // Custom Enterprise Request Submission
  const handleEnterpriseSubmit = async (e) => {
    e.preventDefault();
    if (!entStudioName || !entPhone || !entEmail) return;
    setBusy('enterprise-req');
    try {
      await api.requestEnterpriseQuote({
        storage_needed_gb: Number(entStorageGb),
        monthly_uploads_approx: entMonthlyUploads,
        expected_downloads: entExpectedDownloads,
        studio_name: entStudioName,
        phone: entPhone,
        email: entEmail,
        notes: entNotes,
      });
      flash('Your Custom Enterprise request has been submitted. Our team will contact you shortly!');
      setShowEnterpriseModal(false);
    } catch (e) {
      flash(e?.response?.data?.detail || 'Failed to submit quote request. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <StudioModule active="storage" title="Storage" sub="Store, organize and manage your photography files securely."><Loading /></StudioModule>;
  if (error) return <StudioModule active="storage" title="Storage" sub="Store, organize and manage your photography files securely."><ErrorPanel error={error} onRetry={reload} /></StudioModule>;

  return (
    <StudioModule
      active="storage"
      title="Storage"
      sub="Store, organize and manage your photography files securely."
      actions={
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="wmod-btn secondary"
            style={{ fontSize: 13 }}
            onClick={() => setShowPlanModal(true)}
          >
            Manage Plan
          </button>
          <button
            className="wmod-btn primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => setShowUploadModal(true)}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            Upload Photos
          </button>
        </div>
      }
    >
      {toast && <Toast text={toast.text} type={toast.type} />}

      {/* STORAGE OVERVIEW & USAGE SECTION */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: 20, marginBottom: 28 }}>
        {/* Main Usage Card */}
        <div className="wmod-panel" style={{ padding: '24px 28px', background: 'linear-gradient(135deg, #ffffff 0%, #f9f8ff 100%)', border: '1px solid var(--mj-border-accent)', borderRadius: 'var(--mj-radius-card)', boxShadow: 'var(--mj-shadow-card-rest)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mj-primary)' }}>Storage Capacity</span>
              <h2 style={{ fontSize: 24, fontWeight: 600, color: 'var(--mj-ink)', margin: '4px 0 0', fontFamily: 'var(--mj-font-body)' }}>
                {formatBytes(totalUsedBytes)} <span style={{ fontSize: 16, color: 'var(--mj-muted)', fontWeight: 400 }}>/ {formatBytes(totalCapBytes)} used</span>
              </h2>
            </div>
            <button
              className="wmod-btn secondary"
              style={{ fontSize: 13, padding: '8px 16px' }}
              onClick={() => setShowPlanModal(true)}
            >
              Upgrade / Manage Plan
            </button>
          </div>

          {/* Progress Bar */}
          <div style={{ background: '#EDE9FE', height: 12, borderRadius: 999, overflow: 'hidden', marginBottom: 12, position: 'relative' }}>
            <div
              style={{
                width: `${usagePct}%`,
                height: '100%',
                background: usagePct > 90 ? 'var(--mj-error)' : 'linear-gradient(90deg, #8B5CF6 0%, #6D28D9 100%)',
                borderRadius: 999,
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--mj-muted)' }}>
            <span>{usagePct}% filled</span>
            <span style={{ fontWeight: 600, color: 'var(--mj-ink)' }}>{formatBytes(remainingBytes)} remaining</span>
          </div>
        </div>

        {/* 4 Compact Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
          <div
            className="wmod-panel"
            style={{ padding: 18, borderRadius: 'var(--mj-radius-card-inner)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => { setViewMode('files'); setViewScope('all'); setSelectedFileType(''); setFavoriteOnly(false); }}
            title="Click to view all photos across your account"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mj-muted)' }}>Files</span>
              <div style={{ background: '#F5F3FF', width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--mj-primary)' }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--mj-ink)' }}>{photoCount + videoCount}</span>
              <div style={{ fontSize: 11, color: 'var(--mj-muted)', marginTop: 2 }}>{photoCount} photos, {videoCount} videos</div>
            </div>
          </div>

          <div
            className="wmod-panel"
            style={{ padding: 18, borderRadius: 'var(--mj-radius-card-inner)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => { setViewMode('files'); setViewScope('folders'); setCurrentFolderId(null); setSelectedFileType(''); setFavoriteOnly(false); }}
            title="Click to view folder directory"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mj-muted)' }}>Total Folders</span>
              <div style={{ background: '#F5F3FF', width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--mj-primary)' }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--mj-ink)' }}>{totalAccountFolderCount}</span>
              <div style={{ fontSize: 11, color: 'var(--mj-muted)', marginTop: 2 }}>{totalAccountFolderCount} total folders</div>
            </div>
          </div>

          {/* Storage Plan Stat Card */}
          <div
            className="wmod-panel"
            style={{
              padding: 18,
              borderRadius: 'var(--mj-radius-card-inner)',
              display: 'flex',
              flexDirection: 'column',
              justify: 'space-between',
              cursor: 'pointer',
              border: '1px solid var(--mj-border-accent)',
              background: '#FAF5FF',
            }}
            onClick={() => setShowPlanModal(true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mj-primary)' }}>Storage Plan</span>
              <div style={{ background: '#EDE9FE', width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--mj-primary)', fontSize: 16 }}>
                💎
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--mj-ink)' }}>
                {myPlan.plan?.gb_limit ? `${myPlan.plan.gb_limit >= 1024 ? myPlan.plan.gb_limit / 1024 + ' TB' : myPlan.plan.gb_limit + ' GB'}` : `${Math.round(totalCapBytes / (1024 ** 3))} GB`}
              </span>
              <div style={{ fontSize: 11, color: 'var(--mj-primary)', marginTop: 2, fontWeight: 600 }}>Upgrade / Manage Plans →</div>
            </div>
          </div>

          <div
            className="wmod-panel"
            style={{
              padding: 18,
              borderRadius: 'var(--mj-radius-card-inner)',
              display: 'flex',
              flexDirection: 'column',
              justify: 'space-between',
              cursor: 'pointer',
              borderColor: viewMode === 'trash' ? 'var(--mj-primary)' : undefined,
              background: viewMode === 'trash' ? '#F5F3FF' : undefined,
            }}
            onClick={() => setViewMode(viewMode === 'trash' ? 'files' : 'trash')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mj-muted)' }}>Recycle Bin</span>
              <div style={{ background: '#FEF2F2', width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--mj-error)' }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--mj-ink)' }}>{trashCount}</span>
              <div style={{ fontSize: 11, color: 'var(--mj-muted)', marginTop: 2 }}>Deleted items</div>
            </div>
          </div>
        </div>
      </div>

      {/* FILE MANAGER TOOLBAR & CONTROLS */}
      <div className="wmod-panel" style={{ padding: '16px 20px', borderRadius: 'var(--mj-radius-card)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
          {/* Breadcrumb Navigation & Scope Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500 }}>
              {viewMode === 'trash' ? (
                <span style={{ color: 'var(--mj-error)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  Recycle Bin
                </span>
              ) : viewScope === 'all' ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--mj-ink)', fontWeight: 600 }}>
                  <span>🖼️</span> All Photos ({photoCount})
                </span>
              ) : (
                folderBreadcrumbs.map((crumb, idx) => (
                  <span key={crumb.id || 'root'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {idx > 0 && <span style={{ color: 'var(--mj-muted)' }}>/</span>}
                    <button
                      style={{
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: idx === folderBreadcrumbs.length - 1 ? 'var(--mj-ink)' : 'var(--mj-primary)',
                        fontWeight: idx === folderBreadcrumbs.length - 1 ? 600 : 500,
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                      onClick={() => navigateToFolder(crumb.id, crumb.name)}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Scope Pill Toggle */}
            {viewMode === 'files' && (
              <div style={{ display: 'flex', background: '#F3F4F6', padding: 2, borderRadius: 8, gap: 2 }}>
                <button
                  type="button"
                  style={{
                    padding: '3px 10px',
                    fontSize: 12,
                    border: 'none',
                    borderRadius: 6,
                    background: viewScope === 'folders' ? '#fff' : 'transparent',
                    color: viewScope === 'folders' ? 'var(--mj-primary)' : 'var(--mj-muted)',
                    fontWeight: viewScope === 'folders' ? 600 : 500,
                    cursor: 'pointer',
                    boxShadow: viewScope === 'folders' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                  onClick={() => setViewScope('folders')}
                  title="Browse by folders and subfolders"
                >
                  📁 Folders
                </button>
                <button
                  type="button"
                  style={{
                    padding: '3px 10px',
                    fontSize: 12,
                    border: 'none',
                    borderRadius: 6,
                    background: viewScope === 'all' ? '#fff' : 'transparent',
                    color: viewScope === 'all' ? 'var(--mj-primary)' : 'var(--mj-muted)',
                    fontWeight: viewScope === 'all' ? 600 : 500,
                    cursor: 'pointer',
                    boxShadow: viewScope === 'all' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                  onClick={() => setViewScope('all')}
                  title="View all uploaded photos across your studio"
                >
                  🖼️ All Photos ({photoCount})
                </button>
              </div>
            )}
          </div>

          {/* Right Toolbar Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* View Mode Toggle */}
            <div style={{ display: 'flex', border: '1px solid var(--mj-border)', borderRadius: 'var(--mj-radius-control)', overflow: 'hidden' }}>
              <button
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  border: 'none',
                  background: displayMode === 'grid' ? 'var(--mj-primary)' : '#fff',
                  color: displayMode === 'grid' ? '#fff' : 'var(--mj-ink)',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
                onClick={() => setDisplayMode('grid')}
              >
                ⊞ Grid
              </button>
              <button
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  border: 'none',
                  background: displayMode === 'list' ? 'var(--mj-primary)' : '#fff',
                  color: displayMode === 'list' ? '#fff' : 'var(--mj-ink)',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
                onClick={() => setDisplayMode('list')}
              >
                ≡ List
              </button>
            </div>

            <button
              className="wmod-btn secondary"
              style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={() => setShowFolderModal(true)}
            >
              + New Folder
            </button>

            <button
              className="wmod-btn"
              style={{
                padding: '6px 14px',
                fontSize: 13,
                background: '#EDE9FE',
                color: '#6D28D9',
                border: '1px solid #DDD6FE',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
              onClick={() => setShowPlanModal(true)}
            >
              💎 Storage Plans
            </button>

            <button
              className="wmod-btn secondary"
              style={{ padding: '6px 10px', fontSize: 13 }}
              title="Refresh"
              onClick={reload}
            >
              ↻
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        {viewMode === 'files' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--mj-border)', paddingTop: 14 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 220, flex: 1 }}>
              <input
                type="text"
                className="wmod-input"
                placeholder="Search photos, folders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 34, fontSize: 13, minHeight: 36 }}
              />
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: 10, color: 'var(--mj-muted)' }}>
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {search && (
                <button
                  style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--mj-muted)', fontSize: 14 }}
                  onClick={() => setSearch('')}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Client Filter */}
            <select
              className="wmod-input"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              style={{ width: 'auto', fontSize: 13, minHeight: 36 }}
            >
              <option value="">All Clients</option>
              <option value="unassigned">Unassigned Client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* Event Filter */}
            <select
              className="wmod-input"
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              style={{ width: 'auto', fontSize: 13, minHeight: 36 }}
            >
              <option value="">All Events</option>
              <option value="unassigned">Unassigned Event</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>

            {/* Type Filter */}
            <select
              className="wmod-input"
              value={selectedFileType}
              onChange={(e) => setSelectedFileType(e.target.value)}
              style={{ width: 'auto', fontSize: 13, minHeight: 36 }}
            >
              <option value="">All File Types</option>
              <option value="photo">Photos Only</option>
              <option value="video">Videos Only</option>
            </select>

            {/* Favorite Toggle */}
            <button
              style={{
                padding: '6px 12px',
                fontSize: 13,
                borderRadius: 'var(--mj-radius-control)',
                border: '1px solid var(--mj-border)',
                background: favoriteOnly ? '#FEF3C7' : '#fff',
                color: favoriteOnly ? '#B45309' : 'var(--mj-ink)',
                fontWeight: favoriteOnly ? 600 : 400,
                cursor: 'pointer',
              }}
              onClick={() => setFavoriteOnly(!favoriteOnly)}
            >
              ★ Favorites
            </button>

            {/* Sort Dropdown */}
            <select
              className="wmod-input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ width: 'auto', fontSize: 13, minHeight: 36, marginLeft: 'auto' }}
            >
              <option value="uploaded_at_desc">Newest Uploaded</option>
              <option value="uploaded_at_asc">Oldest Uploaded</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="size_desc">Size (Largest)</option>
              <option value="size_asc">Size (Smallest)</option>
            </select>
          </div>
        )}
      </div>

      {/* BULK ACTION FLOATING BAR */}
      {(selectedFileIds.size > 0 || selectedFolderIds.size > 0) && (
        <div style={{ position: 'sticky', top: 20, zIndex: 100, marginBottom: 20, background: 'var(--mj-ink)', color: '#fff', padding: '12px 24px', borderRadius: 'var(--mj-radius-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--mj-shadow-card-hover)', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {selectedFileIds.size + selectedFolderIds.size} item(s) selected
            </span>
            <button
              style={{ background: 'none', border: 'none', color: '#A78BFA', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
              onClick={() => { setSelectedFileIds(new Set()); setSelectedFolderIds(new Set()); }}
            >
              Clear selection
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="wmod-btn secondary"
              style={{ fontSize: 12, padding: '6px 12px', background: '#374151', color: '#fff', border: 'none' }}
              onClick={() => handleBulkAction('favorite')}
            >
              ★ Favorite
            </button>

            <button
              className="wmod-btn secondary"
              style={{ fontSize: 12, padding: '6px 12px', background: '#374151', color: '#fff', border: 'none' }}
              onClick={() => setShowMoveModal(true)}
            >
              📁 Move To Folder
            </button>

            <button
              className="wmod-btn secondary"
              style={{ fontSize: 12, padding: '6px 12px', background: '#374151', color: '#fff', border: 'none' }}
              onClick={() => setShowAssignClientModal(true)}
            >
              👤 Assign Client
            </button>

            <button
              className="wmod-btn secondary"
              style={{ fontSize: 12, padding: '6px 12px', background: '#374151', color: '#fff', border: 'none' }}
              onClick={() => setShowAssignEventModal(true)}
            >
              📅 Assign Event
            </button>

            <button
              className="wmod-btn"
              style={{ fontSize: 12, padding: '6px 12px', background: 'var(--mj-error)', color: '#fff', border: 'none' }}
              onClick={() => handleBulkAction(viewMode === 'trash' ? 'purge' : 'trash')}
            >
              {viewMode === 'trash' ? 'Purge Permanently' : 'Move to Trash'}
            </button>
          </div>
        </div>
      )}

      {/* CONTENT DISPLAY SECTION (FILES & FOLDERS) */}
      {viewMode === 'trash' ? (
        /* Recycle Bin View */
        <div className="wmod-panel" style={{ padding: 24, borderRadius: 'var(--mj-radius-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Deleted Files & Folders ({trashItems.length})</h3>
            {trashItems.length > 0 && (
              <button
                className="wmod-btn"
                style={{ background: 'var(--mj-error)', color: '#fff', fontSize: 13 }}
                onClick={() => {
                  if (window.confirm('Permanently purge all items in Recycle Bin?')) {
                    api.bulkStorageFiles({ action: 'purge', file_ids: trashItems.map(t => t.id) }).then(reload);
                  }
                }}
              >
                Empty Recycle Bin
              </button>
            )}
          </div>

          {trashItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--mj-muted)' }}>
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', opacity: 0.5 }}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              <p style={{ margin: 0, fontSize: 14 }}>Recycle Bin is empty.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {trashItems.map(item => (
                <div key={item.id} style={{ border: '1px solid var(--mj-border)', borderRadius: 'var(--mj-radius-card-inner)', padding: 14, background: '#fff' }}>
                  <div style={{ height: 120, background: '#F5F3FF', borderRadius: 8, display: 'grid', placeItems: 'center', overflow: 'hidden', marginBottom: 10 }}>
                    {item.download_url && (item.content_type || '').startsWith('image/') ? (
                      <img src={mediaSrc(item.download_url, item)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: 'var(--mj-muted)' }}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--mj-muted)', margin: '4px 0 10px' }}>{formatBytes(item.size_bytes)}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="wmod-btn secondary" style={{ flex: 1, fontSize: 12, padding: '4px 8px' }} onClick={() => handleRestoreFile(item.id, item.name)}>Restore</button>
                    <button className="wmod-btn" style={{ fontSize: 12, padding: '4px 8px', background: '#FEF2F2', color: 'var(--mj-error)', border: 'none' }} onClick={() => api.bulkStorageFiles({ action: 'purge', file_ids: [item.id] }).then(reload)}>Purge</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Active Files & Folders View */
        <div>
          {folders.length === 0 && files.length === 0 ? (
            <div className="wmod-panel" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: 'var(--mj-radius-card)' }}>
              <div style={{ width: 64, height: 64, background: '#F5F3FF', borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 16px', color: 'var(--mj-primary)' }}>
                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 6px', color: 'var(--mj-ink)' }}>No files or folders found</h3>
              <p style={{ fontSize: 14, color: 'var(--mj-muted)', margin: '0 0 20px', maxWidth: '40ch' }}>
                {search || selectedClient || selectedEvent ? 'Try adjusting your search or filters.' : 'Upload photos or create a folder to start organizing your studio media.'}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="wmod-btn primary" onClick={() => setShowUploadModal(true)}>Upload Photos</button>
                <button className="wmod-btn secondary" onClick={() => setShowFolderModal(true)}>Create Folder</button>
              </div>
            </div>
          ) : displayMode === 'grid' ? (
            /* GRID VIEW */
            <div>
              {/* Folders Sub-grid */}
              {folders.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mj-muted)', margin: '0 0 12px' }}>
                    Folders in this directory ({currentViewFolderCount})
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                    {folders.map(fld => {
                      const isSelected = selectedFolderIds.has(fld.id);
                      return (
                        <div
                          key={fld.id}
                          className="wmod-panel"
                          style={{
                            padding: '14px 16px',
                            borderRadius: 'var(--mj-radius-card-inner)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            border: isSelected ? '2px solid var(--mj-primary)' : '1px solid var(--mj-border)',
                            background: isSelected ? '#F5F3FF' : '#fff',
                            position: 'relative',
                          }}
                          onClick={() => navigateToFolder(fld.id, fld.name)}
                          title={`Folder: ${fld.name}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => { e.stopPropagation(); toggleSelectFolder(fld.id); }}
                            style={{ cursor: 'pointer' }}
                          />
                          <div style={{ background: '#EDE9FE', padding: 8, borderRadius: 8, color: 'var(--mj-primary)' }}>
                            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mj-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fld.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--mj-muted)', marginTop: 2 }}>
                              {fld.file_count ? `${fld.file_count} photo${fld.file_count > 1 ? 's' : ''} · ${formatBytes(fld.size_bytes)}` : 'Empty folder'}
                            </div>
                          </div>
                          <button
                            style={{ border: 'none', background: 'none', color: 'var(--mj-muted)', cursor: 'pointer', padding: 4 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToRename({ type: 'folder', id: fld.id, name: fld.name });
                              setRenameValue(fld.name);
                              setShowRenameModal(true);
                            }}
                            title="Rename Folder"
                          >
                            ✎
                          </button>
                          <button
                            style={{ border: 'none', background: 'none', color: 'var(--mj-muted)', cursor: 'pointer', padding: 4 }}
                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(fld.id, fld.name); }}
                            title="Move Folder to Recycle Bin"
                          >
                            🗑
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Informative helper when at root with folders but no loose files */}
              {viewScope === 'folders' && currentFolderId === null && folders.length > 0 && files.length === 0 && (
                <div style={{ marginTop: 20, padding: '16px 20px', background: '#F8FAFC', borderRadius: 'var(--mj-radius-card-inner)', border: '1px dashed var(--mj-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--mj-ink)' }}>
                    <span style={{ fontSize: 18 }}>💡</span>
                    <span>All photos are organized inside the folders above. Click a folder to open it, or switch to <strong>All Photos</strong> to browse everything in one place.</span>
                  </div>
                  <button className="wmod-btn secondary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setViewScope('all')}>
                    View All Photos ({photoCount})
                  </button>
                </div>
              )}

              {/* Files Sub-grid */}
              {files.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mj-muted)', margin: '0 0 12px' }}>
                    Files ({files.length})
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                    {files.map(file => {
                      const isSelected = selectedFileIds.has(file.id);
                      const isVideo = (file.content_type || '').startsWith('video/');
                      return (
                        <div
                          key={file.id}
                          className="wmod-panel"
                          style={{
                            borderRadius: 'var(--mj-radius-card-inner)',
                            overflow: 'hidden',
                            border: isSelected ? '2px solid var(--mj-primary)' : '1px solid var(--mj-border)',
                            background: isSelected ? '#F5F3FF' : '#fff',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          {/* Card Thumbnail / Preview */}
                          <div
                            style={{ height: 160, background: '#F3F4F6', position: 'relative', cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setLightboxFile(file)}
                          >
                            {file.download_url && (file.content_type || '').startsWith('image/') ? (
                              <img
                                src={mediaSrc(file.download_url, file)}
                                alt={file.name}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  objectPosition: 'center top',
                                  imageOrientation: 'from-image',
                                  display: 'block',
                                }}
                              />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--mj-muted)' }}>
                                <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                              </div>
                            )}

                            {/* Selection Checkbox overlay */}
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => { e.stopPropagation(); toggleSelectFile(file.id); }}
                              style={{ position: 'absolute', top: 8, left: 8, cursor: 'pointer', zIndex: 2 }}
                            />

                            {/* Favorite Star Overlay */}
                            <button
                              style={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                border: 'none',
                                background: 'rgba(255,255,255,0.85)',
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'grid',
                                placeItems: 'center',
                                color: file.is_favorite ? '#D97706' : 'var(--mj-muted)',
                                fontSize: 14,
                                zIndex: 2,
                              }}
                              onClick={(e) => handleToggleFavorite(file.id, e)}
                            >
                              {file.is_favorite ? '★' : '☆'}
                            </button>

                            {/* Video Badge */}
                            {isVideo && (
                              <span style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>
                                VIDEO
                              </span>
                            )}
                          </div>

                          {/* Card Content & Details */}
                          <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mj-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                                {file.name}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--mj-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span>{formatBytes(file.size_bytes)}</span>
                                {file.folder && (
                                  <span style={{ background: '#EDE9FE', color: 'var(--mj-primary)', fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                                    📁 {folders.find(f => f.id === file.folder)?.name || 'Folder'}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Card Actions */}
                            <div style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: '1px solid #F3F4F6', paddingTop: 8 }}>
                              <button
                                className="wmod-btn secondary"
                                style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
                                onClick={() => setLightboxFile(file)}
                              >
                                Preview
                              </button>
                              <button
                                className="wmod-btn secondary"
                                style={{ fontSize: 11, padding: '4px 6px', color: 'var(--mj-error)' }}
                                title="Move to Recycle Bin"
                                onClick={() => handleTrashFile(file.id, file.name)}
                              >
                                🗑
                              </button>
                            </div>
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
            <div className="wmod-panel" style={{ overflowX: 'auto', borderRadius: 'var(--mj-radius-card)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--mj-border)', background: '#F9FAFB' }}>
                    <th style={{ padding: '12px 16px', width: 40 }}>
                      <input
                        type="checkbox"
                        checked={(files.length > 0 || folders.length > 0) && selectedFileIds.size === files.length && selectedFolderIds.size === folders.length}
                        onChange={selectAll}
                      />
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Size</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Uploaded</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Folders */}
                  {folders.map(fld => {
                    const isSelected = selectedFolderIds.has(fld.id);
                    return (
                      <tr
                        key={fld.id}
                        style={{
                          borderBottom: '1px solid #F3F4F6',
                          background: isSelected ? '#F5F3FF' : 'transparent',
                          cursor: 'pointer',
                        }}
                        onClick={() => navigateToFolder(fld.id, fld.name)}
                      >
                        <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectFolder(fld.id)} />
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--mj-ink)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ background: '#EDE9FE', padding: '6px', borderRadius: 6, color: 'var(--mj-primary)', display: 'inline-flex' }}>
                              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                            </div>
                            <span>{fld.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--mj-muted)' }}>
                          {fld.file_count ? `${fld.file_count} item${fld.file_count > 1 ? 's' : ''}` : 'Folder'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--mj-muted)' }}>
                          {fld.size_bytes ? formatBytes(fld.size_bytes) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--mj-muted)' }}>
                          {fld.updated_at ? shortDate(fld.updated_at) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              className="wmod-btn secondary"
                              style={{ fontSize: 11, padding: '2px 8px' }}
                              onClick={() => navigateToFolder(fld.id, fld.name)}
                            >
                              Open
                            </button>
                            <button
                              className="wmod-btn secondary"
                              style={{ fontSize: 11, padding: '2px 8px' }}
                              onClick={() => {
                                setItemToRename({ type: 'folder', id: fld.id, name: fld.name });
                                setRenameValue(fld.name);
                                setShowRenameModal(true);
                              }}
                              title="Rename folder"
                            >
                              Rename
                            </button>
                            <button
                              className="wmod-btn secondary"
                              style={{ fontSize: 11, padding: '2px 8px', color: 'var(--mj-error)' }}
                              onClick={() => handleDeleteFolder(fld.id, fld.name)}
                              title="Move folder to Recycle Bin"
                            >
                              Trash
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Informative state when folders exist but no loose files at this level */}
                  {viewScope === 'folders' && currentFolderId === null && folders.length > 0 && files.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--mj-muted)', background: '#FAFAFA' }}>
                        <div style={{ fontSize: 13, color: 'var(--mj-ink)' }}>
                          All photos are organized inside the folders above. Click <strong>Open</strong> on a folder, or{' '}
                          <button
                            type="button"
                            onClick={() => setViewScope('all')}
                            style={{ background: 'none', border: 'none', color: 'var(--mj-primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', padding: 0, font: 'inherit' }}
                          >
                            view all photos flat ({photoCount})
                          </button>.
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Files */}
                  {files.map(file => {
                    const isSelected = selectedFileIds.has(file.id);
                    return (
                      <tr key={file.id} style={{ borderBottom: '1px solid #F3F4F6', background: isSelected ? '#F5F3FF' : 'transparent' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectFile(file.id)} />
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--mj-ink)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{ cursor: 'pointer', color: file.is_favorite ? '#D97706' : 'var(--mj-muted)', fontSize: 16 }}
                              onClick={(e) => handleToggleFavorite(file.id, e)}
                              title={file.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              {file.is_favorite ? '★' : '☆'}
                            </span>
                            {(file.content_type || '').startsWith('image/') && file.download_url ? (
                              <img
                                src={mediaSrc(file.download_url, file)}
                                alt=""
                                style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', objectPosition: 'center top', imageOrientation: 'from-image', cursor: 'pointer', flexShrink: 0 }}
                                onClick={() => setLightboxFile(file)}
                              />
                            ) : (
                              <span style={{ fontSize: 16 }}>📄</span>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                              <span
                                style={{ cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                onClick={() => setLightboxFile(file)}
                                title={file.name}
                              >
                                {file.name}
                              </span>
                              {file.folder && viewScope === 'all' && (
                                <span style={{ fontSize: 10, color: 'var(--mj-muted)' }}>
                                  📁 {folders.find(f => f.id === file.folder)?.name || 'Subfolder'}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--mj-muted)' }}>{file.content_type || 'File'}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--mj-muted)' }}>{formatBytes(file.size_bytes)}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--mj-muted)' }}>{shortDate(file.uploaded_at)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button className="wmod-btn secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setLightboxFile(file)}>Preview</button>
                            <a className="wmod-btn secondary" style={{ fontSize: 11, padding: '2px 8px', textDecoration: 'none' }} href={file.download_url} download target="_blank" rel="noreferrer">Download</a>
                            <button className="wmod-btn secondary" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--mj-error)' }} onClick={() => handleTrashFile(file.id, file.name)}>Trash</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Empty state when neither folders nor files exist */}
                  {folders.length === 0 && files.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--mj-muted)' }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--mj-ink)', marginBottom: 4 }}>This folder is empty</div>
                        <div style={{ fontSize: 12 }}>Upload photos or create a subfolder to get started.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* LIGHTBOX & DETAILS MODAL */}
      {lightboxFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 'var(--mj-radius-card)', width: '100%', maxWidth: 960, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
            {/* Preview Box */}
            <div style={{ flex: 2, minWidth: 320, background: '#000', display: 'grid', placeItems: 'center', padding: 20 }}>
              {(lightboxFile.content_type || '').startsWith('video/') ? (
                <video src={mediaSrc(lightboxFile.download_url, lightboxFile)} controls style={{ maxWidth: '100%', maxHeight: '70vh' }} />
              ) : (
                <img
                  src={mediaSrc(lightboxFile.download_url, lightboxFile)}
                  alt={lightboxFile.name}
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', objectPosition: 'center', display: 'block', imageOrientation: 'from-image' }}
                  onError={(e) => {
                    console.warn('Image failed to render:', lightboxFile.name);
                  }}
                />
              )}
            </div>

            {/* Sidebar Metadata */}
            <div style={{ flex: 1, minWidth: 280, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '1px solid var(--mj-border)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, wordBreak: 'break-all' }}>{lightboxFile.name}</h3>
                  <button style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--mj-muted)' }} onClick={() => setLightboxFile(null)}>✕</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--mj-muted)' }}>
                  <div><strong style={{ color: 'var(--mj-ink)' }}>File Size:</strong> {formatBytes(lightboxFile.size_bytes)}</div>
                  <div><strong style={{ color: 'var(--mj-ink)' }}>Type:</strong> {lightboxFile.content_type}</div>
                  <div><strong style={{ color: 'var(--mj-ink)' }}>Uploaded:</strong> {shortDate(lightboxFile.uploaded_at)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
                <a className="wmod-btn primary" href={lightboxFile.download_url} download target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  Download Photo
                </a>
                <button className="wmod-btn secondary" style={{ color: 'var(--mj-error)' }} onClick={() => { handleTrashFile(lightboxFile.id, lightboxFile.name); setLightboxFile(null); }}>
                  Move to Recycle Bin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD PHOTOS MODAL */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="wmod-panel" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 'var(--mj-radius-card)', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Upload Media</h3>
              <button style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--mj-muted)' }} onClick={() => setShowUploadModal(false)}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 16px' }}>
              Select photos or videos to store securely. Photos up to 250 MB and videos up to 2 GB are supported.
            </p>

            {uploadErr && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
                {uploadErr}
              </div>
            )}

            <form onSubmit={handleStartUpload}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Destination Folder</label>
                  <select className="wmod-input" value={uploadFolderId} onChange={(e) => setUploadFolderId(e.target.value)} style={{ fontSize: 13 }}>
                    <option value="">Root Storage Directory</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Assign Client (Optional)</label>
                  <select className="wmod-input" value={uploadClientId} onChange={(e) => setUploadClientId(e.target.value)} style={{ fontSize: 13 }}>
                    <option value="">No Client Assignment</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div
                style={{
                  border: isDragging ? '2px dashed var(--mj-primary)' : '2px dashed var(--mj-border-accent)',
                  borderRadius: 'var(--mj-radius-card-inner)',
                  padding: 24,
                  textAlign: 'center',
                  background: isDragging ? '#F5F3FF' : '#F9F8FF',
                  cursor: 'pointer',
                  marginBottom: 16,
                  transition: 'background 0.2s',
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.length) {
                    handleSelectFiles(Array.from(e.dataTransfer.files));
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: 'var(--mj-primary)', margin: '0 auto 8px' }}>
                  <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mj-ink)' }}>Drag and drop photos here</div>
                <div style={{ fontSize: 12, color: 'var(--mj-muted)', margin: '4px 0 10px' }}>or click to choose from your device</div>
                <button type="button" className="wmod-btn secondary" style={{ fontSize: 12, padding: '4px 12px' }}>
                  Choose from Device
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleSelectFiles(Array.from(e.target.files || []))}
                />
              </div>

              {/* Selected Files List with Editable Custom Photo Names */}
              {uploadFiles.length > 0 && (
                <div style={{ marginBottom: 16, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--mj-border)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mj-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    {uploadFiles.length} file(s) selected ({formatBytes(uploadFiles.reduce((acc, item) => acc + (item.file?.size || item.size || 0), 0))})
                  </div>
                  {uploadFiles.map((item, idx) => (
                    <div key={item.id || idx} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <input
                        type="text"
                        className="wmod-input"
                        value={item.customName !== undefined ? item.customName : (item.file?.name || item.name || '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUploadFiles(prev => prev.map((f, i) => i === idx ? { ...f, customName: val } : f));
                        }}
                        placeholder="Photo / File Name"
                        style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
                      />
                      <span style={{ color: 'var(--mj-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {formatBytes(item.file?.size || item.size)}
                      </span>
                      <button
                        type="button"
                        style={{ border: 'none', background: 'none', color: 'var(--mj-error)', cursor: 'pointer', padding: '2px 6px', fontWeight: 'bold' }}
                        onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))}
                        title="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Progress Bar */}
              {uploadProgress && (
                <div style={{ marginBottom: 16, background: '#F5F3FF', padding: 12, borderRadius: 8, border: '1px solid var(--mj-border-accent)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--mj-primary)', marginBottom: 4 }}>
                    <span>{uploadProgress.statusMsg}</span>
                    <span>{uploadProgress.pct}%</span>
                  </div>
                  <div style={{ background: '#EDE9FE', height: 8, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${uploadProgress.pct}%`, height: '100%', background: 'var(--mj-primary)', transition: 'width 0.2s ease' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="wmod-btn secondary" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button type="submit" className="wmod-btn primary" disabled={!uploadFiles.length || Boolean(uploadProgress)}>
                  {uploadProgress ? 'Uploading…' : 'Start Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {showRenameModal && itemToRename && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="wmod-panel" style={{ width: '100%', maxWidth: 400, padding: 24, borderRadius: 'var(--mj-radius-card)', background: '#fff' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 600 }}>Rename {itemToRename.type === 'file' ? 'File' : 'Folder'}</h3>
            <form onSubmit={handleRenameSubmit}>
              <div style={{ marginBottom: 18 }}>
                <input
                  type="text"
                  className="wmod-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="wmod-btn secondary" onClick={() => setShowRenameModal(false)}>Cancel</button>
                <button type="submit" className="wmod-btn primary" disabled={busy === 'rename'}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PLAN & SUBSCRIPTION MODAL */}
      {showPlanModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="wmod-panel" style={{ width: '100%', maxWidth: 860, maxHeight: '90vh', overflowY: 'auto', padding: 28, borderRadius: 'var(--mj-radius-card)', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Studio Storage Plans</h3>
              <button style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }} onClick={() => setShowPlanModal(false)}>✕</button>
            </div>

            {/* Current Plan Summary Header */}
            {myPlan.subscription && (
              <div style={{ background: '#F5F3FF', border: '1px solid var(--mj-border-accent)', borderRadius: 'var(--mj-radius-card-inner)', padding: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mj-primary)', textTransform: 'uppercase' }}>Current Plan</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--mj-ink)' }}>{myPlan.plan?.name || 'Active Subscription'} ({myPlan.plan?.gb_limit || 100} GB)</div>
                  <div style={{ fontSize: 12, color: 'var(--mj-muted)', marginTop: 2 }}>
                    Status: <span style={{ fontWeight: 600, color: 'var(--mj-success)' }}>{myPlan.subscription.status || 'Active'}</span> | Expires: {shortDate(myPlan.subscription.expires_at)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mj-ink)' }}>{formatBytes(totalUsedBytes)} used</div>
                  <div style={{ fontSize: 12, color: 'var(--mj-muted)' }}>{formatBytes(remainingBytes)} remaining</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <BillingCycleToggle
                options={[
                  { key: '30', label: 'Monthly' },
                  { key: '90', label: '3 Months', save: 5 },
                  { key: '180', label: '6 Months', save: 10 },
                  { key: '365', label: '1 Year', save: 15 },
                ]}
                value={duration}
                onChange={setDuration}
              />
            </div>

            {/* Public Storage Tiers Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {/* Canonical Purchasable Tiers (50 GB, 100 GB, 250 GB, 500 GB, 1 TB) */}
              {[50, 100, 250, 500, 1024].map(tierGb => {
                const planMatch = plans.find(p => p.gb_limit === tierGb && p.duration_days === Number(duration));
                const price = planMatch ? (planMatch.effective_price_inr || planMatch.price_inr) : null;
                const tierLabel = tierGb >= 1024 ? `${tierGb / 1024} TB` : `${tierGb} GB`;
                const isCurrentPlan = myPlan.plan?.gb_limit === tierGb;

                return (
                  <div key={tierGb} style={{ border: isCurrentPlan ? '2px solid var(--mj-primary)' : '1px solid var(--mj-border-accent)', borderRadius: 'var(--mj-radius-card-inner)', padding: 20, background: isCurrentPlan ? '#F5F3FF' : '#fff', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
                    {isCurrentPlan && (
                      <span style={{ position: 'absolute', top: 10, right: 10, background: 'var(--mj-primary)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>Active</span>
                    )}
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--mj-primary)' }}>{tierLabel}</div>
                      <div style={{ fontSize: 12, color: 'var(--mj-muted)', margin: '4px 0 12px' }}>
                        {tierGb === 100 ? 'Suitable for active wedding projects' : tierGb === 500 ? 'Great for busy wedding studios' : 'Pro photographer multi-event drive'}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, margin: '8px 0', color: 'var(--mj-ink)' }}>
                        {price ? formatRupees(price) : 'Coming Soon'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--mj-muted)', marginBottom: 16 }}>
                        {price ? `for ${DURATION_LABEL[duration]}` : 'Price configuration pending'}
                      </div>
                    </div>

                    <button
                      className={`wmod-btn ${isCurrentPlan ? 'secondary' : 'primary'}`}
                      style={{ width: '100%', fontSize: 13 }}
                      onClick={() => planMatch && handleSubscribe(planMatch.id)}
                      disabled={payBusy || !price || isCurrentPlan}
                    >
                      {isCurrentPlan ? 'Current Plan' : !price ? 'Coming Soon' : payBusy ? 'Processing...' : 'Subscribe Now'}
                    </button>
                  </div>
                );
              })}

              {/* Custom Enterprise Card */}
              <div style={{ border: '2px dashed var(--mj-primary)', borderRadius: 'var(--mj-radius-card-inner)', padding: 20, background: '#F9F8FF', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--mj-primary)' }}>Custom Enterprise</div>
                  <div style={{ fontSize: 12, color: 'var(--mj-muted)', margin: '4px 0 12px' }}>
                    Dedicated multi-TB storage & priority bandwidth
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, margin: '8px 0', color: 'var(--mj-ink)' }}>
                    Custom Quote
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mj-muted)', marginBottom: 16 }}>
                    Tailored plans for large studios
                  </div>
                </div>

                <button
                  className="wmod-btn secondary"
                  style={{ width: '100%', fontSize: 13, borderColor: 'var(--mj-primary)', color: 'var(--mj-primary)' }}
                  onClick={() => { setShowPlanModal(false); setShowEnterpriseModal(true); }}
                >
                  Contact Us
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM ENTERPRISE REQUEST MODAL */}
      {showEnterpriseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="wmod-panel" style={{ width: '100%', maxWidth: 500, padding: 24, borderRadius: 'var(--mj-radius-card)', background: '#fff' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>Custom Enterprise Storage Request</h3>
            <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 16px' }}>
              Fill out your studio storage requirements and our team will get back to you with a custom plan.
            </p>

            <form onSubmit={handleEnterpriseSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Required Storage (GB)</label>
                  <input type="number" className="wmod-input" value={entStorageGb} onChange={(e) => setEntStorageGb(e.target.value)} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Monthly Uploads</label>
                  <input type="text" className="wmod-input" value={entMonthlyUploads} onChange={(e) => setEntMonthlyUploads(e.target.value)} placeholder="e.g. 5,000 photos" />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Studio Name</label>
                <input type="text" className="wmod-input" value={entStudioName} onChange={(e) => setEntStudioName(e.target.value)} required placeholder="Your Studio / Agency Name" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Phone Number</label>
                  <input type="tel" className="wmod-input" value={entPhone} onChange={(e) => setEntPhone(e.target.value)} required placeholder="+91 9876543210" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Email Address</label>
                  <input type="email" className="wmod-input" value={entEmail} onChange={(e) => setEntEmail(e.target.value)} required placeholder="studio@example.com" />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Additional Requirements & Notes</label>
                <textarea className="wmod-input" rows={3} value={entNotes} onChange={(e) => setEntNotes(e.target.value)} placeholder="Describe your studio requirements..." />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="wmod-btn secondary" onClick={() => setShowEnterpriseModal(false)}>Cancel</button>
                <button type="submit" className="wmod-btn primary" disabled={busy === 'enterprise-req'}>
                  {busy === 'enterprise-req' ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MOVE TO FOLDER MODAL */}
      {showMoveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="wmod-panel" style={{ width: '100%', maxWidth: 400, padding: 24, borderRadius: 'var(--mj-radius-card)', background: '#fff' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Move Selected Items</h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Folder</label>
              <select className="wmod-input" value={moveTargetFolderId} onChange={(e) => setMoveTargetFolderId(e.target.value)}>
                <option value="">Root Storage Directory</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="wmod-btn secondary" onClick={() => setShowMoveModal(false)}>Cancel</button>
              <button className="wmod-btn primary" onClick={() => handleBulkAction('move', { target_folder_id: moveTargetFolderId })}>
                Move Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN CLIENT MODAL */}
      {showAssignClientModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="wmod-panel" style={{ width: '100%', maxWidth: 400, padding: 24, borderRadius: 'var(--mj-radius-card)', background: '#fff' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Assign Client to Items</h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Client</label>
              <select className="wmod-input" value={assignClientId} onChange={(e) => setAssignClientId(e.target.value)}>
                <option value="">Unassign Client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="wmod-btn secondary" onClick={() => setShowAssignClientModal(false)}>Cancel</button>
              <button className="wmod-btn primary" onClick={() => handleBulkAction('assign_client', { target_client_id: assignClientId })}>
                Assign Client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN EVENT MODAL */}
      {showAssignEventModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="wmod-panel" style={{ width: '100%', maxWidth: 400, padding: 24, borderRadius: 'var(--mj-radius-card)', background: '#fff' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Assign Event to Items</h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Event</label>
              <select className="wmod-input" value={assignEventId} onChange={(e) => setAssignEventId(e.target.value)}>
                <option value="">Unassign Event</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="wmod-btn secondary" onClick={() => setShowAssignEventModal(false)}>Cancel</button>
              <button className="wmod-btn primary" onClick={() => handleBulkAction('assign_event', { target_event_id: assignEventId })}>
                Assign Event
              </button>
            </div>
          </div>
        </div>
      )}
    </StudioModule>
  );
}
