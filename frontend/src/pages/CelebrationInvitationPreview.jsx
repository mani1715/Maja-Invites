/**
 * CelebrationInvitationPreview
 * -----------------------------------------------------------------------------
 * Full live-invitation preview for non-wedding categories (baby_birthday,
 * half_saree, puberty, dhoti).
 *
 * Layout mirrors the wedding DesignFullPreview:
 *   • Full-bleed blurred design image as page background (SoftDesignBackdrop)
 *   • Centered hero "invitation card" rendered like the homepage card
 *     (eyebrow + circular photo bubble + bottom cream panel with celebrant
 *     name, date and venue) — but at a larger, poster size.
 *   • A scroll-down indicator + an "Our Story" / Cherished Photos /
 *     Blessings section below.
 *   • Sticky bottom CTA: "Use this design" → buy flow.
 *
 * Route: /preview/celebration/:category   or
 *        /preview/celebration/:category/:designId
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, Sparkles, Heart, MapPin, Calendar, Send, MessageSquare, Camera, Search,
} from 'lucide-react';
import ThemeAnimatedBackground from '@/components/ThemeAnimatedBackground';
import TouchParticles from '@/components/TouchParticles';
import PetalConfetti from '@/components/luxury/PetalConfetti';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Per-category mapping to dedicated ThemeAnimatedBackground particle
// dictionaries — each non-wedding ceremony now has its OWN culturally
// resonant floating motif (balloons & cake for baby_birthday, peacock &
// bells for half_saree, turmeric blossoms & lamps for Manjal Neerattu,
// coconut leaves & jasmine for Vetti Kattum Vizha). Applied here on the
// homepage preview AND inside CelebrationPublicView on the published
// invitation link, so the cinematic feel is identical across both.
const BG_THEME_FOR_CATEGORY = {
  baby_birthday: 'baby_birthday',
  half_saree:    'half_saree',
  puberty:       'puberty',
  dhoti:         'dhoti',
};

/* ─────────────────────────────────────────────────────────────────────
   Reveal — scroll-triggered fade/slide wrapper for celebration sections.
   Mirrors the exact framer-motion pattern used on the wedding viewer
   (LuxuryPublicInvitation.jsx) so non-wedding pages animate identically.

   Critical mobile defaults (Sep 2026 parity sprint):
     • amount: 0.15  — tall sections on phones never cross 50% visibility,
                       so we must trigger sooner. The wedding viewer uses
                       0.1; 0.15 is the safe shared baseline.
     • margin '0px 0px -10% 0px' — fire slightly before the section
                       reaches the bottom of the viewport for smoother feel
                       on touch scroll (iOS Safari + Android Chrome).
     • useReducedMotion — if the OS prefers reduced motion, we collapse
                       to a plain fade so the page stays usable.
   ───────────────────────────────────────────────────────────────────── */
const Reveal = ({
  as = 'section',
  amount = 0.15,
  delay = 0,
  duration = 0.6,
  y = 24,
  children,
  ...rest
}) => {
  const reduce = useReducedMotion();
  const Tag = motion[as] || motion.section;
  return (
    <Tag
      initial={reduce ? { opacity: 1 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount, margin: '0px 0px -10% 0px' }}
      transition={{ duration, delay, ease: 'easeOut' }}
      {...rest}
    >
      {children}
    </Tag>
  );
};

const inOneMonth = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setHours(17, 30, 0, 0);
  return d;
};

