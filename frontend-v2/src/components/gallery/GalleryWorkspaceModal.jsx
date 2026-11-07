import React, { useState, useEffect, useRef } from 'react';
import {
  getGallery,
  updateGallery,
  listAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  listPhotos,
  deletePhoto,
  movePhotos,
  bulkUploadPhotos,
  publishGallery,
  unpublishGallery,
  attachInvitation,
  detachInvitation,
} from '../../api/gallery';
import * as weddingsApi from '../../api/weddings';
import CameraUploadPanel from './CameraUploadPanel';

export default function GalleryWorkspaceModal({ isOpen, galleryId, onClose, onUpdate }) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'albums' | 'appearance' | 'camera' | 'preview' | 'publish'
  const [gallery, setGallery] = useState(null);
  const [albums, setAlbums] = useState([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState('all');
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStats, setUploadStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form states for details
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [watermarkText, setWatermarkText] = useState('MAJA INVITES');
  const [studioName, setStudioName] = useState('');

  // Cover photo & repositioning state
  const [coverPhotoId, setCoverPhotoId] = useState('');
  const [coverPositionY, setCoverPositionY] = useState(50);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const coverUploadRef = useRef(null);

  // Album creation modal / input
  const [newAlbumName, setNewAlbumName] = useState('');
  const [editingAlbum, setEditingAlbum] = useState(null);
  const [movePhotoItem, setMovePhotoItem] = useState(null);
  const [targetAlbumId, setTargetAlbumId] = useState('');

  // Invitations linking
  const [invitationsList, setInvitationsList] = useState([]);
  const [selectedInvToAttach, setSelectedInvToAttach] = useState('');

  const fileInputRef = useRef(null);

  const loadData = async () => {
    if (!galleryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getGallery(galleryId);
      const gal = res.data?.gallery || res.data;
      setGallery(gal);
      setAlbums(res.data?.albums || []);
      setTitle(gal.title || '');
      setClientName(gal.client_name || '');
      setEventDate(gal.event_date ? gal.event_date.slice(0, 10) : '');
      setExpiresAt(gal.expires_at ? gal.expires_at.slice(0, 10) : '');
      setWatermarkText(gal.branding?.watermark_text || 'MAJA INVITES');
      setStudioName(gal.branding?.studio_name || '');
      setCoverPhotoId(gal.cover_photo_id || '');
      setCoverPositionY(gal.cover_position_y ?? 50);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load gallery details');
      setLoading(false);
    }
  };

  const loadPhotos = async (albumId = selectedAlbumId) => {
    if (!galleryId) return;
    setPhotosLoading(true);
    try {
      const params = albumId && albumId !== 'all' ? { album_id: albumId } : {};
      const res = await listPhotos(galleryId, params);
      setPhotos(res.data?.photos || []);
      setPhotosLoading(false);
    } catch {
      setPhotosLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && galleryId) {
      loadData();
    }
  }, [isOpen, galleryId]);

  useEffect(() => {
    if (isOpen && galleryId && (activeTab === 'albums' || activeTab === 'preview' || activeTab === 'appearance')) {
      loadPhotos(activeTab === 'appearance' ? 'all' : selectedAlbumId);
    }
  }, [isOpen, galleryId, activeTab, selectedAlbumId]);

  if (!isOpen) return null;

  const handleSaveDetails = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await updateGallery(galleryId, {
        title: title.trim(),
        client_name: clientName.trim(),
        event_date: eventDate || undefined,
        gallery_expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        cover_photo_id: coverPhotoId || undefined,
        cover_position_y: coverPositionY,
        branding: {
          studio_name: studioName.trim(),
          watermark_text: watermarkText.trim(),
        },
      });
      setSuccessMsg('Details saved successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save changes');
    }
  };

  const handleUpdateCoverPosition = async (newY) => {
    setCoverPositionY(newY);
    try {
      await updateGallery(galleryId, { cover_position_y: newY });
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Failed to update cover position:', err);
    }
  };

  const handleSelectCoverPhoto = async (photoId) => {
    try {
      await updateGallery(galleryId, { cover_photo_id: photoId });
      setCoverPhotoId(photoId);
      setShowCoverPicker(false);
      setSuccessMsg('Gallery cover photo updated');
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to set cover photo');
    }
  };

  const handleRemoveCover = async () => {
    try {
      await updateGallery(galleryId, { cover_photo_id: '' });
      setCoverPhotoId('');
      setSuccessMsg('Gallery cover photo removed');
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError('Failed to remove cover photo');
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('files', file);
    try {
      const res = await bulkUploadPhotos(galleryId, formData);
      const uploaded = res.data?.photos?.[0];
      if (uploaded?.id) {
        await updateGallery(galleryId, { cover_photo_id: uploaded.id, cover_position_y: coverPositionY });
        setCoverPhotoId(uploaded.id);
        setSuccessMsg('Cover photo uploaded and set successfully');
        setTimeout(() => setSuccessMsg(null), 3000);
        loadData();
        loadPhotos('all');
        if (onUpdate) onUpdate();
      }
    } catch {
      setError('Failed to upload cover photo');
    } finally {
      setUploading(false);
      if (coverUploadRef.current) coverUploadRef.current.value = '';
    }
  };

  const handleCreateAlbum = async (e) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;
    try {
      await createAlbum(galleryId, { name: newAlbumName.trim() });
      setNewAlbumName('');
      loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create album');
    }
  };

  const handleDeleteAlbum = async (albumId) => {
    if (!window.confirm('Delete this album? Photos will be kept in the general gallery.')) return;
    try {
      await deleteAlbum(galleryId, albumId);
      if (selectedAlbumId === albumId) setSelectedAlbumId('all');
      loadData();
      loadPhotos('all');
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete album');
    }
  };

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setUploadStats({ total: files.length, completed: 0 });

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (selectedAlbumId && selectedAlbumId !== 'all') {
      formData.append('album_id', selectedAlbumId);
    }

    try {
      const res = await bulkUploadPhotos(galleryId, formData, (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percent);
      });
      setUploading(false);
      setSuccessMsg(`Uploaded ${files.length} photos successfully!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      loadData();
      loadPhotos(selectedAlbumId);
      if (onUpdate) onUpdate();
    } catch (err) {
      setUploading(false);
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : detail?.message || 'Upload failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return;
    try {
      await deletePhoto(galleryId, photoId);
      loadPhotos(selectedAlbumId);
      loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete photo');
    }
  };

  const handleMovePhoto = async () => {
    if (!movePhotoItem || !targetAlbumId) return;
    try {
      await movePhotos(galleryId, [movePhotoItem.id], targetAlbumId);
      setMovePhotoItem(null);
      setTargetAlbumId('');
      loadPhotos(selectedAlbumId);
      loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to move photo');
    }
  };

  const handleSetGalleryCover = async (photoId) => {
    try {
      await updateGallery(galleryId, { cover_photo_id: photoId });
      setSuccessMsg('Set as gallery cover');
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to set cover photo');
    }
  };

  const handleSetAlbumCover = async (albumId, photoId) => {
    try {
      await updateAlbum(galleryId, albumId, { cover_photo_id: photoId });
      setSuccessMsg('Set as album cover');
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to set album cover');
    }
  };

  const handleTogglePublish = async () => {
    try {
      if (gallery.status === 'active') {
        await unpublishGallery(galleryId);
      } else {
        await publishGallery(galleryId);
      }
      loadData();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to change publish status');
    }
  };

  const publicUrl = gallery?.slug
    ? `${window.location.origin}/gallery/${gallery.slug}`
    : '';

  const handleCopyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="wmod-backdrop" onClick={onClose} style={{ zIndex: 9997 }}>
      <div
        className="wmod-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1020, width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0 }}
      >
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'serif' }}>
                {gallery?.title || 'Gallery Workspace'}
              </h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: gallery?.status === 'active' ? '#dcfce7' : gallery?.status === 'expired' ? '#fee2e2' : '#f1f5f9',
                  color: gallery?.status === 'active' ? '#15803d' : gallery?.status === 'expired' ? '#b91c1c' : '#475569',
                  textTransform: 'uppercase',
                }}
              >
                {gallery?.status || 'Draft'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
              {gallery?.photo_count || 0} photos • {albums.length} albums • {gallery?.is_standalone ? 'Standalone' : 'Integrated'}
            </div>
          </div>
          <button
            type="button"
            className="wmod-btn wmod-btn--ghost"
            onClick={onClose}
            style={{ fontSize: '1.2rem', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 24px' }}>
          {[
            { id: 'details', label: '1. Gallery Details' },
            { id: 'albums', label: '2. Albums & Uploads' },
            { id: 'appearance', label: '3. Appearance & Watermark' },
            { id: 'camera', label: '4. Live Camera / FTP' },
            { id: 'preview', label: '5. Preview' },
            { id: 'publish', label: '6. Publish & Share' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 16px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: activeTab === tab.id ? 600 : 500,
                color: activeTab === tab.id ? '#c5a059' : '#64748b',
                borderBottom: activeTab === tab.id ? '2px solid #c5a059' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Alerts */}
        {error && (
          <div style={{ margin: '12px 24px 0', padding: '8px 14px', background: '#fef2f2', border: '1px solid #fee2e2', color: '#b91c1c', borderRadius: 6, fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
        {successMsg && (
          <div style={{ margin: '12px 24px 0', padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 6, fontSize: '0.85rem' }}>
            {successMsg}
          </div>
        )}

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#777' }}>Loading workspace...</div>
          ) : (
            <>
              {/* TAB 1: DETAILS */}
              {activeTab === 'details' && (
                <form onSubmit={handleSaveDetails} style={{ maxWidth: 650 }}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Gallery Title *
                    </label>
                    <input
                      type="text"
                      className="wmod-input"
                      style={{ width: '100%' }}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Client Name
                      </label>
                      <input
                        type="text"
                        className="wmod-input"
                        style={{ width: '100%' }}
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Event Date
                      </label>
                      <input
                        type="date"
                        className="wmod-input"
                        style={{ width: '100%' }}
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Gallery Expiry Date
                    </label>
                    <input
                      type="date"
                      className="wmod-input"
                      style={{ width: '100%' }}
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                      Independent of invitation link expiry. 30 days retention grace period applies after expiry.
                    </div>
                  </div>

                  {/* Linked Invitation Status */}
                  <div style={{ padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                      Attached Invitation
                    </div>
                    {gallery.is_linked && gallery.linked_invitation ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{gallery.linked_invitation.title}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Slug: {gallery.linked_invitation.slug}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          onClick={async () => {
                            await detachInvitation(galleryId);
                            loadData();
                          }}
                        >
                          Detach
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        This is a standalone gallery. You can optionally link it to an invitation if needed.
                      </div>
                    )}
                  </div>

                  <button type="submit" className="wmod-btn wmod-btn--primary">
                    Save Details
                  </button>
                </form>
              )}

              {/* TAB 2: ALBUMS & UPLOADS */}
              {activeTab === 'albums' && (
                <div>
                  {/* Albums Ribbon */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 6 }}>
                    <button
                      type="button"
                      className={`wmod-btn ${selectedAlbumId === 'all' ? 'wmod-btn--primary' : 'wmod-btn--ghost'} wmod-btn--sm`}
                      onClick={() => setSelectedAlbumId('all')}
                    >
                      All Photos ({gallery.photo_count || 0})
                    </button>
                    {albums.map((alb) => (
                      <div key={alb.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <button
                          type="button"
                          className={`wmod-btn ${selectedAlbumId === alb.id ? 'wmod-btn--primary' : 'wmod-btn--secondary'} wmod-btn--sm`}
                          onClick={() => setSelectedAlbumId(alb.id)}
                        >
                          {alb.name} ({alb.photo_count || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAlbum(alb.id)}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px 4px', fontSize: '0.85rem' }}
                          title="Delete Album"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <input
                        type="text"
                        className="wmod-input"
                        placeholder="+ New Album"
                        style={{ fontSize: '0.8rem', padding: '4px 8px', width: 120 }}
                        value={newAlbumName}
                        onChange={(e) => setNewAlbumName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateAlbum(e);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                        onClick={handleCreateAlbum}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Upload Drop Zone */}
                  <div
                    style={{
                      border: '2px dashed #cbd5e1',
                      borderRadius: 12,
                      padding: 24,
                      textAlign: 'center',
                      background: '#f8fafc',
                      marginBottom: 20,
                    }}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      multiple
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFilesSelected}
                    />
                    <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>📤</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155' }}>
                      Upload Photos to{' '}
                      {selectedAlbumId === 'all'
                        ? 'General Gallery'
                        : albums.find((a) => a.id === selectedAlbumId)?.name || 'Album'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 12px' }}>
                      Fast direct-to-S3 parallel upload. JPEG, PNG, WEBP, HEIC supported.
                    </div>
                    <button
                      type="button"
                      className="wmod-btn wmod-btn--primary wmod-btn--sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'Uploading...' : 'Select Photos to Upload'}
                    </button>

                    {uploading && (
                      <div style={{ marginTop: 14, maxWidth: 360, margin: '14px auto 0' }}>
                        <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#c5a059', transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                          Uploading batch... {uploadProgress}%
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Photo Grid */}
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', marginBottom: 12 }}>
                      Photos in this view ({photos.length})
                    </div>
                    {photosLoading ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Loading photos...</div>
                    ) : photos.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', background: '#fff', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                        No photos uploaded in this album yet. Select photos above to upload.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                        {photos.map((p) => {
                          const albObj = albums.find((a) => a.id === p.album_id);
                          return (
                            <div
                              key={p.id}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                overflow: 'hidden',
                                background: '#fff',
                                position: 'relative',
                              }}
                            >
                              <div style={{ aspectRatio: '1', background: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
                                <img
                                  src={p.thumb_url || p.display_url}
                                  alt="thumbnail"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  loading="lazy"
                                />
                                {albObj && (
                                  <span
                                    style={{
                                      position: 'absolute',
                                      bottom: 4,
                                      left: 4,
                                      background: 'rgba(0,0,0,0.65)',
                                      color: '#fff',
                                      fontSize: '0.65rem',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    {albObj.name}
                                  </span>
                                )}
                              </div>
                              <div style={{ padding: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                                  style={{ padding: '2px 4px', fontSize: '0.7rem' }}
                                  onClick={() => handleSetGalleryCover(p.id)}
                                  title="Set as Gallery Cover"
                                >
                                  ⭐ Cover
                                </button>
                                <button
                                  type="button"
                                  className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                                  style={{ padding: '2px 4px', fontSize: '0.7rem' }}
                                  onClick={() => {
                                    setMovePhotoItem(p);
                                    setTargetAlbumId(albums[0]?.id || '');
                                  }}
                                  title="Move to another album"
                                >
                                  📁 Move
                                </button>
                                <button
                                  type="button"
                                  className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                                  style={{ padding: '2px 4px', fontSize: '0.7rem', color: '#b91c1c' }}
                                  onClick={() => handleDeletePhoto(p.id)}
                                  title="Delete photo"
                                >
                                  🗑️
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

              {/* TAB 3: APPEARANCE & WATERMARK */}
              {activeTab === 'appearance' && (
                <div style={{ maxWidth: 680 }}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Studio Display Name
                    </label>
                    <input
                      type="text"
                      className="wmod-input"
                      style={{ width: '100%' }}
                      value={studioName}
                      onChange={(e) => setStudioName(e.target.value)}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Watermark Protection Text
                    </label>
                    <input
                      type="text"
                      className="wmod-input"
                      style={{ width: '100%' }}
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                      Applied to display derivatives and thumbnails served to guests. Originals remain untouched in the cloud vault.
                    </div>
                  </div>

                  {/* Couple Photo Cover & Repositioning */}
                  <div style={{ padding: 18, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>
                          Couple Photo Cover & Repositioning
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          Featured hero photograph at the top of the public gallery.
                        </div>
                      </div>
                      <input
                        type="file"
                        ref={coverUploadRef}
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleCoverUpload}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                          onClick={() => setShowCoverPicker(true)}
                        >
                          Choose from Photos
                        </button>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          onClick={() => coverUploadRef.current?.click()}
                        >
                          Upload Cover
                        </button>
                      </div>
                    </div>

                    {gallery?.cover_url ? (
                      <div>
                        <div
                          style={{
                            width: '100%',
                            height: 180,
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: '#e2e8f0',
                            position: 'relative',
                            marginTop: 10,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                          }}
                        >
                          <img
                            src={gallery.cover_url}
                            alt="Cover Preview"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              objectPosition: `center ${coverPositionY}%`,
                              display: 'block',
                            }}
                          />
                        </div>

                        {/* Repositioning Slider */}
                        <div style={{ marginTop: 12, background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#334155', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600 }}>Vertical Repositioning (Keep Faces Centered):</span>
                            <span style={{ color: '#0f172a', fontWeight: 700 }}>{coverPositionY}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={coverPositionY}
                            onChange={(e) => handleUpdateCoverPosition(Number(e.target.value))}
                            style={{ width: '100%', accentColor: '#c5a059', cursor: 'pointer' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>
                            <span>Top (0%)</span>
                            <span>Center (50%)</span>
                            <span>Bottom (100%)</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                            style={{ color: '#b91c1c', fontSize: '0.75rem' }}
                            onClick={handleRemoveCover}
                          >
                            Remove Cover Photo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '24px 16px', textAlign: 'center', background: '#ffffff', borderRadius: 8, border: '1px dashed #cbd5e1', marginTop: 10 }}>
                        <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>🖼️</div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 10 }}>
                          No cover photo selected yet. Choose an uploaded photo or upload a dedicated portrait.
                        </div>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--primary wmod-btn--sm"
                          onClick={() => setShowCoverPicker(true)}
                        >
                          + Choose Cover Photo
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                      Public Presentation Standards:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.6 }}>
                      <li>Clean white background (<code>#ffffff</code>) with minimal distraction.</li>
                      <li>Standardized 2-column photo grid on all mobile, tablet, and desktop screens.</li>
                      <li>Full-screen lightbox viewer with swipe navigation for mobile guests.</li>
                      <li>Direct guest downloads disabled; only watermarked derivatives served.</li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    className="wmod-btn wmod-btn--primary"
                    onClick={handleSaveDetails}
                  >
                    Save Appearance Settings
                  </button>
                </div>
              )}

              {/* TAB 4: LIVE CAMERA TRANSFER */}
              {activeTab === 'camera' && (
                <div style={{ maxWidth: 840, margin: '0 auto' }}>
                  <CameraUploadPanel
                    profileId={galleryId}
                    albums={albums}
                    onAlbumCreated={loadData}
                  />
                </div>
              )}

              {/* TAB 5: PREVIEW */}
              {activeTab === 'preview' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Public Gallery Preview</h3>
                      <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                        This shows the exact experience your clients and guests will see.
                      </p>
                    </div>
                    <a
                      href={`/gallery/${gallery.slug}?preview=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                    >
                      Open in New Tab ↗
                    </a>
                  </div>

                  {/* Clean 2-column preview container */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      padding: 24,
                      minHeight: 400,
                    }}
                  >
                    {/* 1. Studio Tag */}
                    <div style={{ textAlign: 'center', marginBottom: 14 }}>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', color: '#94a3b8', fontWeight: 600 }}>
                        {studioName || 'STUDIO PHOTOGRAPHY'}
                      </div>
                    </div>

                    {/* 2. Cover Photo if selected */}
                    {gallery?.cover_url && (
                      <div style={{ maxWidth: 680, margin: '0 auto 16px' }}>
                        <div style={{ width: '100%', height: 200, borderRadius: 8, overflow: 'hidden', background: '#f8fafc', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                          <img
                            src={gallery.cover_url}
                            alt="Cover preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${coverPositionY}%`, display: 'block' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* 3. Title & Date */}
                    <div style={{ textAlign: 'center', marginBottom: 18 }}>
                      <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontFamily: 'serif', color: '#1e293b' }}>
                        {title}
                      </h1>
                      {eventDate && (
                        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                          {new Date(eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>

                    {/* 4. Responsive photo grid in 4:3 aspect ratio */}
                    <div style={{ maxWidth: 840, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                      {photos.slice(0, 8).map((p) => (
                        <div
                          key={p.id}
                          style={{
                            aspectRatio: '4 / 3',
                            background: '#f8fafc',
                            borderRadius: 6,
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          <img
                            src={p.thumb_url || p.display_url}
                            alt="preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        </div>
                      ))}
                    </div>
                    {photos.length > 8 && (
                      <div style={{ textAlign: 'center', marginTop: 16, color: '#94a3b8', fontSize: '0.85rem' }}>
                        + {photos.length - 8} more photos in responsive grid layout
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: PUBLISH & SHARE */}
              {activeTab === 'publish' && (
                <div style={{ maxWidth: 650 }}>
                  <div
                    style={{
                      padding: 20,
                      borderRadius: 12,
                      background: gallery.status === 'active' ? '#f0fdf4' : '#fffbeb',
                      border: gallery.status === 'active' ? '1px solid #bbf7d0' : '1px solid #fef3c7',
                      marginBottom: 20,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: gallery.status === 'active' ? '#15803d' : '#b45309' }}>
                        Status: {gallery.status === 'active' ? 'Published & Active' : 'Unpublished (Draft)'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                        {gallery.status === 'active'
                          ? 'This gallery is live and accessible via the unguessable link below.'
                          : 'Unpublished galleries cannot be viewed by guests until published.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`wmod-btn ${gallery.status === 'active' ? 'wmod-btn--secondary' : 'wmod-btn--primary'}`}
                      onClick={handleTogglePublish}
                    >
                      {gallery.status === 'active' ? 'Unpublish Gallery' : 'Publish Gallery Now'}
                    </button>
                  </div>

                  {gallery.status === 'active' && (
                    <div style={{ padding: 20, background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                        Shareable Public Link
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <input
                          type="text"
                          readOnly
                          className="wmod-input"
                          style={{ flex: 1, fontSize: '0.85rem', background: '#f8fafc' }}
                          value={publicUrl}
                        />
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--primary wmod-btn--sm"
                          onClick={handleCopyLink}
                        >
                          {copied ? 'Copied! ✓' : 'Copy Link'}
                        </button>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                        🔐 <strong>PIN-Free Unguessable Link:</strong> Guests can view the gallery immediately without needing a PIN or account. Originals remain protected, and guest downloads are disabled.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal for Moving Photo */}
        {movePhotoItem && (
          <div className="wmod-backdrop" style={{ zIndex: 10000 }} onClick={() => setMovePhotoItem(null)}>
            <div className="wmod-modal" style={{ maxWidth: 400, padding: 20 }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Move Photo to Album</h3>
              <select
                className="wmod-input"
                style={{ width: '100%', marginBottom: 16 }}
                value={targetAlbumId}
                onChange={(e) => setTargetAlbumId(e.target.value)}
              >
                {albums.map((alb) => (
                  <option key={alb.id} value={alb.id}>
                    {alb.name}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--ghost"
                  onClick={() => setMovePhotoItem(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--primary"
                  onClick={handleMovePhoto}
                >
                  Move Photo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal for Selecting Gallery Cover Photo */}
        {showCoverPicker && (
          <div className="wmod-backdrop" style={{ zIndex: 10001 }} onClick={() => setShowCoverPicker(false)}>
            <div className="wmod-modal" style={{ maxWidth: 620, padding: 20 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'serif' }}>Select Cover Photo</h3>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--ghost"
                  style={{ fontSize: '1.2rem', padding: '2px 8px' }}
                  onClick={() => setShowCoverPicker(false)}
                >
                  ✕
                </button>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#64748b' }}>
                Select an uploaded couple portrait to feature as the cover at the top of your gallery.
              </p>
              <div style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: 4 }}>
                {photos.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8' }}>
                    No photos uploaded in this gallery yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {photos.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectCoverPhoto(p.id)}
                        style={{
                          aspectRatio: '4/3',
                          borderRadius: 6,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: coverPhotoId === p.id ? '3px solid #c5a059' : '1px solid #e2e8f0',
                          position: 'relative',
                        }}
                        title="Click to select as cover"
                      >
                        <img
                          src={p.thumb_url || p.display_url}
                          alt="option"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        {coverPhotoId === p.id && (
                          <div style={{ position: 'absolute', top: 4, right: 4, background: '#c5a059', color: '#fff', fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                            CURRENT
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--ghost"
                  onClick={() => setShowCoverPicker(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
