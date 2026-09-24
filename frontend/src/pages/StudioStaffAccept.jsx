import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, Check, Loader2, AlertCircle } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * StudioStaffAccept — lands from a staff invite link (/studio/staff/accept?token=…).
 * Accepts the invite for the currently signed-in studio account.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function StudioStaffAccept() {
  const [state, setState] = useState('working'); // working | ok | error | noauth
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setState('error'); setMsg('This link is missing its invite code.'); return; }
    if (!localStorage.getItem('admin_token')) { setState('noauth'); return; }
    axios.post(`${API_URL}/api/studio/staff/accept`, { token })
      .then(() => setState('ok'))
      .catch((e) => { setState('error'); setMsg(e?.response?.data?.detail || 'This invite is no longer valid.'); });
  }, []);

  return (
    <div className="luxe min-h-screen grid place-items-center p-6" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="lux-glass p-8 text-center max-w-sm">
        <Users className="w-8 h-8 mx-auto mb-3" style={{ color: '#E8C97A' }} />
        {state === 'working' && <><Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: '#E8C97A' }} /><p className="text-sm mt-3" style={{ color: 'var(--lux-text-muted)' }}>Accepting your invite…</p></>}
        {state === 'ok' && <><Check className="w-7 h-7 mx-auto" style={{ color: '#7BD88F' }} /><h1 className="font-display text-xl mt-2" style={{ color: 'var(--lux-text)' }}>You’re on the team!</h1><p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>You now have scoped access to this studio.</p><a href="/studio/dashboard" className="lux-btn inline-block mt-4 !px-4 !py-2 text-sm">Go to dashboard</a></>}
        {state === 'noauth' && <><AlertCircle className="w-7 h-7 mx-auto" style={{ color: '#E8C97A' }} /><h1 className="font-display text-xl mt-2" style={{ color: 'var(--lux-text)' }}>Sign in first</h1><p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>Log in to your MAJA studio account, then open this invite link again.</p><a href={`/studio/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="lux-btn inline-block mt-4 !px-4 !py-2 text-sm">Sign in</a></>}
        {state === 'error' && <><AlertCircle className="w-7 h-7 mx-auto" style={{ color: '#ff9a9a' }} /><h1 className="font-display text-xl mt-2" style={{ color: 'var(--lux-text)' }}>Invite problem</h1><p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>{msg}</p></>}
      </div>
    </div>
  );
}
