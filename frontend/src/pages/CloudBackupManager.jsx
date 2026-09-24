import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import PanelTabs from '@/components/PanelTabs';
import {
  FolderPlus, Folder, Upload, Trash2, RotateCcw, Search, HardDrive,
  File as FileIcon, Image as ImageIcon, Film, Clock, Loader2, X, AlertTriangle,
  Download, DownloadCloud, CheckSquare, Square, Lock, Sparkles,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const fmt = (b) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const kindIcon = (k) => (k === 'video' ? Film : k === 'image' ? ImageIcon : FileIcon);
const kindOf = (mime) => (mime?.startsWith('video') ? 'video' : mime?.startsWith('image') ? 'image' : mime?.includes('raw') || /\.(raw|cr2|nef|arw|dng)$/i ? 'raw' : 'other');

export default function CloudBackupManager() {
  const navigate = useNavigate();
  const [storage, setStorage] = useState(null);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [folder, setFolder] = useState(null); // current folder id (null = root)
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('files'); // files | recycle | history
  const [recycle, setRecycle] = useState([]);
  const [history, setHistory] = useState({ events: [], recent_uploads: [], last_backup: null });
  const [uploads, setUploads] = useState([]); // {name, pct}
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null); // file being viewed in the lightbox
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // selected file ids
  const [zipping, setZipping] = useState(false);
  const fileInput = useRef(null);
  const srcOf = (u) => (u ? (u.startsWith('http') ? u : `${API_URL}${u}`) : null);
  const locked = storage && storage.locked;

  // Save a blob to disk via a temporary anchor (keeps the auth header, unlike a
  // plain link, because the bytes come back through an authenticated request).
  const saveBlob = (data, filename) => {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const downloadOne = async (f) => {
    try {
      const res = await axios.get(`${API_URL}/api/cloud-backup/files/${f.id}/download`, { responseType: 'blob' });
      saveBlob(res.data, f.name || 'photo');
    } catch (e) { window.alert(e?.response?.data?.detail || 'Download failed'); }
  };
  const downloadZip = async (body, name) => {
    setZipping(true);
    try {
      const res = await axios.post(`${API_URL}/api/cloud-backup/download-zip`, body, { responseType: 'blob' });
      saveBlob(res.data, `${name}.zip`);
    } catch (e) { window.alert(e?.response?.data?.detail || 'Download failed'); }
    finally { setZipping(false); }
  };
  const downloadSelected = () => { if (selected.size) downloadZip({ file_ids: [...selected] }, 'selected-photos'); };
  const downloadFolder = () => { if (folder) downloadZip({ folder_id: folder }, folders.find((f) => f.id === folder)?.name || 'photos'); };
  const toggleSelect = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => { setSelected(new Set()); setSelectMode(false); };

  const refreshStorage = useCallback(async () => {
    try { setStorage((await axios.get(`${API_URL}/api/cloud-backup/storage`)).data); } catch (e) {}
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, fl, fi] = await Promise.all([
        axios.get(`${API_URL}/api/cloud-backup/storage`),
        axios.get(`${API_URL}/api/cloud-backup/folders`),
        axios.get(`${API_URL}/api/cloud-backup/files${folder ? `?folder_id=${folder}` : ''}`),
      ]);
      setStorage(s.data); setFolders(fl.data.folders || []); setFiles(fi.data.files || []);
    } catch (e) {}
    setLoading(false);
  }, [folder]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === 'recycle') axios.get(`${API_URL}/api/cloud-backup/recycle-bin`).then((r) => setRecycle(r.data.files || []));
    if (tab === 'history') axios.get(`${API_URL}/api/cloud-backup/history`).then((r) => setHistory(r.data));
  }, [tab]);

  const newFolder = async () => {
    const name = window.prompt('Folder name'); if (!name) return;
    await axios.post(`${API_URL}/api/cloud-backup/folders`, { name, parent_id: folder });
    load();
  };
  const delFolder = async (id) => { if (!window.confirm('Delete folder + move its files to recycle bin?')) return; await axios.delete(`${API_URL}/api/cloud-backup/folders/${id}`); load(); };

  // Upload each file. Images: real bytes go to the object store (returns a URL
  // we store so the photo actually shows + opens in the viewer). Non-images:
  // keep the metadata-only record (name/size) so quota still tracks them.
  const uploadFiles = async (picked) => {
    for (const f of picked) {
      const row = { name: f.name, pct: 0 };
      setUploads((u) => [...u, row]);
      try {
        let url = null;
        let size = f.size;
        if ((f.type || '').startsWith('image/')) {
          row.pct = 40; setUploads((u) => [...u]);
          const fd = new FormData();
          fd.append('file', f);
          fd.append('slot', 'backup');
          const up = await axios.post(`${API_URL}/api/admin/upload-image`, fd);
          url = up.data?.url || null;
          if (up.data?.file_size) size = up.data.file_size;
        }
        row.pct = 80; setUploads((u) => [...u]);
        await axios.post(`${API_URL}/api/cloud-backup/files`, {
          name: f.name, folder_id: folder, size_bytes: size,
          mime_type: f.type, kind: kindOf(f.type + f.name),
          url, thumbnail_url: url,
        });
        row.pct = 100; setUploads((u) => [...u]);
      } catch (err) {
        row.pct = -1; row.err = err?.response?.data?.detail || 'Failed'; setUploads((u) => [...u]);
      }
    }
    setTimeout(() => setUploads([]), 1200);
    load();
  };
  const onPick = async (e) => { if (folder) await uploadFiles(Array.from(e.target.files || [])); e.target.value = ''; };
  const onDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    if (!folder) return;   // owner spec: photos upload only INSIDE an open folder
    await uploadFiles(Array.from(e.dataTransfer?.files || []));
  };
  const delFile = async (id) => { await axios.delete(`${API_URL}/api/cloud-backup/files/${id}`); load(); };
  const restore = async (id) => { await axios.post(`${API_URL}/api/cloud-backup/files/${id}/restore`); axios.get(`${API_URL}/api/cloud-backup/recycle-bin`).then((r) => setRecycle(r.data.files || [])); refreshStorage(); };
  const purge = async (id) => { await axios.delete(`${API_URL}/api/cloud-backup/files/${id}/purge`); axios.get(`${API_URL}/api/cloud-backup/recycle-bin`).then((r) => setRecycle(r.data.files || [])); };

  const shown = files.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8 md:py-12 max-w-[1400px] mx-auto relative z-10">
        <PanelTabs active="/studio/cloud-backup" />

        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <span className="lux-eyebrow block mb-3">◆ Cloud Backup</span>
            <h1 className="font-display text-[2rem] md:text-[3rem]" style={{ color: 'var(--lux-text)' }}>
              Your client media, <span className="text-gold italic font-script">safe.</span>
            </h1>
          </div>
          {!locked && (
            <div className="flex gap-2">
              <button onClick={newFolder} className="lux-btn lux-btn-ghost"><FolderPlus className="w-4 h-4" /> {folder ? 'New sub-folder' : 'New folder'}</button>
              {folder && <button onClick={() => fileInput.current?.click()} className="lux-btn"><Upload className="w-4 h-4" /> Upload</button>}
              <input ref={fileInput} type="file" multiple hidden onChange={onPick} data-testid="backup-file-input" />
            </div>
          )}
        </div>

        {/* Plan gate — cloud backup is a paid feature; no storage until purchase */}
        {locked && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="lux-glass p-8 md:p-14 text-center max-w-2xl mx-auto mt-6" data-testid="backup-locked">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5"
              style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' }}>
              <Lock className="w-8 h-8" style={{ color: '#D4AF37' }} />
            </div>
            <h2 className="font-display text-2xl md:text-3xl mb-3" style={{ color: 'var(--lux-text)' }}>
              Buy a plan to unlock <span className="text-gold italic font-script">cloud storage.</span>
            </h2>
            <p className="text-sm max-w-md mx-auto mb-6" style={{ color: 'var(--lux-text-muted)' }}>
              Cloud Backup keeps your original client media safe. Choose a storage plan to start
              uploading photos into folders, download them any time, and restore from the recycle bin.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => navigate('/studio/plans')} className="lux-btn" data-testid="backup-buy-plan">
                <Sparkles className="w-4 h-4" /> View storage plans
              </button>
              <button onClick={load} className="lux-btn lux-btn-ghost text-xs">
                <RotateCcw className="w-3.5 h-3.5" /> I've purchased — refresh
              </button>
            </div>
          </motion.div>
        )}

        {!locked && (<>
        {/* storage meter */}
        {storage && (
          <div className="lux-glass p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--lux-text)' }}><HardDrive className="w-4 h-4" style={{ color: '#E8C97A' }} /> {fmt(storage.used_bytes)} of {storage.quota_gb} GB used</span>
              <span className="text-xs" style={{ color: storage.used_percent > 90 ? '#ff8a8a' : 'var(--lux-text-muted)' }}>{fmt(storage.remaining_bytes)} free</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--lux-panel)' }}>
              <div style={{ width: `${storage.used_percent}%`, height: '100%', background: storage.used_percent > 90 ? '#ff6b6b' : 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
            </div>
          </div>
        )}

        {/* uploads in progress */}
        {uploads.length > 0 && (
          <div className="lux-glass p-4 mb-6 space-y-2">
            {uploads.map((u, i) => (
              <div key={i} className="text-xs">
                <div className="flex justify-between" style={{ color: 'var(--lux-text)' }}><span>{u.name}</span><span>{u.pct < 0 ? u.err : `${u.pct}%`}</span></div>
                <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--lux-panel)' }}>
                  <div style={{ width: `${Math.max(u.pct, 0)}%`, height: '100%', background: u.pct < 0 ? '#ff6b6b' : '#E8C97A', borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* tabs */}
        <div className="flex gap-2 mb-5">
          {['files', 'recycle', 'history'].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-xs uppercase tracking-wide ${tab === t ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`} data-testid={`backup-tab-${t}`}>
              {t === 'files' ? 'Files' : t === 'recycle' ? 'Recycle bin' : 'History'}
            </button>
          ))}
          {tab === 'files' && folder && (
            <button onClick={() => fileInput.current?.click()} className="lux-btn ml-auto" data-testid="backup-upload-btn">
              <Upload className="w-4 h-4" /> Upload
            </button>
          )}
          {tab === 'files' && (
            <div className={`relative ${folder ? '' : 'ml-auto'}`}>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--lux-text-faint)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="lux-input pl-9 w-56" />
            </div>
          )}
        </div>

        {/* select + download toolbar (files tab) */}
        {tab === 'files' && (folder || shown.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button onClick={() => (selectMode ? clearSelection() : setSelectMode(true))} className="lux-btn lux-btn-ghost text-xs" data-testid="backup-select-toggle">
              {selectMode ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><CheckSquare className="w-3.5 h-3.5" /> Select</>}
            </button>
            {selectMode && (
              <button onClick={downloadSelected} disabled={!selected.size || zipping} className="lux-btn text-xs disabled:opacity-50" data-testid="backup-download-selected">
                {zipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />} Download selected ({selected.size})
              </button>
            )}
            {folder && shown.length > 0 && (
              <button onClick={downloadFolder} disabled={zipping} className="lux-btn lux-btn-ghost text-xs disabled:opacity-50" data-testid="backup-download-folder">
                {zipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download whole folder
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2" style={{ color: 'var(--lux-text)' }}><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : tab === 'files' ? (
          <div className="space-y-5"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={onDrop}>
            {/* Root shows a hint only — the upload zone now lives DOWN in the
                file area (empty-state) / the toolbar Upload button, per owner:
                move upload to where "No files here yet" sits, not the top. */}
            {!folder && (
              <div className="rounded-2xl p-6 text-center" style={{ border: '2px dashed rgba(232,201,122,0.25)' }} data-testid="backup-open-folder-hint">
                <Folder className="w-6 h-6 mx-auto mb-2" style={{ color: '#E8C97A' }} />
                <div className="text-sm" style={{ color: 'var(--lux-text)' }}>Open a folder to upload photos</div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--lux-text-faint)' }}>Create a folder, open it, then drag photos in.</div>
              </div>
            )}
            {/* folders — filtered to the current level; nest with "New sub-folder" */}
            {folders.filter((f) => (f.parent_id || null) === folder).length > 0 || folder ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {folder && (
                  <button onClick={() => setFolder(folders.find((f) => f.id === folder)?.parent_id || null)} className="lux-glass p-4 flex items-center gap-2 text-sm" style={{ color: '#E8C97A' }} data-testid="backup-up-level">← Back</button>
                )}
                {folders.filter((f) => (f.parent_id || null) === folder).map((f) => (
                  <div key={f.id} className="lux-glass p-4 flex items-center justify-between group cursor-pointer" onClick={() => setFolder(f.id)}>
                    <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--lux-text)' }}><Folder className="w-4 h-4" style={{ color: '#E8C97A' }} /> {f.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); delFolder(f.id); }} className="opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" style={{ color: 'var(--lux-text-faint)' }} /></button>
                  </div>
                ))}
              </div>
            ) : null}
            {/* files */}
            {shown.length === 0 ? (
              folder ? (
                <div onClick={() => fileInput.current?.click()}
                  className="rounded-2xl p-10 text-center cursor-pointer transition-all"
                  style={{ border: `2px dashed ${dragOver ? '#E8C97A' : 'rgba(232,201,122,0.35)'}`, background: dragOver ? 'rgba(232,201,122,0.08)' : 'transparent' }}
                  data-testid="backup-dropzone">
                  <Upload className="w-7 h-7 mx-auto mb-2" style={{ color: '#E8C97A' }} />
                  <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{dragOver ? 'Drop to upload' : 'No files here yet — drag photos here, or click to upload'}</div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--lux-text-faint)' }}>Uploads into {folders.find((f) => f.id === folder)?.name || 'this folder'} · files over your quota are rejected</div>
                </div>
              ) : (
                <div className="lux-glass p-10 text-center" style={{ color: 'var(--lux-text-muted)' }}>No files here yet. Open a folder to back up client media.</div>
              )
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {shown.map((f) => {
                  const Icon = kindIcon(f.kind);
                  const isSel = selected.has(f.id);
                  return (
                    <motion.div key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lux-glass p-3 group relative"
                      style={isSel ? { outline: '2px solid #E8C97A', outlineOffset: 2 } : undefined}>
                      {(() => {
                        const src = srcOf(f.thumbnail_url || f.url);
                        return (
                          <button type="button" onClick={() => (selectMode ? toggleSelect(f.id) : src && setPreview(f))}
                            className="aspect-square w-full rounded-lg mb-2 grid place-items-center overflow-hidden"
                            style={{ background: 'var(--lux-panel)', cursor: selectMode ? 'pointer' : src ? 'zoom-in' : 'default' }}
                            data-testid={`backup-file-thumb-${f.id}`}>
                            {src ? <img src={src} alt={f.name} loading="lazy" className="w-full h-full object-cover" /> : <Icon className="w-7 h-7 opacity-50" style={{ color: '#E8C97A' }} />}
                          </button>
                        );
                      })()}
                      <div className="text-[11px] truncate" style={{ color: 'var(--lux-text)' }} title={f.name}>{f.name}</div>
                      <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--lux-text-muted)' }}>
                        {fmt(f.size_bytes)}{f.is_duplicate && <span className="flex items-center gap-0.5" style={{ color: '#ffcf6b' }} title="Duplicate detected"><AlertTriangle className="w-3 h-3" />dup</span>}
                      </div>
                      {/* selection checkbox (shown in select mode) */}
                      {selectMode && (
                        <button onClick={() => toggleSelect(f.id)} className="absolute top-2 left-2" data-testid={`backup-select-${f.id}`} aria-label="Select">
                          {isSel ? <CheckSquare className="w-5 h-5" style={{ color: '#E8C97A' }} /> : <Square className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.75)' }} />}
                        </button>
                      )}
                      {/* per-file download + delete */}
                      <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100">
                        <button onClick={() => downloadOne(f)} title="Download" data-testid={`backup-download-${f.id}`}><Download className="w-3.5 h-3.5" style={{ color: '#fff' }} /></button>
                        <button onClick={() => delFile(f.id)} title="Move to recycle bin"><Trash2 className="w-3.5 h-3.5" style={{ color: '#fff' }} /></button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        ) : tab === 'recycle' ? (
          <div className="space-y-2">
            <div className="text-[11px] mb-3 flex items-center gap-1.5" style={{ color: 'var(--lux-text-faint)' }}>
              <Clock className="w-3.5 h-3.5" style={{ color: '#E8C97A' }} /> Deleted photos stay here for 1 day, then they're permanently removed.
            </div>
            {recycle.length === 0 ? <div className="lux-glass p-10 text-center" style={{ color: 'var(--lux-text-muted)' }}>Recycle bin is empty.</div> :
              recycle.map((f) => (
                <div key={f.id} className="lux-glass p-3 flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm" style={{ color: 'var(--lux-text)' }}>{f.name} <span className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>· {fmt(f.size_bytes)}{f.purge_at ? ` · auto-deletes ${new Date(f.purge_at).toLocaleString()}` : ''}</span></span>
                  <div className="flex gap-2">
                    <button onClick={() => restore(f.id)} className="lux-btn lux-btn-ghost text-xs"><RotateCcw className="w-3.5 h-3.5" /> Restore</button>
                    <button onClick={() => purge(f.id)} className="lux-btn lux-btn-ghost text-xs"><Trash2 className="w-3.5 h-3.5" /> Delete now</button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="space-y-2">
            {history.last_backup && <div className="text-xs mb-3" style={{ color: 'var(--lux-text-muted)' }}>Last backup: {new Date(history.last_backup).toLocaleString()}</div>}
            {history.events.map((ev) => (
              <div key={ev.id} className="lux-glass p-3 flex items-center gap-3 text-sm" style={{ color: 'var(--lux-text)' }}>
                <Clock className="w-4 h-4" style={{ color: '#E8C97A' }} />
                <span className="capitalize" style={{ color: '#E8C97A' }}>{ev.action}</span>
                <span>{ev.name || ev.file_id}</span>
                <span className="ml-auto text-[10px]" style={{ color: 'var(--lux-text-faint)' }}>{new Date(ev.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        </>)}
      </div>

      {/* Photo lightbox — click a photo to view it full-size */}
      {preview && srcOf(preview.thumbnail_url || preview.url) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(6,4,2,0.94)' }} onClick={() => setPreview(null)} data-testid="backup-lightbox">
          <button className="absolute top-5 right-5 z-10" onClick={() => setPreview(null)} aria-label="Close">
            <X className="w-6 h-6" style={{ color: '#FFF8DC' }} />
          </button>
          <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={srcOf(preview.thumbnail_url || preview.url)} alt={preview.name}
              className="w-full max-h-[82vh] object-contain rounded-xl" />
            <div className="flex items-center justify-center gap-4 mt-3 text-sm" style={{ color: 'rgba(255,248,220,0.85)' }}>
              <span>{preview.name} <span style={{ color: 'var(--lux-text-faint)' }}>· {fmt(preview.size_bytes)}</span></span>
              <button onClick={() => downloadOne(preview)} className="lux-btn text-xs" data-testid="backup-lightbox-download">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
