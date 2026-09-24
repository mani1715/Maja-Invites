import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Camera, X, Upload, Check, AlertCircle, Sparkles, Shield, Mail, Phone, Download } from 'lucide-react';
import { useGalleryAccess, authHeader } from '../../hooks/useGalleryAccess';
import GalleryLockScreen from './GalleryLockScreen';
import { PxSpinner } from '../px';
import { resolveMediaUrl } from '../../utils/mediaUrl';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90000;

/**
 * FindMyPhotosModal — guest-facing "Find my photos" flow.
 *
 * Primary path: selfie -> POST /face-search -> (consent if required) ->
 * poll /face-results -> matched grid with per-photo + bulk download.
 * Manual path (unchanged): selfie + email + WhatsApp -> /photo-request,
 * kept reachable as a fallback when the AI search fails or finds nothing.
 */
const FindMyPhotosModal = ({ slug, open, onClose }) => {
  // select | consent | searching | results | no-match | failed
  // | manual | submitting | done | error
  const [step, setStep] = useState('select');
  const [selfieFile, setSelfieFile] = useState(null);
  const [selfie, setSelfie] = useState(null); // preview URL
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const pollTimer = useRef(null);
  const pollDeadline = useRef(0);
  const access = useGalleryAccess(slug);

  useEffect(() => {
    if (!open) {
      clearTimeout(pollTimer.current);
      setStep('select'); setSelfieFile(null); setSelfie(null);
      setEmail(''); setWhatsapp(''); setName(''); setErr('');
      setConsentChecked(false); setSessionId(null); setMatches([]);
    }
  }, [open]);

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  const pickSelfie = (file, { autoSearch = false } = {}) => {
    if (!file) return;
    setErr('');
    setSelfieFile(file);
    setSelfie(URL.createObjectURL(file));
    if (autoSearch) runFaceSearch(file);
  };

  // ---- real face search ---------------------------------------------------
  const runFaceSearch = async (file) => {
    setStep('searching');
    setErr('');
    try {
      const fd = new FormData();
      fd.append('selfie', file);
      const r = await axios.post(`${API_URL}/api/public/gallery/${slug}/face-search`, fd,
        { headers: { 'Content-Type': 'multipart/form-data', ...authHeader(access.deviceToken) } });
      handleSearchResponse(r.data);
    } catch (e) {
      if (e.response?.status === 428) {
        setStep('consent');
      } else if (e.response?.status === 401) {
        access.logout();
        setErr('Your access has expired. Please re-enter the code.');
        setStep('failed');
      } else {
        const detail = e.response?.data?.detail;
        setErr((typeof detail === 'string' ? detail : detail?.message) || 'Face search failed. Please try again.');
        setStep('failed');
      }
    }
  };

  const handleSearchResponse = (data) => {
    if (data.status === 'done') {
      setSessionId(data.session_id);
      setMatches(data.photos || []);
      setStep((data.match_count || 0) > 0 ? 'results' : 'no-match');
    } else {
      setSessionId(data.session_id);
      pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
      schedulePoll(data.session_id);
    }
  };

  const schedulePoll = (sid) => {
    pollTimer.current = setTimeout(() => pollOnce(sid), POLL_INTERVAL_MS);
  };

  const pollOnce = async (sid) => {
    try {
      const r = await axios.get(`${API_URL}/api/public/gallery/${slug}/face-results`, {
        params: { session_id: sid }, headers: authHeader(access.deviceToken),
      });
      const d = r.data;
      if (d.status === 'done') {
        setMatches(d.photos || []);
        setStep((d.match_count || 0) > 0 ? 'results' : 'no-match');
        return;
      }
      if (d.status === 'failed') {
        setErr(d.error || 'Face search failed. Please try again.');
        setStep('failed');
        return;
      }
    } catch (e) {
      setErr('Lost connection while searching. Please try again.');
      setStep('failed');
      return;
    }
    if (Date.now() >= pollDeadline.current) {
      setErr('This is taking longer than expected. Please try again in a moment.');
      setStep('failed');
      return;
    }
    schedulePoll(sid);
  };

  const submitConsent = async () => {
    if (!consentChecked || !selfieFile) return;
    setConsentBusy(true);
    setErr('');
    try {
      await axios.post(`${API_URL}/api/public/gallery/${slug}/face-consent`, { agreed: true });
      runFaceSearch(selfieFile);
    } catch (e) {
      setErr('Could not record consent. Please try again.');
      setStep('failed');
    } finally {
      setConsentBusy(false);
    }
  };

  const downloadAll = async () => {
    if (!sessionId || downloadBusy) return;
    setDownloadBusy(true);
    try {
      const r = await axios.get(`${API_URL}/api/public/gallery/${slug}/download-zip`, {
        params: { session_id: sessionId }, headers: authHeader(access.deviceToken),
      });
      const files = r.data.files || [];
      files.forEach((f, i) => {
        setTimeout(() => {
          const a = document.createElement('a');
          a.href = resolveMediaUrl(f.url); a.download = f.name; a.rel = 'noopener';
          document.body.appendChild(a); a.click(); a.remove();
        }, i * 350);
      });
    } catch (e) {
      setErr('Could not start the download. Please try again.');
    } finally {
      setDownloadBusy(false);
    }
  };

  // ---- manual fallback (unchanged endpoint) -------------------------------
  const emailOk = /\S+@\S+\.\S+/.test(email);
  const waOk = whatsapp.replace(/\D/g, '').length >= 8;
  const canSubmitManual = !!selfieFile && emailOk && waOk && step !== 'submitting';

  const submitManual = async () => {
    if (!canSubmitManual) return;
    setStep('submitting'); setErr('');
    try {
      const fd = new FormData();
      fd.append('selfie', selfieFile);
      fd.append('email', email.trim());
      fd.append('whatsapp', whatsapp.trim());
      fd.append('name', name.trim());
      await axios.post(`${API_URL}/api/public/gallery/${slug}/photo-request`, fd,
        { headers: { 'Content-Type': 'multipart/form-data', ...authHeader(access.deviceToken) } });
      setStep('done');
    } catch (e) {
      if (e.response?.status === 401) {
        access.logout();
        setErr('Your access has expired. Please re-enter the code.');
      } else {
        setErr(e.response?.data?.detail || 'Could not send your request. Please try again.');
      }
      setStep('error');
    }
  };

  if (!open) return null;

  const featureOff = access.isProtected && access.isUnlocked && access.privacy && !access.privacy.ai_face_match_enabled;
  const canUse = (!access.isProtected || access.isUnlocked) && (!access.privacy || access.privacy.ai_face_match_enabled !== false);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="px-modal-overlay"
        data-testid="find-photos-modal"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <motion.div initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="px-modal relative"
          style={{ maxWidth: 520 }}
          onClick={(e) => e.stopPropagation()}>

          <button onClick={onClose} aria-label="Close"
            className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full grid place-items-center"
            style={{ color: 'var(--px-muted)' }} data-testid="close-find-photos">
            <X className="w-5 h-5" />
          </button>

          <div>
            {access.isProtected && !access.isUnlocked && (
              <div className="py-2">
                <GalleryLockScreen
                  testid="find-photos-lock"
                  title="Private Gallery"
                  subtitle="Enter the access code from the couple to request your photos."
                  onUnlock={(code, remember) => access.unlock(code, remember)}
                  fetchFailed={access.privacyFetchFailed}
                  onRetry={access.refresh}
                />
              </div>
            )}

            {featureOff && (
              <div className="py-10 text-center" data-testid="ai-disabled-message">
                <Shield className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--px-primary)' }} />
                <h3 className="px-section-title mb-2" style={{ fontSize: '1.4rem' }}>Photo requests are turned off</h3>
                <p className="px-section-sub">The couple has turned off photo requests for this gallery.</p>
              </div>
            )}

            {canUse && step === 'select' && (
              <div className="space-y-6 py-2">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3" style={{ background: 'var(--px-violet-100)' }}>
                    <Sparkles className="w-7 h-7" style={{ color: 'var(--px-primary)' }} />
                  </div>
                  <h2 className="px-section-title mb-2" style={{ fontSize: '1.7rem' }}>
                    Find <span style={{ color: 'var(--px-primary)', fontStyle: 'italic' }}>your photos</span>
                  </h2>
                  <p className="px-section-sub max-w-sm mx-auto">
                    Take or upload a clear selfie — we&rsquo;ll search the gallery and show you every photo you&rsquo;re in.
                  </p>
                </div>

                {!selfie ? (
                  <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                    <button onClick={() => cameraRef.current?.click()} data-testid="find-take-selfie"
                      className="px-btn gap-2" style={{ minHeight: 96, padding: '18px', flexDirection: 'column' }}>
                      <Camera className="w-7 h-7" />
                      <span className="text-xs tracking-[0.15em] uppercase font-medium">Take Selfie</span>
                    </button>
                    <button onClick={() => fileRef.current?.click()} data-testid="find-choose-photo"
                      className="px-btn px-btn-secondary gap-2" style={{ minHeight: 96, padding: '18px', flexDirection: 'column' }}>
                      <Upload className="w-7 h-7" />
                      <span className="text-xs tracking-[0.15em] uppercase">Choose Photo</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <img src={selfie} alt="Your selfie" className="w-24 h-24 rounded-full object-cover" style={{ border: '3px solid var(--px-primary)' }} />
                    <button onClick={() => { setSelfie(null); setSelfieFile(null); }} className="text-xs underline" style={{ color: 'var(--px-primary)' }} data-testid="change-selfie">Change selfie</button>
                  </div>
                )}

                <p className="text-[11px] text-center max-w-sm mx-auto inline-flex items-center gap-1.5 w-full justify-center" style={{ color: 'var(--px-muted)' }}>
                  <Shield className="w-3 h-3" style={{ color: 'var(--px-primary)' }} /> Your selfie is used only for this search.
                </p>

                {err && (
                  <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-md max-w-sm mx-auto" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{err}</span>
                  </div>
                )}

                <div className="text-center">
                  <button onClick={() => setStep('manual')} className="text-xs underline" style={{ color: 'var(--px-muted)' }} data-testid="go-manual-request">
                    Prefer to request your photos by email instead?
                  </button>
                </div>
              </div>
            )}

            {canUse && step === 'consent' && (
              <div className="space-y-5 py-2" data-testid="face-consent-step">
                <div className="text-center">
                  <Shield className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--px-primary)' }} />
                  <h2 className="px-section-title mb-2" style={{ fontSize: '1.5rem' }}>One-time consent needed</h2>
                </div>
                <div className="px-card p-4" style={{ background: 'var(--px-section)' }}>
                  <p className="text-sm" style={{ color: 'var(--px-ink)', lineHeight: 1.6 }}>
                    Your photo is scanned to find face matches in this gallery. The selfie is kept for at most
                    24 hours, is never shared or used to train any model, and you can withdraw consent at any time.
                  </p>
                </div>
                <label className="flex items-start gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--px-ink)' }}>
                  <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)}
                    className="w-4 h-4 mt-0.5 flex-none" style={{ accentColor: 'var(--px-primary)' }}
                    data-testid="face-consent-checkbox" />
                  I agree to a one-time face match on my selfie for this gallery.
                </label>
                {err && (
                  <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-md" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{err}</span>
                  </div>
                )}
                <button onClick={submitConsent} disabled={!consentChecked || consentBusy} className="px-btn w-full justify-center" data-testid="face-consent-submit">
                  {consentBusy ? <PxSpinner style={{ borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} /> : 'Agree & search'}
                </button>
              </div>
            )}

            {canUse && step === 'searching' && (
              <div className="text-center py-14 space-y-4" data-testid="face-searching">
                <PxSpinner style={{ width: 40, height: 40, borderWidth: 3 }} />
                <h3 className="px-section-title" style={{ fontSize: '1.4rem' }}>Looking through the gallery&hellip;</h3>
                <p className="px-section-sub">Usually takes about ten seconds.</p>
              </div>
            )}

            {canUse && step === 'results' && (
              <div className="py-2" data-testid="face-results">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <span className="px-eyebrow block mb-1">Your photographs</span>
                    <h2 className="px-section-title" style={{ fontSize: '1.4rem' }}>Found {matches.length} of you</h2>
                  </div>
                  <button onClick={() => { setStep('select'); setSelfie(null); setSelfieFile(null); }} className="px-btn px-btn-secondary text-xs" style={{ padding: '0 14px' }} data-testid="face-change-selfie">
                    Change selfie
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-5">
                  {matches.map((m) => (
                    <div key={m.id} className="relative rounded-[var(--px-r-media)] overflow-hidden px-card" data-testid={`face-match-${m.id}`}>
                      <img src={resolveMediaUrl(m.thumb_url)} alt="Matched photo" className="w-full aspect-square object-cover block" />
                      <span className="px-chip absolute top-1.5 left-1.5" style={{ fontSize: '10px', padding: '2px 8px' }}>{Math.round(m.similarity)}%</span>
                      <a href={resolveMediaUrl(m.original_url)} download
                        className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full grid place-items-center"
                        style={{ background: 'rgba(255,255,255,.92)', color: 'var(--px-primary)' }}
                        aria-label="Download this photo" data-testid={`face-download-${m.id}`}>
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
                <button onClick={downloadAll} disabled={downloadBusy} className="px-btn w-full justify-center mb-2" data-testid="face-download-all">
                  {downloadBusy ? <PxSpinner style={{ borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} /> : `Download all ${matches.length}`}
                </button>
                <button onClick={onClose} className="px-btn px-btn-ghost w-full justify-center">Close</button>
              </div>
            )}

            {canUse && step === 'no-match' && (
              <div className="text-center py-10 space-y-4" data-testid="face-no-match">
                <AlertCircle className="w-9 h-9 mx-auto" style={{ color: 'var(--px-muted)' }} />
                <h3 className="px-section-title" style={{ fontSize: '1.4rem' }}>No confident match found</h3>
                <p className="px-section-sub max-w-sm mx-auto">
                  We couldn&rsquo;t find you with confidence in the photos published so far. You can try another selfie,
                  or ask the couple&rsquo;s team to send your photos directly.
                </p>
                <div className="flex flex-col gap-2 max-w-xs mx-auto">
                  <button onClick={() => { setStep('select'); setSelfie(null); setSelfieFile(null); }} className="px-btn justify-center" data-testid="face-try-again">Try another selfie</button>
                  <button onClick={() => setStep('manual')} className="px-btn px-btn-secondary justify-center" data-testid="face-fallback-manual">Request by email instead</button>
                </div>
              </div>
            )}

            {canUse && step === 'failed' && (
              <div className="text-center py-10 space-y-4" data-testid="face-search-failed">
                <AlertCircle className="w-9 h-9 mx-auto" style={{ color: 'var(--px-error)' }} />
                <h3 className="px-section-title" style={{ fontSize: '1.4rem' }}>Something went wrong</h3>
                <p className="px-section-sub max-w-sm mx-auto">{err || 'Please try again.'}</p>
                <div className="flex flex-col gap-2 max-w-xs mx-auto">
                  <button onClick={() => { setStep('select'); }} className="px-btn justify-center inline-flex items-center gap-2" data-testid="face-retry">
                    <Camera className="w-4 h-4" /> Try again
                  </button>
                  <button onClick={() => setStep('manual')} className="px-btn px-btn-secondary justify-center" data-testid="face-fallback-manual">Request by email instead</button>
                </div>
              </div>
            )}

            {canUse && step === 'manual' && (
              <div className="space-y-6 py-2" data-testid="manual-request-step">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3" style={{ background: 'var(--px-violet-100)' }}>
                    <Sparkles className="w-7 h-7" style={{ color: 'var(--px-primary)' }} />
                  </div>
                  <h2 className="px-section-title mb-2" style={{ fontSize: '1.6rem' }}>
                    Get <span style={{ color: 'var(--px-primary)', fontStyle: 'italic' }}>your photos</span>
                  </h2>
                  <p className="px-section-sub max-w-sm mx-auto">
                    Upload a clear selfie and share your contact — we&rsquo;ll send you every photo you&rsquo;re in.
                  </p>
                </div>

                {!selfie ? (
                  <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                    <button onClick={() => cameraRef.current?.click()} data-testid="find-take-selfie"
                      className="px-btn gap-2" style={{ minHeight: 96, padding: '18px', flexDirection: 'column' }}>
                      <Camera className="w-7 h-7" />
                      <span className="text-xs tracking-[0.15em] uppercase font-medium">Take Selfie</span>
                    </button>
                    <button onClick={() => fileRef.current?.click()} data-testid="find-choose-photo"
                      className="px-btn px-btn-secondary gap-2" style={{ minHeight: 96, padding: '18px', flexDirection: 'column' }}>
                      <Upload className="w-7 h-7" />
                      <span className="text-xs tracking-[0.15em] uppercase">Choose Photo</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <img src={selfie} alt="Your selfie" className="w-24 h-24 rounded-full object-cover" style={{ border: '3px solid var(--px-primary)' }} />
                    <button onClick={() => { setSelfie(null); setSelfieFile(null); }} className="text-xs underline" style={{ color: 'var(--px-primary)' }} data-testid="change-selfie">Change selfie</button>
                  </div>
                )}

                <div className="space-y-3 max-w-sm mx-auto">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)"
                    className="px-input" data-testid="pr-name" />
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--px-primary)' }} />
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email"
                      className="px-input" style={{ paddingLeft: 36 }} data-testid="pr-email" />
                  </div>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--px-primary)' }} />
                    <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} type="tel" placeholder="WhatsApp number"
                      className="px-input" style={{ paddingLeft: 36 }} data-testid="pr-whatsapp" />
                  </div>
                </div>

                <div className="max-w-sm mx-auto">
                  <button onClick={submitManual} disabled={!canSubmitManual} data-testid="pr-submit" className="px-btn w-full justify-center">
                    Send request
                  </button>
                  <p className="text-[11px] text-center mt-3 inline-flex items-center gap-1.5 w-full justify-center" style={{ color: 'var(--px-muted)' }}>
                    <Shield className="w-3 h-3" style={{ color: 'var(--px-primary)' }} /> Your selfie and contact are shared only with the studio to send your photos.
                  </p>
                </div>
              </div>
            )}

            {canUse && step === 'submitting' && (
              <div className="text-center py-12 space-y-4">
                <PxSpinner style={{ width: 32, height: 32, borderWidth: 3 }} />
                <h3 className="px-section-title" style={{ fontSize: '1.4rem' }}>Sending your request&hellip;</h3>
              </div>
            )}

            {canUse && step === 'done' && (
              <div className="text-center py-12 space-y-4" data-testid="pr-done">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full" style={{ background: '#D1FAE5' }}>
                  <Check className="w-8 h-8" style={{ color: 'var(--px-success)' }} />
                </div>
                <h3 className="px-section-title" style={{ fontSize: '1.6rem' }}>Request received!</h3>
                <p className="px-section-sub max-w-sm mx-auto">
                  We&rsquo;ll send your photos to your email and WhatsApp soon. You can close this window.
                </p>
                <button onClick={onClose} className="px-btn" data-testid="pr-close-done">Done</button>
              </div>
            )}

            {canUse && step === 'error' && (
              <div className="text-center py-12 space-y-4">
                <AlertCircle className="w-10 h-10 mx-auto" style={{ color: 'var(--px-error)' }} />
                <h3 className="px-section-title" style={{ fontSize: '1.4rem' }}>Something went wrong</h3>
                <p className="px-section-sub max-w-sm mx-auto">{err}</p>
                <button onClick={() => setStep('manual')} className="px-btn inline-flex items-center gap-2" data-testid="pr-retry">
                  <Camera className="w-4 h-4" /> Try again
                </button>
              </div>
            )}

            <input ref={cameraRef} type="file" accept="image/*" capture="user"
              style={{ display: 'none' }} onChange={(e) => pickSelfie(e.target.files?.[0], { autoSearch: step === 'select' })}
              data-testid="selfie-camera-input" />
            <input ref={fileRef} type="file" accept="image/*"
              style={{ display: 'none' }} onChange={(e) => pickSelfie(e.target.files?.[0], { autoSearch: step === 'select' })}
              data-testid="selfie-gallery-input" />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FindMyPhotosModal;
