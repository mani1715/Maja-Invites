import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import PanelTabs from '@/components/PanelTabs';
import { Users, UserPlus, Crown, Trash2, Copy, Check, Loader2, ArrowRight } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * StudioStaff — invite staff to your studio with scoped roles, and (as owner)
 * transfer primary ownership to a team member. Reads /api/studio/staff/*.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const ROLE_DESC = {
  manager: 'Can manage bookings, finance, portfolio and staff',
  editor: 'Can edit the portfolio only',
  viewer: 'Read-only access',
};

export default function StudioStaff() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', name: '', role: 'viewer' });
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(null);   // last created {email, invite_token, id}
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [confirmXfer, setConfirmXfer] = useState(null); // staff row pending transfer

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await axios.get(`${API_URL}/api/studio/staff`)).data); }
    catch (e) { setData(null); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const isOwner = data?.my_role === 'owner';

  const submitInvite = async (e) => {
    e.preventDefault(); setErr('');
    if (!form.email.trim()) { setErr('Email is required.'); return; }
    setBusy(true);
    try {
      const r = await axios.post(`${API_URL}/api/studio/staff/invite`, form);
      setInvite(r.data.staff); setForm({ email: '', name: '', role: 'viewer' });
      load();
    } catch (e2) { setErr(e2?.response?.data?.detail || 'Could not send invite.'); }
    setBusy(false);
  };

  const changeRole = async (s, role) => {
    try { await axios.patch(`${API_URL}/api/studio/staff/${s.id}`, { role }); load(); } catch (_) {}
  };
  const revoke = async (s) => {
    if (!window.confirm(`Remove ${s.name || s.email} from your team?`)) return;
    try { await axios.delete(`${API_URL}/api/studio/staff/${s.id}`); load(); } catch (_) {}
  };
  const doTransfer = async (s) => {
    setConfirmXfer(null);
    try { await axios.post(`${API_URL}/api/studio/staff/transfer-ownership`, { new_owner_admin_id: s.member_admin_id }); load(); }
    catch (e) { setErr(e?.response?.data?.detail || 'Transfer failed.'); }
  };

  const inviteLink = invite ? `${window.location.origin}/studio/staff/accept?token=${invite.invite_token}` : '';
  const copy = () => { navigator.clipboard?.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 860, margin: '0 auto' }}>
        <PanelTabs active="/studio/staff" />
        <div className="flex items-center gap-3 mb-2">
          <Users style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Team</h1>
          {data?.my_role && data.my_role !== 'owner' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full capitalize" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--lux-text-muted)' }}>You: {data.my_role}</span>
          )}
        </div>
        <p className="text-xs mb-6" style={{ color: 'var(--lux-text-muted)' }}>
          Invite people to help run your studio, each with a scoped role. They sign in with their own MAJA account and accept your invite.
        </p>

        {loading ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div>
          : !data ? <div className="lux-glass p-6 text-sm" style={{ color: 'var(--lux-text-muted)' }}>You don’t have permission to manage staff.</div>
          : (
            <>
              {/* Invite */}
              <form onSubmit={submitInvite} className="lux-glass p-4 mb-5">
                <div className="text-[10px] uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--lux-text-muted)' }}><UserPlus className="w-3.5 h-3.5" /> Invite a team member</div>
                <div className="grid md:grid-cols-[1.4fr_1fr_auto] gap-2">
                  <input className="lux-input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="staff-email" />
                  <input className="lux-input" placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <select className="lux-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="manager">Manager</option>
                  </select>
                </div>
                <div className="text-[11px] mt-1.5" style={{ color: 'var(--lux-text-faint)' }}>{ROLE_DESC[form.role]}</div>
                {err && <div className="text-xs mt-2" style={{ color: '#ff9a9a' }}>{err}</div>}
                <button type="submit" disabled={busy} className="lux-btn mt-3 !px-4 !py-2 text-sm flex items-center gap-2 disabled:opacity-60">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Send invite
                </button>
              </form>

              {/* Invite link to share */}
              {invite && invite.invite_token && (
                <div className="lux-glass p-3 mb-5">
                  <div className="text-xs mb-2" style={{ color: 'var(--lux-text)' }}>Invite created for <b>{invite.email}</b>. Share this link — they accept it while signed in:</div>
                  <div className="flex items-center gap-2">
                    <input readOnly value={inviteLink} className="lux-input flex-1 text-xs" onFocus={(e) => e.target.select()} />
                    <button onClick={copy} className="lux-btn lux-btn-ghost !px-3 !py-2">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                  </div>
                </div>
              )}

              {/* Roster */}
              <div className="flex flex-col gap-2">
                {/* owner row */}
                <div className="lux-glass p-3 flex items-center gap-3">
                  <Crown className="w-4 h-4" style={{ color: '#E8C97A' }} />
                  <span className="text-sm" style={{ color: 'var(--lux-text)' }}>Primary owner</span>
                  <span className="ml-auto text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{data.owner_admin_id}</span>
                </div>
                {(data.staff || []).filter((s) => s.member_admin_id !== data.owner_admin_id).length === 0 && (
                  <div className="text-xs px-1" style={{ color: 'var(--lux-text-faint)' }}>No team members yet.</div>
                )}
                {(data.staff || []).filter((s) => s.member_admin_id !== data.owner_admin_id).map((s) => (
                  <div key={s.id} className="lux-glass p-3 flex items-center gap-3 flex-wrap" data-testid={`staff-${s.id}`}>
                    <div className="min-w-0">
                      <div className="text-sm truncate" style={{ color: 'var(--lux-text)' }}>{s.name || s.email}</div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--lux-text-muted)' }}>{s.email} · {s.status}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {s.role === 'owner'
                        ? <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: 'rgba(212,175,55,0.18)', color: '#E8C97A' }}>owner</span>
                        : <select value={s.role} onChange={(e) => changeRole(s, e.target.value)} className="lux-input text-xs !py-1" disabled={s.status !== 'active'}>
                            <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="manager">Manager</option>
                          </select>}
                      {isOwner && s.status === 'active' && s.role !== 'owner' && (
                        <button title="Transfer ownership" onClick={() => setConfirmXfer(s)} className="lux-btn lux-btn-ghost !px-2 !py-1"><ArrowRight className="w-4 h-4" /></button>
                      )}
                      <button title="Remove" onClick={() => revoke(s)} className="lux-btn lux-btn-ghost !px-2 !py-1"><Trash2 className="w-4 h-4" style={{ color: '#ff9a9a' }} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

        {/* transfer confirm */}
        {confirmXfer && (
          <div className="fixed inset-0 z-[80] grid place-items-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmXfer(null)}>
            <div className="lux-glass p-5 max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-2"><ArrowRight className="w-4 h-4" style={{ color: '#E8C97A' }} /><span className="font-medium" style={{ color: 'var(--lux-text)' }}>Transfer ownership</span></div>
              <p className="text-xs mb-4" style={{ color: 'var(--lux-text-muted)' }}>
                Make <b>{confirmXfer.name || confirmXfer.email}</b> the primary owner? You’ll stay on the team as a <b>manager</b> and keep working access, but they’ll control ownership. This can only be reversed by the new owner.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmXfer(null)} className="lux-btn lux-btn-ghost !px-3 !py-2 text-sm">Cancel</button>
                <button onClick={() => doTransfer(confirmXfer)} className="lux-btn !px-3 !py-2 text-sm">Transfer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
