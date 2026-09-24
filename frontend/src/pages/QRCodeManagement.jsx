import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Sparkles } from 'lucide-react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import GalleryPrivacyEditor, { validatePrivacy } from '@/components/luxury/GalleryPrivacyEditor';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/**
 * PHASE 28: QR Code Management Page
 *
 * Admin page for generating and downloading QR codes for:
 * - Full wedding invitation
 * - Individual events
 *
 * Usage: Print cards, venue banners, digital displays
 */
const QRCodeManagement = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  // BUG 15 FIX: guard the page so logged-out visitors are bounced to /admin/login
  // instead of seeing a blank/silently-401'd screen.
  const { admin, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The password a guest types after scanning the QR to reach the photos. The
  // whole capability already existed (bcrypt code, trusted devices, lockout) but
  // was buried inside a step of the long profile form, so nobody could find it.
  // It belongs HERE, next to the QR the guest actually scans.
  const [privacy, setPrivacy] = useState(null);
  const [pvSaving, setPvSaving] = useState(false);
  const [pvMsg, setPvMsg] = useState('');
  const [pvErr, setPvErr] = useState('');

  useEffect(() => {
    if (!authLoading && !admin) {
      navigate('/studio/login', { replace: true });
    }
  }, [authLoading, admin, navigate]);

  useEffect(() => {
    if (!authLoading && admin) fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, authLoading, admin]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      // BUG 13 FIX: AuthContext stores the photographer JWT under `admin_token`.
      // Using a different key sent null in the Authorization header and the API
      // silently 401'd — page rendered blank instead of redirecting to login.
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(
        `${API_URL}/api/admin/profiles/${profileId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setProfile(response.data);
      // Best-effort: a missing privacy record just means "not protected yet".
      try {
        const pv = await axios.get(
          `${API_URL}/api/admin/profiles/${profileId}/gallery/privacy`,
          { headers: { Authorization: `Bearer ${token}` } });
        setPrivacy({ ...(pv.data || {}), code: '', confirm_code: '' });
      } catch (_e) {
        setPrivacy({ enabled: false, code: '', confirm_code: '' });
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError('Failed to load profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const savePrivacy = async () => {
    setPvErr(''); setPvMsg('');
    const pv = privacy || {};
    if (pv.enabled) {
      const v = validatePrivacy(pv);
      if (v) { setPvErr(v); return; }
      // A fresh lock with no code would save `enabled: true` and no password —
      // the gallery would demand a code nobody can satisfy, locking the couple
      // out of their own photos.
      if (!pv.has_password && !pv.code) {
        setPvErr('Set a password before turning the lock on, or guests will be locked out with no way in.');
        return;
      }
    }
    setPvSaving(true);
    try {
      const payload = {
        enabled: !!pv.enabled,
        remember_days: pv.remember_days ?? 30,
        public_highlights_enabled: pv.public_highlights_enabled !== false,
        private_full_gallery_enabled: pv.private_full_gallery_enabled !== false,
        ai_face_match_enabled: pv.ai_face_match_enabled !== false,
        allow_downloads: pv.allow_downloads !== false,
        allow_share: pv.allow_share !== false,
        ...(pv.code ? { code: pv.code, confirm_code: pv.confirm_code } : {}),
      };
      const r = await axios.put(
        `${API_URL}/api/admin/profiles/${profileId}/gallery/privacy`, payload,
        { headers: authHeaders() });
      setPrivacy({ ...(r.data || {}), code: '', confirm_code: '' });
      setPvMsg(payload.enabled
        ? 'Saved. Guests who scan the QR will be asked for this password.'
        : 'Saved. The gallery is open — anyone with the QR can see the photos.');
    } catch (e) {
      setPvErr(e?.response?.data?.detail || 'Could not save the gallery password.');
    }
    setPvSaving(false);
  };

  if (loading) {
    return (
      <div className="px-aurora min-h-screen flex items-center justify-center">
        <span className="px-spinner" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="px-aurora min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <div className="px-glass p-8 text-center">
            <p className="mb-4" style={{ color: 'var(--px-error)' }}>{error || 'Profile not found'}</p>
            <Button onClick={() => navigate('/studio/dashboard')} className="px-btn">
              Back to Studio
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Get enabled events
  const enabledEvents = profile.events?.filter(e => e.event_enabled) || [];

  return (
    <div className="px-aurora min-h-screen relative" data-testid="qr-management">
      <div className="relative z-10 max-w-5xl mx-auto p-6 md:p-12">
        {/* Header */}
        <div className="mb-10">
          <Button
            variant="ghost"
            onClick={() => navigate('/studio/dashboard')}
            className="px-btn px-btn-ghost text-xs mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Studio
          </Button>

          <span className="px-eyebrow block mb-4">Scan · Share · Celebrate</span>
          <h1 className="px-section-title" style={{ fontSize: 'clamp(30px,5vw,48px)' }}>
            QR <span style={{ color: 'var(--px-primary)' }}>codes</span> for every guest
          </h1>
          <p className="mt-4 text-base" style={{ color: 'var(--px-muted)' }}>
            {profile.bride_name} &amp; {profile.groom_name}
          </p>
        </div>

        {/* ── Password guests type after scanning the QR ─────────────────── */}
        <div className="px-card p-6 mb-8" data-testid="qr-gallery-password">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
            <span className="px-eyebrow">Photo password · what guests enter after scanning</span>
            <span className="px-chip" data-testid="qr-password-state"
              style={!privacy?.enabled ? { background: 'var(--px-section)', color: 'var(--px-muted)', border: '1px solid var(--px-border)' } : undefined}>
              {privacy?.enabled
                ? (privacy?.has_password ? 'Password on' : 'Lock on · no password set')
                : 'Open — no password'}
            </span>
          </div>
          <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--px-muted)' }}>
            A guest scans the QR to collect their photos. Turn this on and they must enter this
            password first, so the photos stay private even if the QR or link is forwarded.
            Guests can tick "Remember this device" and enter it only once.
          </p>

          {/* GalleryPrivacyEditor is a shared dark-on-cream component also used inside
              the (still-dark) profile form — inset panel keeps it legible here rather
              than reskinning a component other, out-of-scope pages still rely on. */}
          <div className="rounded-2xl p-4 md:p-5" style={{ background: '#1A130B' }}>
            {privacy ? (
              <GalleryPrivacyEditor value={privacy} onChange={setPrivacy} compact />
            ) : (
              <div className="text-xs" style={{ color: 'rgba(255,248,220,0.78)' }}>Loading…</div>
            )}
          </div>

          {pvErr && (
            <div className="mt-3 px-3 py-2 rounded-lg text-xs" data-testid="qr-password-error"
              style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}>
              {pvErr}
            </div>
          )}
          {pvMsg && (
            <div className="mt-3 px-3 py-2 rounded-lg text-xs" data-testid="qr-password-saved"
              style={{ background: 'var(--px-violet-100)', border: '1px solid var(--px-border-tint)', color: 'var(--px-primary)' }}>
              {pvMsg}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={savePrivacy} disabled={pvSaving || !privacy}
              className="px-btn text-xs" data-testid="qr-password-save">
              {pvSaving ? 'Saving…' : 'Save password settings'}
            </button>
            <button onClick={() => navigate(`/studio/profile/${profileId}/live-gallery`)}
              className="px-btn px-btn-secondary text-xs" data-testid="qr-upload-photos">
              Upload photos into this QR gallery
            </button>
          </div>
        </div>

        {/* Profile Info */}
        <div className="px-card p-6 mb-8">
          <h2 className="px-section-title" style={{ fontSize: 20, marginBottom: 14 }}>
            About QR Codes
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm" style={{ color: 'var(--px-muted)' }}>
            <div>
              <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>Where to use</h3>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Print on physical wedding cards</li>
                <li>Display on venue entrance banners</li>
                <li>Add to save-the-date cards</li>
                <li>Place on table cards at reception</li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>Benefits</h3>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Instant access to digital invitation</li>
                <li>Guests can RSVP immediately</li>
                <li>Easy to share with others</li>
                <li>Works on any smartphone camera</li>
              </ul>
            </div>
          </div>
        </div>

        {/* QR Code Display Component */}
        <QRCodeDisplay
          profileId={profileId}
          slugUrl={profile.slug}
          events={enabledEvents}
        />

        {/* Additional Instructions */}
        <div className="px-card p-6 mt-8">
          <h3 className="px-section-title flex items-center gap-2" style={{ fontSize: 18, marginBottom: 16 }}>
            <Sparkles className="w-4 h-4" style={{ color: 'var(--px-primary)' }} /> Pro Tips
          </h3>
          <div className="space-y-3 text-sm" style={{ color: 'var(--px-muted)' }}>
            {[
              ['Test Before Printing', 'Download and scan the QR code with your phone to ensure it works correctly before mass printing.'],
              ['Size Matters', 'For print materials, ensure the QR code is at least 2cm x 2cm (0.8" x 0.8") for easy scanning.'],
              ['High Contrast', 'Maintain good contrast between QR code and background for reliable scanning in all lighting conditions.'],
              ['Event-Specific QR Codes', 'Generate separate QR codes for each event (Engagement, Haldi, etc.) to direct guests to specific ceremony details.'],
            ].map(([title, body], i) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 text-sm font-bold"
                  style={{ background: 'var(--px-violet-100)', color: 'var(--px-primary)' }}>
                  {i + 1}
                </div>
                <div>
                  <p className="font-semibold mb-1" style={{ color: 'var(--px-ink)' }}>{title}</p>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {profile.slug && (
          <div className="mt-6 flex items-center gap-2 text-xs" style={{ color: 'var(--px-faint)' }}>
            <MapPin className="w-3.5 h-3.5" /> maja.in/{profile.slug}
          </div>
        )}
      </div>
    </div>
  );
};

export default QRCodeManagement;
