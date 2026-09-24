import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import PanelTabs from '@/components/PanelTabs';
import { ShieldCheck, KeyRound, Mail, Phone, Monitor, LogOut } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * StudioSecurity — photographer self-service account security (audit gap #1).
 * Password / email / phone change · active sessions (view + revoke) · 2FA (TOTP),
 * all over endpoints that already exist (account_security + auth_sessions + MFA).
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function StudioSecurity() {
  const [sum, setSum] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [mfa, setMfa] = useState(null);
  const [enroll, setEnroll] = useState(null);
  const [backup, setBackup] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [em, setEm] = useState({ new_email: '', password: '' });
  const [ph, setPh] = useState({ new_phone: '', password: '' });
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, ss, mf] = await Promise.all([
        axios.get(`${API_URL}/api/admin/account/summary`),
        axios.get(`${API_URL}/api/auth/sessions`).catch(() => ({ data: { sessions: [] } })),
        axios.get(`${API_URL}/api/admin/mfa/status`).catch(() => ({ data: null })),
      ]);
      setSum(s.data); setSessions(ss.data.sessions || []); setMfa(mf.data);
    } catch (_) {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, okMsg) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); setMsg(okMsg); load(); }
    catch (e) { setErr(e?.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };

  const changePw = () => run(async () => { await axios.post(`${API_URL}/api/admin/account/change-password`, pw); setPw({ current_password: '', new_password: '' }); }, 'Password updated. Other devices were signed out.');
  const changeEmail = () => run(async () => { await axios.post(`${API_URL}/api/admin/account/change-email`, em); setEm({ new_email: '', password: '' }); }, 'Email updated.');
  const changePhone = () => run(async () => { await axios.post(`${API_URL}/api/admin/account/change-phone`, ph); setPh({ new_phone: '', password: '' }); }, 'Phone updated.');
  const revoke = (device_id) => run(async () => { await axios.post(`${API_URL}/api/admin/account/revoke-device`, { device_id }); }, 'Device signed out.');
  const logoutAll = () => run(async () => { await axios.post(`${API_URL}/api/auth/logout-all`); }, 'Signed out everywhere.');

  const startMfa = () => run(async () => { setEnroll((await axios.post(`${API_URL}/api/admin/mfa/enroll/start`)).data); setBackup(null); }, '');
  const verifyMfa = () => run(async () => { setBackup((await axios.post(`${API_URL}/api/admin/mfa/enroll/verify`, { code })).data.backup_codes); setEnroll(null); setCode(''); }, 'Two-factor enabled.');
  const disableMfa = () => run(async () => { await axios.post(`${API_URL}/api/admin/mfa/disable`, { code }); setCode(''); }, 'Two-factor disabled.');

  const isGoogle = sum?.auth_provider === 'google';

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 820, margin: '0 auto' }}>
        <PanelTabs active="/studio/security" />
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Account security</h1>
        </div>
        {msg && <div className="lux-glass p-3 mb-4" style={{ color: '#7BD88F' }}>{msg}</div>}
        {err && <div className="lux-glass p-3 mb-4" style={{ color: '#ff9a9a' }}>{err}</div>}

        {/* Password */}
        <Card icon={KeyRound} title="Password">
          {isGoogle ? <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>You sign in with Google — manage your password in your Google account.</p> : (
            <div className="grid gap-2">
              <input className="lux-input" type="password" placeholder="Current password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
              <input className="lux-input" type="password" placeholder="New password (min 8)" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              <button onClick={changePw} disabled={busy} className="lux-btn w-fit">Update password</button>
            </div>
          )}
        </Card>

        {/* Email + phone */}
        <Card icon={Mail} title="Email">
          <div className="text-sm mb-2" style={{ color: 'var(--lux-text-muted)' }}>Current: {sum?.email || '—'}</div>
          {isGoogle ? <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>Managed by Google.</p> : (
            <div className="grid gap-2">
              <input className="lux-input" placeholder="New email" value={em.new_email} onChange={(e) => setEm({ ...em, new_email: e.target.value })} />
              <input className="lux-input" type="password" placeholder="Confirm password" value={em.password} onChange={(e) => setEm({ ...em, password: e.target.value })} />
              <button onClick={changeEmail} disabled={busy} className="lux-btn w-fit">Update email</button>
            </div>
          )}
        </Card>
        <Card icon={Phone} title="Phone">
          <div className="text-sm mb-2" style={{ color: 'var(--lux-text-muted)' }}>Current: {sum?.phone || '—'}</div>
          <div className="grid gap-2">
            <input className="lux-input" placeholder="New phone" value={ph.new_phone} onChange={(e) => setPh({ ...ph, new_phone: e.target.value })} />
            <input className="lux-input" type="password" placeholder="Confirm password" value={ph.password} onChange={(e) => setPh({ ...ph, password: e.target.value })} />
            <button onClick={changePhone} disabled={busy} className="lux-btn w-fit">Update phone</button>
          </div>
        </Card>

        {/* 2FA */}
        <Card icon={ShieldCheck} title="Two-factor authentication">
          {mfa && !mfa.enabled && !enroll && !backup && <button onClick={startMfa} disabled={busy} className="lux-btn">Enable two-factor</button>}
          {enroll && (
            <div className="grid md:grid-cols-2 gap-4 items-center">
              <div className="text-center">
                <div style={{ background: '#fff', padding: 12, borderRadius: 12, display: 'inline-block' }}><QRCodeCanvas value={enroll.otpauth_uri} size={160} /></div>
                <p className="text-[11px] mt-2" style={{ color: 'var(--lux-text-muted)' }}>Scan in Google Authenticator / Authy. Key: <code style={{ color: '#E8C97A' }}>{enroll.secret}</code></p>
              </div>
              <div><input className="lux-input mb-2" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} /><button onClick={verifyMfa} disabled={busy} className="lux-btn">Verify &amp; enable</button></div>
            </div>
          )}
          {backup && (
            <div><p className="text-sm mb-2" style={{ color: '#7BD88F' }}>✓ Enabled. Save these backup codes — shown once:</p>
              <div className="grid grid-cols-2 gap-1 font-mono text-sm" style={{ color: 'var(--lux-text)' }}>{backup.map((c) => <span key={c}>{c}</span>)}</div></div>
          )}
          {mfa && mfa.enabled && !backup && (
            <div><p className="text-sm mb-2" style={{ color: '#7BD88F' }}>✓ Enabled · {mfa.backup_codes_remaining} backup codes left</p>
              <div className="flex gap-2"><input className="lux-input" placeholder="code to disable" value={code} onChange={(e) => setCode(e.target.value)} /><button onClick={disableMfa} disabled={busy} className="lux-btn lux-btn-ghost">Disable</button></div></div>
          )}
        </Card>

        {/* Sessions */}
        <Card icon={Monitor} title="Active devices">
          {sessions.length === 0 ? <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No device sessions recorded.</p> : (
            <div className="grid gap-2">
              {sessions.filter((s) => !s.revoked).map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-sm py-2 border-b" style={{ borderColor: 'var(--lux-border)' }}>
                  <Monitor className="w-4 h-4 shrink-0" style={{ color: 'var(--lux-text-muted)' }} />
                  <div className="flex-1 min-w-0"><div className="truncate" style={{ color: 'var(--lux-text)' }}>{s.ua || 'Unknown device'}</div>
                    <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>{s.ip || '—'} · active {s.last_active ? new Date(s.last_active).toLocaleString() : '—'}</div></div>
                  <button onClick={() => revoke(s.device_id)} disabled={busy} className="lux-btn lux-btn-ghost !px-3 !py-1.5 !text-xs">Sign out</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={logoutAll} disabled={busy} className="lux-btn lux-btn-ghost mt-3 !text-xs"><LogOut className="w-3.5 h-3.5" /> Sign out of all devices</button>
        </Card>
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, children }) {
  return (
    <div className="lux-glass p-5 mb-4">
      <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--lux-text-muted)' }}>
        <Icon className="w-4 h-4" /> {title}
      </h2>
      {children}
    </div>
  );
}
