import { useCallback, useEffect, useState } from 'react';
import * as galleryApi from '@/api/gallery';

const cardStyle = { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', padding: '20px 22px' };
const labelStyle = { fontSize: 11.5, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 4px' };
const hintStyle = { fontSize: 12.5, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.5 };
const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 6px' };
const inputStyle = { width: '100%', minHeight: 42, padding: '0 12px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: 13.5, fontFamily: 'inherit', color: '#111827', background: '#fff' };
const btnPrimary = { background: '#6d28d9', color: '#fff', border: 'none', padding: '0 20px', minHeight: 42, borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { minHeight: 38, padding: '0 16px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#ffffff', color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };

const PASSWORD_RE = /^\d{4,6}$/;
const digitsOnly = (v) => v.replace(/\D/g, '').slice(0, 6);

function Toggle({ active, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', width: 40, height: 22, borderRadius: 999,
      background: active ? '#6d28d9' : '#d1d5db', border: 'none', position: 'relative', cursor: disabled ? 'wait' : 'pointer', flexShrink: 0,
    }}>
      <span style={{ position: 'absolute', top: 2, left: active ? 20 : 2, width: 18, height: 18, borderRadius: 999, background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}
function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', cursor: 'pointer' }}>
      <Toggle active={checked} onClick={() => onChange(!checked)} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{hint}</div>}
      </div>
    </label>
  );
}

const DEFAULT_FORM = {
  enabled: false, code: '', confirm_code: '', remember_days: 30,
  public_highlights_enabled: true, private_full_gallery_enabled: true,
  ai_face_match_enabled: true, allow_downloads: true, allow_share: true, expires_at: '',
};

export default function PrivacyPanel({ profileId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [analytics, setAnalytics] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [codeVisible, setCodeVisible] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: pv }, analyticsRes] = await Promise.all([
        galleryApi.adminGetPrivacy(profileId),
        galleryApi.adminPrivacyAnalytics(profileId).catch(() => ({ data: null })),
      ]);
      setHasPassword(!!pv.has_password);
      setForm({
        enabled: !!pv.enabled,
        code: '', confirm_code: '',
        remember_days: pv.remember_days ?? 30,
        public_highlights_enabled: pv.public_highlights_enabled !== false,
        private_full_gallery_enabled: pv.private_full_gallery_enabled !== false,
        ai_face_match_enabled: pv.ai_face_match_enabled !== false,
        allow_downloads: pv.allow_downloads !== false,
        allow_share: pv.allow_share !== false,
        expires_at: pv.expires_at || '',
      });
      setAnalytics(analyticsRes.data);
    } catch (e) {
      const status = e?.response?.status;
      setError(status === 403 || status === 404
        ? 'Privacy settings aren’t available for this gallery right now.'
        : (e?.response?.data?.detail || 'Could not load privacy settings.'));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const validate = () => {
    if (!form.enabled) return null;
    if (!hasPassword && !form.code) return 'Set an access code before turning the lock on, or guests will be locked out with no way in.';
    if (form.code && !PASSWORD_RE.test(form.code)) return 'Access code must be a 4–6 digit PIN.';
    if (form.code && form.code !== form.confirm_code) return 'Access code and confirmation must match.';
    return null;
  };

  const save = async () => {
    setSaveErr(''); setSaveMsg('');
    const v = validate();
    if (v) { setSaveErr(v); return; }
    setSaving(true);
    try {
      const payload = {
        enabled: !!form.enabled,
        remember_days: form.remember_days,
        public_highlights_enabled: form.public_highlights_enabled,
        private_full_gallery_enabled: form.private_full_gallery_enabled,
        ai_face_match_enabled: form.ai_face_match_enabled,
        allow_downloads: form.allow_downloads,
        allow_share: form.allow_share,
        expires_at: form.expires_at || null,
        ...(form.code ? { code: form.code, confirm_code: form.confirm_code } : {}),
      };
      const { data } = await galleryApi.adminUpdatePrivacy(profileId, payload);
      setHasPassword(!!data.has_password);
      // Clear the code fields from state now that the save succeeded --
      // never keep a submitted password sitting around in memory.
      setForm((f) => ({ ...f, code: '', confirm_code: '' }));
      setSaveMsg(payload.enabled
        ? 'Saved. Guests now need this code to view the gallery.'
        : 'Saved. The gallery is open — anyone with the link or QR can view it.');
    } catch (e) {
      setSaveErr(e?.response?.data?.detail || 'Could not save privacy settings.');
    } finally {
      setSaving(false);
    }
  };

  const doResetCode = async () => {
    if (!PASSWORD_RE.test(resetCode)) {
      setSaveErr('Reset code must be a 4–6 digit PIN.');
      return;
    }
    if (!window.confirm('Reset the access code? Every guest device currently trusted will be signed out and must enter the new code.')) return;
    setResetBusy(true);
    try {
      await galleryApi.adminResetPrivacyCode(profileId, resetCode);
      setResetCode('');
      setHasPassword(true);
      setSaveMsg('Access code reset. All trusted devices were signed out.');
    } catch (e) {
      setSaveErr(e?.response?.data?.detail || 'Could not reset the access code.');
    } finally {
      setResetBusy(false);
    }
  };

  const logoutAll = async () => {
    if (!window.confirm('Force-logout every guest device? Everyone currently viewing this gallery loses access immediately and must re-enter the access code.')) return;
    setLogoutBusy(true);
    try {
      await galleryApi.adminLogoutAllDevices(profileId);
      setSaveMsg('All guest devices were signed out.');
    } catch (e) {
      setSaveErr(e?.response?.data?.detail || 'Could not log out guest devices.');
    } finally {
      setLogoutBusy(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'grid', gap: 14 }}>{[0, 1].map((i) => <div key={i} className="stgal-skel" style={{ height: 140, borderRadius: 20 }} />)}</div>;
  }
  if (error) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 24px' }}>
        <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 14px' }}>{error}</p>
        <button type="button" onClick={load} style={btnPrimary}>Try again</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
          <div>
            <p style={labelStyle}>Access code</p>
            <p style={{ fontSize: 13.5, color: '#111827', margin: 0, fontWeight: 500 }}>Require a code before guests can view the gallery</p>
          </div>
          <span style={{
            fontSize: 11.5, fontWeight: 600, padding: '4px 12px', borderRadius: 999,
            background: form.enabled ? '#f5f3ff' : '#f9fafb', color: form.enabled ? '#6d28d9' : '#6b7280',
            border: `1px solid ${form.enabled ? '#c4b5fd' : '#e5e7eb'}`, whiteSpace: 'nowrap',
          }}>
            {form.enabled ? (hasPassword ? 'Password on' : 'Lock on · no password') : 'Open — no password'}
          </span>
        </div>

        <ToggleRow
          label="Password-protect this gallery"
          hint={hasPassword
            ? 'A code is already saved. Leave the fields below empty to keep it, or type a new one to change it. Turning this off clears the requirement — the code stays stored but nobody is asked for it.'
            : 'Guests must enter this code (after scanning the QR or opening the link) before they can view photos or use AI face match.'}
          checked={form.enabled}
          onChange={(v) => {
            if (!v && form.enabled && !window.confirm('Turn off password protection? The gallery becomes open — anyone with the link or QR can view it without a code.')) return;
            set('enabled', v);
          }}
        />

        {form.enabled && (
          <div style={{ display: 'grid', gap: 14, marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              <div>
                <label style={fieldLabel}>{hasPassword ? 'New access code (optional)' : 'Access code *'}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={codeVisible ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="\d{4,6}"
                    maxLength={6}
                    value={form.code}
                    onChange={(e) => set('code', digitsOnly(e.target.value))}
                    placeholder="e.g. 4821"
                    autoComplete="new-password"
                    style={{ ...inputStyle, paddingRight: 64 }}
                  />
                  <button type="button" onClick={() => setCodeVisible((v) => !v)}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#6d28d9', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '4px 6px' }}>
                    {codeVisible ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p style={hintStyle}>4–6 digit PIN.</p>
              </div>
              <div>
                <label style={fieldLabel}>Confirm access code</label>
                <input
                  type={codeVisible ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  value={form.confirm_code}
                  onChange={(e) => set('confirm_code', digitsOnly(e.target.value))}
                  placeholder="Re-type the PIN"
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              <div>
                <label style={fieldLabel}>Remember device for</label>
                <select value={form.remember_days} onChange={(e) => set('remember_days', parseInt(e.target.value, 10))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Gallery expiry date (optional)</label>
                <input
                  type="date"
                  value={form.expires_at ? form.expires_at.slice(0, 10) : ''}
                  onChange={(e) => set('expires_at', e.target.value ? new Date(`${e.target.value}T23:59:59Z`).toISOString() : '')}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
              <ToggleRow label="Public highlights" hint="A curated set viewable without the code." checked={form.public_highlights_enabled} onChange={(v) => set('public_highlights_enabled', v)} />
              <ToggleRow label="Private full gallery" hint="The full set, only after unlock." checked={form.private_full_gallery_enabled} onChange={(v) => set('private_full_gallery_enabled', v)} />
              <ToggleRow label="AI face match" hint="Guests can upload a selfie to find their photos." checked={form.ai_face_match_enabled} onChange={(v) => set('ai_face_match_enabled', v)} />
              <ToggleRow label="Allow downloads" hint="Guests can save matched photos." checked={form.allow_downloads} onChange={(v) => set('allow_downloads', v)} />
              <ToggleRow label="Allow sharing" hint="Show share buttons on matched photos." checked={form.allow_share} onChange={(v) => set('allow_share', v)} />
            </div>
          </div>
        )}

        {saveErr && <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '10px 14px', fontSize: 12.5 }}>{saveErr}</div>}
        {saveMsg && <div style={{ marginTop: 12, background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#6d28d9', borderRadius: 12, padding: '10px 14px', fontSize: 12.5 }}>{saveMsg}</div>}

        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={save} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save privacy settings'}
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <p style={labelStyle}>Quick reset</p>
        <p style={{ fontSize: 13.5, color: '#111827', margin: '0 0 4px', fontWeight: 500 }}>Reset the access code</p>
        <p style={hintStyle}>Sets a new code immediately and signs out every trusted device — use this if the current code got shared somewhere it shouldn&rsquo;t have.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{4,6}"
            maxLength={6}
            value={resetCode}
            onChange={(e) => setResetCode(digitsOnly(e.target.value))}
            placeholder="New PIN, e.g. 4821"
            style={{ ...inputStyle, maxWidth: 240 }}
          />
          <button type="button" onClick={doResetCode} disabled={resetBusy || !resetCode} style={btnGhost}>
            {resetBusy ? 'Resetting…' : 'Reset code'}
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <p style={labelStyle}>Trusted devices</p>
        <p style={{ fontSize: 13.5, color: '#111827', margin: '0 0 4px', fontWeight: 500 }}>Force-logout every guest device</p>
        <p style={hintStyle}>
          Individual devices aren&rsquo;t listed — the backend only tracks how many times the gallery has
          been unlocked (see analytics below). This revokes every trusted device at once; each guest
          will need to re-enter the access code next time they open the gallery.
        </p>
        <button type="button" onClick={logoutAll} disabled={logoutBusy} style={{ ...btnGhost, marginTop: 10, borderColor: '#fecaca', color: '#b91c1c' }}>
          {logoutBusy ? 'Signing out…' : 'Force logout all devices'}
        </button>
      </section>

      {analytics && (
        <section style={cardStyle}>
          <p style={labelStyle}>Unlock analytics</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 14, marginTop: 8 }}>
            {[
              ['QR scans', analytics.qr_scans],
              ['Unlocks', analytics.unlocks],
              ['Failed attempts', analytics.failed_attempts],
              ['AI selfie uploads', analytics.ai_uploads],
              ['Matched results', analytics.matched_results],
            ].map(([label, value]) => (
              <div key={label}>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontFamily: "'Spectral',serif", fontSize: 22, margin: 0 }}>{value ?? 0}</p>
              </div>
            ))}
          </div>
          {analytics.is_expired && (
            <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 12, marginBottom: 0 }}>This gallery is past its expiry date and is no longer reachable by guests.</p>
          )}
        </section>
      )}
    </div>
  );
}
