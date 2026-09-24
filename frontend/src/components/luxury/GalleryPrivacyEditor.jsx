import React, { useState, useEffect } from 'react';
import { Lock, Shield, ToggleLeft, Eye, EyeOff, Sparkles } from 'lucide-react';

/**
 * GalleryPrivacyEditor — UI for the per-invitation Photo Privacy Settings.
 *
 * Reusable inside:
 *   • LuxuryProfileForm (admin/photographer) — Stay & Video step
 *   • UserInvitationForm (normal user) — at the bottom of the form
 *
 * Props:
 *   value: PrivacySettings | null
 *   onChange: (next: PrivacySettings) => void
 *   compact?: boolean
 *
 * Where PrivacySettings shape is:
 *   {
 *     enabled, code, confirm_code, remember_days,
 *     public_highlights_enabled, private_full_gallery_enabled,
 *     ai_face_match_enabled, allow_downloads, allow_share, expires_at,
 *     has_password (read-only, from server when editing)
 *   }
 */
const DEFAULT_PRIVACY = {
  enabled: false,
  code: '',
  confirm_code: '',
  remember_days: 30,
  public_highlights_enabled: true,
  private_full_gallery_enabled: true,
  ai_face_match_enabled: true,
  allow_downloads: true,
  allow_share: true,
  expires_at: '',
  has_password: false,
};

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9!@#$%^&*_\-+=?.]{4,20}$/;

export const validatePrivacy = (privacy) => {
  if (!privacy?.enabled) return null;
  // When already saved with a password, code can be left blank
  if (!privacy.has_password) {
    if (!privacy.code) return 'Please set an access code.';
    if (!PASSWORD_RE.test(privacy.code)) return 'Code must be 4–20 chars with at least 1 letter and 1 digit.';
    if (privacy.code !== privacy.confirm_code) return 'Access code and confirmation must match.';
  } else if (privacy.code) {
    // Changing the code requires confirmation too
    if (!PASSWORD_RE.test(privacy.code)) return 'New code must be 4–20 chars with at least 1 letter and 1 digit.';
    if (privacy.code !== privacy.confirm_code) return 'New access code and confirmation must match.';
  }
  return null;
};

