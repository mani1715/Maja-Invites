import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { resolveMediaUrl } from '../../utils/mediaUrl';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Drag-and-drop single-photo upload with live preview.
 *
 * Two modes (auto-selected):
 *   • profileId given → uploads via `/api/admin/profiles/{id}/upload-photo`
 *     (photographer flow, requires admin auth cookie / token).
 *   • profileId omitted but `mode="user"` → uploads via
 *     `/api/users/upload-image` (normal-user flow, requires user session).
 *
 * Props
 * ─────
 *   value      string  — current image URL (relative or absolute)
 *   onChange   fn(url) — fired on successful upload or remove
 *   profileId  string? — photographer profile id
 *   mode       'admin' | 'user'  (default inferred from profileId)
 *   slot       string  — semantic slot ("bride" / "groom" / "couple") — used by
 *                        the user endpoint to tag the audit record.
 *   label      string  — display label above the dropzone
 *   testid     string  — root data-testid prefix
 *   maxSizeMb  number  — soft cap (default 8 MB)
 */
const PhotoUploadField = ({
  value, onChange, profileId, mode, slot, label, testid, maxSizeMb = 8,
}) => {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const effectiveMode = mode || (profileId ? 'admin' : 'admin-presave');

  const upload = useCallback(async (file) => {
    if (!file) return;
    setErr('');
    if (!file.type?.startsWith('image/')) {
      setErr('Please drop an image file'); return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      setErr(`Max ${maxSizeMb} MB`); return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      let url;
      // NOTE: do NOT set Content-Type — axios needs to inject the
      // multipart boundary string itself. Setting it manually here
      // breaks the upload (server can't parse the body) which was the
      // root cause of the "uploaded photo never shows" bug.
      if (effectiveMode === 'admin') {
        fd.append('caption', label || '');
        const res = await axios.post(
          `${API_URL}/api/admin/profiles/${profileId}/upload-photo`, fd,
        );
        url = res.data?.url || res.data?.file_url || res.data?.media_url;
      } else if (effectiveMode === 'admin-presave') {
        // photographer pre-save upload (no profile yet)
        fd.append('slot', slot || 'misc');
        const res = await axios.post(
          `${API_URL}/api/admin/upload-image`, fd,
        );
        url = res.data?.url;
      } else {
        fd.append('slot', slot || 'misc');
        const res = await axios.post(
          `${API_URL}/api/users/upload-image`, fd,
          { withCredentials: true },
        );
        url = res.data?.url;
      }
      if (url) onChange(url);
      else setErr('Upload OK but no URL returned');
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [effectiveMode, profileId, slot, label, maxSizeMb, onChange]);

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) upload(file);
  };

  const resolvedUrl = resolveMediaUrl(value);

  return (
    <div data-testid={testid}>
      {label && (
        <span className="block text-[10px] tracking-[0.3em] uppercase mb-2"
              style={{ color: 'rgba(255,248,220,0.78)' }}>
          {label}
        </span>
      )}
      <div
        className="lux-glass relative overflow-hidden rounded-xl cursor-pointer transition-all"
        style={{
          height: 200,
          border: value
            ? '1px solid rgba(212,175,55,0.5)'
            : dragOver
              ? '2px dashed #D4AF37'
              : '1px dashed rgba(212,175,55,0.35)',
          background: dragOver ? 'rgba(212,175,55,0.08)' : undefined,
          transform: dragOver ? 'scale(1.01)' : 'none',
        }}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={onDrop}
        data-testid={`${testid}-dropzone`}
      >
        {value ? (
          <>
            <img src={resolvedUrl} alt={label || ''}
                 className="absolute inset-0 w-full h-full object-cover" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full grid place-items-center"
              style={{ background: 'rgba(8,5,3,0.7)', color: '#FFB0A0',
                       border: '1px solid rgba(139,0,0,0.4)' }}
              data-testid={`${testid}-remove`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {uploading && (
              <div className="absolute inset-0 grid place-items-center"
                   style={{ background: 'rgba(8,5,3,0.7)' }}>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#D4AF37' }} />
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-center px-4">
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#D4AF37' }} />
                <span className="text-xs" style={{ color: 'rgba(255,248,220,0.8)' }}>Uploading…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                {dragOver
                  ? <Upload className="w-7 h-7" style={{ color: '#D4AF37' }} />
                  : <ImageIcon className="w-7 h-7" style={{ color: '#D4AF37' }} />}
                <span className="text-xs" style={{ color: 'rgba(255,248,220,0.85)' }}>
                  {dragOver ? 'Release to upload' : 'Drag photo or click'}
                </span>
                <span className="text-[10px]" style={{ color: 'rgba(255,248,220,0.4)' }}>
                  PNG / JPG / HEIC · max {maxSizeMb} MB
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
        data-testid={`${testid}-input`}
      />
      {err && (
        <div className="mt-2 text-xs" style={{ color: '#FFB0A0' }}
             data-testid={`${testid}-error`}>
          {err}
        </div>
      )}
    </div>
  );
};

export default PhotoUploadField;
