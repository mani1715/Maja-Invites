import { useRef, useState } from 'react';
import * as portfolioApi from '@/api/portfolio';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import '@/pages/StudioPortfolio.css';

// Drag-and-drop (or click) single-image/video uploader against
// POST /api/portfolio/upload. Extracted out of StudioPortfolio.jsx (where it
// started as a page-local component) so PortfolioGallery can reuse the exact
// same upload path for work media instead of re-implementing it.
export default function MediaDrop({ label, value, accept = 'image/*', onUploaded, onClear }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const { data } = await portfolioApi.uploadFile(file);
      onUploaded(data);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Upload failed.');
    } finally { setBusy(false); }
  };

  const isVideo = /video\//.test(value || '') || /\.(mp4|mov|webm|m4v|avi)$/i.test(value || '');

  return (
    <div>
      {label && <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#111827', marginBottom: 6 }}>{label}</span>}
      <div
        className="stpf-drop"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
        style={{ borderRadius: 14, padding: 14, textAlign: 'center',
          border: `1px dashed ${drag ? '#6d28d9' : '#ddd6fe'}`, background: drag ? '#f5f3ff' : '#fafafa' }}>
        {busy ? (
          <span style={{ fontSize: 12, color: '#6d28d9' }}>Uploading...</span>
        ) : value ? (
          isVideo ? (
            <span style={{ fontSize: 12, color: '#4b5563' }}>Video uploaded</span>
          ) : (
            <img src={resolveMediaUrl(value)} alt={label || ''} style={{ maxHeight: 96, margin: '0 auto', borderRadius: 10, objectFit: 'cover' }} />
          )
        ) : (
          <span style={{ fontSize: 12, color: '#6b7280' }}>Drag &amp; drop or click to upload</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        {value && onClear && <button type="button" onClick={onClear} style={{ fontSize: 11, color: '#6d28d9', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Remove</button>}
      </div>
      {err && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{err}</div>}
      <input ref={inputRef} type="file" accept={accept} hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