const GalleryPrivacyEditor = ({ value, onChange, compact = false }) => {
  const v = { ...DEFAULT_PRIVACY, ...(value || {}) };
  const [show, setShow] = useState(false);
  const set = (k, val) => onChange({ ...v, [k]: val });
  const err = validatePrivacy(v);

  return (
    <div className="space-y-4" data-testid="gallery-privacy-editor">
      {/* Master toggle */}
      <ToggleRow
        label="Enable Photo Privacy Protection"
        hint={v.has_password
          ? 'A code is already saved. Leave the field empty to keep it; type a new one to change it.'
          : 'Adds an access-code gate before guests can view photos or use AI face match.'}
        checked={v.enabled}
        onChange={(c) => set('enabled', c)}
        testid="privacy-enabled-toggle"
      />

      {v.enabled && (
        <div className="space-y-4 pl-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={v.has_password ? 'New Access Code (optional)' : 'Wedding Access Code *'}>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={v.code}
                  onChange={(e) => set('code', e.target.value)}
                  placeholder="e.g. MANI2026"
                  className="w-full"
                  data-testid="privacy-code-input"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/5"
                  data-testid="privacy-code-toggle"
                >
                  {show ? <EyeOff className="w-3.5 h-3.5" style={{ color: 'rgba(255,248,220,0.78)' }} /> :
                           <Eye className="w-3.5 h-3.5" style={{ color: 'rgba(255,248,220,0.78)' }} />}
                </button>
              </div>
              <Hint>4–20 chars · at least 1 letter & 1 digit.</Hint>
            </Field>
            <Field label="Confirm Access Code">
              <input
                type={show ? 'text' : 'password'}
                value={v.confirm_code}
                onChange={(e) => set('confirm_code', e.target.value)}
                placeholder="Re-type the code"
                className="w-full"
                data-testid="privacy-confirm-input"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Remember device duration">
            <select
              value={v.remember_days}
              onChange={(e) => set('remember_days', parseInt(e.target.value, 10))}
              className="w-full"
              data-testid="privacy-remember-days"
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}
            >
              <option value={7}  style={{ background: '#1A130B' }}>7 days</option>
              <option value={30} style={{ background: '#1A130B' }}>30 days</option>
              <option value={90} style={{ background: '#1A130B' }}>90 days</option>
            </select>
            <Hint>How long guests stay logged in after unlocking on a device.</Hint>
          </Field>

          {!compact && (
            <Field label="Gallery expiry date (optional)">
              <input
                type="date"
                value={v.expires_at ? v.expires_at.slice(0, 10) : ''}
                onChange={(e) => set('expires_at', e.target.value ? new Date(e.target.value + 'T23:59:59Z').toISOString() : null)}
                className="w-full"
                data-testid="privacy-expires"
                style={inputStyle}
              />
              <Hint>Gallery becomes inaccessible to guests after this date.</Hint>
            </Field>
          )}

          {/* Feature flags */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ToggleRow
              compact
              label="Public Highlights"
              hint="Show a curated set of photos without requiring the access code."
              checked={v.public_highlights_enabled}
              onChange={(c) => set('public_highlights_enabled', c)}
              testid="privacy-highlights-toggle"
            />
            <ToggleRow
              compact
              label="Private Full Gallery"
              hint="The full gallery, only viewable after unlock."
              checked={v.private_full_gallery_enabled}
              onChange={(c) => set('private_full_gallery_enabled', c)}
              testid="privacy-private-gallery-toggle"
            />
            <ToggleRow
              compact
              label="AI Face Match"
              hint="Allow guests to upload a selfie to find their photos."
              checked={v.ai_face_match_enabled}
              onChange={(c) => set('ai_face_match_enabled', c)}
              testid="privacy-ai-toggle"
            />
            <ToggleRow
              compact
              label="Allow Photo Downloads"
              hint="Guests can download matched photos."
              checked={v.allow_downloads}
              onChange={(c) => set('allow_downloads', c)}
              testid="privacy-downloads-toggle"
            />
            <ToggleRow
              compact
              label="Allow Share Matched Photos"
              hint="Show share buttons on matched photos."
              checked={v.allow_share}
              onChange={(c) => set('allow_share', c)}
              testid="privacy-share-toggle"
            />
          </div>

          {err && (
            <div
              className="text-xs px-3 py-2 rounded-md"
              style={{
                background: 'rgba(255,176,160,0.08)',
                border: '1px solid rgba(255,176,160,0.25)',
                color: '#FFB0A0',
              }}
              data-testid="privacy-validation-error"
            >
              {err}
            </div>
          )}

          {v.has_password && !v.code && (
            <div
              className="text-[11px] italic flex items-center gap-2"
              style={{ color: 'rgba(255,248,220,0.78)' }}
            >
              <Shield className="w-3 h-3 text-gold" />
              A code is already configured. The QR & invite link won't reveal it.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── helpers ── */
const ToggleRow = ({ label, hint, checked, onChange, testid, compact = false }) => (
  <label
    className={`flex items-start gap-3 cursor-pointer ${compact ? 'p-3' : 'p-4'} rounded-lg`}
    style={{ background: 'rgba(255,248,220,0.03)', border: '1px solid var(--lux-border)' }}
    data-testid={testid + '-row'}
  >
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-amber-400 mt-1 w-4 h-4 shrink-0"
      data-testid={testid}
    />
    <div className="flex-1 min-w-0">
      <div className="text-sm" style={{ color: '#FFF8DC' }}>{label}</div>
      {hint && <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,248,220,0.78)' }}>{hint}</div>}
    </div>
  </label>
);

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.25em] uppercase mb-1.5" style={{ color: 'rgba(255,248,220,0.78)' }}>{label}</span>
    {children}
  </label>
);
const Hint = ({ children }) => (
  <span className="block text-[10px] mt-1 italic" style={{ color: 'rgba(255,248,220,0.62)' }}>{children}</span>
);
const inputStyle = {
  padding: '0.7rem 0.95rem',
  background: 'rgba(255,248,220,0.04)',
  color: '#FFF8DC',
  border: '1px solid var(--lux-border)',
  borderRadius: '0.5rem',
  outline: 'none',
  caretColor: '#D4AF37',
  fontSize: '0.88rem',
};

export default GalleryPrivacyEditor;
