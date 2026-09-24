import { useState, useRef, useEffect, useCallback } from 'react';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import * as facematch from '@/api/facematch';
import { grantDownload } from '@/api/gallery';

// Ported from the "Find my photos" modal in "MAJA Live Photo Wall.dc.html".
// Self-contained selfie face-search flow: consent → selfie → poll → results,
// with explicit no-match / failed states and a manual "photo request" fallback.
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90000;

export default function FindMyPhotos({ slug, deviceHeader, onClose }) {
  const [step, setStep] = useState('intro'); // intro | matching | results | no-match | failed
  const [consent, setConsent] = useState(false);
  const [mobile, setMobile] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [downloadedIds, setDownloadedIds] = useState(() => new Set());
  const [remaining, setRemaining] = useState(null);
  const [dlBusyId, setDlBusyId] = useState(null);
  const [dlError, setDlError] = useState('');

  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackName, setFallbackName] = useState('');
  const [fallbackEmail, setFallbackEmail] = useState('');
  const [fallbackWhatsapp, setFallbackWhatsapp] = useState('');
  const [fallbackFile, setFallbackFile] = useState(null);
  const [fallbackStatus, setFallbackStatus] = useState('form'); // form | sending | sent | error
  const [fallbackError, setFallbackError] = useState('');

  const takeInputRef = useRef(null);
  const chooseInputRef = useRef(null);
  const fallbackInputRef = useRef(null);
  const pollTimer = useRef(null);
  const pollDeadline = useRef(0);
  const lastSelfie = useRef(null);

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  const stopPolling = () => { clearTimeout(pollTimer.current); pollTimer.current = null; };

  const pollResults = useCallback((sid) => {
    stopPolling();
    const tick = async () => {
      try {
        const r = await facematch.faceResults(slug, sid, deviceHeader);
        const { status, photos: found = [] } = r.data;
        if (status === 'done') {
          setPhotos(found);
          setStep(found.length ? 'results' : 'no-match');
          return;
        }
        if (status === 'failed') {
          setErrorMsg(r.data.error || 'The search ran into a problem.');
          setStep('failed');
          return;
        }
        if (Date.now() > pollDeadline.current) {
          setErrorMsg("This is taking longer than expected. Please try again in a moment.");
          setStep('failed');
          return;
        }
        pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (e) {
        setErrorMsg(e.response?.data?.detail || 'Could not check your results. Please try again.');
        setStep('failed');
      }
    };
    tick();
  }, [slug, deviceHeader]);

  const runSearch = useCallback(async (file) => {
    setStep('matching');
    setErrorMsg('');
    lastSelfie.current = file;
    try {
      const r = await facematch.faceSearch(slug, file, deviceHeader);
      if (r.data.status === 'done') {
        setSessionId(r.data.session_id);
        setPhotos(r.data.photos || []);
        setStep((r.data.photos || []).length ? 'results' : 'no-match');
      } else {
        setSessionId(r.data.session_id);
        pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
        pollResults(r.data.session_id);
      }
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 428 && detail?.code === 'CONSENT_REQUIRED') {
        try {
          await facematch.faceConsent(slug, true);
          const r2 = await facematch.faceSearch(slug, file, deviceHeader);
          if (r2.data.status === 'done') {
            setSessionId(r2.data.session_id);
            setPhotos(r2.data.photos || []);
            setStep((r2.data.photos || []).length ? 'results' : 'no-match');
          } else {
            setSessionId(r2.data.session_id);
            pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
            pollResults(r2.data.session_id);
          }
        } catch (e2) {
          setErrorMsg(e2.response?.data?.detail || 'Could not record consent. Please try again.');
          setStep('failed');
        }
        return;
      }
      setErrorMsg(typeof detail === 'string' ? detail : 'Could not search for your photos. Please try again.');
      setStep('failed');
    }
  }, [slug, deviceHeader, pollResults]);

  const onSelfiePicked = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!consent) return;
    runSearch(file);
  };

  const changeSelfie = () => { stopPolling(); setStep('intro'); setPhotos([]); setSessionId(null); };

  // Per-photo download, counted against the guest's cap server-side (keyed by
  // mobile). No "download all" — each save is one granted, capped download.
  const downloadOne = useCallback(async (m) => {
    if (dlBusyId) return;
    setDlError('');
    setDlBusyId(m.id);
    try {
      const r = await grantDownload(slug, {
        photo_id: m.id, scope: 'face', mobile: mobile.trim(), session_id: sessionId,
      }, deviceHeader);
      setRemaining(r.data.remaining);
      setDownloadedIds((prev) => new Set(prev).add(m.id));
      const a = document.createElement('a');
      a.href = resolveMediaUrl(r.data.url);
      a.download = `photo_${m.id}.jpg`;
      a.rel = 'noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      const d = e.response?.data?.detail;
      setDlError((d && (d.message || (typeof d === 'string' ? d : ''))) || 'Could not download. Please try again.');
    } finally {
      setDlBusyId(null);
    }
  }, [slug, mobile, sessionId, deviceHeader, dlBusyId]);

  const submitFallback = async () => {
    if (!fallbackEmail.trim() || !fallbackWhatsapp.trim()) {
      setFallbackError('Email and WhatsApp number are both needed.');
      return;
    }
    const selfie = fallbackFile || lastSelfie.current;
    if (!selfie) {
      setFallbackError('Please attach a selfie so the studio can identify you.');
      return;
    }
    setFallbackStatus('sending');
    setFallbackError('');
    try {
      await facematch.photoRequest(slug, {
        selfie, email: fallbackEmail.trim(), whatsapp: fallbackWhatsapp.trim(), name: fallbackName.trim(),
      }, deviceHeader);
      setFallbackStatus('sent');
    } catch (e) {
      setFallbackStatus('error');
      setFallbackError(e.response?.data?.detail || 'Could not send your request. Please try again.');
    }
  };

  const mobileValid = mobile.replace(/\D/g, '').length >= 8;
  const selfieDisabled = !consent || !mobileValid;

  return (
    <>
      <input ref={takeInputRef} type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={onSelfiePicked} />
      <input ref={chooseInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onSelfiePicked} />

      {step === 'intro' && (
        <>
          <p style={{ fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 12px', fontWeight: 600 }}>Find my photos</p>
          <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 22, margin: '0 0 8px' }}>Take one selfie. We&rsquo;ll find the rest.</h2>
          <p style={{ fontSize: 13.5, color: '#c9c0e4', lineHeight: 1.7, margin: '0 0 20px' }}>We compare your selfie against the photographs on this wall and show you the ones you are in.</p>
          <div style={{ border: '1px solid rgba(196,181,253,.22)', borderRadius: 12, padding: 18, background: '#190f33', marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#c9c0e4', lineHeight: 1.7, margin: 0 }}>
              <strong style={{ color: '#f2eefb' }}>Before you do:</strong> your selfie is used for this one search and deleted within 24 hours. It is never shared, never used to train anything, and never linked to your name. You can withdraw consent at any time.
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 11, minHeight: 44, fontSize: 13.5, color: '#c9c0e4', marginBottom: 20, cursor: 'pointer', lineHeight: 1.55 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#a78bfa', flex: 'none', marginTop: 2 }} />
            I agree to a one-time face match on my selfie.
          </label>
          <label className="lpw-field-label">Mobile number (needed to download your photos)</label>
          <input className="lpw-text-input" type="tel" inputMode="numeric" value={mobile}
            onChange={(e) => setMobile(e.target.value)} placeholder="e.g. +91 98765 43210" />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={selfieDisabled} onClick={() => takeInputRef.current?.click()}
              className="lpw-solid-btn" style={{ flex: 1, minWidth: 140, minHeight: 48 }}>Take a selfie</button>
            <button type="button" disabled={selfieDisabled} onClick={() => chooseInputRef.current?.click()}
              className="lpw-ghost-btn" style={{ flex: 1, minWidth: 140, minHeight: 48 }}>Choose a photo</button>
          </div>
          <p style={{ fontSize: 13, color: '#a396c4', margin: '14px 0 0', textAlign: 'center' }}>
            {!consent ? 'Tick the consent box to continue.' : !mobileValid ? 'Enter your mobile number to continue.' : 'Deleted within 24 hours, whatever the result.'}
          </p>
          <button type="button" className="lpw-text-btn" onClick={onClose}>Close</button>
        </>
      )}

      {step === 'matching' && (
        <div style={{ textAlign: 'center', padding: '26px 0' }}>
          <div className="lpw-spinner" />
          <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 21, margin: '0 0 10px' }}>Looking through the wall&hellip;</h2>
          <p style={{ fontSize: 13.5, color: '#c9c0e4', lineHeight: 1.7, margin: 0 }}>Usually about ten seconds.</p>
        </div>
      )}

      {step === 'results' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 6px', fontWeight: 600 }}>Your photographs</p>
              <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 21, margin: 0 }}>Found {photos.length} of you.</h2>
            </div>
            <button type="button" className="lpw-ghost-btn" style={{ minHeight: 44, padding: '0 16px', flex: 'none' }} onClick={changeSelfie}>Change selfie</button>
          </div>
          <p style={{ fontSize: 12.5, color: '#a396c4', margin: '0 0 12px', lineHeight: 1.6 }}>
            Tap a photo to save it. {remaining != null ? `${remaining} download${remaining === 1 ? '' : 's'} left.` : 'You can download up to 10.'}
          </p>
          {dlError && <p style={{ fontSize: 13, color: '#fca5a5', margin: '0 0 10px' }}>{dlError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
            {photos.map((m) => {
              const saved = downloadedIds.has(m.id);
              const busy = dlBusyId === m.id;
              return (
                <button key={m.id} type="button" data-mj-tile onClick={() => downloadOne(m)} disabled={busy}
                  style={{ aspectRatio: '1', borderRadius: 16, overflow: 'hidden', display: 'block', position: 'relative', background: '#241a3d', border: 'none', padding: 0, cursor: busy ? 'wait' : 'pointer' }}>
                  <img src={resolveMediaUrl(m.thumb_url)} alt="Match" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
                  <span style={{ position: 'absolute', right: 4, top: 4, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 999, background: 'rgba(25,15,51,.75)', color: '#c4b5fd' }}>{Math.round((m.similarity || 0))}%</span>
                  <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'rgba(25,15,51,.82)', color: saved ? '#86efac' : '#e9e2fb' }}>
                    {busy ? '…' : saved ? '✓ Saved' : '⬇ Save'}
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" className="lpw-text-btn" onClick={onClose}>Close</button>
        </>
      )}

      {step === 'no-match' && (
        <div>
          <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 21, margin: '0 0 10px', textAlign: 'center' }}>No confident matches yet.</h2>
          <p style={{ fontSize: 13.5, color: '#c9c0e4', lineHeight: 1.7, margin: '0 0 20px', textAlign: 'center' }}>
            We couldn&rsquo;t find you with enough confidence on this wall right now — more photos may still be coming in. Try again later, or ask the studio directly.
          </p>
          <FallbackForm
            open={fallbackOpen} setOpen={setFallbackOpen}
            fallbackName={fallbackName} setFallbackName={setFallbackName}
            fallbackEmail={fallbackEmail} setFallbackEmail={setFallbackEmail}
            fallbackWhatsapp={fallbackWhatsapp} setFallbackWhatsapp={setFallbackWhatsapp}
            fallbackFile={fallbackFile} setFallbackFile={setFallbackFile}
            fallbackInputRef={fallbackInputRef}
            status={fallbackStatus} error={fallbackError} onSubmit={submitFallback}
            hasSelfieOnFile={!!lastSelfie.current}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="button" className="lpw-ghost-btn" style={{ flex: 1, minHeight: 44 }} onClick={changeSelfie}>Try another selfie</button>
            <button type="button" className="lpw-text-btn" style={{ flex: 1 }} onClick={onClose}>Close</button>
          </div>
        </div>
      )}

      {step === 'failed' && (
        <div>
          <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 21, margin: '0 0 10px', textAlign: 'center' }}>That didn&rsquo;t work.</h2>
          <p style={{ fontSize: 13.5, color: '#c9c0e4', lineHeight: 1.7, margin: '0 0 20px', textAlign: 'center' }}>{errorMsg}</p>
          <FallbackForm
            open={fallbackOpen} setOpen={setFallbackOpen}
            fallbackName={fallbackName} setFallbackName={setFallbackName}
            fallbackEmail={fallbackEmail} setFallbackEmail={setFallbackEmail}
            fallbackWhatsapp={fallbackWhatsapp} setFallbackWhatsapp={setFallbackWhatsapp}
            fallbackFile={fallbackFile} setFallbackFile={setFallbackFile}
            fallbackInputRef={fallbackInputRef}
            status={fallbackStatus} error={fallbackError} onSubmit={submitFallback}
            hasSelfieOnFile={!!lastSelfie.current}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="button" className="lpw-ghost-btn" style={{ flex: 1, minHeight: 44 }} onClick={changeSelfie}>Try again</button>
            <button type="button" className="lpw-text-btn" style={{ flex: 1 }} onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