const fmtDate = (d) => d.toLocaleDateString('en-IN', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

/* ─────────────────────────────────────────────────────────────────────
   Per-category presentation tokens — palette + sample text.
   Mirrors NonWeddingDesignCard so the live preview is visually
   consistent with the homepage card the user clicks from.
   ───────────────────────────────────────────────────────────────────── */
const CATEGORY_TOKENS = {
  baby_birthday: {
    label: 'Baby Birthday',
    eyebrow: 'First Birthday',
    familyLine: 'With Blessings From Our Family',
    accent: '#FF69B4',
    panelTint: 'rgba(255,235,243,0.94)',
    panelText: '#3B1E2B',
    celebrant: 'Manvi Sharma',
    nickname: 'Mini',
    parents: 'Aakash Sharma & Priya Sharma',
    date: inOneMonth(),
    venue: 'The Royal Banquet · Hyderabad',
    photo: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&q=80&fit=crop',
    story:
      'A year ago, our world was transformed by a tiny pair of footsteps and the brightest of smiles. ' +
      'Manvi has grown into our little sunshine — from her first giggle, to her first tooth, to her first ' +
      'wobbly step. Come help us celebrate one full year of joy, laughter and unconditional love.',
    extraPhotos: [
      'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=600&q=80&fit=crop',
      'https://images.unsplash.com/photo-1492725764893-90b379c2b6e7?w=600&q=80&fit=crop',
      'https://images.unsplash.com/photo-1544027993-37dbfe43562a?w=600&q=80&fit=crop',
    ],
    closing: "Your blessings are her greatest gift. We can't wait to celebrate with you.",
  },
  half_saree: {
    label: 'Half Saree Ceremony',
    eyebrow: 'Half Saree Ceremony',
    familyLine: 'Together With Our Family',
    accent: '#C71585',
    panelTint: 'rgba(255,232,243,0.94)',
    panelText: '#3B0F2B',
    celebrant: 'Meera Karthik',
    nickname: '',
    parents: 'Karthik Iyer & Lakshmi Iyer',
    date: inOneMonth(),
    venue: 'Sri Krishna Kalyana Mandapam · Chennai',
    photo: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&q=80&fit=crop',
    story:
      'Today our little girl steps into a new chapter — draped in her first half-saree, blessed by ' +
      'family, music and tradition. From plaits of jasmine to silk and gold, every detail tells a story ' +
      'of love. We invite you to share this sacred moment with us.',
    extraPhotos: [
      'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&q=80&fit=crop',
      'https://images.unsplash.com/photo-1583394293214-28ded15ee548?w=600&q=80&fit=crop',
      'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=600&q=80&fit=crop',
    ],
    closing: 'Bless our Meera with your love, presence and prayers.',
  },
  puberty: {
    label: 'Puberty Ceremony',
    eyebrow: 'Manjal Neerattu',
    familyLine: 'With Blessings From Our Family',
    accent: '#FF8C00',
    panelTint: 'rgba(255,240,224,0.94)',
    panelText: '#3B1F0F',
    celebrant: 'Anika Sundar',
    nickname: '',
    parents: 'Sundar Murali & Priya Sundar',
    date: inOneMonth(),
    venue: 'Sri Meenakshi Mandapam · Coimbatore',
    photo: 'https://images.unsplash.com/photo-1631049551717-1a2d5c52ca7d?w=400&q=80&fit=crop',
    story:
      'Our daughter has reached a sacred milestone. Surrounded by turmeric, blessings and family, ' +
      'we mark this beautiful coming-of-age — a threshold between childhood and grace. Join us in ' +
      'showering Anika with your warmest wishes.',
    extraPhotos: [
      'https://images.unsplash.com/photo-1631049551717-1a2d5c52ca7d?w=600&q=80&fit=crop',
      'https://images.unsplash.com/photo-1583394293214-28ded15ee548?w=600&q=80&fit=crop',
      'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&q=80&fit=crop',
    ],
    closing: 'Your blessings light the path ahead.',
  },
  dhoti: {
    label: 'Dhoti Ceremony',
    eyebrow: 'Vetti Kattum Vizha',
    familyLine: 'Together With Our Family',
    accent: '#7B68EE',
    panelTint: 'rgba(232,232,255,0.94)',
    panelText: '#1A1A3B',
    celebrant: 'Arjun Vasanth',
    nickname: '',
    parents: 'Vasanth Krishnan & Geetha Vasanth',
    date: inOneMonth(),
    venue: 'Anjaneyar Temple Mandapam · Madurai',
    photo: 'https://images.unsplash.com/photo-1543342384-1f1350e27861?w=400&q=80&fit=crop',
    story:
      'Today our young man dons the dhoti for the first time — a proud moment of tradition, family ' +
      "and growing up. From childhood's small steps to standing tall in our heritage, we celebrate " +
      "every chapter of Arjun's journey. Be with us as he begins this new one.",
    extraPhotos: [
      'https://images.unsplash.com/photo-1543342384-1f1350e27861?w=600&q=80&fit=crop',
      'https://images.unsplash.com/photo-1576675784201-0e142b423952?w=600&q=80&fit=crop',
      'https://images.unsplash.com/photo-1607113256158-56a934936ef1?w=600&q=80&fit=crop',
    ],
    closing: 'Your presence is our pride.',
  },
};

const resolveImg = (u) => {
  if (!u) return '';
  if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('blob:')) return u;
  return `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`;
};

/* SoftDesignBackdrop — the SAME design image extended to a soft, blurred
   full-viewport background. Lifted from DesignFullPreview so the look
   matches wedding previews exactly. */
const SoftDesignBackdrop = ({ image, accent }) => {
  if (!image) {
    return (
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse at top left, ${accent}1F 0%, transparent 55%),
                     radial-gradient(ellipse at bottom right, ${accent}14 0%, transparent 60%),
                     #1A130B`,
      }} />
    );
  }
  return (
    <>
      <img aria-hidden src={image} alt="" draggable={false} loading="eager" decoding="async"
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          width: '100%', height: '100%', objectFit: 'cover',
          filter: 'blur(18px) saturate(1.1)',
          transform: 'scale(1.1)',
          opacity: 0.85,
          willChange: 'transform',
        }}
        data-testid="celebration-preview-backdrop"
      />
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(11,9,8,0.25) 0%, rgba(11,9,8,0.55) 100%)',
      }} />
      <div aria-hidden style={{
        position: 'fixed', left: '4vw', top: '40vh',
        width: 240, height: 240, zIndex: 1, pointerEvents: 'none',
        background: `radial-gradient(circle, ${accent}40 0%, transparent 70%)`,
        filter: 'blur(24px)',
      }} />
      <div aria-hidden style={{
        position: 'fixed', right: '4vw', top: '55vh',
        width: 280, height: 280, zIndex: 1, pointerEvents: 'none',
        background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`,
        filter: 'blur(26px)',
      }} />
    </>
  );
};

/* HeroInvitationCard — the centered "poster" with design as card background,
   eyebrow at top, circular celebrant photo bubble, and bottom cream/tinted
   panel with family line, big serif celebrant name, date and venue.
   Visually matches NonWeddingDesignCard but at poster scale. */

/* ─────────────────────────────────────────────────────────────────────
   CelebrationOpening — full-screen 2.5 s cinematic intro that mirrors
   the wedding `ZoomInOpening`, but for a single celebrant.

   Background  = the design image (so you immediately recognize the
                 design before the invitation appears).
   Foreground  = eyebrow (e.g. "FIRST BIRTHDAY") + the celebrant name
                 in luxe serif + the date underneath.
   ───────────────────────────────────────────────────────────────────── */
const CelebrationOpening = ({ image, token, onComplete }) => {
  useEffect(() => {
    if (!onComplete) return undefined;
    // Tightened from 2500ms → 1400ms so the page never feels blank at the
    // top of the link. Content is mounted underneath this overlay already
    // (see openingDone gate removal below), so as soon as the curtain
    // fades the hero card is already in place.
    const t = setTimeout(() => onComplete(), 1400);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <motion.div
      role="presentation"
      data-testid="celebration-opening"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, overflow: 'hidden',
        background: '#0A0707',
      }}
    >
      {/* Zooming design background */}
      <motion.div
        initial={{ scale: 1.18 }} animate={{ scale: 1.0 }}
        transition={{ duration: 2.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url("${image || token.photo}")`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }}
      />
      <div style={{
        position: 'absolute', inset: 0,
        background:
          'radial-gradient(ellipse at center, rgba(8,5,11,0.18) 0%, rgba(8,5,11,0.6) 55%, rgba(8,5,11,0.9) 100%)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        textAlign: 'center', padding: '0 24px',
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div style={{
            fontFamily: 'Cinzel, "Cormorant Garamond", serif',
            fontSize: 'clamp(12px, 1.6vw, 14px)',
            letterSpacing: '0.55em', textTransform: 'uppercase',
            color: token.accent,
            textShadow: '0 1px 8px rgba(0,0,0,0.55)',
            marginBottom: 14,
          }}>
            ◇ {token.eyebrow} ◇
          </div>
          <div style={{
            fontFamily: 'Cinzel, "Cormorant Garamond", serif', fontWeight: 500,
            fontSize: 'clamp(34px, 7vw, 80px)', lineHeight: 1.05,
            letterSpacing: '0.04em', color: '#FFF8DC',
            textShadow: `0 2px 18px rgba(0,0,0,0.6), 0 0 60px ${token.accent}33`,
          }}>
            {token.celebrant}
          </div>
          {token.nickname && (
            <div style={{
              fontFamily: '"Great Vibes", "Pinyon Script", cursive',
              fontSize: 'clamp(24px, 4.5vw, 48px)', color: token.accent,
              margin: '6px 0 2px', textShadow: '0 2px 18px rgba(0,0,0,0.5)',
            }}>
              “{token.nickname}”
            </div>
          )}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 1.0 }}
            style={{
              marginTop: 22, fontFamily: 'Cinzel, serif',
              fontSize: 'clamp(11px, 1.6vw, 14px)',
              letterSpacing: '0.4em', textTransform: 'uppercase',
              color: 'rgba(255,248,220,0.85)',
            }}
          >
            {fmtDate(token.date)}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};

