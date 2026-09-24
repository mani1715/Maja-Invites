import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ClientAccessPanel from '@/components/luxury/ClientAccessPanel';
import ClientBudgetPanel from '@/components/luxury/ClientBudgetPanel';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * ClientHubPage — the "Client" page for one invitation.
 *
 * Replaces the old per-ceremony link composer at this route on the owner's
 * instruction: what a photographer needs here is the client's LOGIN and the
 * MONEY, nothing else. Two sections, both photographer-only:
 *
 *   1. Client Access — create the login, see the username, copy the one-time
 *      password (ClientAccessPanel, rendered inline rather than as a modal).
 *   2. Budget — agreed amount, payments received, balance, promised date.
 *
 * The per-ceremony composer still exists at /studio/profile/:id/event-links; it
 * is simply no longer the thing this route opens.
 */
const ClientHubPage = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) { navigate('/studio/login', { replace: true }); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/admin/profiles/${profileId}`);
        if (!cancelled) setProfile(data);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.detail || 'Could not load this invitation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profileId, admin, authLoading, navigate]);

  const coupleName = profile
    ? [profile.bride_name, profile.groom_name].filter(Boolean).join(' & ')
    : '';

  return (
    <div className="luxe min-h-screen relative" data-testid="client-hub-page">
      <motion.nav
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-40 px-6 md:px-12 py-4 flex items-center justify-between border-b"
        style={{ background: 'rgba(14,10,6,0.85)', backdropFilter: 'blur(12px)', borderColor: 'var(--lux-border)' }}
      >
        <button onClick={() => navigate('/studio/dashboard')}
          className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase"
          style={{ color: 'rgba(255,248,220,0.85)' }} data-testid="client-hub-back">
          <ArrowLeft className="w-4 h-4" /> Studio
        </button>
        <div className="text-center">
          <div className="text-[10px] tracking-[0.35em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>Client</div>
          <div className="font-display text-lg" style={{ color: '#FFF8DC' }}>{coupleName || '…'}</div>
        </div>
        <div className="w-20" />
      </motion.nav>

      <div className="px-6 md:px-12 py-10 md:py-14 max-w-[1000px] mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-9">
          <span className="lux-eyebrow block mb-4">◆ Client</span>
          <h1 className="font-display text-[2.2rem] md:text-[3.2rem] leading-[1.05] tracking-tight"
            style={{ color: '#FFF8DC' }}>
            Their login and <span className="text-gold italic font-script">their budget</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[1rem]" style={{ color: 'rgba(255,248,220,0.82)' }}>
            Give {coupleName || 'the couple'} a private login to follow their own event, and keep
            the money for this booking in one place.
          </p>
        </motion.div>

        {error && (
          <div className="px-4 py-3 rounded-lg text-sm mb-6"
            style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(255,120,90,0.4)', color: '#FFD7C9' }}
            data-testid="client-hub-error">{error}</div>
        )}

        {loading ? (
          <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-gold" /></div>
        ) : (
          <div className="space-y-6">
            <ClientAccessPanel profileId={profileId} coupleName={coupleName} inline />
            <ClientBudgetPanel profileId={profileId} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientHubPage;
