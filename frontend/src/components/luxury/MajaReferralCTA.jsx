import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { ArrowUpRight, Camera, Sparkles } from 'lucide-react';
import { useInvitePrefetch } from '@/context/InvitePrefetchContext';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * MAJA Invites — Photographer-Referral Viral CTA
 * Subtle, luxe, on-brand. Shows once at the bottom of the public invitation.
 * Tracks via referral_code if available; otherwise plain signup.
 */
const MajaReferralCTA = ({ slug }) => {
  const prefetch = useInvitePrefetch(slug);
  const [code, setCode] = useState(prefetch?.referral_code || null);

  useEffect(() => {
    if (!slug) return;
    // Skip network if /full already provided the referral code (or null).
    if (prefetch && 'referral_code' in prefetch) {
      setCode(prefetch.referral_code || null);
      return;
    }
    axios.get(`${API_URL}/api/public/referral-code-by-slug/${slug}`)
      .then((r) => setCode(r.data?.referral_code || null))
      .catch(() => setCode(null));
  }, [slug, prefetch]);

  const signupUrl = code
    ? `${window.location.origin}/admin/login?ref=${code}`
    : `${window.location.origin}/admin/login`;

  // Compact one-line band (kept, but small) per owner request — the big hero
  // block was too dominant near the end of the invitation.
  return (
    <section className="px-6 py-8" data-testid="public-maja-cta">
      <motion.div
        initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl mx-auto lux-glass px-5 py-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-center"
      >
        <span className="lux-eyebrow inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-gold" /> Crafted on <span className="font-script italic text-gold">MAJA</span>
        </span>
        {code && (
          <span className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.15em] uppercase"
            style={{ color: 'rgba(255,248,220,0.8)' }} data-testid="public-maja-cta-code">
            code
            <code className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.18)', color: '#FFF8DC' }}>{code}</code>
            <span className="text-gold">· 50 free credits</span>
          </span>
        )}
        <a href={signupUrl} target="_blank" rel="noopener noreferrer"
          className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5"
          data-testid="public-maja-cta-button">
          <Camera className="w-3.5 h-3.5" /> See how this was made <ArrowUpRight className="w-3 h-3" />
        </a>
      </motion.div>
    </section>
  );
};

export default MajaReferralCTA;