/* ─────────────────────────────────────────────────────────────────────
   Countdown — live D/H/M/S until the celebration date.
   Uses useSyncExternalStore so the strict React-19 purity lint stays
   happy while the cells still tick every second.
   ───────────────────────────────────────────────────────────────────── */
const tickStore = (() => {
  const listeners = new Set();
  let timer = null;
  const ensureTimer = () => {
    if (timer || listeners.size === 0) return;
    timer = setInterval(() => listeners.forEach((l) => l()), 1000);
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      ensureTimer();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer) { clearInterval(timer); timer = null; }
      };
    },
    getSnapshot() { return Date.now(); },
  };
})();

const useCountdown = (target) => {
  const now = React.useSyncExternalStore(tickStore.subscribe, tickStore.getSnapshot, tickStore.getSnapshot);
  const diff = Math.max(0, target.getTime() - now);
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
};

const CountdownBlock = ({ token, accent }) => {
  const { d, h, m, s } = useCountdown(token.date);
  const cell = (label, value) => (
    <div className="text-center px-3 md:px-5 py-3 rounded-xl min-w-[68px] md:min-w-[88px]"
      style={{ background: 'rgba(11,9,8,0.7)', border: `1px solid ${accent}55` }}>
      <div className="font-display text-2xl md:text-4xl"
        style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
        {String(value).padStart(2, '0')}
      </div>
      <div className="text-[9px] md:text-[10px] tracking-[0.3em] uppercase mt-1"
        style={{ color: `${accent}` }}>
        {label}
      </div>
    </div>
  );
  return (
    <div className="max-w-3xl mx-auto text-center" data-testid="celebration-preview-countdown">
      <span className="block text-[10px] tracking-[0.42em] uppercase mb-3" style={{ color: accent }}>
        ◆ Counting down to the day
      </span>
      <h3 className="font-display text-3xl md:text-4xl leading-tight mb-7"
        style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
        Save the date.
      </h3>
      <div className="flex items-center justify-center gap-2 md:gap-4">
        {cell('Days', d)}
        {cell('Hours', h)}
        {cell('Minutes', m)}
        {cell('Seconds', s)}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────
   EventDetails — date/time/venue block with a Google-Maps deep link.
   ───────────────────────────────────────────────────────────────────── */
const EventDetails = ({ token, accent }) => {
  const mapsHref = `https://www.google.com/maps/search/${encodeURIComponent(token.venue)}`;
  return (
    <div className="max-w-3xl mx-auto" data-testid="celebration-preview-event-details">
      <span className="block text-[10px] tracking-[0.42em] uppercase mb-3 text-center"
        style={{ color: accent }}>
        ◆ When &amp; Where
      </span>
      <h3 className="text-center font-display text-3xl md:text-4xl leading-tight mb-8"
        style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
        We would love to have you with us.
      </h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl px-5 py-6"
          style={{ background: 'rgba(11,9,8,0.78)', border: `1px solid ${accent}44` }}>
          <Calendar className="w-5 h-5 mb-2" style={{ color: accent }} />
          <div className="text-[10px] tracking-[0.3em] uppercase opacity-75 mb-1">Date</div>
          <div className="text-lg" style={{ color: '#FFF8DC' }}>{fmtDate(token.date)}</div>
          <div className="text-sm mt-1" style={{ color: 'rgba(255,248,220,0.85)' }}>
            {token.date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </div>
        </div>
        <div className="rounded-xl px-5 py-6"
          style={{ background: 'rgba(11,9,8,0.78)', border: `1px solid ${accent}44` }}>
          <MapPin className="w-5 h-5 mb-2" style={{ color: accent }} />
          <div className="text-[10px] tracking-[0.3em] uppercase opacity-75 mb-1">Venue</div>
          <div className="text-lg" style={{ color: '#FFF8DC' }}>{token.venue}</div>
          <a href={mapsHref} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] tracking-[0.25em] uppercase mt-3"
            style={{ color: accent }} data-testid="celebration-preview-map-link">
            Open in Google Maps →
          </a>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────
   RSVPDemo — visual demo of the RSVP form. In real invitations this
   posts to /api/invitations/{slug}/rsvp, but on the preview page we
   just show a confirmation toast so couples can experience the flow.
   ───────────────────────────────────────────────────────────────────── */
const RSVPDemo = ({ token, accent }) => {
  const [form, setForm] = useState({ name: '', count: 1, attending: 'yes', message: '' });
  const [sent, setSent] = useState(false);
  const onSubmit = (e) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => setSent(false), 4500);
  };
  return (
    <div className="max-w-xl mx-auto" data-testid="celebration-preview-rsvp">
      <span className="block text-[10px] tracking-[0.42em] uppercase mb-3 text-center"
        style={{ color: accent }}>
        ◆ Will you be there?
      </span>
      <h3 className="text-center font-display text-3xl md:text-4xl leading-tight mb-7"
        style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
        Kindly <span style={{ color: accent, fontStyle: 'italic' }}>respond.</span>
      </h3>
      <form onSubmit={onSubmit} className="rounded-2xl px-6 py-7 space-y-4"
        style={{ background: 'rgba(11,9,8,0.82)', border: `1px solid ${accent}44`, backdropFilter: 'blur(8px)' }}>
        <label className="block">
          <span className="text-[10px] tracking-[0.3em] uppercase opacity-80">Your name</span>
          <input type="text" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full mt-1.5 px-3 py-2.5 rounded-md text-[15px] outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#FFF8DC',
              border: `1px solid ${accent}55`, fontFamily: '"Cormorant Garamond", serif' }}
            data-testid="rsvp-name" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] tracking-[0.3em] uppercase opacity-80">Guests</span>
            <input type="number" min={1} max={20} value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value })}
              className="w-full mt-1.5 px-3 py-2.5 rounded-md text-[15px] outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#FFF8DC',
                border: `1px solid ${accent}55` }}
              data-testid="rsvp-count" />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-[0.3em] uppercase opacity-80">Attending</span>
            <select value={form.attending}
              onChange={(e) => setForm({ ...form, attending: e.target.value })}
              className="w-full mt-1.5 px-3 py-2.5 rounded-md text-[15px] outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#FFF8DC',
                border: `1px solid ${accent}55` }}
              data-testid="rsvp-attending">
              <option value="yes" style={{ background: '#0b0908' }}>Joyfully accepts</option>
              <option value="no" style={{ background: '#0b0908' }}>Regretfully declines</option>
              <option value="maybe" style={{ background: '#0b0908' }}>Trying my best</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-[10px] tracking-[0.3em] uppercase opacity-80">A note (optional)</span>
          <textarea rows={3} value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="w-full mt-1.5 px-3 py-2.5 rounded-md text-[15px] outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#FFF8DC',
              border: `1px solid ${accent}55`, fontFamily: '"Cormorant Garamond", serif' }}
            placeholder={`A blessing for ${token.celebrant.split(' ')[0]}…`}
            data-testid="rsvp-message" />
        </label>
        <button type="submit"
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md text-[11px] tracking-[0.3em] uppercase font-medium"
          style={{ background: accent, color: '#16110C', border: `1px solid ${accent}` }}
          data-testid="rsvp-send">
          Send RSVP <Send className="w-3.5 h-3.5" />
        </button>
        <AnimatePresence>
          {sent && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-center text-[11px] tracking-[0.25em] uppercase"
              style={{ color: accent }} data-testid="rsvp-confirmation">
              ✓ Thank you — your RSVP has been received (preview mode).
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────
   BlessingsWall — sample wishes feed + add-your-own form (preview mode
   only stores in local component state).
   ───────────────────────────────────────────────────────────────────── */
const SAMPLE_BLESSINGS_FOR = (celebrantFirst) => [
  { name: 'Vinitha Aunty', text: `Many many happy wishes to little ${celebrantFirst}! May this year bring health, laughter and a lifetime of beautiful memories. 💕` },
  { name: 'Karthik Mama',  text: `Bless you, ${celebrantFirst}. Always remember that the whole family is rooting for you — today and every day after.` },
  { name: 'Anu',           text: `So so so excited for ${celebrantFirst}! See you at the celebration ✨` },
];

const BlessingsWall = ({ token, accent }) => {
  const reduce = useReducedMotion();
  const initial = useMemo(() => SAMPLE_BLESSINGS_FOR(token.celebrant.split(' ')[0]), [token.celebrant]);
  const [wishes, setWishes] = useState(initial);
  const [draft, setDraft] = useState({ name: '', text: '' });

  const addWish = (e) => {
    e.preventDefault();
    if (!draft.name.trim() || !draft.text.trim()) return;
    setWishes((w) => [{ name: draft.name.trim(), text: draft.text.trim() }, ...w]);
    setDraft({ name: '', text: '' });
  };

  return (
    <div className="max-w-3xl mx-auto" data-testid="celebration-preview-blessings">
      <span className="block text-[10px] tracking-[0.42em] uppercase mb-3 text-center"
        style={{ color: accent }}>
        ◆ Blessings &amp; Wishes
      </span>
      <h3 className="text-center font-display text-3xl md:text-4xl leading-tight mb-7"
        style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
        A wall of love.
      </h3>

      <form onSubmit={addWish} className="rounded-2xl px-5 py-5 mb-6 grid sm:grid-cols-[1fr_2fr_auto] gap-2"
        style={{ background: 'rgba(11,9,8,0.78)', border: `1px solid ${accent}44` }}>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Your name"
          className="px-3 py-2.5 rounded-md text-[14px] outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#FFF8DC', border: `1px solid ${accent}55` }}
          data-testid="wish-name" />
        <input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          placeholder={`Share a wish for ${token.celebrant.split(' ')[0]}…`}
          className="px-3 py-2.5 rounded-md text-[14px] outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#FFF8DC', border: `1px solid ${accent}55` }}
          data-testid="wish-text" />
        <button type="submit"
          className="px-4 py-2.5 rounded-md text-[11px] tracking-[0.25em] uppercase font-medium inline-flex items-center justify-center gap-1.5"
          style={{ background: accent, color: '#16110C', border: `1px solid ${accent}` }}
          data-testid="wish-add">
          <MessageSquare className="w-3.5 h-3.5" /> Send
        </button>
      </form>

      <div className="space-y-3">
        {wishes.map((w, i) => (
          <motion.div key={`${w.name}-${i}`}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15, margin: '0px 0px -10% 0px' }}
            transition={{ duration: 0.55, delay: Math.min(0.04 * i, 0.6), ease: 'easeOut' }}
            className="rounded-xl px-5 py-4"
            style={{ background: 'rgba(11,9,8,0.72)', border: `1px solid ${accent}33` }}>
            <div className="text-[10px] tracking-[0.3em] uppercase mb-1"
              style={{ color: accent }}>{w.name}</div>
            <p className="text-[14px] leading-relaxed" style={{ color: 'rgba(255,248,220,0.88)' }}>
              {w.text}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────
   Shared wedding-style primitives, copied 1:1 from DesignFullPreview so
   non-wedding sections render with the exact same visual language.
   ───────────────────────────────────────────────────────────────────── */
const PAGE_BG = '#1A130B';           // matches wedding default pageBg
const TEXT_ON_BG = '#FFF8DC';
const MUTED_TEXT = 'rgba(255,248,220,0.85)';
const HEADING_FONT = '"Cormorant Garamond", serif';

const Panel = ({ accent, testId, children }) => (
  <Reveal
    as="section"
    data-testid={testId}
    className="relative px-6 md:px-16"
    style={{ paddingTop: '4.5rem', paddingBottom: '4.5rem' }}
  >
    <div
      className="max-w-3xl mx-auto rounded-2xl px-6 md:px-10 py-8 md:py-10"
      style={{
        background: `${PAGE_BG}CC`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${accent}44`,
        boxShadow: '0 16px 50px rgba(0,0,0,0.10)',
      }}
    >
      {children}
    </div>
  </Reveal>
);

const Eyebrow = ({ accent, children }) => (
  <div className="text-[10px] tracking-[0.4em] uppercase mb-3" style={{ color: accent }}>{children}</div>
);

const SectionHeading = ({ children }) => (
  <h2 className="leading-tight"
    style={{ fontFamily: HEADING_FONT, color: TEXT_ON_BG, fontSize: 'clamp(1.6rem, 3.2vw, 2.5rem)' }}>
    {children}
  </h2>
);

const PillButton = ({ accent, children, onClick, testId }) => (
  <button type="button" onClick={onClick}
    className="text-[11px] tracking-[0.3em] uppercase px-5 py-2.5 rounded-md inline-flex items-center gap-2"
    style={{ color: PAGE_BG, background: accent }}
    data-testid={testId}>
    {children}
  </button>
);

/* ─────────────────────────────────────────────────────────────────────
   LivePhotoWall — mirrors the wedding `live-photo-wall-section` Panel
   from DesignFullPreview exactly. Eyebrow + heading with italic script
   accent + short description + gold pill CTA.
   ───────────────────────────────────────────────────────────────────── */
const LivePhotoWall = ({ accent, eventLabel }) => (
  <Panel accent={accent} testId="celebration-preview-live-photo-wall">
    <Eyebrow accent={accent}>◆ Live Photo Wall</Eyebrow>
    <SectionHeading>
      Photos appear{' '}
      <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>live.</em>
    </SectionHeading>
    <p className="mt-3 text-sm" style={{ color: MUTED_TEXT }}>
      The photographer&apos;s hand-picked moments stream here as the {eventLabel.toLowerCase()} unfolds.
    </p>
    <div className="mt-4">
      <PillButton accent={accent} testId="celebration-live-wall-cta">
        <Camera className="w-3.5 h-3.5" /> View live wall
      </PillButton>
    </div>
  </Panel>
);

/* ─────────────────────────────────────────────────────────────────────
   FindMyPhotos — mirrors the wedding `find-photos-section` Panel from
   DesignFullPreview exactly.
   ───────────────────────────────────────────────────────────────────── */
const FindMyPhotos = ({ accent, eventLabel }) => (
  <Panel accent={accent} testId="celebration-preview-find-photos">
    <Eyebrow accent={accent}>◆ Your photos</Eyebrow>
    <SectionHeading>
      Get{' '}
      <em style={{ color: accent, fontFamily: '"Great Vibes", cursive', fontStyle: 'italic' }}>your photos</em>{' '}
      from the {eventLabel.toLowerCase()}.
    </SectionHeading>
    <p className="mt-3 text-sm" style={{ color: MUTED_TEXT }}>
      Upload one selfie and share your contact — we’ll send you every photo you’re in.
    </p>
    <div className="mt-4">
      <PillButton accent={accent} testId="celebration-find-photos-cta">
        <Search className="w-3.5 h-3.5" /> Get Your Photos
      </PillButton>
    </div>
  </Panel>
);

/* ─────────────────────────────────────────────────────────────────────
   CelebrationClosing — in-flow "Thank you for visiting" cinematic outro.
   Sits above the footer. Trigger on intersection so it plays once the
   guest has scrolled all the way through.
   ───────────────────────────────────────────────────────────────────── */
const CelebrationClosing = ({ image, token, accent }) => {
  const ref = useRef(null);
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setPlayed(true); });
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative overflow-hidden"
      style={{ minHeight: '80vh' }} data-testid="celebration-closing">
      {/* Slow reverse Ken-Burns over the design image */}
      <motion.div
        initial={{ scale: 1.06, opacity: 0 }}
        animate={played ? { scale: 1.18, opacity: 0.55 } : { scale: 1.06, opacity: 0 }}
        transition={{ duration: 6, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url("${image || token.photo}")`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'saturate(0.9)',
        }}
      />
      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background:
          'radial-gradient(ellipse at center, rgba(8,5,11,0.35) 0%, rgba(8,5,11,0.78) 60%, rgba(8,5,11,0.96) 100%)',
      }} />
      {/* Petal-like drifting dots */}
      {played && Array.from({ length: 18 }).map((_, i) => (
        <motion.span key={i}
          initial={{ y: -20, x: 0, opacity: 0 }}
          animate={{
            y: '90vh',
            x: (i % 2 ? 1 : -1) * (30 + (i % 4) * 25),
            opacity: [0, 0.9, 0.9, 0],
            rotate: 360,
          }}
          transition={{ duration: 5.5 + (i % 3) * 0.7, delay: i * 0.18, ease: 'linear' }}
          style={{
            position: 'absolute', left: `${6 + i * 5}%`, top: 0,
            width: 12, height: 9,
            borderRadius: '70% 30% 70% 30%',
            background: accent,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            opacity: 0.85,
          }}
        />
      ))}
      <div className="relative grid place-items-center text-center px-6"
        style={{ minHeight: '80vh', zIndex: 5 }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={played ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 1.4, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div style={{
            fontFamily: 'Cinzel, serif',
            fontSize: 'clamp(11px, 1.6vw, 14px)',
            letterSpacing: '0.5em', textTransform: 'uppercase',
            color: accent, marginBottom: 18,
          }}>
            With all our love
          </div>
          <div style={{
            fontFamily: '"Cormorant Garamond", serif', fontWeight: 600,
            fontSize: 'clamp(28px, 5.4vw, 64px)', lineHeight: 1.12,
            color: '#FFF8DC',
            textShadow: '0 2px 18px rgba(0,0,0,0.55)',
            maxWidth: '20ch',
            margin: '0 auto',
          }}>
            Your presence is enough for us. Thank you.
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={played ? {
              opacity: [0, 1, 1],
              scale: [0.85, 1.08, 1.0],
              textShadow: [
                '0 0 0px rgba(255,248,220,0)',
                `0 0 36px ${accent}AA`,
                `0 0 18px ${accent}88`,
              ],
            } : { opacity: 0, scale: 0.85 }}
            transition={{ duration: 2.2, delay: 1.4, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontFamily: '"Great Vibes", "Pinyon Script", cursive',
              fontSize: 'clamp(34px, 6.5vw, 72px)', color: accent,
              marginTop: 22, letterSpacing: '0.01em',
            }}
            data-testid="closing-celebrant-signature"
          >
            — {token.celebrant} —
          </motion.div>
          <div style={{
            marginTop: 22, fontFamily: 'Cinzel, serif',
            fontSize: 'clamp(11px, 1.5vw, 13px)',
            letterSpacing: '0.42em', textTransform: 'uppercase',
            color: 'rgba(255,248,220,0.8)',
          }}>
            {fmtDate(token.date)} · {token.venue}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

/* HeroInvitationCard — the centered "poster" with design as card background,
   eyebrow at top, circular celebrant photo bubble, and bottom cream/tinted
   panel with family line, big serif celebrant name, date and venue.
   Visually matches NonWeddingDesignCard but at poster scale. */
const HeroInvitationCard = ({ design, token }) => {
  const baseImg = resolveImg(design?.preview_image || design?.thumbnail);
  return (
    <div className="relative mx-auto overflow-hidden rounded-2xl"
      style={{
        width: 'min(560px, 92vw)',
        aspectRatio: '3 / 4',
        background: '#161210',
        boxShadow: '0 40px 80px rgba(0,0,0,0.45), 0 12px 28px rgba(0,0,0,0.25)',
        border: '1px solid rgba(212,175,55,0.18)',
      }}
      data-testid="celebration-preview-hero-card"
    >
      {/* Base design art */}
      {baseImg && (
        <img src={baseImg} alt={design?.name || token.label}
          className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* Soft top wash so the eyebrow stays readable */}
      <div aria-hidden className="absolute top-0 inset-x-0 h-28 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 100%)' }} />

      {/* Eyebrow */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="absolute top-6 inset-x-0 text-center px-4 z-10"
      >
        <span className="font-display text-xs sm:text-sm tracking-[0.42em] uppercase"
          style={{ color: token.panelText, textShadow: '0 1px 6px rgba(255,255,255,0.5)' }}>
          ◇ {token.eyebrow} ◇
        </span>
      </motion.div>

      {/* Photo bubble — outer wrapper does the absolute centering so that
          framer-motion's animated transform (scale) doesn't clobber the
          translateX(-50%) used for horizontal centering. */}
      <div className="absolute z-10"
        style={{
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          className="relative"
        >
          <div className="rounded-full overflow-hidden"
            style={{
              width: 'min(40vw, 156px)',
              height: 'min(40vw, 156px)',
              border: `4px solid ${token.accent}`,
              boxShadow: '0 8px 28px rgba(0,0,0,0.45), inset 0 0 0 4px rgba(255,255,255,0.95)',
              background: '#fff',
            }}>
            <img src={token.photo} alt={token.celebrant}
              className="w-full h-full"
              style={{ objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          </div>
          <div aria-hidden className="absolute -inset-2 rounded-full pointer-events-none"
            style={{ border: `1.5px dashed ${token.accent}80` }} />
        </motion.div>
      </div>

      {/* Bottom cream / tinted invitation panel */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
        className="absolute bottom-0 inset-x-0 px-5 pt-16 pb-8 text-center"
        style={{
          background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${token.panelTint} 38%, ${token.panelTint} 100%)`,
        }}
      >
        <span className="block text-[10px] sm:text-xs tracking-[0.32em] uppercase mb-2"
          style={{ color: `${token.panelText}AA` }}>
          {token.familyLine}
        </span>
        <h2 className="font-display leading-tight"
          style={{
            color: token.panelText,
            fontFamily: '"Cormorant Garamond", serif',
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}>
          {token.celebrant}
        </h2>
        {token.nickname && (
          <p className="italic mt-1" style={{ color: token.panelText, opacity: 0.7,
            fontFamily: '"Cormorant Garamond", serif', fontSize: 'clamp(0.95rem, 1.6vw, 1.15rem)' }}>
            “{token.nickname}”
          </p>
        )}
        <span className="block text-[11px] sm:text-xs tracking-[0.28em] uppercase mt-3"
          style={{ color: token.panelText }}>
          {fmtDate(token.date)}
        </span>
        <span className="block text-[10px] sm:text-[11px] tracking-[0.22em] uppercase mt-1.5"
          style={{ color: `${token.panelText}AA` }}>
          {token.venue}
        </span>
        <span className="block text-[9px] sm:text-[10px] tracking-[0.32em] uppercase mt-3"
          style={{ color: `${token.panelText}77` }}>
          Beloved child of {token.parents}
        </span>
      </motion.div>
    </div>
  );
};

/* Module-level cache so the design fetch is shared across mounts and
   the effect below doesn't need to call setState from an async path. */
const designCache = new Map(); // key: category → designs[]
const fetchPromises = new Map();

const loadDesignsForCategory = (category) => {
  if (designCache.has(category)) return Promise.resolve(designCache.get(category));
  if (fetchPromises.has(category)) return fetchPromises.get(category);
  const p = axios
    .get(`${API_URL}/api/event-categories/${category}/designs`)
    .then((res) => {
      const designs = res?.data?.designs || [];
      designCache.set(category, designs);
      return designs;
    })
    .catch(() => {
      designCache.set(category, []);
      return [];
    })
    .finally(() => { fetchPromises.delete(category); });
  fetchPromises.set(category, p);
  return p;
};

const CelebrationInvitationPreview = () => {
  const { category, designId } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const token = CATEGORY_TOKENS[category] || CATEGORY_TOKENS.baby_birthday;
  const accent = token.accent;

  // Opening animation: plays once on first mount per session-per-category.
  // Stored in sessionStorage so navigating between designs in the same
  // category doesn't replay the intro, but a fresh tab will see it.
  const sessionKey = `celeb_open_seen_${category || 'x'}`;
  const alreadySeen = typeof window !== 'undefined' && window.sessionStorage?.getItem(sessionKey) === '1';
  const [openingDone, setOpeningDone] = useState(alreadySeen);
  const finishOpening = () => {
    try { window.sessionStorage.setItem(sessionKey, '1'); } catch (_) { /* ignore */ }
    setOpeningDone(true);
  };

  // Trigger a load if needed; the actual state update happens via the
  // resolved-promise callback below, which is NOT inside an effect.
  const cached = category ? designCache.get(category) : [];
  const [designs, setDesigns] = useState(cached);

  if (category && !designCache.has(category) && !fetchPromises.has(category)) {
    loadDesignsForCategory(category).then(setDesigns);
  } else if (category && !cached && fetchPromises.has(category)) {
    fetchPromises.get(category).then(setDesigns);
  }

  const designMeta = useMemo(() => {
    if (!designs || designs.length === 0) return null;
    if (designId) return designs.find((d) => d.design_id === designId) || designs[0];
    return designs[0];
  }, [designs, designId]);

  const loading = !designs;

  const backdropImg = useMemo(
    () => resolveImg(designMeta?.preview_image || designMeta?.thumbnail),
    [designMeta],
  );

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/');
  };

  const goBuy = () => {
    const id = designMeta?.design_id || designId;
    if (!id) { navigate('/'); return; }
    navigate(`/user/buy-celebration/${category}/${encodeURIComponent(id)}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: '#0b0908', color: '#FFF8DC' }}>
        <div className="text-xs tracking-[0.3em] uppercase opacity-70">Loading preview…</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen"
      style={{ background: '#0b0908', color: '#FFF8DC' }}
      data-testid="celebration-invitation-preview-page"
      data-category={category}
    >
      {/* Ambient themed particle canvas — each non-wedding category now
          has its OWN dedicated particle dictionary in ThemeAnimatedBackground
          (balloons / peacock / turmeric / coconut motifs). Same canvas
          appears on the published invitation link so guests see the
          identical cinematic ambience the photographer previewed. */}
      <ThemeAnimatedBackground theme={BG_THEME_FOR_CATEGORY[category] || 'baby_birthday'} />

      {/* Interactive touch / mouse-move particle bursts — category-specific
          motifs (balloons, peacock, turmeric flowers, coconut leaves) fly
          out wherever the guest taps or moves the cursor. Mounted only
          after the opening curtain finishes so the heaviest paints don't
          land at the same moment. */}
      {openingDone && (
        <TouchParticles theme={BG_THEME_FOR_CATEGORY[category] || 'baby_birthday'} />
      )}

      {/* Celebratory petal burst when the opening curtain finishes. */}
      <PetalConfetti
        trigger={openingDone}
        count={32}
        duration={5200}
        palette={[token.accent, token.primary || token.accent, '#FFF8DC']}
      />

      {/* Cinematic opening — plays once per session-per-category */}
      <AnimatePresence>
        {!openingDone && (
          <CelebrationOpening
            image={backdropImg}
            token={token}
            onComplete={finishOpening}
          />
        )}
      </AnimatePresence>

      {/* Full-bleed design backdrop (blurred) */}
      <SoftDesignBackdrop image={backdropImg} accent={accent} />

      {/* All page content is mounted IMMEDIATELY (not gated by openingDone)
          so the hero card is already laid out underneath the curtain. When
          the curtain fades after 1.4 s the user sees a populated page, not
          a blank scroll area. Sections use `whileInView` with `once: true`
          which still fires correctly because the wrapper isn't opacity-0
          while hidden — it's just visually covered by the opening overlay. */}
      <>
      {/* Top controls */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 md:px-10 py-4"
        style={{
          background: 'linear-gradient(180deg, rgba(11,9,8,0.85) 0%, rgba(11,9,8,0) 100%)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <button onClick={goBack}
          className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase px-3 py-2 rounded-md"
          style={{ color: '#FFF8DC', background: 'rgba(11,9,8,0.8)', border: `1px solid ${accent}55` }}
          data-testid="celebration-preview-back"
        >
          <ArrowLeft className="w-4 h-4" /> Designs
        </button>
        <div className="hidden sm:block text-[10px] tracking-[0.32em] uppercase"
          style={{ color: 'rgba(255,248,220,0.85)' }}>
          ◆ Preview · {token.label}
        </div>
        <button onClick={goBuy}
          className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase px-4 py-2 rounded-md font-medium"
          style={{ color: '#16110C', background: accent, border: `1px solid ${accent}` }}
          data-testid="celebration-preview-use-design"
        >
          <Sparkles className="w-3.5 h-3.5" /> Use this design
        </button>
      </div>

      {/* HERO — centered invitation card on the blurred design backdrop */}
      <main className="relative z-10" style={{ paddingTop: 90 }}>
        <section className="px-5 md:px-12 pt-10 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
            style={{
              filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.35))',
            }}
          >
            <HeroInvitationCard design={designMeta || {}} token={token} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} transition={{ delay: 1.4, duration: 0.8 }}
            className="text-center mt-10"
          >
            <span className="text-[10px] tracking-[0.5em] uppercase"
              style={{ color: accent }}>
              ▾ Scroll for the full story
            </span>
          </motion.div>
        </section>

        {/* OUR STORY */}
        <Reveal as="section" className="px-5 md:px-12 py-16">
          <div className="max-w-3xl mx-auto rounded-2xl px-7 md:px-12 py-10 md:py-12"
            style={{
              background: 'rgba(11,9,8,0.78)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${accent}44`,
            }}
            data-testid="celebration-preview-story"
          >
            <span className="block text-[10px] tracking-[0.42em] uppercase mb-3 text-center"
              style={{ color: accent }}>
              ◆ Our Story
            </span>
            <h3 className="text-center font-display text-3xl md:text-4xl leading-tight mb-4"
              style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
              A moment we will hold forever.
            </h3>
            <p className="text-[1rem] md:text-[1.05rem] leading-relaxed text-center"
              style={{ color: 'rgba(255,248,220,0.82)' }}>
              {token.story}
            </p>
          </div>
        </Reveal>

        {/* COUNTDOWN */}
        <Reveal as="section" className="px-5 md:px-12 py-16">
          <CountdownBlock token={token} accent={accent} />
        </Reveal>

        {/* EVENT DETAILS — date / time / venue + Google Maps */}
        <Reveal as="section" className="px-5 md:px-12 py-16">
          <EventDetails token={token} accent={accent} />
        </Reveal>

        {/* CHERISHED PHOTOS */}
        <Reveal as="section" className="px-5 md:px-12 py-16">
          <div className="max-w-5xl mx-auto">
            <span className="block text-[10px] tracking-[0.42em] uppercase mb-3 text-center"
              style={{ color: accent }}>
              ◆ Moments to Remember
            </span>
            <h3 className="text-center font-display text-3xl md:text-4xl leading-tight mb-8"
              style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
              Cherished Photos
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {token.extraPhotos.map((p, i) => (
                <motion.div key={i}
                  initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.96 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.1 }}
                  transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.6), ease: 'easeOut' }}
                  className="aspect-square rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${accent}33`, background: '#161210' }}
                >
                  <img src={p} alt={`Moment ${i + 1}`} loading="lazy"
                    className="w-full h-full object-cover" />
                </motion.div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* RSVP */}
        <Reveal as="section" className="px-5 md:px-12 py-16">
          <RSVPDemo token={token} accent={accent} />
        </Reveal>

        {/* BLESSINGS / WISHES WALL */}
        <Reveal as="section" className="px-5 md:px-12 py-16">
          <BlessingsWall token={token} accent={accent} />
        </Reveal>

        {/* LIVE PHOTO WALL — wedding-style Panel (Panel itself is now a Reveal) */}
        <LivePhotoWall accent={accent} eventLabel={token.label} />

        {/* AI-POWERED PHOTO SEARCH — wedding-style Panel (Panel itself is now a Reveal) */}
        <FindMyPhotos accent={accent} eventLabel={token.label} />

        {/* CLOSING BLESSING — short cream card */}
        <Reveal as="section" className="px-5 md:px-12 pt-8 pb-16">
          <div className="max-w-2xl mx-auto text-center px-6 py-10 rounded-2xl"
            style={{
              background: 'rgba(11,9,8,0.72)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: `1px solid ${accent}33`,
            }}
          >
            <Heart className="w-5 h-5 mx-auto mb-3" style={{ color: accent }} />
            <p className="text-base md:text-lg italic"
              style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
              “{token.closing}”
            </p>
            <span className="block text-[10px] tracking-[0.32em] uppercase mt-4"
              style={{ color: `${accent}` }}>
              — {token.parents}
            </span>
          </div>
        </Reveal>
      </main>

      {/* CINEMATIC CLOSING — "Thank you for visiting." with reverse Ken-Burns */}
      <CelebrationClosing image={backdropImg} token={token} accent={accent} />

      {/* Footer */}
      <footer className="relative z-10 px-6 md:px-16 py-12 text-center border-t"
        style={{ borderColor: 'rgba(212,175,55,0.18)' }} data-testid="celebration-preview-footer">
        <div className="text-3xl mb-2 italic"
          style={{ color: accent, fontFamily: '"Great Vibes", "Pinyon Script", cursive' }}>
          {token.celebrant}
        </div>
        <div className="text-xs tracking-[0.3em] uppercase"
          style={{ color: 'rgba(255,248,220,0.78)' }}>
          Crafted with reverence · MAJA Invites
        </div>
      </footer>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-2.5 rounded-full"
        style={{
          background: 'rgba(11,9,8,0.92)',
          border: `1px solid ${accent}66`,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
      >
        <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.85)' }}>
          Sample preview
        </span>
        <span style={{ color: 'rgba(255,248,220,0.3)' }}>|</span>
        <button onClick={goBuy}
          className="text-[11px] tracking-[0.25em] uppercase font-medium inline-flex items-center gap-1.5"
          style={{ color: accent }}
          data-testid="celebration-preview-sticky-cta"
        >
          Use this design <Sparkles className="w-3 h-3" />
        </button>
      </div>
      </>
    </div>
  );
};

export default CelebrationInvitationPreview;
