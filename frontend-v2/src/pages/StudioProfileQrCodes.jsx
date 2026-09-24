import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import WeddingToolbar from '@/components/nav/WeddingToolbar';
import { getProfile, listEventInvitations, regenerateQr, regenerateAllQrs, faceMatchQr } from '@/api/qr';
import ReferralShare from '@/components/studio/ReferralShare';
import './StudioProfileQrCodes.css';

// Ported from "MAJA Wedding QR Codes.dc.html". The prototype's plate art was a
// placeholder checker pattern (no real QR data yet); event_invitations now
// return a real branded `qr_image` data: URI, so the plate just frames it.
const STYLES = [
  { label: 'Ivory', plate: '#ede9fe' },
  { label: 'Brass', plate: '#faf3e2' },
  { label: 'Midnight', plate: '#2e1065' },
];

function useViewport() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

function eventLabel(type) {
  if (!type) return 'Invitation';
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

export default function StudioProfileQrCodes() {
  const { profileId } = useParams();
  const vw = useViewport();
  const isMobile = vw < 900;
  const isPhone = vw < 400;

  const [profile, setProfile] = useState(null);
  const [codes, setCodes] = useState(null); // null = loading, [] = loaded-empty
  const [error, setError] = useState(null);
  const [style, setStyle] = useState(1);
  const [busy, setBusy] = useState(null); // id (or 'all') currently regenerating
  const [toast, setToast] = useState('');
  // The wedding's single face-match QR. `null` = still loading, `false` = the
  // AI gallery is not enabled, so there is deliberately nothing to print.
  const [faceQr, setFaceQr] = useState(null);

  const flash = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(''), 2400);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ data: p }, { data: list }] = await Promise.all([
        getProfile(profileId),
        listEventInvitations(profileId),
      ]);
      setProfile(p);
      setCodes(list || []);
      // Loaded separately: a wedding with no AI gallery still has invitation
      // QRs, so a 409 here must not blank the page.
      faceMatchQr(profileId)
        .then(({ data }) => setFaceQr(data))
        .catch(() => setFaceQr(false));
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load this wedding’s QR codes.');
      setCodes([]);
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const copyLink = async (invitationLink) => {
    const abs = `${window.location.origin}${invitationLink}`;
    try {
      await navigator.clipboard.writeText(abs);
      flash(`Link copied: ${abs}`);
    } catch (_e) {
      flash(abs);
    }
  };

  const downloadPng = (code) => {
    if (!code.qr_image) return;
    const a = document.createElement('a');
    a.href = code.qr_image;
    a.download = `${profile?.slug || 'maja'}-${code.event_type}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    flash(`${eventLabel(code.event_type)} QR downloaded as PNG.`);
  };

  const downloadFaceQr = () => {
    if (!faceQr?.qr_image) return;
    const a = document.createElement('a');
    a.href = faceQr.qr_image;
    a.download = `${profile?.slug || 'maja'}-find-my-photos-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    flash('Find My Photos QR downloaded as PNG.');
  };

  const doRegenerate = async (invitationId) => {
    setBusy(invitationId);
    try {
      await regenerateQr(invitationId);
      await load();
      flash('QR code regenerated.');
    } catch (e) {
      flash(e?.response?.data?.detail || 'Could not regenerate that QR code.');
    } finally {
      setBusy(null);
    }
  };

  const doRegenerateAll = async () => {
    setBusy('all');
    try {
      const { data } = await regenerateAllQrs(profileId);
      await load();
      flash(`Regenerated ${data.regenerated} QR code${data.regenerated === 1 ? '' : 's'}.`);
    } catch (e) {
      flash(e?.response?.data?.detail || 'Could not regenerate the QR codes.');
    } finally {
      setBusy(null);
    }
  };

  const shellCols = isMobile ? 'minmax(0,1fr)' : vw < 1200 ? '76px minmax(0,1fr)' : '250px minmax(0,1fr)';
  const pagePad = isPhone ? '20px 14px 44px' : isMobile ? '24px 20px 48px' : vw < 1200 ? '30px 26px 52px' : '40px 40px 56px';
  const qrCols = isPhone ? 'minmax(0,1fr)' : isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fit,minmax(220px,1fr))';
  const actionFlex = isMobile && !isPhone ? '1 1 100%' : '1';

  const enabledCount = (codes || []).filter((c) => c.enabled && !c.expired).length;
  const kpis = [
    { label: 'QR codes', value: String((codes || []).length) },
    { label: 'Active links', value: String(enabledCount) },
    { label: 'Disabled / expired', value: String((codes || []).length - enabledCount) },
  ];

  const st = STYLES[style];
  // A celebration has one celebrant, so template-literal joining printed
  // "Kiaan & undefined" on the QR plate — and this one goes to a printer.
  const coupleLine = profile
    ? ([profile.groom_name || (profile.celebrant_info || {}).celebrant_name, profile.bride_name]
        .map((n) => (n || '').trim()).filter(Boolean).join(' & ') || undefined)
    : undefined;

  return (
    <div className="qrp-page" style={{ fontFamily: "'Inter',system-ui,sans-serif", background: '#ffffff', color: '#111827', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols }}>
      <MobileNav panel="studio" active="Weddings" />
      <div style={{ display: isMobile ? 'none' : 'block' }}>
        <StudioNav active="Weddings" />
      </div>

      <main id="main-content" style={{ padding: pagePad, minWidth: 0, animation: 'mjRise .55s cubic-bezier(.22,.61,.36,1) both' }}>
        <WeddingToolbar weddingId={profileId} active="QR codes" title="QR codes" coupleLine={coupleLine}
          slug={profile?.slug} status={profile?.status === 'PUBLISHED' || profile?.is_published ? 'Published' : 'Draft'} />

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 16, padding: '14px 18px', fontSize: 13.5, marginBottom: 22 }}>
            {error}
          </div>
        )}

        <div className="qrp-wash" style={{ borderRadius: 20, padding: isPhone ? 14 : 18, marginBottom: 26 }}>
          <div data-mj-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(132px,1fr))', gap: 14 }}>
            {kpis.map((k) => (
              <div key={k.label} data-reveal="scale" className="qrp-glass" style={{ borderRadius: 20, padding: '18px 20px', minWidth: 0 }}>
                <p style={{ fontSize: 11.5, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 10px' }}>{k.label}</p>
                <p style={{ fontFamily: "'Spectral',serif", fontSize: 'clamp(24px,3vw,30px)', margin: 0, lineHeight: 1 }}>
                  {codes === null ? '—' : k.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div data-reveal style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 4, background: '#f5f3ff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 4 }}>
            {STYLES.map((s, i) => (
              <button
                key={s.label}
                className="qrp-style-btn"
                onClick={() => setStyle(i)}
                style={{ minHeight: 44, padding: '0 14px', border: 'none', borderRadius: 14, background: i === style ? '#ffffff' : 'transparent', color: i === style ? '#111827' : '#4b5563', fontSize: 13, fontWeight: i === style ? 600 : 400, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            className="qrp-btn-solid"
            onClick={doRegenerateAll}
            disabled={!codes || codes.length === 0 || busy !== null}
            style={{ minHeight: 46, padding: '0 20px', borderRadius: 14, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 'auto' }}
          >
            {busy === 'all' ? 'Regenerating…' : 'Regenerate all QR codes'}
          </button>
        </div>

        {/* One face-match QR per wedding. Printed on a sign at the venue, it is
            the guests' entire path to their own photos, so it sits above the
            per-ceremony invitation codes rather than among them. */}
        <div className="qrp-card" style={{ padding: isPhone ? 18 : 22, marginBottom: 22,
                                            display: 'grid', gap: 18,
                                            gridTemplateColumns: isPhone ? '1fr' : '176px minmax(0,1fr)',
                                            alignItems: 'center' }}>
          {faceQr && faceQr.qr_image ? (
            <img
              src={faceQr.qr_image}
              alt="QR code that opens this wedding's event photos — whole album and face match"
              style={{ width: '100%', maxWidth: 176, borderRadius: 16, background: st.plate, padding: 10 }}
            />
          ) : (
            <div style={{ width: '100%', maxWidth: 176, aspectRatio: '1', borderRadius: 16,
                          background: '#f5f3ff', display: 'grid', placeItems: 'center',
                          color: '#8b7bb8', fontSize: 12, textAlign: 'center', padding: 12 }}>
              {faceQr === null ? 'Loading…' : 'Gallery not enabled'}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 11.5, letterSpacing: '.07em', textTransform: 'uppercase',
                        color: '#6d28d9', fontWeight: 600, margin: '0 0 6px' }}>
              Event Photos
            </p>
            <p style={{ fontFamily: "'Spectral',serif", fontSize: 19, margin: '0 0 6px' }}>
              One QR for the whole wedding
            </p>
            <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 14px', lineHeight: 1.55 }}>
              {faceQr === false
                ? 'Enable the AI photo gallery for this wedding to get its event-photos QR.'
                : 'Guests scan once and go straight to AI face match — they take a selfie and see only their own photos. The same code works for every ceremony.'}
            </p>
            {faceQr && faceQr.qr_url && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="qrp-btn-solid"
                        onClick={() => downloadFaceQr()}
                        style={{ minHeight: 44, padding: '0 18px', borderRadius: 14, fontSize: 13,
                                 fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                  Download PNG
                </button>
                <button type="button" className="qrp-style-btn"
                        onClick={() => copyLink(`/invite/${profile?.slug}/find-my-photos`)}
                        style={{ minHeight: 44, padding: '0 18px', borderRadius: 14, fontSize: 13,
                                 fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #e5e7eb',
                                 background: '#ffffff', color: '#4b5563' }}>
                  Copy link
                </button>
              </div>
            )}
          </div>
        </div>

        {codes === null ? (
          <div style={{ display: 'grid', gridTemplateColumns: qrCols, gap: 16, marginBottom: 28 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="qrp-card" style={{ padding: 20, height: 260, opacity: .5 }} />
            ))}
          </div>
        ) : codes.length === 0 ? (
          <div className="qrp-card" style={{ padding: '40px 24px', textAlign: 'center', marginBottom: 28 }}>
            <p style={{ fontFamily: "'Spectral',serif", fontSize: 19, margin: '0 0 8px' }}>No event invitations yet.</p>
            <p style={{ fontSize: 13.5, color: '#6b7280', margin: 0 }}>Create an event invitation for this wedding to get a QR code here.</p>
          </div>
        ) : (
          <div data-mj-stagger style={{ display: 'grid', gridTemplateColumns: qrCols, gap: 16, marginBottom: 28 }}>
            {codes.map((c) => (
              <div key={c.id} data-reveal="scale" className="qrp-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ aspectRatio: '1', borderRadius: 16, background: st.plate, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
                  {c.qr_image ? (
                    <img src={c.qr_image} alt={`${eventLabel(c.event_type)} QR code`} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} loading="lazy" decoding="async" />
                  ) : (
                    <p style={{ fontSize: 12.5, color: '#6b7280', textAlign: 'center', margin: 0 }}>QR pending</p>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 3px' }}>{eventLabel(c.event_type)}</p>
                  <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 2px', wordBreak: 'break-all' }}>{c.invitation_link}</p>
                  <p style={{ fontSize: 12.5, color: c.expired ? '#dc2626' : '#6b7280', margin: 0 }}>
                    {c.expired ? 'Expired' : c.enabled ? 'Active' : 'Disabled'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
                  <button className="qrp-btn-ghost" disabled={!c.qr_image} onClick={() => downloadPng(c)} style={{ flex: actionFlex, minHeight: 44, padding: '0 14px', borderRadius: 14, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>PNG</button>
                  <button className="qrp-btn-ghost" onClick={() => copyLink(c.invitation_link)} style={{ flex: actionFlex, minHeight: 44, padding: '0 14px', borderRadius: 14, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Copy link</button>
                  <button className="qrp-btn-ghost" disabled={busy === c.id} onClick={() => doRegenerate(c.id)} style={{ flex: actionFlex, minHeight: 44, padding: '0 14px', borderRadius: 14, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                    {busy === c.id ? '…' : 'Regenerate'}
                  </button>
                  <a href={c.invitation_link} target="_blank" rel="noreferrer" className="qrp-btn-solid" style={{ flex: actionFlex, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 14px', borderRadius: 14, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Open</a>
                </div>
              </div>
            ))}
          </div>
        )}

        <ReferralShare profileId={profileId} isPhone={isPhone} onToast={flash} />

        <div data-reveal className="qrp-card" style={{ padding: '20px 24px' }}>
          <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 'clamp(18px,2.4vw,22px)', margin: '0 0 4px' }}>Scan <span style={{ color: '#6d28d9' }}>activity</span></h2>
          <p style={{ fontSize: 12.5, color: '#6b7280', margin: 0 }}>
            The backend counts scans per wedding, not per QR code, so a lifetime
            total is the honest number here. For a breakdown of when guests
            scanned, see <Link to={`/studio/wedding/${profileId}/analytics`} data-mj-link style={{ color: '#6d28d9' }}>Analytics</Link>.
          </p>
        </div>

        {toast && <div className="qrp-toast">{toast}</div>}
      </main>
    </div>
  );
}
