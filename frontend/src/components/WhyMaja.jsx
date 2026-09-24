import React from 'react';
import { motion } from 'framer-motion';
import { Check, X, ShieldOff, BadgeIndianRupee, Smartphone, Hammer, Globe2, Camera } from 'lucide-react';

/**
 * WhyMaja — research-backed standout section. Each row turns a real competitor
 * flaw (ads, subscriptions, email/app-only, glitchy DIY editors, English-only,
 * static cards) into a MAJA advantage. Drives differentiation, not just features.
 */
const ROWS = [
  { icon: BadgeIndianRupee, label: 'Price',        maja: 'One-time ₹ — pay once, no subscription',        them: 'Monthly subscriptions or per-send fees' },
  { icon: ShieldOff,        label: 'Ads',          maja: 'Never. Your invite, nothing else',              them: 'Banner & pop-up ads on free invites' },
  { icon: Smartphone,       label: 'Guest access', maja: 'Any phone. No app, no login — even grandma',     them: 'Email or app required; lands in spam' },
  { icon: Hammer,           label: 'Who builds it',maja: 'Our studio builds it for you',                   them: 'DIY editors that glitch & wipe designs' },
  { icon: Globe2,           label: 'Languages',    maja: 'Hindi · Tamil · Telugu · English',               them: 'English-only templates' },
  { icon: Camera,           label: 'After the day',maja: 'A live photo gallery guests add to by QR',       them: 'A static card that goes stale' },
];

const TRUST = ['No ads, ever', 'No subscription', 'No login for guests', 'We build it for you'];

const WhyMaja = () => (
  <section id="why" className="relative px-6 md:px-16 py-24 md:py-28 z-10">
    <div style={{ perspective: 1100 }} className="max-w-3xl mb-12">
      <motion.div
        initial={{ opacity: 0, y: 48, rotateX: 14 }}
        whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <span className="lux-eyebrow block mb-5">◆ Why MAJA</span>
        <h2 className="font-display text-[2.4rem] md:text-[3.6rem] leading-[1.05] tracking-tight" style={{ color: 'var(--lux-text)' }}>
          Built <span className="font-script italic text-gold">different.</span>
        </h2>
        <p className="mt-5 text-[1.02rem] leading-relaxed max-w-xl" style={{ color: 'var(--lux-text-muted)' }}>
          Most e-invites bolt on ads, lock you into subscriptions, or hand you a glitchy editor.
          MAJA does the opposite — and goes far beyond a flat card.
        </p>
      </motion.div>
    </div>

    {/* Comparison */}
    <div className="max-w-5xl">
      <div className="hidden md:grid grid-cols-[1.1fr_1.3fr_1.3fr] gap-px rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--lux-border)' }}>
        <Cell head />
        <Cell head highlight>MAJA</Cell>
        <Cell head muted>Typical e-invite</Cell>
        {ROWS.map((r, i) => (
          <React.Fragment key={r.label}>
            <Cell i={i}><span className="inline-flex items-center gap-2"><r.icon className="w-4 h-4 text-gold" /> {r.label}</span></Cell>
            <Cell i={i} highlight><span className="inline-flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#8AA95B' }} /> {r.maja}</span></Cell>
            <Cell i={i} muted><span className="inline-flex items-start gap-2"><X className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'rgba(255,120,100,0.8)' }} /> {r.them}</span></Cell>
          </React.Fragment>
        ))}
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-3">
        {ROWS.map((r) => (
          <div key={r.label} className="lux-glass p-4">
            <div className="inline-flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--lux-text)' }}>
              <r.icon className="w-4 h-4 text-gold" /> {r.label}
            </div>
            <div className="flex items-start gap-2 text-sm" style={{ color: 'var(--lux-text)' }}>
              <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#8AA95B' }} /> {r.maja}
            </div>
            <div className="flex items-start gap-2 text-xs mt-1.5" style={{ color: 'var(--lux-text-muted)' }}>
              <X className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'rgba(255,120,100,0.7)' }} /> {r.them}
            </div>
          </div>
        ))}
      </div>

      {/* Trust strip */}
      <div className="mt-8 flex flex-wrap gap-2.5">
        {TRUST.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs tracking-wide"
            style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.3)', color: 'var(--lux-text)' }}>
            <Check className="w-3.5 h-3.5 text-gold" /> {t}
          </span>
        ))}
      </div>
    </div>
  </section>
);

const Cell = ({ children, head, highlight, muted, i = 0 }) => (
  <div
    className={`px-5 py-4 text-sm ${head ? 'font-display tracking-wide' : ''}`}
    style={{
      background: highlight
        ? 'rgba(212,175,55,0.07)'
        : head ? 'rgba(255,255,255,0.03)' : 'rgba(14,10,6,0.5)',
      // head row sits on a translucent theme-driven tint (white-wash on head cells,
      // gold-wash on the highlighted "MAJA" head cell) so its text tracks the theme.
      // Data-row label/"Typical" cells sit on a fixed rgba(14,10,6,0.5) chip that
      // never changes color in light mode, so their ivory text stays hard-coded —
      // only the highlighted "MAJA" data cell (gold-tinted, theme-driven) is tokenized.
      color: head
        ? (highlight ? '#D4AF37' : 'var(--lux-text-muted)')
        : (highlight ? 'var(--lux-text)' : muted ? 'rgba(255,248,220,0.7)' : 'rgba(255,248,220,0.92)'),
      fontSize: head ? '0.95rem' : undefined,
    }}
  >
    {children}
  </div>
);

export default WhyMaja;
