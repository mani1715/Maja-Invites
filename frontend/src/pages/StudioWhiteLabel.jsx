/* StudioWhiteLabel — Phase 10 enterprise branding editor (/studio/white-label).
   Studio sets brand name / logo / accent / tagline / domain applied to its
   public portfolio. Removing the "MAJA Invites" credit is entitlement-gated
   (super-admin grants the enterprise plan). */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Check, Crown, Lock } from 'lucide-react';
import PanelTabs from '@/components/PanelTabs';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHdr = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });

export default function StudioWhiteLabel() {
  const [wl, setWl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/api/studio/white-label`, authHdr())
      .then(({ data }) => setWl(data))
      .catch(() => setWl({ entitled: false }));
  }, []);

  const set = (k) => (e) => setWl((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const { data } = await axios.put(`${API_URL}/api/studio/white-label`, {
        brand_name: wl.brand_name || '', logo_url: wl.logo_url || '', accent_color: wl.accent_color || '',
        tagline: wl.tagline || '', custom_domain: wl.custom_domain || '', hide_maja_branding: !!wl.hide_maja_branding,
      }, authHdr());
      setWl(data); setSaved(true);
    } catch { /* noop */ } finally { setSaving(false); }
  };

  if (wl === null) return <div className="luxe min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin" style={{ color: '#D4AF37' }} /></div>;

  const accent = wl.accent_color || '#D4AF37';

  return (
    <div className="luxe min-h-screen">
      <PanelTabs />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="lux-eyebrow mb-2 flex items-center gap-2"><Crown className="w-3.5 h-3.5" /> Enterprise</div>
        <h1 className="font-display text-3xl mb-1" style={{ color: 'var(--lux-text)' }}>White-label branding</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--lux-text-muted)' }}>Make your public portfolio yours — your name, logo and colour.</p>

        <div className="lux-glass p-6 space-y-4" data-testid="wl-editor">
          <L label="Brand name"><input className="lux-input" style={fs} value={wl.brand_name || ''} onChange={set('brand_name')} placeholder="Lens & Light Studio" data-testid="wl-brand" /></L>
          <L label="Logo URL"><input className="lux-input" style={fs} value={wl.logo_url || ''} onChange={set('logo_url')} placeholder="https://…/logo.png" data-testid="wl-logo" /></L>
          <L label="Accent colour">
            <div className="flex items-center gap-3">
              <input type="color" value={accent} onChange={set('accent_color')} style={{ width: 44, height: 38, background: 'transparent', border: 'none' }} data-testid="wl-accent" />
              <input className="lux-input" style={fs} value={wl.accent_color || ''} onChange={set('accent_color')} placeholder="#D4AF37" />
            </div>
          </L>
          <L label="Tagline"><input className="lux-input" style={fs} value={wl.tagline || ''} onChange={set('tagline')} placeholder="Timeless wedding films" data-testid="wl-tagline" /></L>
          <L label="Custom domain (display)"><input className="lux-input" style={fs} value={wl.custom_domain || ''} onChange={set('custom_domain')} placeholder="studio.yourdomain.com" data-testid="wl-domain" /></L>

          {/* entitlement-gated credit removal */}
          <div className="pt-2 flex items-center justify-between gap-3 rounded-lg p-3" style={{ border: '1px solid var(--lux-border)' }}>
            <div>
              <div className="text-sm flex items-center gap-2" style={{ color: 'var(--lux-text)' }}>
                {!wl.entitled && <Lock className="w-3.5 h-3.5" style={{ color: '#E8C97A' }} />} Remove "MAJA Invites" credit
              </div>
              {!wl.entitled && <div className="text-xs mt-0.5" style={{ color: 'var(--lux-text-faint)' }}>Enterprise entitlement required — contact us to enable.</div>}
            </div>
            <button type="button" disabled={!wl.entitled}
              onClick={() => setWl((s) => ({ ...s, hide_maja_branding: !s.hide_maja_branding }))}
              className="relative w-11 h-6 rounded-full shrink-0" data-testid="wl-hide-toggle"
              style={{ background: wl.hide_maja_branding && wl.entitled ? accent : 'rgba(255,255,255,0.15)', opacity: wl.entitled ? 1 : 0.5, cursor: wl.entitled ? 'pointer' : 'not-allowed' }}>
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: wl.hide_maja_branding && wl.entitled ? '22px' : '2px' }} />
            </button>
          </div>

          <button onClick={save} disabled={saving} className="lux-btn w-full justify-center" data-testid="wl-save">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save branding'}
          </button>
        </div>
      </div>
    </div>
  );
}

const fs = { width: '100%', padding: '0.7rem 0.9rem', background: 'transparent', borderRadius: '0.5rem', border: '1px solid var(--lux-border, rgba(212,175,55,0.18))', color: 'var(--lux-text)', outline: 'none' };
const L = ({ label, children }) => (
  <div>
    <label className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>{label}</label>
    {children}
  </div>
);
