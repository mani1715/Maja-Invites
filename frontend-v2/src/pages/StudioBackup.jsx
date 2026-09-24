import { useMemo, useState } from 'react';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  numberFmt, relTime,
} from '@/components/StudioModule';
import { useAsync, Loading, ErrorPanel } from '@/components/AdminModule';
import BackupUploader from '@/components/studio/BackupUploader';
import BackupFolders from '@/components/studio/BackupFolders';
import BackupFileTable from '@/components/studio/BackupFileTable';
import * as api from '@/api/studioOps';

// Cloud backup — the studio's own file vault.
//
// The API bindings for this existed in studioOps.js but NOTHING imported them:
// eleven endpoints with no screen, so a studio could not see what it had
// backed up, recover a deleted file, or tell how much of its quota was gone.
// There was also no way to put a file IN — `POST /api/cloud-backup/files` is
// metadata-only (records a url that must already point at stored bytes), so
// `POST /api/cloud-backup/upload` (multipart) was added to
// cloud_backup_service.py alongside this page.
//
// /storage returns `locked: true` when there is no paid storage plan. Every
// write then refuses. Checking that once up front is kinder than letting each
// button fail on its own and leaving the user to infer why.

function bytes(n) {
  const v = Number(n || 0);
  if (v <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), u.length - 1);
  return `${(v / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function StudioBackup() {
  const [view, setView] = useState('files');
  const [q, setQ] = useState('');
  const [folderId, setFolderId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [zipBusy, setZipBusy] = useState(false);
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const { data, error, loading, reload } = useAsync(() => Promise.all([
    api.backupStorage().then((r) => r.data).catch(() => null),
    api.backupFiles(q ? { q } : {}).then((r) => r.data).catch(() => null),
    api.backupRecycleBin().then((r) => r.data).catch(() => null),
    api.backupHistory().then((r) => r.data).catch(() => null),
    api.backupFolders().then((r) => r.data).catch(() => null),
  ]).then(([storage, files, bin, history, folders]) => ({ storage, files, bin, history, folders })), [q]);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try { await fn(); flash(msg); await reload(); }
    catch (e) { setErr(e?.response?.data?.detail || 'That did not work.'); }
    finally { setBusy(null); }
  };

  const st = data?.storage;
  const allFiles = data?.files?.files || [];
  const folders = data?.folders?.folders || [];
  const binFiles = data?.bin?.files || [];
  const retention = data?.bin?.retention_days;
  const history = data?.history?.events || [];
  const lastBackup = data?.history?.last_backup;

  // Not searching: scope the table to the currently-open folder. Searching
  // (q set) spans every folder, since "find this file" shouldn't require
  // knowing where it lives.
  const files = useMemo(
    () => (q ? allFiles : allFiles.filter((f) => (f.folder_id || null) === (folderId || null))),
    [allFiles, folderId, q],
  );

  const toggleSelect = (id) => setSelected((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = (checked) => setSelected(checked ? new Set(files.map((f) => f.id)) : new Set());

  const createFolder = async (name, parentId) => {
    await run('folder-create', () => api.backupCreateFolder({ name, parent_id: parentId }), 'Folder created.');
  };
  const deleteFolder = async (folder) => {
    if (folderId === folder.id) setFolderId(folder.parent_id || null);
    await run(`folder-${folder.id}`, () => api.backupDeleteFolder(folder.id), 'Folder deleted.');
  };

  const downloadZip = async () => {
    setZipBusy(true);
    setErr(null);
    try {
      const res = await api.backupDownloadZip({ file_ids: [...selected] });
      const cd = res.headers?.['content-disposition'] || '';
      const match = /filename="?([^"]+)"?/.exec(cd);
      const filename = match ? match[1] : 'backup.zip';
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      setSelected(new Set());
    } catch (e) {
      // responseType: 'blob' means an error response's body is a Blob too, not
      // parsed JSON — read it as text to recover the server's actual detail.
      let detail = 'Could not build the zip. Please try again.';
      const blob = e?.response?.data;
      if (blob instanceof Blob) {
        try { detail = JSON.parse(await blob.text())?.detail || detail; } catch { /* not JSON */ }
      }
      setErr(detail);
    } finally {
      setZipBusy(false);
    }
  };

  return (
    <StudioModule
      active="Cloud backup"
      title="Cloud backup"
      sub="Your own copy of everything you have uploaded, separate from any client gallery."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Used', value: loading ? '—' : bytes(st?.used_bytes) },
        { label: 'Quota', value: loading ? '—' : (st?.quota_gb ? `${st.quota_gb} GB` : 'None') },
        { label: 'Files', value: loading ? '—' : numberFmt.format(allFiles.length) },
        { label: 'Last backup', value: loading ? '—' : (lastBackup ? relTime(lastBackup) : 'Never') },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && st?.locked && (
        <Panel title="No storage plan yet">
          <p className="wmod-error-body" style={{ marginBottom: 12 }}>
            Cloud backup needs a paid storage plan. Until one is active the
            vault is read-only and nothing new can be uploaded.
          </p>
          <a className="wmod-btn wmod-btn--primary" href="/studio/plans">See storage plans</a>
        </Panel>
      )}

      {!loading && !error && (
        <>
          {st && !st.locked && (
            <Panel title="Storage" sub={`${st.used_percent ?? 0}% of your plan used.`}>
              <div style={{ height: 10, borderRadius: 999, background: 'var(--mj-section)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, st.used_percent ?? 0)}%`,
                    height: '100%',
                    background: (st.used_percent ?? 0) > 90 ? 'var(--mj-error)' : 'var(--mj-primary)',
                  }}
                />
              </div>
              <p className="wmod-hint" style={{ marginTop: 10 }}>
                {bytes(st.remaining_bytes)} left. Deleted files stay recoverable for
                {' '}{st.recycle_retention_days ?? retention ?? 1} day
                {(st.recycle_retention_days ?? retention ?? 1) === 1 ? '' : 's'} before they are purged.
              </p>
            </Panel>
          )}

          <Segmented
            ariaLabel="Backup views"
            value={view}
            onChange={setView}
            options={[
              { id: 'files', label: 'Files', count: files.length },
              { id: 'bin', label: 'Recycle bin', count: binFiles.length },
              { id: 'history', label: 'History' },
            ]}
          />

          {view === 'files' && (
            <>
              {!st?.locked && (
                <Panel title="Upload">
                  <BackupUploader folderId={folderId} onDone={reload} />
                </Panel>
              )}

              <Panel title="Files" pad={false}>
                <div style={{ padding: '16px 22px 0' }}>
                  <input
                    className="wmod-input"
                    data-mj-field
                    style={{ maxWidth: 320 }}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by file name (across all folders)"
                    aria-label="Search files"
                  />
                </div>
                <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--mj-border)' }}>
                  <BackupFolders
                    folders={folders}
                    currentId={q ? null : folderId}
                    files={allFiles}
                    disabled={!!q || st?.locked}
                    onNavigate={setFolderId}
                    onCreate={createFolder}
                    onDelete={deleteFolder}
                  />
                </div>
                {files.length === 0 ? (
                  <div className="wmod-panel-body">
                    <Empty
                      title={q ? 'Nothing matches that' : 'Nothing here yet'}
                      body={q ? 'Try a different name.' : 'Upload a file above, or open a different folder.'}
                    />
                  </div>
                ) : (
                  <BackupFileTable
                    files={files}
                    selected={selected}
                    onToggleSelect={toggleSelect}
                    onToggleAll={toggleAll}
                    busy={busy}
                    onDeleteFile={(f) => run(f.id, () => api.backupDelete(f.id), 'Moved to the recycle bin.')}
                    zipBusy={zipBusy}
                    onZip={downloadZip}
                  />
                )}
              </Panel>
            </>
          )}

          {view === 'bin' && (
            <Panel
              title="Recycle bin"
              sub={retention != null
                ? `Deleted files, recoverable for ${retention} day${retention === 1 ? '' : 's'}. After that they are gone for good.`
                : 'Deleted files, recoverable until their purge time.'}
              pad={false}
            >
              {binFiles.length === 0 ? (
                <div className="wmod-panel-body"><Empty title="The bin is empty" /></div>
              ) : (
                <div className="wmod-tablewrap">
                  <table className="wmod-table">
                    <thead><tr><th>File</th><th>Size</th><th>Purges</th><th /></tr></thead>
                    <tbody>
                      {binFiles.map((f) => (
                        <tr key={f.id}>
                          <td>{f.name || f.id}</td>
                          <td>{bytes(f.size_bytes ?? f.size)}</td>
                          <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{f.purge_at ? relTime(f.purge_at) : '—'}</td>
                          <td className="wmod-td-actions">
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--primary wmod-btn--sm"
                              disabled={busy === `r-${f.id}`}
                              onClick={() => run(`r-${f.id}`, () => api.backupRestore(f.id), 'Restored.')}
                            >
                              {busy === `r-${f.id}` ? '…' : 'Restore'}
                            </button>
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--danger wmod-btn--sm"
                              style={{ marginLeft: 8 }}
                              disabled={busy === `p-${f.id}`}
                              // Irreversible — and the retention window would do
                              // it anyway, so this only skips the wait.
                              onClick={() => {
                                if (!window.confirm(`Delete “${f.name || f.id}” permanently? This cannot be undone.`)) return;
                                run(`p-${f.id}`, () => api.backupPurge(f.id), 'Deleted permanently.');
                              }}
                            >
                              {busy === `p-${f.id}` ? '…' : 'Delete forever'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {view === 'history' && (
            <Panel title="History" sub="Every backup action on your vault, newest first." pad={false}>
              {history.length === 0 ? (
                <div className="wmod-panel-body"><Empty title="Nothing logged yet" /></div>
              ) : (
                <div className="wmod-tablewrap">
                  <table className="wmod-table">
                    <thead><tr><th>Action</th><th>File</th><th>When</th></tr></thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={h.id || i}>
                          <td style={{ textTransform: 'capitalize' }}>{String(h.action || '—').replace(/_/g, ' ')}</td>
                          <td className="wmod-td-muted">{h.name || h.file_id || '—'}</td>
                          <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{h.at ? relTime(h.at) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
