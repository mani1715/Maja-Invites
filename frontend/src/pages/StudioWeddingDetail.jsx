// StudioWeddingDetail — one published wedding's full picture for the studio.
// Aggregates the couple's filled form, RSVP tallies (counts only, no names),
// gallery + AI face-match counts, digital-shagun totals, the guest photo-upload
// link (QR target), and wishes moderation (delete/reject a bad wish).
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PanelTabs from '@/components/PanelTabs';
import {
  Users, Heart, Image as ImageIcon, ScanFace, Gift, Link2, QrCode, Trash2,
  Loader2, ExternalLink, Check, X,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const abs = (u) => (u ? `${window.location.origin}${u}` : '');

const DETAIL_FIELDS = [
  ['bride_name', 'Bride'], ['groom_name', 'Groom'], ['event_date', 'Date'],
  ['wedding_date', 'Date'], ['venue', 'Venue'], ['city', 'City'],
  ['muhurtam', 'Muhurtam'], ['nakshatram', 'Nakshatram'], ['gotram', 'Gotram'],
];

export default function StudioWeddingDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [wishes, setWishes] = useState([]);
  const [err, setErr] = useState('');

  const loadWishes = useCallback(() => {
    axios.get(`${API_URL}/api/admin/profiles/${id}/wishes`, { headers: authHeaders() })
      .then(({ data }) => setWishes(data.wishes || data.items || [])).catch(() => {});
  }, [id]);

  useEffect(() => {
    axios.get(`${API_URL}/api/studio/wedding/${id}`, { headers: authHeaders() })
      .then(({ data }) => setData(data)).catch((e) => setErr(e?.response?.data?.detail || 'Could not load'));
    loadWishes();
  }, [id, loadWishes]);

  const rejectWish = async (wid) => {
    await axios.post(`${API_URL}/api/admin/profiles/${id}/wishes/${wid}/reject`, {}, { headers: authHeaders() });
    loadWishes();
  };
  const approveWish = async (wid) => {
    await axios.post(`${API_URL}/api/admin/profiles/${id}/wishes/${wid}/approve`, {}, { headers: authHeaders() });
    loadWishes();
  };
  const copy = (u) => navigator.clipboard?.writeText(abs(u));

  if (err) return <Wrap><div className="lux-glass p-8 text-center" style={{ color: '#FFD7C9' }}>{err}</div></Wrap>;
  if (!data) return <Wrap><div className="flex items-center gap-2" style={{ color: 'var(--lux-text)' }}><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div></Wrap>;

  const d = data.details || {};
  const stats = [
    { icon: Users, label: 'Coming', value: data.rsvp.coming, sub: `${data.rsvp.not_coming} not · ${data.rsvp.total} replied` },
    { icon: ImageIcon, label: 'Photos', value: data.gallery.photos },
    { icon: ScanFace, label: 'AI face matches', value: data.gallery.ai_face_matches },
    { icon: Gift, label: 'Digital shagun', value: inr(data.donations.total_inr), sub: `${data.donations.count} gifts` },
    { icon: Heart, label: 'Wishes', value: data.wishes.total, sub: `${data.wishes.rejected} removed` },
  ];

  return (
    <Wrap>
      <div className="mb-6">
        <span className="lux-eyebrow block mb-2">◆ Your wedding</span>
        <h1 className="font-display text-[2rem] md:text-[2.6rem]" style={{ color: 'var(--lux-text)' }}>
          {d.bride_name || 'Bride'} <span className="text-gold font-script italic">&</span> {d.groom_name || 'Groom'}
        </h1>
        {data.live_url && (
          <a href={abs(data.live_url)} target="_blank" rel="noreferrer" className="lux-btn lux-btn-ghost mt-3 inline-flex" data-testid="wedding-live-link">
            View invitation <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="lux-glass p-4" data-testid={`wedding-stat-${s.label}`}>
              <Icon className="w-5 h-5 mb-2" style={{ color: '#E8C97A' }} />
              <div className="font-display text-2xl text-gold">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>{s.label}</div>
              {s.sub && <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>{s.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* guest photo upload (QR target) */}
      {data.guest_upload_url && (
        <div className="lux-glass p-5 mb-6" data-testid="wedding-guest-upload">
          <div className="flex items-center gap-2 mb-2"><QrCode className="w-5 h-5" style={{ color: '#E8C97A' }} /><span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Upload photos into the link</span></div>
          <p className="text-sm mb-3" style={{ color: 'var(--lux-text-muted)' }}>
            Share this link / QR — guests pick the event and drop their photos straight into this wedding's gallery (and AI face-match).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: '#E8C97A' }}>{abs(data.guest_upload_url)}</code>
            <button onClick={() => copy(data.guest_upload_url)} className="lux-btn lux-btn-ghost text-xs" data-testid="wedding-copy-upload"><Link2 className="w-3.5 h-3.5" /> Copy</button>
            <a href={abs(data.guest_upload_url)} target="_blank" rel="noreferrer" className="lux-btn text-xs">Open uploader <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
        </div>
      )}

      {/* the couple's filled form */}
      <div className="lux-glass p-5 mb-6">
        <div className="text-[10px] uppercase tracking-[0.3em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Their details</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {DETAIL_FIELDS.filter(([k]) => d[k]).map(([k, label]) => (
            <div key={k}>
              <div className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>{label}</div>
              <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{String(d[k])}</div>
            </div>
          ))}
        </div>
      </div>

      {/* wishes moderation */}
      <div className="lux-glass p-5">
        <div className="text-[10px] uppercase tracking-[0.3em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Wishes ({wishes.length}) — remove any that aren't good</div>
        {wishes.length === 0 ? <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No wishes yet.</div> : (
          <div className="space-y-2">
            {wishes.map((w) => (
              <div key={w.id} className="flex items-start justify-between gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', opacity: w.status === 'rejected' ? 0.5 : 1 }} data-testid={`wedding-wish-${w.id}`}>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>{w.name || w.author || 'Guest'} {w.status === 'rejected' && <span className="text-[10px]" style={{ color: '#ff8a8a' }}>· removed</span>}</div>
                  <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{w.message || w.text}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {w.status !== 'approved' && <button onClick={() => approveWish(w.id)} className="p-2 rounded-lg" title="Approve" style={{ background: 'rgba(255,255,255,0.05)' }} data-testid={`wish-approve-${w.id}`}><Check className="w-3.5 h-3.5" style={{ color: '#8ae08a' }} /></button>}
                  {w.status !== 'rejected' && <button onClick={() => rejectWish(w.id)} className="p-2 rounded-lg" title="Remove" style={{ background: 'rgba(255,255,255,0.05)' }} data-testid={`wish-reject-${w.id}`}><Trash2 className="w-3.5 h-3.5" style={{ color: '#ff8a8a' }} /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Wrap>
  );
}

const Wrap = ({ children }) => (
  <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-[1000px] mx-auto relative z-10">
      <PanelTabs active="/studio/dashboard" />
      {children}
    </div>
  </div>
);
