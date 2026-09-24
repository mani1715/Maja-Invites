import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Lock, Heart, MessageCircle, Calendar, Image as ImageIcon, ArrowLeft, ExternalLink, BarChart3 } from 'lucide-react';
import MandalaLoader from '@/components/luxury/MandalaLoader';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * CoupleAccess — limited-access portal for couples (not photographers).
 *
 * URL: /couple/access/:slug
 *
 * On submit of share-link + passcode the couple sees:
 *   - RSVP summary count
 *   - Wishes count and latest 5 wishes
 *   - Live gallery (read-only)
 *   - Open public invitation
 *   - No design controls / no photographer fields
 */
const CoupleAccess = () => {
  const navigate = useNavigate();
  const { slug: slugParam } = useParams();
  const [slug, setSlug] = useState(slugParam || '');
  const [passcode, setPasscode] = useState('');
  const [invite, setInvite] = useState(null);
  const [rsvps, setRsvps] = useState({ count: 0, attending: 0 });
  const [wishes, setWishes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  const unlock = async (e) => {
    if (e) e.preventDefault();
    setError(''); setLoading(true);
    try {
      const url = `${API_URL}/api/invite/${slug}${passcode ? `?passcode=${encodeURIComponent(passcode)}` : ''}`;
      const res = await axios.get(url);
      setInvite(res.data);
      const all = (res.data.greetings || []).filter((g) => g.is_approved !== false);
      setWishes(all.slice(0, 5));
      // Estimate RSVP count from public payload if backend exposes it
      const rsvpStats = res.data.rsvp_stats || res.data.rsvps_stats || null;
      setRsvps({
        count:     rsvpStats?.total_count   ?? res.data.rsvp_count ?? 0,
        attending: rsvpStats?.attending     ?? res.data.attending  ?? 0,
      });
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not unlock. Check your link and passcode.');
    } finally { setLoading(false); }
  };

  if (!invite) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center px-6 py-12 relative">
        <button onClick={() => navigate('/')}
          className="absolute top-8 left-8 z-20 flex items-center gap-2 text-xs tracking-[0.25em] uppercase"
          style={{ color: 'var(--lux-text-muted)' }} data-testid="couple-back">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <motion.form onSubmit={unlock}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="lux-glass p-10 max-w-md w-full text-center" data-testid="couple-unlock-form">
          <div className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-5"
            style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}>
            <Lock className="w-5 h-5" style={{ color: '#16110C' }} />
          </div>
          <span className="lux-eyebrow block mb-3">◆ Couple Portal</span>
          <h2 className="font-display text-3xl mb-2" style={{ color: 'var(--lux-text)' }}>Welcome back.</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--lux-text-muted)' }}>
            Enter your invitation slug and (if required) passcode to see your RSVPs, wishes and gallery.
          </p>

          <label className="block text-left mb-4">
            <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>Invitation Slug</span>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="anaya-rohan-2026"
              className="w-full px-4 py-3 rounded-lg bg-transparent outline-none text-sm"
              style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid="couple-slug" />
          </label>

          <label className="block text-left mb-5">
            <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>Passcode (optional)</span>
            <input type="text" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="If your invite is locked"
              className="w-full px-4 py-3 rounded-lg bg-transparent outline-none text-sm"
              style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid="couple-passcode" />
          </label>

          {error && <div className="mb-4 px-3 py-2 rounded-md text-sm" style={{ background: 'rgba(139,0,0,0.18)', color: '#FFD7C9' }}>{error}</div>}

          <button type="submit" disabled={loading} className="lux-btn w-full justify-center" data-testid="couple-unlock-btn">
            {loading ? 'Opening…' : 'Open Portal'} <Heart className="w-3.5 h-3.5" />
          </button>
        </motion.form>
      </div>
    );
  }

  const bride = invite.bride_name || 'Bride';
  const groom = invite.groom_name || 'Groom';
  const events = invite.events || [];

  return (
    <div className="luxe min-h-screen px-6 md:px-12 py-10 relative" data-testid="couple-portal">
      <button onClick={() => { setInvite(null); }}
        className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase mb-8"
        style={{ color: 'var(--lux-text-muted)' }}>
        <ArrowLeft className="w-4 h-4" /> Sign Out
      </button>

      <div className="max-w-5xl mx-auto">
        <span className="lux-eyebrow block mb-4">◆ Couple Portal</span>
        <h1 className="font-display text-[2.4rem] md:text-[4rem] leading-[1.02] mb-3" style={{ color: 'var(--lux-text)' }}>
          {bride} <span className="text-gold italic font-script">&</span> {groom}
        </h1>
        <p className="mb-10 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
          A read-only view of your wedding. Edits stay with your photographer.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10" data-testid="couple-stats">
          <Stat label="Total RSVPs"  value={rsvps.count}     icon={MessageCircle} />
          <Stat label="Attending"    value={rsvps.attending} icon={Heart} />
          <Stat label="Wishes"       value={wishes.length}   icon={MessageCircle} />
          <Stat label="Events"       value={events.length}   icon={Calendar} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="lux-glass p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>Latest Wishes</h3>
              <MessageCircle className="w-4 h-4" style={{ color: '#D4AF37' }} />
            </div>
            {wishes.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No wishes yet.</p>
            ) : (
              <div className="space-y-3" data-testid="couple-wishes-list">
                {wishes.map((w, i) => (
                  <div key={w.id || i} className="px-4 py-3 rounded-lg"
                    style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                    <p className="text-sm italic font-heading mb-1.5" style={{ color: 'var(--lux-text)' }}>“{w.message || w.wish}”</p>
                    <p className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>— {w.guest_name || w.name || 'A guest'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lux-glass p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>Events</h3>
              <Calendar className="w-4 h-4" style={{ color: '#D4AF37' }} />
            </div>
            {events.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No events scheduled.</p>
            ) : (
              <div className="space-y-3" data-testid="couple-events-list">
                {events.map((evt, i) => (
                  <div key={evt.id || i} className="px-4 py-3 rounded-lg"
                    style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                    <div className="font-heading text-base" style={{ color: 'var(--lux-text)' }}>{evt.title || evt.event_type}</div>
                    {evt.event_date && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--lux-text-muted)' }}>
                        {new Date(evt.event_date).toLocaleDateString(undefined, { day: '2-digit', month: 'long' })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <a href={`/invite/${slug}`} target="_blank" rel="noreferrer" className="lux-btn" data-testid="couple-open-public">
          Open My Invitation <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {loading && <div className="fixed inset-0 grid place-items-center" style={{ background: 'rgba(0,0,0,0.4)' }}><MandalaLoader /></div>}
    </div>
  );
};

const Stat = ({ label, value, icon: Icon }) => (
  <div className="lux-glass p-5">
    <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>
      <Icon className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} /> {label}
    </div>
    <div className="font-display text-3xl text-gold leading-none">{value}</div>
  </div>
);

export default CoupleAccess;
