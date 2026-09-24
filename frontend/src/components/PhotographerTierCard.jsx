/**
 * PhotographerTierCard — Loyalty tier badge for the photographer dashboard.
 *
 * Fetches `/api/photographer/me/tier` and renders:
 *   - Current tier label (Starter / Pro / Elite / Partner)
 *   - Total paid links published
 *   - Active discount % and bonus % (when any)
 *   - Progress bar toward the next tier
 *
 * The tier auto-upgrades server-side every time the photographer publishes
 * a paid link, so this card just reflects whatever `/me/tier` returns.
 */
import React, { useEffect, useState } from 'react';
import { Sparkles, TrendingUp, BadgeCheck, ChevronRight } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const TIER_VISUALS = {
  starter: { gradient: 'linear-gradient(135deg,#6b6b6b,#3a3a3a)',  glyph: '◆', accent: '#cfcfcf' },
  pro:     { gradient: 'linear-gradient(135deg,#7c5b2e,#4f3a1f)',  glyph: '◆◆', accent: '#E8C766' },
  elite:   { gradient: 'linear-gradient(135deg,#9c4b2a,#5b2a17)',  glyph: '★', accent: '#FFB774' },
  partner: { gradient: 'linear-gradient(135deg,#D4AF37,#8B5E1B)',  glyph: '✦', accent: '#FFE38A' },
};

export default function PhotographerTierCard({ className = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) { setLoading(false); return; }
    axios.get(`${API_URL}/api/photographer/me/tier`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return null;
  }

  const tier = data.tier;
  const next = data.next_tier;
  const visuals = TIER_VISUALS[tier.key] || TIER_VISUALS.starter;
  const paid = data.paid_links_count || 0;
  const linksToNext = data.links_to_next || 0;
  const span = next ? Math.max(1, next.min_paid_links - tier.min_paid_links) : 1;
  const progress = next
    ? Math.min(100, Math.round(((paid - tier.min_paid_links) / span) * 100))
    : 100;

  return (
    <div
      className={`relative rounded-2xl p-5 md:p-6 overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(140,30,30,0.08) 100%)',
        border: '1px solid rgba(212,175,55,0.32)',
      }}
      data-testid="photographer-tier-card"
    >
      {/* Subtle glow */}
      <div
        aria-hidden
        className="absolute -top-12 -right-12 w-44 h-44 rounded-full"
        style={{ background: `radial-gradient(circle, ${visuals.accent}33 0%, transparent 65%)`, filter: 'blur(20px)' }}
      />

      <div className="flex items-start justify-between gap-4 flex-wrap relative">
        <div>
          <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: visuals.accent }}>
            <Sparkles className="w-3.5 h-3.5" /> Loyalty tier
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-3xl md:text-4xl"
              style={{
                background: visuals.gradient,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
              data-testid="tier-label"
            >
              {tier.label}
            </span>
            <span className="text-[10px] tracking-[0.3em]" style={{ color: visuals.accent }}>
              {visuals.glyph}
            </span>
          </div>
          <div className="text-xs mt-1" style={{ color: 'rgba(245,236,215,0.7)' }} data-testid="tier-paid-links">
            {paid} paid link{paid === 1 ? '' : 's'} published
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 min-w-[140px]">
          {tier.discount_pct > 0 && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] tracking-[0.25em] uppercase"
              style={{ background: 'rgba(212,175,55,0.18)', color: '#FFE38A', border: '1px solid rgba(212,175,55,0.45)' }}
              data-testid="tier-discount-badge"
            >
              <BadgeCheck className="w-3 h-3" /> {tier.discount_pct}% off packs
            </div>
          )}
          {tier.bonus_pct > 0 && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] tracking-[0.25em] uppercase"
              style={{ background: 'rgba(212,175,55,0.10)', color: '#FFE38A', border: '1px solid rgba(212,175,55,0.32)' }}
              data-testid="tier-bonus-badge"
            >
              <TrendingUp className="w-3 h-3" /> +{tier.bonus_pct}% bonus credits
            </div>
          )}
        </div>
      </div>

      {/* Progress to next tier */}
      <div className="mt-5 relative">
        <div className="flex items-center justify-between text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(245,236,215,0.55)' }}>
          <span>{tier.label}</span>
          {next ? (
            <span className="inline-flex items-center gap-1" style={{ color: visuals.accent }} data-testid="tier-next-label">
              Next: {next.label} <ChevronRight className="w-3 h-3" />
            </span>
          ) : (
            <span style={{ color: '#FFE38A' }}>Top tier unlocked</span>
          )}
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(245,236,215,0.1)' }}>
          <div
            className="h-1.5 transition-all"
            style={{ width: `${progress}%`, background: visuals.gradient }}
            data-testid="tier-progress-bar"
          />
        </div>
        {next && (
          <div className="text-[11px] mt-2" style={{ color: 'rgba(245,236,215,0.7)' }} data-testid="tier-progress-msg">
            {linksToNext === 0 ? (
              <span>One more publish unlocks <span style={{ color: visuals.accent, fontWeight: 600 }}>{next.label}</span>.</span>
            ) : (
              <>
                Publish <span style={{ color: visuals.accent, fontWeight: 600 }}>{linksToNext}</span> more paid link{linksToNext === 1 ? '' : 's'} to unlock
                {' '}<span style={{ color: visuals.accent, fontWeight: 600 }}>{next.label}</span>
                {' '}({next.discount_pct}% off + {next.bonus_pct}% bonus credits).
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
