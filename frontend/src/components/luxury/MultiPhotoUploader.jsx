import React, { useRef, useState } from 'react';
import axios from 'axios';
import { Upload, X, Loader2, Image as ImageIcon, Plus } from 'lucide-react';
import { resolveMediaUrl } from '../../utils/mediaUrl';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const MAX_FILE = 10 * 1024 * 1024;

/**
 * MultiPhotoUploader — July 2026
 * ──────────────────────────────────────────────────────────────────
 * Renders a small carousel-style row of couple-photo slots.
 *
 * - The first photo is the "primary" and is what existing components
 *   (covers, thumbnails, opening animation) read from `couple_photo_url`.
 * - Additional photos sit in a separate array and appear after the
 *   primary one in the public-link carousel.
 *
 * Props:
 *   primary       — string. couple_photo_url
 *   onPrimary     — (newUrl: string) => void
 *   extras        — string[]. additional photos
 *   onExtras      — (newArr: string[]) => void
 *   profileId     — UUID when editing an existing wedding; falsy when
 *                   creating (we then use the admin-presave endpoint).
 *   max           — maximum total photos (including primary). Default 8.
 */
const MultiPhotoUploader = ({
  primary = '',
  onPrimary = () => {},
  extras = [],
  onExtras = () => {},
  profileId = null,
  max = 8,
  testid = 'multi-couple-photos',
}) => {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const totalCount = (primary ? 1 : 0) + (Array.isArray(extras) ? extras.length : 0);
  const canAddMore = totalCount < max;

  const uploadFile = async (file) => {
    if (!file) return null;
    if (file.size > MAX_FILE) {
      setErr('Photo too large (max 10 MB)');
      return null;
    }
    if (!file.type.startsWith('image/')) {
      setErr('Please choose an image file');
      return null;
    }
    setErr('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot', 'couple');
    const endpoint = profileId
      ? `${API_URL}/api/admin/profiles/${profileId}/upload-photo`
      : `${API_URL}/api/admin/upload-image`;
    try {
      setBusy(true);
      const res = await axios.post(endpoint, fd);
      const url = res.data?.url || res.data?.file_url || res.data?.media_url;
      return url || null;
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Upload failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handlePick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      if (totalCount + (Array.isArray(extras) ? 0 : 0) >= max) break;
      const url = await uploadFile(f);
      if (!url) continue;
      if (!primary) onPrimary(url);
      else onExtras([...(extras || []), url]);
    }
  };

  const removePrimary = () => {
    if (extras && extras.length > 0) {
      // promote first extra to primary
      const [next, ...rest] = extras;
      onPrimary(next);
      onExtras(rest);
    } else {
      onPrimary('');
    }
  };

  const removeExtra = (idx) => {
    const next = [...(extras || [])];
    next.splice(idx, 1);
    onExtras(next);
  };

  const tile = (url, key, onRemove, label) => (
    <div
      key={key}
      className="relative rounded-lg overflow-hidden flex-shrink-0"
      style={{
        width: 140, height: 180,
        border: '1px solid var(--lux-border)',
        background: 'rgba(8,5,3,0.55)',
      }}
      data-testid={`${testid}-tile-${key}`}
    >
      {url ? (
        <img src={resolveMediaUrl(url)} alt={label} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center" style={{ color: 'rgba(255,248,220,0.4)' }}>
          <ImageIcon className="w-8 h-8" />
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 rounded-full grid place-items-center"
        style={{
          width: 22, height: 22,
          background: 'rgba(8,5,3,0.8)',
          border: '1px solid rgba(255,248,220,0.4)',
          color: '#FFF8DC',
        }}
        aria-label={`Remove ${label}`}
        data-testid={`${testid}-remove-${key}`}
      >
        <X className="w-3 h-3" />
      </button>
      <div
        className="absolute bottom-0 inset-x-0 text-[10px] tracking-[0.25em] uppercase text-center py-1"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.7))', color: '#FFF8DC' }}
      >
        {label}
      </div>
    </div>
  );

  return (
    <div data-testid={testid}>
      <div className="flex items-center gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {primary ? tile(primary, 'primary', removePrimary, 'Main') : null}
        {(extras || []).map((u, i) => tile(u, `extra-${i}`, () => removeExtra(i), `Extra ${i + 1}`))}

        {canAddMore && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="relative rounded-lg flex-shrink-0 transition-all"
            style={{
              width: 140, height: 180,
              border: '1.5px dashed rgba(212,175,55,0.45)',
              background: 'rgba(212,175,55,0.05)',
              color: '#E8C766',
            }}
            data-testid={`${testid}-add`}
          >
            <div className="absolute inset-0 grid place-items-center text-center px-2">
              {busy ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  {primary ? <Plus className="w-7 h-7 mx-auto mb-1.5" /> : <Upload className="w-7 h-7 mx-auto mb-1.5" />}
                  <div className="text-[10px] tracking-[0.25em] uppercase">
                    {primary ? `Add more (${totalCount}/${max})` : 'Upload couple photo'}
                  </div>
                </>
              )}
            </div>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePick}
        data-testid={`${testid}-input`}
      />

      {err && (
        <div className="text-[11px] mt-2" style={{ color: '#ff6b6b' }} role="alert">{err}</div>
      )}
      <div className="text-[10px] tracking-[0.2em] uppercase mt-2" style={{ color: 'rgba(255,248,220,0.7)' }}>
        First photo is used everywhere as the main couple shot. Additional photos appear in the public invitation carousel.
      </div>
    </div>
  );
};

export default MultiPhotoUploader;
