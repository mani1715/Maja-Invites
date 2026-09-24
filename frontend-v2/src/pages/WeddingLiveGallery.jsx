import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import WeddingToolbar from '@/components/nav/WeddingToolbar';
import * as studioApi from '@/api/studio';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import * as galleryApi from '@/api/gallery';
import './WeddingLiveGallery.css';

// Ported from "MAJA Wedding Live Gallery.dc.html" — studio moderation view.
// Route: /studio/wedding/:weddingId/live-gallery (see App.jsx) — reads
// `weddingId` from the route param, same id the backend calls profile_id.
const TABS = ['All', 'Pending', 'Published'];
const RULES = [
  { key: 'moderation_required', label: 'Hold guest photos for review before publishing' },
  { key: 'auto_approve', label: 'Auto-approve photos as they arrive' },
  { key: 'watermark_enabled', label: 'Watermark guest uploads' },
];

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function WeddingLiveGallery() {
  const { weddingId } = useParams();
  const [photos, setPhotos] = useState([]);
  const [settings, setSettings] = useState(null);
  // Loaded purely so the toolbar can offer a real /invite/{slug} link and the
  // correct Published/Draft pill — without it the toolbar fell back to the
  // internal UUID and produced a 404.
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState([]);
  const [toast, setToast] = useState('');
  const [savingRule, setSavingRule] = useState(null);
  const toastTimer = useRef(null);

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [photosRes, settingsRes, profileRes] = await Promise.all([
        galleryApi.adminGetPhotos(weddingId),
        galleryApi.getLiveGallerySettings(weddingId),
        // Non-fatal: the gallery is still usable if the profile read fails.
        studioApi.getProfile(weddingId).catch(() => null),
      ]);
      setPhotos(photosRes.data.photos || []);
      setSettings(settingsRes.data);
      if (profileRes) setProfile(profileRes.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not load this wedding’s live gallery.');
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { if (weddingId) load(); }, [weddingId, load]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const counts = useMemo(() => ({
    all: photos.length,
    pending: photos.filter((p) => !p.approved).length,
    published: photos.filter((p) => p.approved).length,
  }), [photos]);

  const shown = tab === 1 ? photos.filter((p) => !p.approved) : tab === 2 ? photos.filter((p) => p.approved) : photos;

  const kpis = [
    { label: 'Uploaded today', value: photos.filter((p) => isToday(p.created_at)).length },
    { label: 'Awaiting review', value: counts.pending },
    { label: 'Guests uploading', value: new Set(photos.filter((p) => p.uploader_type === 'guest').map((p) => p.uploader_name)).size },
  ];

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.concat(id)));
  const clearSelection = () => setSelected([]);

  const publishSelected = async () => {
    if (!selected.length) { flash('Select some photos first.'); return; }
    const ids = selected;
    try {
      await Promise.all(ids.map((id) => galleryApi.moderatePhoto(id, true)));
      setPhotos((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, approved: true } : p)));
      setSelected([]);
      flash(`${ids.length} photo${ids.length === 1 ? '' : 's'} published to the live gallery.`);
    } catch (e) {
      flash('Could not publish — please try again.');
    }
  };

  const togglePause = async () => {
    if (!settings) return;
    const next = !settings.guest_upload_enabled;
    setSettings((s) => ({ ...s, guest_upload_enabled: next }));
    try {
      await galleryApi.updateLiveGallerySettings(weddingId, { ...settings, guest_upload_enabled: next });
      flash(next ? 'Guest uploads resumed.' : 'Guest uploads paused.');
    } catch (e) {
      setSettings((s) => ({ ...s, guest_upload_enabled: !next }));
      flash('Could not change that — please try again.');
    }
  };

  const toggleRule = async (key, label) => {
    if (!settings) return;
    const next = !settings[key];
    setSavingRule(key);
    const prevSettings = settings;
    setSettings((s) => ({ ...s, [key]: next }));
    try {
      await galleryApi.updateLiveGallerySettings(weddingId, { ...settings, [key]: next });
      flash(`${label}${next ? ' turned on.' : ' turned off.'}`);
    } catch (e) {
      setSettings(prevSettings);
      flash('Could not save that — please try again.');
    } finally {
      setSavingRule(null);
    }
  };

  return (
    <div className="wlg-page">
      <div style={{ position: 'sticky', top: 0, zIndex: 60 }}><MobileNav panel="studio" active="Weddings" /></div>
      <div className="wlg-shell">
        <div className="wlg-sidebar"><StudioNav active="Weddings" /></div>
        <main id="main-content" className="wlg-main">
          <WeddingToolbar weddingId={weddingId} active="Live gallery" title="Live gallery"
            slug={profile?.slug} status={profile?.status === 'PUBLISHED' || profile?.is_published ? 'Published' : 'Draft'} />

          {loading && <div className="wlg-state">Loading the live gallery&hellip;</div>}
          {!loading && error && (
            <div className="wlg-state">
              <p style={{ marginBottom: 14 }}>{error}</p>
              <button type="button" className="wlg-btn-ghost" onClick={load}>Try again</button>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="wlg-toprow">
                <span className="wlg-live-chip"><span className="wlg-live-dot" />Live</span>
                <div className="wlg-tabs">
                  {TABS.map((label, i) => (
                    <button key={label} type="button" className="wlg-tab" onClick={() => setTab(i)}
                      style={{ background: tab === i ? '#ffffff' : 'transparent', color: tab === i ? '#111827' : '#4b5563', fontWeight: tab === i ? 600 : 400 }}>
                      {label} &middot; {i === 0 ? counts.all : i === 1 ? counts.pending : counts.published}
                    </button>
                  ))}
                </div>
                <button type="button" className="wlg-pause-btn" onClick={togglePause} disabled={!settings}>
                  {settings?.guest_upload_enabled === false ? 'Resume uploads' : 'Pause uploads'}
                </button>
              </div>

              <div className="px-aurora wlg-strip">
                <div className="wlg-kpis">
                  {kpis.map((k) => (
                    <div key={k.label} className="px-glass wlg-kpi">
                      <p>{k.label}</p>
                      <p>{k.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="wlg-body">
                <div style={{ minWidth: 0 }}>
                  {shown.length === 0 ? (
                    <div className="wlg-state">No photos in this view yet.</div>
                  ) : (
                    <div className="wlg-grid">
                      {shown.map((p) => (
                        <button key={p.id} type="button" className="wlg-tile" onClick={() => toggleSelect(p.id)}
                          style={{ borderColor: selected.includes(p.id) ? '#6d28d9' : 'transparent' }}>
                          <img src={resolveMediaUrl(p.thumb_url || p.url)} alt={p.caption || 'Guest upload'} loading="lazy" />
                          <span className="wlg-tile-by">{p.uploader_name || (p.uploader_type === 'desktop' ? 'Studio' : 'Guest')}</span>
                          <span className="wlg-tile-mark" style={{ background: p.approved ? '#ede9fe' : 'rgba(255,255,255,.75)', color: p.approved ? '#6d28d9' : '#4b5563' }}>
                            {p.approved ? '✓' : '·'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="wlg-actions">
                    <button type="button" className="wlg-btn-solid" onClick={publishSelected}>Publish {selected.length} selected</button>
                    <button type="button" className="wlg-btn-ghost" onClick={clearSelection}>Clear selection</button>
                  </div>
                </div>

                <div className="wlg-rail">
                  <div className="wlg-card wlg-card--qr">
                    <h3 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 17, lineHeight: 1.25, margin: '0 0 6px', color: '#111827' }}>Guest <span style={{ color: '#6d28d9' }}>uploads</span></h3>
                    <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 16px' }}>Guests scan the table QR and upload straight from their camera roll.</p>
                    <div className="wlg-code">Table QR — set up under this wedding&rsquo;s QR codes page</div>
                  </div>

                  <div className="wlg-card">
                    <h3 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 16, margin: '0 0 14px' }}>Moderation</h3>
                    {settings && RULES.map((r) => {
                      const on = !!settings[r.key];
                      return (
                        <div key={r.key} className="wlg-rule-row">
                          <p style={{ fontSize: 13, margin: 0, color: '#6b7280', lineHeight: 1.5 }}>{r.label}</p>
                          <button type="button" role="switch" aria-checked={on} className="wlg-switch"
                            disabled={savingRule === r.key}
                            onClick={() => toggleRule(r.key, r.label)}
                            style={{ background: on ? '#a78bfa' : '#ddd6fe', justifyContent: on ? 'flex-end' : 'flex-start' }}>
                            <span />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="wlg-card">
                    <h3 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 16, margin: '0 0 12px' }}>After the <span style={{ color: '#6d28d9' }}>event</span></h3>
                    <p style={{ fontSize: 12.5, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>Everything published here moves into the studio gallery for the final album.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {toast && <div className="wlg-toast">{toast}</div>}
        </main>
      </div>
    </div>
  );
}
