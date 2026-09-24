import { useCallback, useEffect, useState } from 'react';
import * as studioApi from '@/api/studio';
import QrCode from './QrCode';

// Card shell matching the page's existing white-card language (StudioGallery.css
// / StudioProfileQrCodes.jsx use the same border/shadow recipe).
const cardStyle = { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', padding: '20px 22px' };
const labelStyle = { fontSize: 11.5, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 4px' };
const hintStyle = { fontSize: 12.5, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.5 };
const monoBox = { fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 12.5, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', overflowX: 'auto', whiteSpace: 'nowrap', color: '#111827', flex: 1, minWidth: 0 };
const btnGhost = { minHeight: 36, padding: '0 14px', borderRadius: 999, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };

function maskMiddle(str, keepStart = 4, keepEnd = 4) {
  if (!str) return '';
  if (str.length <= keepStart + keepEnd) return '•'.repeat(str.length);
  return `${str.slice(0, keepStart)}${'•'.repeat(Math.max(6, str.length - keepStart - keepEnd))}${str.slice(-keepEnd)}`;
}
function maskUrlToken(url) {
  if (!url) return '';
  return url.replace(/([?&]token=)([^&]+)/, (_m, p1, p2) => `${p1}${maskMiddle(p2)}`);
}

function Toggle({ active, busy, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 36, padding: '0 14px 0 6px',
        borderRadius: 999, border: `1px solid ${active ? '#6d28d9' : '#e5e7eb'}`,
        background: active ? '#f5f3ff' : '#ffffff', color: active ? '#6d28d9' : '#6b7280',
        fontSize: 12.5, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <span style={{
        width: 30, height: 18, borderRadius: 999, background: active ? '#6d28d9' : '#d1d5db',
        position: 'relative', flexShrink: 0, transition: 'background .15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: active ? 14 : 2, width: 14, height: 14, borderRadius: 999,
          background: '#fff', transition: 'left .15s',
        }} />
      </span>
      {label ?? (active ? 'Enabled' : 'Disabled')}
    </button>
  );
}

function CopyButton({ text, onCopied }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch (_e) { /* clipboard unavailable */ }
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button type="button" onClick={copy} style={btnGhost}>{copied ? 'Copied' : 'Copy'}</button>
  );
}

export default function UploadMethodsPanel({ profileId, galleryEnabled, isPhone }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // null | 'not_enabled' | 'blocked' | string
  const [creds, setCreds] = useState(null);
  const [health, setHealth] = useState(null);
  const [methods, setMethods] = useState(null); // optimistic local copy
  const [savingKey, setSavingKey] = useState(null);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [toast, setToast] = useState('');

  const flash = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(''), 2600);
  }, []);

  const load = useCallback(async () => {
    if (!galleryEnabled) { setLoading(false); setError('not_enabled'); return; }
    setLoading(true);
    setError(null);
    try {
      const [{ data: c }, { data: h }] = await Promise.all([
        studioApi.galleryCredentials(profileId),
        studioApi.galleryAwsHealth().catch(() => ({ data: null })),
      ]);
      setCreds(c);
      setHealth(h);
      setMethods(c.upload_methods || {});
    } catch (e) {
      const status = e?.response?.status;
      if (status === 400) setError('not_enabled');
      else if (status === 403 || status === 404) setError('blocked');
      else setError(e?.response?.data?.detail || 'Could not load upload settings.');
    } finally {
      setLoading(false);
    }
  }, [profileId, galleryEnabled]);

  useEffect(() => { load(); }, [load]);

  const toggleMethod = async (key) => {
    if (!methods) return;
    const prev = methods;
    const next = { ...methods, [key]: !methods[key] };
    setMethods(next);
    setSavingKey(key);
    try {
      await studioApi.galleryUpdateUploadMethods(profileId, next);
    } catch (e) {
      setMethods(prev); // revert on failure
      flash(e?.response?.data?.detail || 'Could not save that change.');
    } finally {
      setSavingKey(null);
    }
  };

  const regenerateToken = async () => {
    if (!window.confirm(
      'Regenerate the 24-hour live-upload link?\n\n' +
      'This immediately invalidates the current link and QR code — anyone ' +
      'mid-upload from the old one will be disconnected and need the new QR.'
    )) return;
    setRegenBusy(true);
    try {
      await studioApi.galleryRegenerateToken(profileId);
      const { data: c } = await studioApi.galleryCredentials(profileId);
      setCreds(c);
      setMethods(c.upload_methods || {});
      flash('New 24-hour link generated.');
    } catch (e) {
      flash(e?.response?.data?.detail || 'Could not regenerate the link.');
    } finally {
      setRegenBusy(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'grid', gap: 14 }}>{[0, 1, 2].map((i) => <div key={i} className="stgal-skel" style={{ height: 120, borderRadius: 20 }} />)}</div>;
  }

  if (error === 'not_enabled') {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
        <p style={{ fontFamily: "'Spectral',serif", fontSize: 17, margin: '0 0 6px' }}>Enable the AI gallery first.</p>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Upload methods (phone live mode, WiFi SD card, DSLR tether, guest contributions) become configurable once the gallery is on. See the Photos tab.</p>
      </div>
    );
  }
  if (error === 'blocked') {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
        <p style={{ fontSize: 13.5, color: '#6b7280', margin: 0 }}>Upload settings aren&rsquo;t available for this gallery right now.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 24px' }}>
        <p style={{ fontSize: 13.5, color: '#dc2626', margin: '0 0 14px' }}>{error}</p>
        <button type="button" onClick={load} className="stgal-btn" style={{ background: '#6d28d9', color: '#fff', border: 'none', padding: '0 20px', minHeight: 40, borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
      </div>
    );
  }
  if (!creds || !methods) return null;

  const liveUrl = creds.live_upload_url || '';
  const sdUrl = creds.sd_card_post_url || '';
  const rawToken = creds.live_token || '';
  const expires = creds.live_token_expires_at ? new Date(creds.live_token_expires_at) : null;
  const expired = expires ? expires.getTime() < Date.now() : false;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {health && !health.configured && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 14, padding: '10px 16px', fontSize: 12.5 }}>
          AWS isn&rsquo;t configured on the backend — uploads that need S3/Rekognition may fail until that&rsquo;s fixed.
        </div>
      )}

      {/* Phone Live Mode */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div>
            <p style={labelStyle}>Phone live mode</p>
            <p style={{ fontSize: 13.5, color: '#111827', margin: 0, fontWeight: 500 }}>Scan to upload straight from a phone</p>
            <p style={hintStyle}>Open the live page on a phone and every photo taken there uploads automatically. Best for a second shooter or assistant.</p>
          </div>
          <Toggle active={!!methods.phone_live_enabled} busy={savingKey === 'phone_live_enabled'} onClick={() => toggleMethod('phone_live_enabled')} />
        </div>

        {methods.phone_live_enabled && (
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '176px 1fr', gap: 18, alignItems: 'start' }}>
            <div style={{ display: 'flex', justifyContent: isPhone ? 'center' : 'flex-start' }}>
              <div style={{ padding: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14 }}>
                <QrCode value={liveUrl} size={156} />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
              <p style={labelStyle}>Live URL (24h)</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={monoBox}>{tokenRevealed ? liveUrl : maskUrlToken(liveUrl)}</code>
                <CopyButton text={liveUrl} onCopied={() => flash('Live URL copied.')} />
              </div>
              <button type="button" onClick={() => setTokenRevealed((v) => !v)} style={{ ...btnGhost, alignSelf: 'flex-start', border: '1px solid #e5e7eb', color: '#6b7280' }}>
                {tokenRevealed ? 'Hide token' : 'Reveal token'}
              </button>
              <p style={{ fontSize: 12, margin: 0, color: expired ? '#dc2626' : '#6b7280' }}>
                {expires ? `${expired ? 'Expired' : 'Expires'} ${expires.toLocaleString()}` : 'Expiry unknown'}
              </p>
              <button type="button" onClick={regenerateToken} disabled={regenBusy} style={{ ...btnGhost, alignSelf: 'flex-start' }}>
                {regenBusy ? 'Regenerating…' : 'Regenerate 24h link'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* WiFi / SD card */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div>
            <p style={labelStyle}>WiFi SD card</p>
            <p style={{ fontSize: 13.5, color: '#111827', margin: 0, fontWeight: 500 }}>Auto-upload from a FlashAir / EzShare card</p>
            <p style={hintStyle}>Paste this URL into the card&rsquo;s upload/POST-target setting. It POSTs new JPEGs here as they land on the card — no phone needed.</p>
          </div>
          <Toggle active={!!methods.wifi_sd_card_enabled} busy={savingKey === 'wifi_sd_card_enabled'} onClick={() => toggleMethod('wifi_sd_card_enabled')} />
        </div>
        {methods.wifi_sd_card_enabled && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={monoBox}>{sdUrl}</code>
            <CopyButton text={sdUrl} onCopied={() => flash('POST URL copied.')} />
          </div>
        )}
      </section>

      {/* DSLR tether */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <p style={labelStyle}>DSLR tether</p>
            <p style={{ fontSize: 13.5, color: '#111827', margin: 0, fontWeight: 500 }}>Forward tethered shots via the phone</p>
            <p style={hintStyle}>Pair the DSLR to a phone with Canon Camera Connect / Sony Imaging Edge / Nikon SnapBridge, then use Phone Live Mode above to forward shots to this gallery.</p>
          </div>
          <Toggle active={!!methods.phone_tether_enabled} busy={savingKey === 'phone_tether_enabled'} onClick={() => toggleMethod('phone_tether_enabled')} />
        </div>
      </section>

      {/* Guest contributions */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <p style={labelStyle}>Guest contributions</p>
            <p style={{ fontSize: 13.5, color: '#111827', margin: 0, fontWeight: 500 }}>Let guests add their own candids</p>
            <p style={hintStyle}>Guests upload from the invitation&rsquo;s live gallery straight into this same photo pool.</p>
          </div>
          <Toggle active={!!methods.guest_contributions_enabled} busy={savingKey === 'guest_contributions_enabled'} onClick={() => toggleMethod('guest_contributions_enabled')} />
        </div>
      </section>

      <div style={{ display: toast ? 'flex' : 'none', position: 'fixed', left: 0, right: 0, bottom: 26, justifyContent: 'center', pointerEvents: 'none', zIndex: 80 }}>
        <div className="stgal-toast" style={{ background: '#2e1065', color: '#ffffff', fontSize: 13, padding: '12px 20px', borderRadius: 14, boxShadow: '0 18px 40px rgba(109,40,217,.30)' }}>{toast}</div>
      </div>
    </div>
  );
}
