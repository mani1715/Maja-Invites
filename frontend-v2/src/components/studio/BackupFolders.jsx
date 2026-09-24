import { useState } from 'react';

// Folder breadcrumb + browse/create/delete. Wires the three exports that
// existed in api/studioOps.js (backupFolders/backupCreateFolder/
// backupDeleteFolder) but had no page importing them.

function pathTo(folders, id) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const trail = [];
  let cur = id ? byId.get(id) : null;
  while (cur) {
    trail.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return trail;
}

export default function BackupFolders({ folders, currentId, files, disabled, onNavigate, onCreate, onDelete }) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const trail = pathTo(folders, currentId);
  const children = folders.filter((f) => (f.parent_id || null) === (currentId || null));

  const submitCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try { await onCreate(name, currentId); setNewName(''); setCreating(false); }
    finally { setBusy(false); }
  };

  const removeFolder = async (folder) => {
    const fileCount = files.filter((f) => f.folder_id === folder.id).length;
    const subCount = folders.filter((f) => f.parent_id === folder.id).length;
    const parts = [];
    if (fileCount) parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'} (moved to the recycle bin)`);
    if (subCount) parts.push(`${subCount} subfolder${subCount === 1 ? '' : 's'} (will stay, but no longer reachable from here)`);
    const detail = parts.length ? ` It contains ${parts.join(' and ')}.` : ' It is empty.';
    if (!window.confirm(`Delete the folder "${folder.name}"?${detail}`)) return;
    setBusy(true);
    try { await onDelete(folder); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
        <button type="button" onClick={() => onNavigate(null)}
          className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ fontWeight: currentId ? 400 : 700 }}>
          All files
        </button>
        {trail.map((f) => (
          <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--mj-faint)' }}>/</span>
            <button type="button" onClick={() => onNavigate(f.id)}
              className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ fontWeight: f.id === currentId ? 700 : 400 }}>
              {f.name}
            </button>
          </span>
        ))}
        {!disabled && (
          <button type="button" onClick={() => setCreating((s) => !s)} className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ marginLeft: 'auto' }}>
            + New folder
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submitCreate} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input className="wmod-input" data-mj-field autoFocus value={newName}
            onChange={(e) => setNewName(e.target.value)} placeholder="Folder name" style={{ maxWidth: 240 }} />
          <button type="submit" disabled={busy || !newName.trim()} className="wmod-btn wmod-btn--primary wmod-btn--sm">Create</button>
          <button type="button" onClick={() => { setCreating(false); setNewName(''); }} className="wmod-btn wmod-btn--ghost wmod-btn--sm">Cancel</button>
        </form>
      )}

      {children.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {children.map((f) => {
            const count = files.filter((ff) => ff.folder_id === f.id).length;
            return (
              <span key={f.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 6px 6px 12px',
                borderRadius: 999, border: '1px solid var(--mj-border)', background: 'var(--mj-card)', fontSize: 12.5,
              }}>
                <button type="button" onClick={() => onNavigate(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mj-ink-deep)', padding: 0 }}>
                  📁 {f.name} <span style={{ color: 'var(--mj-muted)' }}>({count})</span>
                </button>
                {!disabled && (
                  <button type="button" disabled={busy} onClick={() => removeFolder(f)}
                    aria-label={`Delete folder ${f.name}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mj-error-text)', fontSize: 14, lineHeight: 1, padding: '0 4px' }}>
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
