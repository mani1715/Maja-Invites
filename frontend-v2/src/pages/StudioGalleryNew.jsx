import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import StudioModule from '@/components/StudioModule';
import CommercialPlansModal from '@/components/gallery/CommercialPlansModal';
import {
  createGallery,
  getGallery,
  updateGallery,
  publishGallery,
  listAlbums,
  createAlbum,
  deleteAlbum,
  listPhotos,
  deletePhoto,
  bulkUploadPhotos,
} from '@/api/gallery';
import './StudioGalleryNew.css';

const LOCAL_STORAGE_KEY = 'maja_gallery_new_draft_v1';

export default function StudioGalleryNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Navigation Steps: 1 = Details, 2 = Albums & Photos, 3 = Appearance, 4 = Review & Share
  const [currentStep, setCurrentStep] = useState(1);

  // Draft & Server state
  const [draftId, setDraftId] = useState(null);
  const [slug, setSlug] = useState(null);
  const [isPublished, setIsPublished] = useState(false);

  // Entitlement & Commercial modal state
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [entitlementError, setEntitlementError] = useState(null);

  // Step 1: Details
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [expiryDays, setExpiryDays] = useState(365); // 90 | 180 | 365

  // Step 2: Albums & Photos
  const [albums, setAlbums] = useState([]);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [selectedAlbumId, setSelectedAlbumId] = useState('all');
  const [photos, setPhotos] = useState([]);
  const [uploadQueue, setUploadQueue] = useState([]); // Array of { id, name, size, status, progress, error, file }
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Step 3: Appearance & Cover
  const [watermarkText, setWatermarkText] = useState('MAJA INVITES');
  const [studioName, setStudioName] = useState('');
  const [coverPhotoId, setCoverPhotoId] = useState('');
  const [coverPositionY, setCoverPositionY] = useState(50);
  const [previewMode, setPreviewMode] = useState('desktop'); // desktop | tablet | mobile
  const coverUploadRef = useRef(null);

  // General feedback
  const [globalError, setGlobalError] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Suggested albums
  const suggestedAlbums = ['Engagement', 'Haldi', 'Wedding', 'Reception', 'Sangeet', 'Mehendi'];

  // 1. Initial Load & Restore Draft
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.clientName) setClientName(parsed.clientName);
        if (parsed.eventDate) setEventDate(parsed.eventDate);
        if (parsed.expiryDays) setExpiryDays(parsed.expiryDays);
        if (parsed.watermarkText) setWatermarkText(parsed.watermarkText);
        if (parsed.studioName) setStudioName(parsed.studioName);
        if (parsed.draftId) setDraftId(parsed.draftId);
        if (parsed.currentStep) setCurrentStep(parsed.currentStep);
      }
    } catch (e) {
      console.warn('Could not read draft from localStorage', e);
    }
  }, []);

  // 2. Persist Draft locally whenever form fields change
  useEffect(() => {
    try {
      const draftObj = {
        title,
        clientName,
        eventDate,
        expiryDays,
        watermarkText,
        studioName,
        draftId,
        currentStep,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(draftObj));
    } catch (e) {
      console.warn('Could not save draft to localStorage', e);
    }
  }, [title, clientName, eventDate, expiryDays, watermarkText, studioName, draftId, currentStep]);

  // 3. Load Gallery data from backend if draftId exists
  const refreshGalleryData = async (idToLoad = draftId) => {
    if (!idToLoad) return;
    try {
      const res = await getGallery(idToLoad);
      const gal = res.data?.gallery || res.data;
      if (gal) {
        setSlug(gal.slug);
        setIsPublished(gal.status === 'active' || gal.gallery_status === 'active');
        if (gal.cover_photo_id) setCoverPhotoId(gal.cover_photo_id);
        if (gal.cover_position_y !== undefined) setCoverPositionY(gal.cover_position_y);
        if (gal.branding?.watermark_text) setWatermarkText(gal.branding.watermark_text);
        if (gal.branding?.studio_name) setStudioName(gal.branding.studio_name);
      }
      if (res.data?.albums) {
        setAlbums(res.data.albums);
      }
    } catch (err) {
      console.error('Failed to load gallery details:', err);
    }
  };

  const refreshPhotos = async (idToLoad = draftId, albumId = selectedAlbumId) => {
    if (!idToLoad) return;
    try {
      const params = albumId && albumId !== 'all' ? { album_id: albumId } : {};
      const res = await listPhotos(idToLoad, params);
      setPhotos(res.data?.photos || []);
    } catch (err) {
      console.error('Failed to load photos:', err);
    }
  };

  useEffect(() => {
    if (draftId) {
      refreshGalleryData(draftId);
      refreshPhotos(draftId, selectedAlbumId);
    }
  }, [draftId, selectedAlbumId]);

  const showToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Helper to ensure draft gallery exists on server
  const ensureDraftGallery = async () => {
    if (!title.trim()) {
      setGlobalError('Please enter a gallery title to continue.');
      return null;
    }
    setGlobalError(null);
    setIsSaving(true);

    const payload = {
      title: title.trim(),
      client_name: clientName.trim() || undefined,
      event_date: eventDate || undefined,
      expiry_days: Number(expiryDays) || 365,
      branding: {
        studio_name: studioName.trim() || undefined,
        watermark_text: watermarkText.trim() || 'MAJA INVITES',
      },
      initial_albums: [],
      cover_position_y: coverPositionY,
    };

    try {
      if (!draftId) {
        // Create new draft gallery
        const res = await createGallery(payload);
        const gal = res.data?.gallery || res.data;
        const newId = gal.id;
        setDraftId(newId);
        setSlug(gal.slug);
        setAlbums(res.data?.albums || []);
        setIsSaving(false);
        setEntitlementError(null);
        showToast('Draft gallery created on server.');
        return newId;
      } else {
        // Update existing draft
        await updateGallery(draftId, {
          title: payload.title,
          client_name: payload.client_name,
          event_date: payload.event_date,
          cover_position_y: coverPositionY,
          branding: payload.branding,
        });
        setIsSaving(false);
        return draftId;
      }
    } catch (err) {
      setIsSaving(false);
      const detail = err.response?.data?.detail;
      if (err.response?.status === 403 && (detail?.error === 'STORAGE_SUBSCRIPTION_REQUIRED' || typeof detail === 'string')) {
        setEntitlementError(
          'A Gallery Storage or Combined subscription is required to publish and manage standalone galleries.'
        );
      } else {
        setGlobalError(typeof detail === 'string' ? detail : detail?.message || 'Failed to save gallery.');
      }
      return null;
    }
  };

  // Step 1 -> Step 2
  const handleProceedFromStep1 = async () => {
    const id = await ensureDraftGallery();
    if (id) {
      setCurrentStep(2);
      refreshGalleryData(id);
      refreshPhotos(id, 'all');
    }
  };

  // Add Album
  const handleAddAlbum = async (albumName) => {
    const name = (albumName || newAlbumName).trim();
    if (!name) return;
    if (albums.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      setGlobalError(`Album "${name}" already exists.`);
      return;
    }
    try {
      if (!draftId) {
        const id = await ensureDraftGallery();
        if (!id) return;
      }
      const res = await createAlbum(draftId, { name });
      setNewAlbumName('');
      setGlobalError(null);
      showToast(`Added album: ${name}`);
      refreshGalleryData(draftId);
    } catch (err) {
      setGlobalError(err.response?.data?.detail || 'Failed to create album.');
    }
  };

  // Delete Album
  const handleDeleteAlbum = async (albumId, albumName) => {
    if (!window.confirm(`Delete empty album "${albumName}"?`)) return;
    try {
      await deleteAlbum(draftId, albumId);
      if (selectedAlbumId === albumId) setSelectedAlbumId('all');
      showToast(`Deleted album: ${albumName}`);
      refreshGalleryData(draftId);
      refreshPhotos(draftId, 'all');
    } catch (err) {
      setGlobalError(err.response?.data?.detail || 'Failed to delete album.');
    }
  };

  // Upload handler with per-file tracking
  const handleFilesChosen = async (filesList) => {
    const files = Array.from(filesList);
    if (files.length === 0) return;

    if (!draftId) {
      const id = await ensureDraftGallery();
      if (!id) return;
    }

    // Prepare queue items
    const newItems = files.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      status: 'Uploading', // Uploading -> Processing -> Ready | Failed
      progress: 0,
      albumId: selectedAlbumId !== 'all' ? selectedAlbumId : undefined,
    }));

    setUploadQueue((prev) => [...newItems, ...prev]);
    setIsUploading(true);

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    if (selectedAlbumId && selectedAlbumId !== 'all') {
      formData.append('album_id', selectedAlbumId);
    }

    try {
      // Direct bulk upload with progress
      await bulkUploadPhotos(draftId, formData, (progressEvent) => {
        const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadQueue((prev) =>
          prev.map((item) =>
            newItems.some((n) => n.id === item.id)
              ? { ...item, progress: pct, status: pct === 100 ? 'Processing' : 'Uploading' }
              : item
          )
        );
      });

      // Mark items ready
      setUploadQueue((prev) =>
        prev.map((item) =>
          newItems.some((n) => n.id === item.id)
            ? { ...item, progress: 100, status: 'Ready' }
            : item
        )
      );

      setIsUploading(false);
      showToast(`Uploaded ${files.length} photos successfully!`);
      refreshPhotos(draftId, selectedAlbumId);
      refreshGalleryData(draftId);
    } catch (err) {
      setIsUploading(false);
      const detail = err.response?.data?.detail;
      const errMsg = typeof detail === 'string' ? detail : detail?.message || 'Upload failed.';
      setUploadQueue((prev) =>
        prev.map((item) =>
          newItems.some((n) => n.id === item.id)
            ? { ...item, status: 'Failed', error: errMsg }
            : item
        )
      );
      setGlobalError(`Upload error: ${errMsg}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Retry failed upload item
  const handleRetryFailed = async (item) => {
    if (!item.file || !draftId) return;
    setUploadQueue((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, status: 'Uploading', progress: 0, error: null } : p))
    );

    const formData = new FormData();
    formData.append('files', item.file);
    if (item.albumId) formData.append('album_id', item.albumId);

    try {
      await bulkUploadPhotos(draftId, formData, (progressEvent) => {
        const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadQueue((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, progress: pct, status: pct === 100 ? 'Processing' : 'Uploading' } : p))
        );
      });
      setUploadQueue((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'Ready', progress: 100 } : p))
      );
      showToast(`Retried and uploaded ${item.name}`);
      refreshPhotos(draftId, selectedAlbumId);
      refreshGalleryData(draftId);
    } catch (err) {
      setUploadQueue((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'Failed', error: 'Retry failed' } : p))
      );
    }
  };

  // Delete photo
  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return;
    try {
      await deletePhoto(draftId, photoId);
      showToast('Photo removed.');
      if (coverPhotoId === photoId) setCoverPhotoId('');
      refreshPhotos(draftId, selectedAlbumId);
      refreshGalleryData(draftId);
    } catch (err) {
      setGlobalError(err.response?.data?.detail || 'Failed to delete photo.');
    }
  };

  // Set Cover Photo
  const handleSelectCover = async (photoId) => {
    try {
      await updateGallery(draftId, { cover_photo_id: photoId, cover_position_y: coverPositionY });
      setCoverPhotoId(photoId);
      showToast('Set as couple cover photo!');
      refreshGalleryData(draftId);
    } catch (err) {
      setGlobalError(err.response?.data?.detail || 'Failed to set cover photo.');
    }
  };

  // Upload separate cover photo
  const handleCoverUploadSeparate = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !draftId) return;
    setIsSaving(true);
    const formData = new FormData();
    formData.append('files', file);
    try {
      const res = await bulkUploadPhotos(draftId, formData);
      const uploaded = res.data?.photos?.[0];
      if (uploaded?.id) {
        await updateGallery(draftId, { cover_photo_id: uploaded.id, cover_position_y: coverPositionY });
        setCoverPhotoId(uploaded.id);
        showToast('Cover uploaded and set successfully.');
        refreshGalleryData(draftId);
        refreshPhotos(draftId, selectedAlbumId);
      }
    } catch (err) {
      setGlobalError('Failed to upload cover photo.');
    } finally {
      setIsSaving(false);
      if (coverUploadRef.current) coverUploadRef.current.value = '';
    }
  };

  // Save Cover Repositioning
  const handleRepositionChange = async (newY) => {
    setCoverPositionY(newY);
    if (draftId && coverPhotoId) {
      try {
        await updateGallery(draftId, { cover_position_y: newY });
      } catch (err) {
        console.error('Failed to update cover position', err);
      }
    }
  };

  // Step 4: Publish Gallery
  const handlePublishGallery = async () => {
    if (!draftId) return;
    setIsSaving(true);
    try {
      const res = await publishGallery(draftId);
      setIsPublished(true);
      setIsSaving(false);
      showToast('Gallery published live!');
      refreshGalleryData(draftId);
    } catch (err) {
      setIsSaving(false);
      setGlobalError(err.response?.data?.detail || 'Failed to publish gallery.');
    }
  };

  const publicUrl = slug ? `${window.location.origin}/gallery/${slug}` : '';

  const handleCopyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    showToast('Gallery link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Current cover photo object
  const currentCoverPhoto = photos.find((p) => p.id === coverPhotoId);
  const coverUrl = currentCoverPhoto?.display_url || currentCoverPhoto?.thumbnail_url || currentCoverPhoto?.url;

  return (
    <StudioModule
      active="invitations"
      title="Create Gallery"
      sub="Organize your event photos into albums and share a beautifully branded gallery."
      actions={
        <Link to="/studio/invitations?tab=gallery" className="wmod-btn wmod-btn--ghost wmod-btn--sm">
          ← Back to Galleries
        </Link>
      }
    >
      <div className="sgn-page">

        {/* Global Error Banner */}
        {globalError && (
          <div className="sgn-banner sgn-banner--error">
            <div>
              <div className="sgn-banner-title">Action Required</div>
              <div className="sgn-banner-desc">{globalError}</div>
            </div>
            <button
              type="button"
              className="wmod-btn wmod-btn--ghost wmod-btn--sm"
              onClick={() => setGlobalError(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Entitlement Banner */}
        {entitlementError && (
          <div className="sgn-banner sgn-banner--warning">
            <div>
              <div className="sgn-banner-title">Storage Plan Required</div>
              <div className="sgn-banner-desc">{entitlementError}</div>
            </div>
            <button
              type="button"
              className="wmod-btn wmod-btn--primary wmod-btn--sm"
              onClick={() => setShowPlansModal(true)}
            >
              Get Gallery Plan ↗
            </button>
          </div>
        )}

        {/* Success Toast */}
        {successToast && (
          <div className="sgn-banner sgn-banner--success">
            <div className="sgn-banner-title">✓ {successToast}</div>
          </div>
        )}

        {/* Compact Progress Indicator */}
        <div className="sgn-stepper">
          <button
            type="button"
            className={`sgn-step-item ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}
            onClick={() => setCurrentStep(1)}
          >
            <span className="sgn-step-badge">{currentStep > 1 ? '✓' : '1'}</span>
            <span className="sgn-step-name">Details</span>
          </button>

          <div className={`sgn-step-divider ${currentStep > 1 ? 'completed' : ''}`} />

          <button
            type="button"
            className={`sgn-step-item ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}
            onClick={() => {
              if (draftId || title.trim()) setCurrentStep(2);
            }}
            disabled={!draftId && !title.trim()}
          >
            <span className="sgn-step-badge">{currentStep > 2 ? '✓' : '2'}</span>
            <span className="sgn-step-name">Albums & Photos</span>
          </button>

          <div className={`sgn-step-divider ${currentStep > 2 ? 'completed' : ''}`} />

          <button
            type="button"
            className={`sgn-step-item ${currentStep === 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}
            onClick={() => {
              if (draftId) setCurrentStep(3);
            }}
            disabled={!draftId}
          >
            <span className="sgn-step-badge">{currentStep > 3 ? '✓' : '3'}</span>
            <span className="sgn-step-name">Appearance</span>
          </button>

          <div className={`sgn-step-divider ${currentStep > 3 ? 'completed' : ''}`} />

          <button
            type="button"
            className={`sgn-step-item ${currentStep === 4 ? 'active' : ''}`}
            onClick={() => {
              if (draftId) setCurrentStep(4);
            }}
            disabled={!draftId}
          >
            <span className="sgn-step-badge">4</span>
            <span className="sgn-step-name">Review & Share</span>
          </button>
        </div>

        {/* ================= STEP 1: DETAILS ================= */}
        {currentStep === 1 && (
          <div className="sgn-card">
            <h3 className="sgn-card-title">Gallery Details</h3>
            <p className="sgn-card-sub">
              Enter event information and choose how long guests can access the public gallery.
            </p>

            <div className="sgn-form-grid">
              <div className="sgn-field">
                <label className="sgn-label">
                  Gallery / Event Title <span className="sgn-label-req">*</span>
                </label>
                <input
                  type="text"
                  className="sgn-input"
                  placeholder="e.g. Diya & Kabir Royal Wedding"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
                <span className="sgn-field-hint">Required. Displayed as the primary event headline.</span>
              </div>

              <div className="sgn-field">
                <label className="sgn-label">Client Name (Optional)</label>
                <input
                  type="text"
                  className="sgn-input"
                  placeholder="e.g. Kabir Sharma"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
                <span className="sgn-field-hint">Used for your internal client delivery records.</span>
              </div>

              <div className="sgn-field">
                <label className="sgn-label">Event Date (Optional)</label>
                <input
                  type="date"
                  className="sgn-input"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
                <span className="sgn-field-hint">Displayed underneath the couple cover photo.</span>
              </div>

              <div className="sgn-field">
                <label className="sgn-label">Public Access Expiry</label>
                <div className="sgn-expiry-grid">
                  <div
                    className={`sgn-expiry-card ${expiryDays === 90 ? 'selected' : ''}`}
                    onClick={() => setExpiryDays(90)}
                  >
                    <div className="sgn-expiry-title">90 Days</div>
                    <div className="sgn-expiry-sub">3 Months public access</div>
                  </div>
                  <div
                    className={`sgn-expiry-card ${expiryDays === 180 ? 'selected' : ''}`}
                    onClick={() => setExpiryDays(180)}
                  >
                    <div className="sgn-expiry-title">180 Days</div>
                    <div className="sgn-expiry-sub">6 Months public access</div>
                  </div>
                  <div
                    className={`sgn-expiry-card ${expiryDays === 365 ? 'selected' : ''}`}
                    onClick={() => setExpiryDays(365)}
                  >
                    <div className="sgn-expiry-title">365 Days</div>
                    <div className="sgn-expiry-sub">1 Year standard access</div>
                  </div>
                </div>
                <span className="sgn-field-hint">
                  Clients and guests can view and browse this gallery publicly until the selected expiry date.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 2: ALBUMS & PHOTOS ================= */}
        {currentStep === 2 && (
          <div className="sgn-card">
            <h3 className="sgn-card-title">Albums & Photos</h3>
            <p className="sgn-card-sub">
              Add named albums for your event segments, select an album, and upload high-resolution photos.
            </p>

            {/* Suggested Albums Chips */}
            <div style={{ marginBottom: 20 }}>
              <div className="sgn-suggest-label">Suggested Albums (click to add):</div>
              <div className="sgn-album-chips">
                {suggestedAlbums.map((sug) => {
                  const alreadyAdded = albums.some((a) => a.name.toLowerCase() === sug.toLowerCase());
                  return (
                    <button
                      key={sug}
                      type="button"
                      className={`sgn-chip ${alreadyAdded ? 'added' : ''}`}
                      onClick={() => !alreadyAdded && handleAddAlbum(sug)}
                      disabled={alreadyAdded}
                    >
                      {alreadyAdded ? '✓ ' + sug : '+ ' + sug}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Album Creator & Tab Filter */}
            <div className="sgn-album-manager">
              <div className="sgn-album-tabs">
                <span style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginRight: 4 }}>
                  Select Album for Upload:
                </span>
                <button
                  type="button"
                  className={`sgn-album-tab ${selectedAlbumId === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedAlbumId('all')}
                >
                  All Photos ({photos.length})
                </button>
                {albums.map((alb) => {
                  const albPhotos = photos.filter((p) => p.album_id === alb.id);
                  return (
                    <div key={alb.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={`sgn-album-tab ${selectedAlbumId === alb.id ? 'active' : ''}`}
                        onClick={() => setSelectedAlbumId(alb.id)}
                      >
                        {alb.name} ({albPhotos.length})
                        {albPhotos.length === 0 && (
                          <span
                            className="sgn-album-del"
                            title="Remove empty album"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAlbum(alb.id, alb.name);
                            }}
                          >
                            ✕
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add Custom Album Form */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="New album name..."
                  className="sgn-input"
                  style={{ padding: '6px 12px', fontSize: 13, width: 170 }}
                  value={newAlbumName}
                  onChange={(e) => setNewAlbumName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAlbum();
                    }
                  }}
                />
                <button
                  type="button"
                  className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                  onClick={() => handleAddAlbum()}
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Drag & Drop Upload Area */}
            <div
              className={`sgn-dropzone ${isDragOver ? 'drag-active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files) handleFilesChosen(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files) handleFilesChosen(e.target.files);
                }}
              />
              <div className="sgn-drop-icon">📸</div>
              <div className="sgn-drop-title">
                {selectedAlbumId !== 'all'
                  ? `Upload Photos to "${albums.find((a) => a.id === selectedAlbumId)?.name}"`
                  : 'Drag & drop photos here or click to browse'}
              </div>
              <div className="sgn-drop-sub">
                Supports JPG, PNG, WebP up to 50MB per file. Watermarked display derivatives are created automatically.
              </div>
              <button
                type="button"
                className="wmod-btn wmod-btn--primary wmod-btn--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Choose Photo Files
              </button>
            </div>

            {/* Upload Queue & Progress Tracker */}
            {uploadQueue.length > 0 && (
              <div className="sgn-upload-progress-card">
                <div className="sgn-progress-header">
                  <span>Uploading Files ({uploadQueue.filter((q) => q.status === 'Ready').length}/{uploadQueue.length} Ready)</span>
                  {isUploading && <span>Uploading…</span>}
                </div>
                <div className="sgn-progress-bar-bg" style={{ marginBottom: 16 }}>
                  <div
                    className="sgn-progress-bar-fill"
                    style={{
                      width: `${
                        Math.round(
                          (uploadQueue.filter((q) => q.status === 'Ready').length / uploadQueue.length) * 100
                        ) || 0
                      }%`,
                    }}
                  />
                </div>

                {/* Queue Items List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                  {uploadQueue.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: '#f8fafc',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span
                          className={`sgn-photo-badge ${item.status.toLowerCase()}`}
                          style={{ position: 'static' }}
                        >
                          {item.status}
                        </span>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.name}
                        </span>
                        <span style={{ color: '#94a3b8' }}>({item.size})</span>
                      </div>
                      <div>
                        {item.status === 'Failed' && (
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                            style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => handleRetryFailed(item)}
                          >
                            Retry
                          </button>
                        )}
                        {item.status === 'Ready' && <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Done</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modern Uploaded Photo Grid */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                  Uploaded Photos ({photos.length})
                </h4>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  {selectedAlbumId !== 'all'
                    ? `Showing: ${albums.find((a) => a.id === selectedAlbumId)?.name}`
                    : 'Showing: All albums'}
                </span>
              </div>

              {photos.length === 0 ? (
                <div
                  style={{
                    padding: 32,
                    textAlign: 'center',
                    background: '#f8fafc',
                    borderRadius: 10,
                    color: '#94a3b8',
                  }}
                >
                  No photos uploaded yet in this album. Drag photos into the box above to get started.
                </div>
              ) : (
                <div className="sgn-photo-grid">
                  {photos.map((photo) => {
                    const isCover = photo.id === coverPhotoId;
                    const albObj = albums.find((a) => a.id === photo.album_id);
                    const photoSrc = photo.display_url || photo.thumbnail_url || photo.url;

                    return (
                      <div key={photo.id} className="sgn-photo-card">
                        <div className="sgn-photo-thumb-wrap">
                          <img
                            src={photoSrc}
                            alt={photo.filename || 'Gallery photo'}
                            className="sgn-photo-img"
                            loading="lazy"
                          />
                          <span className="sgn-photo-badge ready">Ready</span>
                          {isCover && (
                            <span
                              className="sgn-photo-badge"
                              style={{ top: 'auto', bottom: 8, background: '#6366f1' }}
                            >
                              ★ Gallery Cover
                            </span>
                          )}
                        </div>

                        <div className="sgn-photo-meta">
                          <span className="sgn-photo-filename">{photo.filename || 'Photo ' + photo.id.slice(0, 6)}</span>
                          <div className="sgn-photo-sub">
                            <span>{albObj ? albObj.name : 'General'}</span>
                            <span>{photo.storage_bytes ? (photo.storage_bytes / 1024 / 1024).toFixed(1) + ' MB' : ''}</span>
                          </div>
                        </div>

                        <div className="sgn-photo-actions">
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                            style={{ fontSize: 11, padding: '2px 6px' }}
                            onClick={() => handleSelectCover(photo.id)}
                            disabled={isCover}
                          >
                            {isCover ? '✓ Cover' : 'Set as Cover'}
                          </button>
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                            style={{ fontSize: 11, padding: '2px 6px', color: '#ef4444' }}
                            onClick={() => handleDeletePhoto(photo.id)}
                            title="Delete photo"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= STEP 3: APPEARANCE & BRANDING ================= */}
        {currentStep === 3 && (
          <div className="sgn-card">
            <h3 className="sgn-card-title">Appearance & Branding</h3>
            <p className="sgn-card-sub">
              Set the couple-photo cover, refine framing position, and customize your studio branding watermark.
            </p>

            {/* Couple Cover Section */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label className="sgn-label">Selected Couple-Photo Cover</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    ref={coverUploadRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleCoverUploadSeparate}
                  />
                  <button
                    type="button"
                    className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                    onClick={() => coverUploadRef.current?.click()}
                  >
                    Upload Separate Cover
                  </button>
                  {coverPhotoId && (
                    <button
                      type="button"
                      className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                      onClick={() => handleSelectCover('')}
                    >
                      Remove Cover
                    </button>
                  )}
                </div>
              </div>

              {/* Cover Preview Container */}
              <div className="sgn-cover-preview-box">
                <div className="sgn-cover-banner">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt="Cover Preview"
                      className="sgn-cover-img"
                      style={{ objectPosition: `center ${coverPositionY}%` }}
                    />
                  ) : (
                    <div className="sgn-cover-empty">
                      <span style={{ fontSize: 32 }}>🖼️</span>
                      <span>No cover photo selected. Select a photo below or upload one.</span>
                    </div>
                  )}
                </div>

                {/* Vertical Focal Slider */}
                {coverUrl && (
                  <div className="sgn-slider-row">
                    <span className="sgn-slider-label">Vertical Framing Focus:</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={coverPositionY}
                      onChange={(e) => handleRepositionChange(Number(e.target.value))}
                      className="sgn-range-input"
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 44, color: '#475569' }}>
                      {coverPositionY}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Branding & Watermark Inputs */}
            <div className="sgn-form-grid">
              <div className="sgn-field">
                <label className="sgn-label">Studio Name Branding</label>
                <input
                  type="text"
                  className="sgn-input"
                  placeholder="e.g. Royal Shutter Photography"
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                />
                <span className="sgn-field-hint">Displayed in the header and public gallery title.</span>
              </div>

              <div className="sgn-field">
                <label className="sgn-label">Watermark Overlay Text</label>
                <input
                  type="text"
                  className="sgn-input"
                  placeholder="e.g. ROYAL SHUTTER • PROOF"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                />
                <span className="sgn-field-hint">
                  Embedded across client display thumbnails to protect your intellectual property.
                </span>
              </div>
            </div>

            {/* Live Responsive Layout Preview */}
            <div className="sgn-responsive-preview-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Responsive Photo Grid Layout</h4>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Desktop: 4 columns • Tablet: 3 columns • Mobile: 2 columns
                  </span>
                </div>
                <div className="sgn-preview-tabs">
                  <button
                    type="button"
                    className={`sgn-preview-btn ${previewMode === 'desktop' ? 'active' : ''}`}
                    onClick={() => setPreviewMode('desktop')}
                  >
                    Desktop (4 cols)
                  </button>
                  <button
                    type="button"
                    className={`sgn-preview-btn ${previewMode === 'tablet' ? 'active' : ''}`}
                    onClick={() => setPreviewMode('tablet')}
                  >
                    Tablet (3 cols)
                  </button>
                  <button
                    type="button"
                    className={`sgn-preview-btn ${previewMode === 'mobile' ? 'active' : ''}`}
                    onClick={() => setPreviewMode('mobile')}
                  >
                    Mobile (2 cols)
                  </button>
                </div>
              </div>

              {/* Mock cards previewing the 4 / 3 / 2 responsive layout */}
              <div className={`sgn-mock-grid ${previewMode}`}>
                {(photos.length > 0 ? photos.slice(0, 8) : Array.from({ length: 8 })).map((item, idx) => (
                  <div key={idx} className="sgn-mock-card">
                    {item?.display_url || item?.thumbnail_url ? (
                      <img
                        src={item.display_url || item.thumbnail_url}
                        alt="preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#cbd5e1',
                          fontSize: 12,
                        }}
                      >
                        4:3 Card #{idx + 1}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 4: REVIEW & SHARE ================= */}
        {currentStep === 4 && (
          <div className="sgn-card">
            <h3 className="sgn-card-title">Review & Share Gallery</h3>
            <p className="sgn-card-sub">
              Review your gallery configuration, publish it live, and generate client delivery links and QR codes.
            </p>

            <div className="sgn-review-grid">
              <div className="sgn-review-stat">
                <div className="sgn-review-label">Gallery Title</div>
                <div className="sgn-review-value">{title || 'Untitled Gallery'}</div>
              </div>

              <div className="sgn-review-stat">
                <div className="sgn-review-label">Albums Configured</div>
                <div className="sgn-review-value">
                  {albums.length > 0 ? albums.map((a) => a.name).join(', ') : 'None'}
                </div>
              </div>

              <div className="sgn-review-stat">
                <div className="sgn-review-label">Total Photos Uploaded</div>
                <div className="sgn-review-value">{photos.length} Photos</div>
              </div>

              <div className="sgn-review-stat">
                <div className="sgn-review-label">Public Lifetime</div>
                <div className="sgn-review-value">{expiryDays} Days</div>
              </div>

              <div className="sgn-review-stat">
                <div className="sgn-review-label">Gallery Cover</div>
                <div className="sgn-review-value">{coverPhotoId ? 'Custom Selected' : 'Not set'}</div>
              </div>

              <div className="sgn-review-stat">
                <div className="sgn-review-label">Publication Status</div>
                <div className="sgn-review-value" style={{ color: isPublished ? '#10b981' : '#f59e0b' }}>
                  {isPublished ? '● Published Live' : '○ Draft'}
                </div>
              </div>
            </div>

            {/* Sharing & Delivery Actions */}
            {publicUrl && (
              <div className="sgn-share-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: 15, color: '#1e3a8a' }}>Live Gallery Link</h4>
                    <span style={{ fontSize: 13, color: '#3b82f6' }}>
                      Share this link directly with your client or wedding guests.
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                    >
                      Open Gallery ↗
                    </a>
                  </div>
                </div>

                <div className="sgn-link-row">
                  <input
                    type="text"
                    readOnly
                    value={publicUrl}
                    className="sgn-link-input"
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className="wmod-btn wmod-btn--primary wmod-btn--sm"
                    onClick={handleCopyLink}
                  >
                    {copiedLink ? '✓ Copied' : 'Copy Link'}
                  </button>
                </div>

                {/* SVG QR Code */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
                  <div
                    style={{
                      background: '#ffffff',
                      padding: 8,
                      borderRadius: 8,
                      border: '1px solid #bfdbfe',
                      display: 'inline-block',
                    }}
                  >
                    <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
                      <rect width="100" height="100" fill="#ffffff" />
                      <rect x="10" y="10" width="24" height="24" fill="#1e293b" />
                      <rect x="14" y="14" width="16" height="16" fill="#ffffff" />
                      <rect x="17" y="17" width="10" height="10" fill="#1e293b" />
                      <rect x="66" y="10" width="24" height="24" fill="#1e293b" />
                      <rect x="70" y="14" width="16" height="16" fill="#ffffff" />
                      <rect x="73" y="17" width="10" height="10" fill="#1e293b" />
                      <rect x="10" y="66" width="24" height="24" fill="#1e293b" />
                      <rect x="14" y="70" width="16" height="16" fill="#ffffff" />
                      <rect x="17" y="73" width="10" height="10" fill="#1e293b" />
                      <rect x="42" y="15" width="8" height="8" fill="#1e293b" />
                      <rect x="52" y="25" width="8" height="8" fill="#1e293b" />
                      <rect x="40" y="40" width="20" height="20" fill="#6366f1" />
                      <rect x="68" y="44" width="8" height="8" fill="#1e293b" />
                      <rect x="76" y="56" width="12" height="8" fill="#1e293b" />
                      <rect x="44" y="68" width="10" height="10" fill="#1e293b" />
                      <rect x="64" y="72" width="14" height="14" fill="#1e293b" />
                    </svg>
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 2px', fontSize: 13, color: '#1e3a8a' }}>Printable QR Code</h5>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                      Display at table arrangements or welcome signs for immediate guest album browsing.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Live Camera Transfer Banner */}
            <div style={{ marginTop: 16, padding: 16, background: '#faf5ff', borderRadius: 12, border: '1px solid #e9d5ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 14, color: '#6b21a8', fontWeight: 600 }}>📸 Live Camera Transfer (FTP / SFTP)</h4>
                  <p style={{ margin: 0, fontSize: 13, color: '#7e22ce' }}>
                    Connect supported Sony (FTPES), Canon, or Nikon cameras to stream photos directly into this gallery and albums.
                  </p>
                </div>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                  style={{ borderColor: '#c084fc', color: '#6b21a8' }}
                  onClick={() => navigate('/studio/invitations?tab=gallery')}
                >
                  Manage in Workspace →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Bar Shim */}
        <div className="sgn-action-bar-shim" />

        {/* Fixed Bottom Action Bar */}
        <div className="sgn-action-bar">
          <div className="sgn-action-container">
            <div className="sgn-action-left">
              {currentStep > 1 && (
                <button
                  type="button"
                  className="wmod-btn wmod-btn--ghost"
                  onClick={() => setCurrentStep((prev) => prev - 1)}
                >
                  ← Back
                </button>
              )}
            </div>

            <div className="sgn-action-right">
              <button
                type="button"
                className="wmod-btn wmod-btn--secondary"
                disabled={isSaving}
                onClick={async () => {
                  await ensureDraftGallery();
                  showToast('Draft saved successfully.');
                }}
              >
                {isSaving ? 'Saving…' : 'Save Draft'}
              </button>

              {currentStep === 1 && (
                <button
                  type="button"
                  className="wmod-btn wmod-btn--primary"
                  disabled={isSaving || !title.trim()}
                  onClick={handleProceedFromStep1}
                >
                  Continue to Albums & Photos →
                </button>
              )}

              {currentStep === 2 && (
                <button
                  type="button"
                  className="wmod-btn wmod-btn--primary"
                  onClick={() => setCurrentStep(3)}
                >
                  Continue to Appearance →
                </button>
              )}

              {currentStep === 3 && (
                <button
                  type="button"
                  className="wmod-btn wmod-btn--primary"
                  onClick={() => setCurrentStep(4)}
                >
                  Continue to Review & Share →
                </button>
              )}

              {currentStep === 4 && (
                <button
                  type="button"
                  className="wmod-btn wmod-btn--primary"
                  disabled={isSaving || isPublished}
                  onClick={handlePublishGallery}
                >
                  {isPublished ? '✓ Gallery Published' : 'Publish Gallery Live'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Commercial Plans Modal for Entitlement resolution */}
        <CommercialPlansModal
          isOpen={showPlansModal}
          onClose={() => setShowPlansModal(false)}
        />
      </div>
    </StudioModule>
  );
}
