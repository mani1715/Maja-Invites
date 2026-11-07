import React, { useState, useEffect } from 'react';
import { createGallery } from '../../api/gallery';
import { listPaginated } from '../../api/weddings';

export default function CreateGalleryModal({ isOpen, onClose, onSuccess, onOpenPlans }) {
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [expiryDays, setExpiryDays] = useState(365);
  const [watermarkText, setWatermarkText] = useState('MAJA INVITES');
  const [studioName, setStudioName] = useState('');
  const [albums, setAlbums] = useState(['Engagement', 'Haldi', 'Wedding', 'Reception']);
  const [newAlbumInput, setNewAlbumInput] = useState('');
  const [attachInvitation, setAttachInvitation] = useState(false);
  const [selectedInvitationId, setSelectedInvitationId] = useState('');
  const [invitationsList, setInvitationsList] = useState([]);
  const [loadingInvs, setLoadingInvs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [invitationError, setInvitationError] = useState('');
  const [invitationRetry, setInvitationRetry] = useState(0);
  useEffect(() => {
    if (!isOpen || !attachInvitation) return;
    let cancelled = false;
    async function loadInvitations() {
      setLoadingInvs(true);
      setInvitationError('');
      try {
        const items = [];
        let page = 1, pages = 1;
        do {
          const { data } = await listPaginated({ page, page_size: 100 });
          if (cancelled) return;
          items.push(...(data.items || []));
          pages = data.total_pages || 1;
          page += 1;
        } while (page <= pages);
        setInvitationsList(items);
      } catch {
        if (!cancelled) setInvitationError('Could not load invitations. Please retry.');
      } finally {
        if (!cancelled) setLoadingInvs(false);
      }
    }
    loadInvitations();
    return () => { cancelled = true; };
  }, [isOpen, attachInvitation, invitationRetry]);

  if (!isOpen) return null;

  const handleAddAlbum = (e) => {
    e.preventDefault();
    const trimmed = newAlbumInput.trim();
    if (trimmed && !albums.includes(trimmed)) {
      setAlbums([...albums, trimmed]);
      setNewAlbumInput('');
    }
  };

  const handleRemoveAlbum = (albumName) => {
    setAlbums(albums.filter((a) => a !== albumName));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Gallery title is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      title: title.trim(),
      client_name: clientName.trim() || undefined,
      event_date: eventDate || undefined,
      expiry_days: Number(expiryDays) || 365,
      branding: {
        studio_name: studioName.trim() || undefined,
        watermark_text: watermarkText.trim() || 'MAJA INVITES',
      },
      initial_albums: albums.length > 0 ? albums : ['Engagement', 'Haldi', 'Wedding', 'Reception'],
      invitation_id: (attachInvitation && selectedInvitationId) ? selectedInvitationId : undefined,
    };

    try {
      const res = await createGallery(payload);
      setSubmitting(false);
      onClose();
      if (onSuccess) {
        onSuccess(res.data?.gallery || res.data);
      }
    } catch (err) {
      setSubmitting(false);
      const detail = err.response?.data?.detail;
      if (err.response?.status === 403 && (detail?.error === 'STORAGE_SUBSCRIPTION_REQUIRED' || typeof detail === 'string')) {
        // Unentitled: open CommercialPlansModal
        onClose();
        if (onOpenPlans) {
          onOpenPlans();
        }
      } else {
        setError(typeof detail === 'string' ? detail : detail?.message || 'Failed to create gallery. Please try again.');
      }
    }
  };

  return (
    <div className="wmod-backdrop" onClick={onClose} style={{ zIndex: 9998 }}>
      <div
        className="wmod-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640, width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="wmod-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontFamily: 'serif' }}>Create Standalone Gallery</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              Create a client photo delivery space with named albums and watermark protection. No invitation required.
            </p>
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

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fee2e2', color: '#b91c1c', borderRadius: 8, margin: '14px 0', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          {/* Gallery Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Gallery / Event Title *
            </label>
            <input
              type="text"
              className="wmod-input"
              style={{ width: '100%' }}
              placeholder="e.g. Aarav & Diya Royal Wedding"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Client Name & Event Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Client Name (Optional)
              </label>
              <input
                type="text"
                className="wmod-input"
                style={{ width: '100%' }}
                placeholder="e.g. Sharma Family"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Event Date (Optional)
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

          {/* Expiry Selection */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Gallery Expiry & Client Access Period
            </label>
            <select
              className="wmod-input"
              style={{ width: '100%' }}
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
            >
              <option value={90}>90 Days (3 Months)</option>
              <option value={180}>180 Days (6 Months)</option>
              <option value={365}>365 Days (1 Year - Standard)</option>
              <option value={730}>730 Days (2 Years)</option>
            </select>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
              Gallery retention operates independently of invitation expiry. A 30-day grace period is granted before archive cleanup.
            </div>
          </div>

          {/* Initial Albums */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Initial Named Albums
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {albums.map((alb) => (
                <span
                  key={alb}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 16,
                    background: '#f1f5f9',
                    fontSize: '0.8rem',
                    color: '#334155',
                  }}
                >
                  {alb}
                  <button
                    type="button"
                    onClick={() => handleRemoveAlbum(alb)}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '0.9rem' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="wmod-input"
                style={{ flex: 1, fontSize: '0.85rem' }}
                placeholder="Add custom album (e.g. Sangeet, Pre-Wedding, Pheras)"
                value={newAlbumInput}
                onChange={(e) => setNewAlbumInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddAlbum(e);
                  }
                }}
              />
              <button
                type="button"
                className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                onClick={handleAddAlbum}
              >
                + Add
              </button>
            </div>
          </div>

          {/* Studio Branding & Watermark */}
          <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 8 }}>
              Studio Branding & Photo Watermark
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: 2 }}>
                  Studio / Display Name
                </label>
                <input
                  type="text"
                  className="wmod-input"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  placeholder="e.g. Royal Shutter Photography"
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: 2 }}>
                  Watermark Text
                </label>
                <input
                  type="text"
                  className="wmod-input"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  placeholder="e.g. MAJA INVITES"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                />
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 6 }}>
              All public guests receive watermarked display derivatives. Full-resolution originals remain securely stored in your private vault.
            </div>
          </div>

          {/* Optional Attach to Existing Invitation */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: '#334155' }}>
              <input
                type="checkbox"
                checked={attachInvitation}
                onChange={(e) => setAttachInvitation(e.target.checked)}
              />
              <span>Optional: Attach to an existing invitation event</span>
            </label>
            {attachInvitation && (
              <div style={{ marginTop: 8, paddingLeft: 24 }}>
                {invitationError && <p role="alert">{invitationError} <button type="button" onClick={()=>setInvitationRetry(v=>v+1)}>Retry invitations</button></p>}
                {!loadingInvs && !invitationError && !invitationsList.length && <p>No invitations available to link.</p>}
                {loadingInvs ? (
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Loading your invitations...</div>
                ) : (
                  <select
                    className="wmod-input"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                    value={selectedInvitationId}
                    onChange={(e) => setSelectedInvitationId(e.target.value)}
                  >
                    <option value="">-- Select an invitation (Optional) --</option>
                    {invitationsList.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.title || `${inv.bride_name} & ${inv.groom_name}`} ({inv.slug})
                      </option>
                    ))}
                  </select>
                )}
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                  Linking is completely optional. Standalone galleries function fully on their own.
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
            <button
              type="button"
              className="wmod-btn wmod-btn--ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="wmod-btn wmod-btn--primary"
              disabled={submitting}
            >
              {submitting ? 'Creating Gallery...' : 'Create Gallery →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
