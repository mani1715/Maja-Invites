import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  Sparkles, Plus, Wallet, ArrowRight, ExternalLink, Calendar, MapPin, Copy, Check,
  Home as HomeIcon, Camera, Edit3,
} from 'lucide-react';
import { useUserAuth } from '@/context/UserAuthContext';
import '../styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function UserDashboard() {
  const navigate = useNavigate();
  const { user, loading, refresh, logout } = useUserAuth();
  const [profiles, setProfiles] = useState([]);
  // Done-for-you orders. The buyer never builds a profile, so a delivered
  // invitation only exists as an order — listing profiles alone left this
  // dashboard permanently empty even after the studio delivered the link.
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/', { replace: true }); return; }
    let mounted = true;
    Promise.all([
      axios.get(`${API_URL}/api/users/profiles`, { withCredentials: true }).catch(() => null),
      axios.get(`${API_URL}/api/store/my-orders`, { withCredentials: true }).catch(() => null),
    ]).then(([p, o]) => {
      if (!mounted) return;
      setProfiles(p?.data?.profiles || []);
      setOrders((o?.data?.orders || []).filter((x) => x.live_url));
    }).finally(() => mounted && setBusy(false));
    return () => { mounted = false; };
  }, [loading, user, navigate]);

  const copyLink = (slug) => {
    const url = `${window.location.origin}/invite/${slug}`;
    navigator.clipboard?.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading || busy) {
    return (
      <div className="luxe min-h-screen grid place-items-center" data-testid="user-dashboard-loading">
        <Sparkles className="w-6 h-6 animate-pulse text-gold" />
      </div>
    );
  }

  return (
    <div className="luxe min-h-screen relative px-5 md:px-12 py-8 md:py-12" data-testid="user-dashboard">
      {/* Prominent "Back to Home" button — fixed top-left for instant escape */}
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] tracking-[0.25em] uppercase transition-all hover:scale-[1.03] active:scale-95 mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))',
          color: '#FFE38A',
          border: '1px solid rgba(212,175,55,0.45)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
        }}
        data-testid="user-back-to-home-btn"
      >
        <HomeIcon className="w-4 h-4" /> Back to Home
      </button>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <span className="lux-eyebrow block mb-2">◆ My Studio</span>
          <h1 className="font-display text-3xl md:text-5xl" style={{ color: 'var(--lux-text)' }}>
            Welcome, <span className="font-script italic text-gold">{user?.name?.split(' ')[0] || 'friend'}.</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            {user?.email}{user?.phone ? ` · ${user.phone}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate('/user/profile')}
            className="lux-btn lux-btn-ghost"
            data-testid="user-profile-btn"
          >
            <Sparkles className="w-4 h-4" /> My Profile
          </button>
          <button
            onClick={() => navigate('/cart')}
            className="lux-btn lux-btn-ghost"
            data-testid="user-cart-btn"
          >
            <Wallet className="w-4 h-4" /> My Cart
          </button>
          <button
            onClick={() => navigate('/designs')}
            className="lux-btn"
            data-testid="user-browse-designs-btn"
          >
            <Plus className="w-4 h-4" /> Browse Designs
          </button>
          <button
            onClick={() => navigate('/order/pending')}
            className="lux-btn lux-btn-ghost"
            data-testid="user-enter-details-btn"
          >
            <Sparkles className="w-4 h-4" /> Enter Details
          </button>
          <button
            onClick={async () => { await logout(); navigate('/'); }}
            className="text-[10px] tracking-[0.25em] uppercase px-3 py-1.5 rounded-full"
            style={{ border: '1px solid var(--lux-border)', color: 'var(--lux-text-muted)' }}
            data-testid="user-logout-btn"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* My Invitations */}
      <div className="lux-hairline mb-8" />
      <h2 className="font-display text-2xl md:text-3xl mb-5" style={{ color: 'var(--lux-text)' }}>
        My Invitations <span className="text-gold text-base">· {profiles.length + orders.length}</span>
      </h2>

      {profiles.length === 0 && orders.length === 0 ? (
        <div className="lux-glass p-12 text-center" data-testid="user-empty-state">
          <Sparkles className="w-10 h-10 text-gold mx-auto mb-4" />
          <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>
            Your first <span className="italic font-script text-gold">memory</span> is just a click away.
          </h3>
          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--lux-text-muted)' }}>
            Pick a cinematic design, pay once, share your details — and our studio crafts your
            wedding invitation page for you.
          </p>
          <button
            onClick={() => navigate('/designs')}
            className="lux-btn justify-center inline-flex"
            data-testid="user-empty-cta"
          >
            Browse designs <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="user-profiles-list">
          {orders.map((o) => (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="lux-glass p-5"
              data-testid={`user-order-card-${o.id}`}
            >
              <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>
                {o.fulfillment_code}
              </div>
              <div className="font-display text-xl mb-3" style={{ color: 'var(--lux-text)' }}>
                {[o.info?.bride_name, o.info?.groom_name].filter(Boolean).join(' & ') || 'Your invitation'}
              </div>
              <a
                href={o.live_url}
                target="_blank"
                rel="noreferrer"
                className="lux-btn justify-center inline-flex w-full"
                data-testid={`user-order-open-${o.id}`}
              >
                Open invitation <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          ))}
          {profiles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="lux-glass p-5"
              data-testid={`user-profile-card-${p.id}`}
            >
              <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>
                {p.event_type || p.invitation_category || 'invitation'}
              </div>
              {/* BUG I FIX: celebration profiles (baby birthday / half saree /
                  puberty / dhoti) don't have bride_name + groom_name — the
                  name lives in celebrant_info.name. Rendering the wedding
                  shape produced "undefined & undefined". */}
              {(() => {
                const cat = p.invitation_category || 'wedding';
                if (cat !== 'wedding') {
                  const name = p.celebrant_info?.name || p.bride_name || 'Celebration';
                  return (
                    <h3 className="font-display text-xl mb-3 leading-tight" style={{ color: 'var(--lux-text)' }}>
                      {name}
                    </h3>
                  );
                }
                return (
                  <h3 className="font-display text-xl mb-3 leading-tight" style={{ color: 'var(--lux-text)' }}>
                    {p.bride_name} <span className="font-script italic text-gold">&amp;</span> {p.groom_name}
                  </h3>
                );
              })()}
              <div className="space-y-1.5 mb-4 text-xs" style={{ color: 'var(--lux-text)' }}>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-gold" />
                  {p.event_date ? new Date(p.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </div>
                {p.venue && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-gold" />
                    {p.venue}{p.city ? ` · ${p.city}` : ''}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => window.open(`${window.location.origin}${p.invitation_link}`, '_blank')}
                  className="lux-btn lux-btn-ghost flex-1 justify-center !text-[10px]"
                  data-testid={`user-profile-view-${p.id}`}
                >
                  <ExternalLink className="w-3 h-3" /> View
                </button>
                {/* BUG J FIX: normal users had no way to edit a typo/venue/date
                    once their invitation was created. Celebration profiles
                    have an existing edit form; wedding profiles use the new
                    UserWeddingEditPage registered at /user/profile/:id/edit. */}
                <button
                  onClick={() => {
                    const cat = p.invitation_category || 'wedding';
                    if (cat !== 'wedding') {
                      navigate(`/user/celebration/${p.id}/edit?category=${cat}`);
                    } else {
                      navigate(`/user/profile/${p.id}/edit`);
                    }
                  }}
                  className="lux-btn lux-btn-ghost flex-1 justify-center !text-[10px]"
                  data-testid={`user-profile-edit-${p.id}`}
                >
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={() => copyLink(p.slug)}
                  className="lux-btn flex-1 justify-center !text-[10px]"
                  data-testid={`user-profile-copy-${p.id}`}
                >
                  {copied === p.slug ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === p.slug ? 'Copied' : 'Copy Link'}
                </button>
              </div>
              <button
                onClick={() => navigate(`/user/profile/${p.id}/live-gallery`)}
                className="lux-btn w-full justify-center !text-[10px] mt-2"
                style={{ background: 'rgba(212,175,55,0.18)', border: '1px solid rgba(212,175,55,0.55)', color: 'var(--lux-text)' }}
                data-testid={`user-profile-manage-live-${p.id}`}
              >
                <Camera className="w-3 h-3" /> Manage Live Photos
              </button>
            </motion.div>
          ))}
        </div>
      )}

    </div>
  );
}
