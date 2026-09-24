import { useRef, useState } from 'react';
import * as api from '@/api/studioOps';

// Multi-file picker + drag-and-drop into the currently-open backup folder.
// Files go straight into FormData (never read into memory as a big buffer),
// a small worker pool uploads a few at a time, and each row shows its own
// progress via axios' onUploadProgress. Errors are per-file — one bad file
// never blocks the rest of the batch.

const CONCURRENCY = 3;

function bytes(n) {
  const v = Number(n || 0);
  if (v <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), u.length - 1);
  return `${(v / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function BackupUploader({ folderId, disabled, onDone }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [queue, setQueue] = useState([]); // [{id, file, status, pct, error}]
  const runningRef = useRef(false);

  const runQueue = async (items) => {
    if (runningRef.current) return;
    runningRef.current = true;
    let idx = 0;
    let anyOk = false;
    const worker = async () => {
      while (idx < items.length) {
        const item = items[idx];
        idx += 1;
        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: 'uploading' } : x)));
        try {
          await api.backupUpload(item.file, folderId, {
            onUploadProgress: (e) => {
              const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
              setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, pct } : x)));
            },
          });
          anyOk = true;
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: 'done', pct: 100 } : x)));
        } catch (e) {
          const msg = e?.response?.data?.detail || 'Upload failed.';
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: 'error', error: msg } : x)));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
    runningRef.current = false;
    if (anyOk) onDone?.();
  };

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const items = files.map((file) => {
      const tooBig = file.size > api.BACKUP_MAX_UPLOAD_BYTES;
      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        status: tooBig ? 'error' : 'pending',
        pct: 0,
        error: tooBig
          ? `Too large (${bytes(file.size)}). Max ${bytes(api.BACKUP_MAX_UPLOAD_BYTES)} per file.`
          : null,
      };
    });
    setQueue((q) => [...items, ...q]);
    const uploadable = items.filter((i) => i.status === 'pending');
    if (uploadable.length) runQueue(uploadable);
  };

  const clearFinished = () => setQueue((q) => q.filter((x) => x.status === 'uploading' || x.status === 'pending'));

  if (disabled) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        style={{
          borderRadius: 'var(--mj-radius-card-inner)', padding: '22px 16px', textAlign: 'center',
          cursor: 'pointer', border: `1px dashed ${drag ? 'var(--mj-primary)' : 'var(--mj-border)'}`,
          background: drag ? 'var(--mj-section)' : 'var(--mj-card)',
        }}
      >
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--mj-ink-deep)' }}>
          Drag files here, or click to choose
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--mj-muted)' }}>
          Up to {bytes(api.BACKUP_MAX_UPLOAD_BYTES)} per file. Uploads into the folder you have open.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {queue.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {queue.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.file.name}
              </span>
              {item.status === 'error' ? (
                <span style={{ color: 'var(--mj-error-text)', flexShrink: 0 }}>{item.error}</span>
              ) : item.status === 'done' ? (
                <span style={{ color: 'var(--mj-primary)', flexShrink: 0 }}>Done</span>
              ) : (
                <span style={{ width: 90, height: 6, borderRadius: 999, background: 'var(--mj-section)', overflow: 'hidden', flexShrink: 0 }}>
                  <span style={{ display: 'block', width: `${item.pct}%`, height: '100%', background: 'var(--mj-primary)' }} />
                </span>
              )}
            </div>
          ))}
          {queue.every((x) => x.status === 'done' || x.status === 'error') && (
            <button type="button" onClick={clearFinished} className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ alignSelf: 'flex-start' }}>
              Clear list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
