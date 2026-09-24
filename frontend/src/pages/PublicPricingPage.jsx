/**
 * PublicPricingPage — `/pricing` (public, no auth required).
 *
 * Lists every add-on (/api/public/addons) and every link-lifetime tier
 * (/api/public/expiry-tiers), all priced in ₹. No credits — a design has a
 * simple one-time price; pay, share details, and our studio builds it.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { IndianRupee, Clock, Check, Sparkles, ArrowRight, Hammer } from 'lucide-react';
import '../styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const fade = {
  hidden:  { opacity: 0, y: 14 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.04, ease: 'easeOut' } }),
};

const PRICING_JSONLD = (addons, tiers) => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'MAJA Wedding Invitations — Pricing',
  description: 'Simple one-time ₹ pricing for luxury interactive wedding invitations. Pick a design, pay once, and our studio builds it for you.',
  offers: tiers.map((t) => ({
    '@type': 'Offer',
    name: `${t.label} link`,
    description: `Your invitation stays live for ${t.days} days.`,
    price: t.credits,
    priceCurrency: 'INR',
  })),
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Add-ons',
    itemListElement: addons.map((a) => ({
      '@type': 'Offer',
      name: a.label,
      description: a.description,
      price: a.credits,
      priceCurrency: 'INR',
    })),
  },
});

export default function PublicPricingPage() {
  const [addons, setAddons] = useState([]);
  const [tiers, setTiers]   = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    document.title = 'Pricing — MAJA Wedding Invitations · Simple ₹ pricing';
    const desc = 'Transparent one-time ₹ pricing for luxury interactive wedding invitations. Pick a design, pay once, share your details — our studio builds it for you.';
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m); }
    m.setAttribute('content', desc);
    let canon = document.querySelector('link[rel="canonical"]');
    if (!canon) { canon = document.createElement('link'); canon.setAttribute('rel', 'canonical'); document.head.appendChild(canon); }
    canon.setAttribute('href', `${window.location.origin}/pricing`);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [a, t] = await Promise.all([
          axios.get(`${API_URL}/api/public/addons`),
          axios.get(`${API_URL}/api/public/expiry-tiers`),
        ]);
        setAddons(a.data?.addons || []);
        setTiers(t.data?.tiers || []);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded || (!addons.length && !tiers.length)) return;
    const existing = document.getElementById('maja-pricing-jsonld');
    if (existing) existing.remove();
    const s = document.createElement('script');
    s.id = 'maja-pricing-jsonld';
    s.type = 'application/ld+json';
    s.text = JSON.stringify(PRICING_JSONLD(addons, tiers));
    document.head.appendChild(s);
    return () => { s.remove(); };
  }, [addons, tiers, loaded]);

  return (
    <div className="luxe min-h-screen" data-testid="public-pricing-page">
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="px-5 md:px-12 pt-14 pb-10 md:pt-24 md:pb-16 max-w-5xl mx-auto">
        <motion.span variants={fade} initial="hidden" animate="visible" custom={0} className="lux-eyebrow inline-block mb-4">
          ◆ Transparent · One-time price · No subscriptions
        </motion.span>
        <motion.h1
          variants={fade} initial="hidden" animate="visible" custom={1}
          className="font-display leading-[0.98] text-[2.6rem] sm:text-[3.4rem] md:text-[5.4rem] tracking-tight"
          style={{ color: 'var(--lux-text)' }}
        >
          Pricing as <span className="text-gold italic font-script">elegant</span><br />
          as the invitation itself.
        </motion.h1>
        <motion.p
          variants={fade} initial="hidden" animate="visible" custom={2}
          className="mt-5 md:mt-7 max-w-2xl text-[0.95rem] md:text-[1.12rem] leading-[1.6]"
          style={{ color: 'var(--lux-text)' }}
        >
          Each design has a simple one-time price in ₹ — never a recurring fee. Pick a theme,
          pay once, and share your details. Our studio builds your invitation for you. No fine print.
        </motion.p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link to="/themes" className="lux-btn" data-testid="pricing-cta-browse">
            <Sparkles className="w-4 h-4" /> Browse designs <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#addons" className="lux-btn lux-btn-ghost" data-testid="pricing-cta-addons">
            See all add-ons
          </a>
          <a href="#expiry" className="lux-btn lux-btn-ghost" data-testid="pricing-cta-expiry">
            Link tiers
          </a>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="px-5 md:px-12 pb-12 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { i: <Sparkles className="w-5 h-5 text-gold" />,    t: 'Pick a design', d: 'Browse our cinematic themes and choose the one you love.' },
            { i: <IndianRupee className="w-5 h-5 text-gold" />, t: 'One simple price', d: 'Each design has a clear ₹ price. Pay once — no credits, no subscriptions.' },
            { i: <Hammer className="w-5 h-5 text-gold" />,      t: 'We build it for you', d: 'Share your details and our studio crafts your invitation page.' },
          ].map((c, i) => (
            <motion.div
              key={c.t}
              variants={fade} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} custom={i}
              className="lux-glass p-5"
              data-testid={`pricing-step-${i + 1}`}
            >
              <div className="mb-3">{c.i}</div>
              <h3 className="font-display text-lg mb-1" style={{ color: 'var(--lux-text)' }}>{c.t}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--lux-text-muted)' }}>{c.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Add-ons grid ─────────────────────────────────────────── */}
      <section id="addons" className="px-5 md:px-12 pb-12 max-w-5xl mx-auto" data-testid="pricing-addons-section">
        <span className="lux-eyebrow block mb-3">◆ Feature add-ons</span>
        <h2 className="font-display text-3xl md:text-4xl mb-3" style={{ color: 'var(--lux-text)' }}>
          The <span className="font-script italic text-gold">extras.</span>
        </h2>
        <p className="mb-7 text-sm max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>
          Mix and match — add only what you want. Each one is a one-time ₹ add-on.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(loaded ? addons : new Array(6).fill(null)).map((a, i) => (
            <motion.div
              key={a?.id || `sk-${i}`}
              variants={fade} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} custom={i}
              className="lux-glass p-5"
              data-testid={a ? `pricing-addon-${a.id}` : undefined}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>
                  {a?.label || <span className="opacity-30">— loading —</span>}
                </h3>
                {a && (
                  <span
                    className="px-2 py-1 rounded-full text-[10px] tracking-[0.15em] uppercase shrink-0 inline-flex items-center gap-1"
                    style={{ background: 'linear-gradient(135deg,#D4AF37,#B8941F)', color: '#16110C', fontWeight: 700 }}
                  >
                    {inr(a.credits)}
                  </span>
                )}
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--lux-text-muted)' }}>
                {a?.description || ''}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Expiry tiers table ───────────────────────────────────── */}
      <section id="expiry" className="px-5 md:px-12 pb-16 max-w-5xl mx-auto" data-testid="pricing-expiry-section">
        <span className="lux-eyebrow block mb-3">◆ Link lifetime</span>
        <h2 className="font-display text-3xl md:text-4xl mb-3" style={{ color: 'var(--lux-text)' }}>
          How long should your <span className="font-script italic text-gold">link</span> live?
        </h2>
        <p className="mb-7 text-sm max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>
          After your event, you'd usually want the invite live for a while so guests can revisit photos & RSVPs. Pick the tier that fits.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(loaded ? tiers : new Array(4).fill(null)).map((t, i) => (
            <motion.div
              key={t?.id || `tsk-${i}`}
              variants={fade} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} custom={i}
              className="lux-glass p-5"
              data-testid={t ? `pricing-tier-${t.id}` : undefined}
            >
              <Clock className="w-4 h-4 text-gold mb-2" />
              <div className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>{t?.label || '—'}</div>
              <div className="text-[10px] tracking-[0.2em] uppercase mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                {t ? `${t.days} days` : ''}
              </div>
              {t && (
                <div className="mt-3 text-sm inline-flex items-center gap-1 text-gold">
                  {inr(t.credits)}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA strip ────────────────────────────────────────────── */}
      <section className="px-5 md:px-12 pb-24 max-w-5xl mx-auto">
        <div className="lux-glass p-7 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-5 justify-between">
          <div>
            <span className="lux-eyebrow block mb-2">◆ Ready when you are</span>
            <h3 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--lux-text)' }}>
              Start with a free preview — pay only when you're <span className="font-script italic text-gold">in love.</span>
            </h3>
          </div>
          <Link to="/themes" className="lux-btn shrink-0" data-testid="pricing-final-cta">
            <Check className="w-4 h-4" /> Pick your design <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <noscript>
        <h2>Add-ons</h2>
        <ul>
          {addons.map((a) => <li key={a.id}>{a.label} — ₹{a.credits} — {a.description}</li>)}
        </ul>
        <h2>Link tiers</h2>
        <ul>
          {tiers.map((t) => <li key={t.id}>{t.label} ({t.days} days) — ₹{t.credits}</li>)}
        </ul>
      </noscript>
    </div>
  );
}
