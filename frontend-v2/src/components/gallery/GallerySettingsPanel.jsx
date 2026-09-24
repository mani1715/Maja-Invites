import { useCallback, useEffect, useState } from 'react';
import * as studioApi from '@/api/studio';

const cardStyle = { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', padding: '20px 22px' };
const labelStyle = { fontSize: 11.5, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 4px' };
const hintStyle = { fontSize: 12.5, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.5 };

function methodLabel(key) {
  const names = {
    phone_live: 'Phone live mode', bulk: 'Bulk upload', presign: 'Bulk upload (direct)',
    guest: 'Guest contribution', phone_tether: 'DSLR tether', wifi_sd_card: 'WiFi SD card',
    unknown: 'Unspecified',
  };
  return names[key] || key.replace(/_/g, ' ');
}

export default function GallerySettingsPanel({ profileId, stats }) {
  const [collectionId, setCollectionId] = useState(null);
  const [credErr, setCredErr] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!stats?.enabled) return;
    try {
      const { data } = await studioApi.galleryCredentials(profileId);
      setCollectionId(data.aws_collection_id || null);
    } catch (_e) {
      setCredErr(true); // non-fatal -- the rest of the panel still renders from `stats`
    }
  }, [profileId, stats?.enabled]);

  useEffect(() => { load(); }, [load]);

  if (!stats?.enabled) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
        <p style={{ fontFamily: "'Spectral',serif", fontSize: 17, margin: '0 0 6px' }}>Enable the AI gallery first.</p>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Auto-delete schedule, the Rekognition collection ID, and upload-method usage show up here once the gallery is on.</p>
      </div>
    );
  }

  const byMethod = stats.by_method || {};
  const methodEntries = Object.entries(byMethod);
  const autoDelete = stats.auto_delete_at ? new Date(stats.auto_delete_at) : null;

  const copyId = async () => {
    if (!collectionId) return;
    try { await navigator.clipboard.writeText(collectionId); } catch (_e) { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={cardStyle}>
        <p style={labelStyle}>Auto-delete schedule</p>
        <p style={{ fontSize: 13.5, color: '#111827', margin: '0 0 4px', fontWeight: 500 }}>
          {autoDelete ? autoDelete.toLocaleString() : 'Not scheduled yet'}
        </p>
        <p style={hintStyle}>All photos, faces, and guest selfies for this gallery are removed on this date. There&rsquo;s no recovery after that — this isn&rsquo;t editable here.</p>
      </section>

      <section style={cardStyle}>
        <p style={labelStyle}>Rekognition collection</p>
        <p style={hintStyle}>Read-only — for support tickets only. This is the AWS face-match collection backing this gallery.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <code style={{ fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 12.5, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', overflowX: 'auto', whiteSpace: 'nowrap', color: '#111827', flex: 1, minWidth: 0 }}>
            {collectionId || (credErr ? '— unavailable —' : '—')}
          </code>
          {collectionId && (
            <button type="button" onClick={copyId} style={{ minHeight: 36, padding: '0 14px', borderRadius: 999, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <p style={labelStyle}>Usage by upload method</p>
        <p style={hintStyle}>How photos in this gallery arrived.</p>
        {methodEntries.length === 0 ? (
          <p style={{ fontSize: 13, color: '#6b7280', margin: '10px 0 0' }}>No uploads yet.</p>
        ) : (
          <div style={{ marginTop: 10, display: 'grid', gap: 2 }}>
            {methodEntries.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13.5 }}>
                <span style={{ color: '#111827' }}>{methodLabel(k)}</span>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
