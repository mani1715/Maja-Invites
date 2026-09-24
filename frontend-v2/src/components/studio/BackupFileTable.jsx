import { relTime } from '@/components/StudioModule';
import * as api from '@/api/studioOps';

function bytes(n) {
  const v = Number(n || 0);
  if (v <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), u.length - 1);
  return `${(v / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

// Files table for the currently-open folder: selection checkboxes, per-file
// download/delete, and a zip-download bar for the selection. Zip creation is
// server-side and can take a moment on a big batch, so the button shows a
// pending state rather than looking frozen.
export default function BackupFileTable({
  files, selected, onToggleSelect, onToggleAll, busy, onDeleteFile, zipBusy, onZip,
}) {
  const allSelected = files.length > 0 && files.every((f) => selected.has(f.id));

  return (
    <>
      {files.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderBottom: '1px solid var(--mj-border)' }}>
          <label className="wmod-check" style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
            Select all
          </label>
          <span style={{ fontSize: 12.5, color: 'var(--mj-muted)' }}>
            {selected.size ? `${selected.size} selected` : ''}
          </span>
          <button
            type="button"
            className="wmod-btn wmod-btn--primary wmod-btn--sm"
            style={{ marginLeft: 'auto' }}
            disabled={selected.size === 0 || zipBusy}
            onClick={onZip}
          >
            {zipBusy ? 'Zipping…' : `Download zip${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      )}
      <div className="wmod-tablewrap">
        <table className="wmod-table">
          <thead><tr><th /><th>File</th><th>Size</th><th>Added</th><th /></tr></thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td style={{ width: 30 }}>
                  <input type="checkbox" checked={selected.has(f.id)} onChange={() => onToggleSelect(f.id)} aria-label={`Select ${f.name || f.id}`} />
                </td>
                <td style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {f.kind === 'image' && (f.thumbnail_url || f.url) && (
                    <img src={f.thumbnail_url || f.url} alt="" loading="lazy" decoding="async"
                      style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <span style={{ overflowWrap: 'anywhere' }}>{f.name || f.id}</span>
                </td>
                <td>{bytes(f.size_bytes ?? f.size)}</td>
                <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{f.created_at ? relTime(f.created_at) : '—'}</td>
                <td className="wmod-td-actions">
                  <a className="wmod-btn wmod-btn--ghost wmod-btn--sm" href={api.backupDownloadUrl(f.id)}>Download</a>
                  <button
                    type="button"
                    className="wmod-btn wmod-btn--danger wmod-btn--sm"
                    style={{ marginLeft: 8 }}
                    disabled={busy === f.id}
                    onClick={() => onDeleteFile(f)}
                  >
                    {busy === f.id ? '…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