function FallbackForm({ open, setOpen, fallbackName, setFallbackName, fallbackEmail, setFallbackEmail,
  fallbackWhatsapp, setFallbackWhatsapp, fallbackFile, setFallbackFile, fallbackInputRef,
  status, error, onSubmit, hasSelfieOnFile }) {
  if (status === 'sent') {
    return <p style={{ fontSize: 13.5, color: '#c9c0e4', textAlign: 'center', lineHeight: 1.7 }}>Thanks! The studio will send your photos to your email and WhatsApp shortly.</p>;
  }
  if (!open) {
    return (
      <button type="button" className="lpw-ghost-btn" style={{ width: '100%', minHeight: 46 }} onClick={() => setOpen(true)}>
        Ask the studio to send my photos instead
      </button>
    );
  }
  return (
    <div style={{ border: '1px solid rgba(196,181,253,.22)', borderRadius: 12, padding: 16, background: '#190f33' }}>
      <input ref={fallbackInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setFallbackFile(e.target.files?.[0] || null)} />
      <label className="lpw-field-label">Your name</label>
      <input className="lpw-text-input" value={fallbackName} onChange={(e) => setFallbackName(e.target.value)} disabled={status === 'sending'} />
      <label className="lpw-field-label">Email</label>
      <input className="lpw-text-input" type="email" value={fallbackEmail} onChange={(e) => setFallbackEmail(e.target.value)} disabled={status === 'sending'} />
      <label className="lpw-field-label">WhatsApp number</label>
      <input className="lpw-text-input" value={fallbackWhatsapp} onChange={(e) => setFallbackWhatsapp(e.target.value)} disabled={status === 'sending'} />
      {!hasSelfieOnFile && (
        <button type="button" className={`lpw-picker-btn${fallbackFile ? ' has-files' : ''}`} onClick={() => fallbackInputRef.current?.click()} disabled={status === 'sending'} style={{ minHeight: 60 }}>
          <span>{fallbackFile ? `Selfie attached: ${fallbackFile.name}` : 'Attach a selfie'}</span>
        </button>
      )}
      {error && <p style={{ fontSize: 13, color: '#fca5a5', margin: '0 0 12px' }}>{error}</p>}
      <button type="button" className="lpw-solid-btn" style={{ width: '100%', minHeight: 46 }} disabled={status === 'sending'} onClick={onSubmit}>
        {status === 'sending' ? 'Sending…' : 'Send request'}
      </button>
    </div>
  );
}
