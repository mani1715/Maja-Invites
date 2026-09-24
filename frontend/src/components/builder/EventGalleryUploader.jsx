/**
 * EventGalleryUploader.jsx — MAJA Dynamic Event Engine: Builder gallery upload.
 * =============================================================================
 *
 * Real media upload for the gallery section (multipart → the event media pipeline:
 * validate → WebP/variants → quota → metadata). Shows a thumbnail grid of uploaded
 * media with per-item delete. Reuses the lux UI primitives.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, Upload, AlertCircle } from 'lucide-react';
import { EventService, GalleryService } from '../../services/eventApi';
import { Button } from '../ui/button';

export function EventGalleryUploader({ eventId }) {
  const [items, setItems] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const reload = useCallback(async () => {
    try {
      const res = await GalleryService.list(eventId, { limit: 200 });
      setItems(res.items || []);
    } catch (_) { setError('Could not load the gallery.'); }
  }, [eventId]);

  useEffect(() => { reload(); }, [reload]);

  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true); setError(''); setProgress({ done: 0, total: files.length });
    let failed = 0;
    for (let i = 0; i < files.length; i += 1) {
      try {
        await EventService.uploadGalleryMedia(eventId, files[i], { on_duplicate: 'keep' });
      } catch (e) {
        failed += 1;
        const d = e?.response?.data?.detail;
        setError(typeof d === 'string' ? d : (d?.message || 'Some files could not be uploaded.'));
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    await reload();
    if (failed === 0) setError('');
  };

  const remove = async (id) => {
    try { await GalleryService.remove(eventId, id); await reload(); } catch (_) { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current && inputRef.current.click()}
        disabled={uploading}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 px-6 py-10 text-center transition hover:border-primary/50 hover:bg-muted/40"
      >
        {uploading
          ? <><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="text-sm">Uploading {progress.done}/{progress.total}…</span></>
          : <><Upload className="h-6 w-6 text-muted-foreground" /><span className="text-sm font-medium">Add photos or videos</span><span className="text-xs text-muted-foreground">JPEG · PNG · WebP · MP4 · MOV</span></>}
      </button>

      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-red-300/50 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((m) => (
            <div key={m.id} className="group relative overflow-hidden rounded-lg border">
              {m.type === 'video'
                ? <div className="flex aspect-square items-center justify-center bg-black/80 text-xs text-white">Video</div>
                : <img src={m.thumbnail_url || m.webp_url || m.url} alt={m.caption || 'Photo'} loading="lazy"
                       className="aspect-square w-full object-cover" />}
              <button
                type="button"
                aria-label="Delete media"
                onClick={() => remove(m.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default EventGalleryUploader;
