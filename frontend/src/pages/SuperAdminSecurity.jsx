import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import { ShieldCheck, KeyRound, UserCog, Eye } from 'lucide-react';
import '@/styles/luxury.css';

/** SuperAdminSecurity — Admin MFA (TOTP) + RBAC roles + audited impersonation (Phase 1/13). */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function SuperAdminSecurity() {
  const [status, setStatus] = useState(null);
  const [enroll, setEnroll] = useState(null);        // {secret, otpauth_uri}
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(null);        // shown once
  const [msg, setMsg] = useState('');
  const [cat, setCat] = useState(null);
  const [assign, setAssign] = useState({ admin_id: '', role: 'support_agent' });
  const [imp, setImp] = useState({ target_admin_id: '', reason: '' });
  const [impResult, setImpResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => { try { setStatus((await axios.get(`${API_URL}/api/admin/mfa/status`)).data); } catch (_) {} }, []);
  const loadCat = useCallback(async () => { try { setCat((await axios.get(`${API_URL}/api/admin/rbac/catalogue`)).data); } catch (_) {} }, []);
  useEffect(() => { loadStatus(); loadCat(); }, [loadStatus, loadCat]);

  const startEnroll = async () => { setMsg(''); setBackup(null); try { setEnroll((await axios.post(`${API_URL}/api/admin/mfa/enroll/start`)).data); } catch (e) { setMsg(e?.response?.data?.detail || 'Failed'); } };
  const verifyEnroll = async () => {
    setBusy(true); setMsg('');
    try { const { data } = await axios.post(`${API_URL}/api/admin/mfa/enroll/verify`, { code }); setBackup(data.backup_codes); setEnroll(null); setCode(''); loadStatus(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Incorrect code'); }
    setBusy(false);
  };
  const disableMfa = async () => {
    setBusy(true); setMsg('');
    try { await axios.post(`${API_URL}/api/admin/mfa/disable`, { code }); setCode(''); loadStatus(); setMsg('MFA disabled.'); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Incorrect code'); }
    setBusy(false);
  };
  const doAssign = async () => {
    setBusy(true); setMsg('');
    try { const { data } = await axios.post(`${API_URL}/api/admin/rbac/assign`, assign); setMsg(`${data.admin_id} → ${data.role}`); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };
  const doImpersonate = async () => {
    setBusy(true); setMsg(''); setImpResult(null);
    try { const { data } = await axios.post(`${API_URL}/api/admin/impersonate`, imp); setImpResult(data); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };
  const useImpersonation = () => {
    if (!impResult?.access_token) return;
    if (!window.confirm('Start the impersonated session? You will be signed out of super-admin and must log in again afterwards.')) return;
    try { localStorage.setItem('admin_token', impResult.access_token); } catch (_) {}
    window.location.href = '/studio/dashboard';
  };

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Admin security</h1>
        </div>
        {msg && <div className="lux-glass p-3 mb-4" style={{ color: '#E8C97A' }}>{msg}</div>}

        {/* MFA */}
        <div className="lux-glass p-5 mb-4">
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}><KeyRound className="inline w-4 h-4" /> Two-factor (TOTP)</h2>
          {status && !status.enabled && !enroll && !backup && (
            <button onClick={startEnroll} className="lux-btn">Enable two-factor</button>
          )}
          {enroll && (
            <div className="grid md:grid-cols-2 gap-4 items-center">
              <div className="text-center">
                <div style={{ background: '#fff', padding: 12, borderRadius: 12, display: 'inline-block' }}>
                  <QRCodeCanvas value={enroll.otpauth_uri} size={168} />
                </div>
                <p className="text-[11px] mt-2" style={{ color: 'var(--lux-text-muted)' }}>Scan in Google Authenticator / Authy, or enter the key:</p>
                <code className="text-xs" style={{ color: '#E8C97A' }}>{enroll.secret}</code>
              </div>
              <div>
                <input className="lux-input mb-2" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
                <button onClick={verifyEnroll} disabled={busy} className="lux-btn">Verify &amp; enable</button>
              </div>
            </div>
          )}
          {backup && (
            <div>
              <p className="text-sm mb-2" style={{ color: '#7BD88F' }}>✓ MFA enabled. Save these backup codes — they are shown only once:</p>
              <div className="grid grid-cols-2 gap-1 font-mono text-sm" style={{ color: 'var(--lux-text)' }}>
                {backup.map((c) => <span key={c}>{c}</span>)}
              </div>
            </div>
          )}
          {status && status.enabled && !backup && (
            <div>
              <p className="text-sm mb-2" style={{ color: '#7BD88F' }}>✓ Enabled · {status.backup_codes_remaining} backup codes left</p>
              <div className="flex gap-2">
                <input className="lux-input" placeholder="code to disable" value={code} onChange={(e) => setCode(e.target.value)} />
                <button onClick={disableMfa} disabled={busy} className="lux-btn lux-btn-ghost">Disable</button>
              </div>
            </div>
          )}
        </div>

        {/* RBAC */}
        <div className="lux-glass p-5 mb-4">
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}><UserCog className="inline w-4 h-4" /> Roles &amp; permissions</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            <input className="lux-input flex-1 min-w-[160px]" placeholder="admin id" value={assign.admin_id} onChange={(e) => setAssign({ ...assign, admin_id: e.target.value })} />
            <select className="lux-input" style={{ width: 'auto' }} value={assign.role} onChange={(e) => setAssign({ ...assign, role: e.target.value })}>
              {cat && Object.keys(cat.roles).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={doAssign} disabled={busy || !assign.admin_id} className="lux-btn">Assign</button>
          </div>
          {cat && (
            <div className="text-xs grid gap-1">
              {Object.entries(cat.roles).map(([r, perms]) => (
                <div key={r} className="py-1 border-t" style={{ borderColor: 'var(--lux-border)' }}>
                  <span className="font-heading" style={{ color: 'var(--lux-text)' }}>{r}</span>
                  <span style={{ color: 'var(--lux-text-muted)' }}> — {perms.length ? perms.join(', ') : 'no platform permissions'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Impersonation */}
        <div className="lux-glass p-5">
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}><Eye className="inline w-4 h-4" /> Impersonate (audited)</h2>
          <input className="lux-input mb-2" placeholder="target admin id" value={imp.target_admin_id} onChange={(e) => setImp({ ...imp, target_admin_id: e.target.value })} />
          <input className="lux-input mb-2" placeholder="reason (required, logged)" value={imp.reason} onChange={(e) => setImp({ ...imp, reason: e.target.value })} />
          <button onClick={doImpersonate} disabled={busy || !imp.target_admin_id} className="lux-btn">Create session</button>
          {impResult && (
            <div className="mt-3 lux-glass p-3">
              <p className="text-sm" style={{ color: 'var(--lux-text)' }}>Session for <b>{impResult.impersonating?.name}</b> · expires in {Math.round(impResult.expires_in / 60)} min · logged.</p>
              <button onClick={useImpersonation} className="lux-btn lux-btn-ghost mt-2 !text-xs">Start impersonated session</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
