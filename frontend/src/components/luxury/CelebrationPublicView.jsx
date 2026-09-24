/**
 * CelebrationPublicView — public viewer for NON-WEDDING invitations
 * (baby_birthday, half_saree, puberty, dhoti).
 *
 * 2026-09 — Major redesign: this view now mirrors the WEDDING invitation
 * pattern exactly (cinematic dark-luxe page, big middle banner with the
 * celebrant's name, full-page banner-design background, scroll-triggered
 * animations on every section and a "thank-you" closing footer). Only the
 * celebrant data and the design palette change per category — the layout
 * is identical to the wedding viewer so users who saw a wedding preview
 * recognise this immediately.
 *
 * Props:
 *   data         — the invitation document (slug, celebrant_info, venue, …)
 *   previewMode  — boolean. When true the page additionally renders the
 *                  watermark overlay, the demo pill, a sticky "Use this
 *                  design" CTA and the cinematic opening curtain. When
 *                  false (live public viewing) those overlays are hidden.
 *   previewExitTo — optional override for the sticky CTA target URL.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  MapPin, Heart, Sparkles, Radio, ExternalLink,
  Image as ImageIcon, ArrowRight, X, QrCode, Search, KeyRound,
} from 'lucide-react';
import WishesWallSection from '@/components/luxury/WishesWallSection';
import MajaReferralCTA from '@/components/luxury/MajaReferralCTA';
import { featureGate } from '@/utils/featureAccess';
import ScrollSection from '@/components/luxury/ScrollSection';
import WatermarkOverlay from '@/components/luxury/WatermarkOverlay';
import PetalConfetti from '@/components/luxury/PetalConfetti';
// GuestUploadButton import removed — the floating "Share your photo" button
// is no longer rendered on celebration links per host preference.
import FindMyPhotosModal from '@/components/luxury/FindMyPhotosModal';
import ThemeAnimatedBackground from '@/components/ThemeAnimatedBackground';
import TouchParticles from '@/components/TouchParticles';
import { ClosingOrchestrator } from '@/themes/shared/ThemeAnimationOrchestrator';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/* ── PER-CATEGORY THEME PALETTE ─────────────────────────────────────────
 * Each category mirrors the wedding viewer's dark-luxe background but
 * with category-specific accent + gradient. Pageboard stays dark; only
 * the hero gradient, the section accent and the petal-confetti colour
 * change. This is what gives the customer the impression of "different
 * design but same pattern". */
const CATEGORY_THEME = {
  baby_birthday: {
    label: 'Baby Birthday',
    label_traditional: '',
    icon: '🎂',
    eyebrow: 'A Joyful Celebration',
    /* card-style eyebrow + family line + panel tint mirror the home page
       NonWeddingDesignCard so the published invitation hero looks IDENTICAL
       in composition to the preview the photographer picked. */
    eyebrowShort: 'First Birthday',
    familyLine: 'With Blessings From Our Family',
    panelTint: 'rgba(255,235,243,0.95)',
    panelText: '#3B1E2B',
    primary: '#FF8FBF',            // hero accent
    accent: '#FFD27D',
    cardAccent: '#FF69B4',         // circle bubble border on the card hero
    heroGradient: 'linear-gradient(135deg,#3a1727 0%,#7a3052 45%,#FFB6C1 100%)',
    sectionBg: '#2a1019',
    softBg: 'rgba(255,143,191,0.07)',
    softBorder: 'rgba(255,143,191,0.28)',
    petals: ['#FF69B4', '#FFB6C1', '#FFD27D', '#FFF8DC'],
    rsvpVerb: 'Bless the Birthday Star',
    blessingVerb: 'Send Birthday Wishes',
    storyHeading: 'A Year (or More) of Joy',
    venueHeading: 'Where the Joy Unfolds',
    closing: 'Thank you for being part of our little one\'s story.',
  },
  half_saree: {
    label: 'Half Saree Ceremony',
    label_traditional: 'Langa Voni · Pavadai Daavani',
    icon: '👗',
    eyebrow: 'A Coming-of-Age Tradition',
    eyebrowShort: 'Half Saree Ceremony',
    familyLine: 'Together With Our Family',
    panelTint: 'rgba(255,232,243,0.95)',
    panelText: '#3B0F2B',
    primary: '#E84393',
    accent: '#FFD700',
    cardAccent: '#C71585',
    heroGradient: 'linear-gradient(135deg,#3a0e23 0%,#8B0A50 45%,#FFD700 100%)',
    sectionBg: '#2a0a1c',
    softBg: 'rgba(232,67,147,0.07)',
    softBorder: 'rgba(232,67,147,0.28)',
    petals: ['#FF1493', '#FFD700', '#FF69B4', '#FFF8DC'],
    rsvpVerb: 'Shower Your Blessings',
    blessingVerb: 'Leave a Blessing',
    storyHeading: 'A Story of Silk, Gold & Grace',
    venueHeading: 'Where Tradition Meets Today',
    closing: 'Thank you for blessing our daughter on this beautiful threshold.',
  },
  puberty: {
    label: 'Puberty Ceremony',
    label_traditional: 'Manjal Neerattu Vizha',
    icon: '🌸',
    eyebrow: 'A Sacred Threshold',
    eyebrowShort: 'Manjal Neerattu',
    familyLine: 'With Blessings From Our Family',
    panelTint: 'rgba(255,240,224,0.95)',
    panelText: '#3B1F0F',
    primary: '#FF8C00',
    accent: '#FFD700',
    cardAccent: '#C0392B',
    heroGradient: 'linear-gradient(135deg,#321906 0%,#9b5302 45%,#FFD700 100%)',
    sectionBg: '#28140a',
    softBg: 'rgba(255,140,0,0.07)',
    softBorder: 'rgba(255,140,0,0.32)',
    petals: ['#FFD700', '#FF8C00', '#FFB347', '#FFF8DC'],
    rsvpVerb: 'Bless the Celebrant',
    blessingVerb: 'Send Blessings',
    storyHeading: 'A Sacred Coming of Age',
    venueHeading: 'Where Blessings Gather',
    closing: 'Thank you for blessing our daughter as she steps into a new chapter.',
  },
  dhoti: {
    label: 'Dhoti Ceremony',
    label_traditional: 'Vetti Kattum Vizha',
    icon: '👔',
    eyebrow: 'A Boy Becomes a Young Man',
    eyebrowShort: 'Vetti Kattum Vizha',
    familyLine: 'Together With Our Family',
    panelTint: 'rgba(232,232,255,0.95)',
    panelText: '#1A1A3B',
    primary: '#9F86FF',
    accent: '#FFD700',
    cardAccent: '#4A148C',
    heroGradient: 'linear-gradient(135deg,#1a0a3a 0%,#3a1d7a 45%,#FFD700 100%)',
    sectionBg: '#150a2d',
    softBg: 'rgba(159,134,255,0.07)',
    softBorder: 'rgba(159,134,255,0.30)',
    petals: ['#7B68EE', '#FFD700', '#9F86FF', '#FFF8DC'],
    rsvpVerb: 'Bless the Young Man',
    blessingVerb: 'Send Blessings',
    storyHeading: 'From Boyhood to Young Man',
    venueHeading: 'Where Family Pride Gathers',
    closing: 'Thank you for being part of our son\'s proud first step.',
  },
};

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const resolveUrl = (u) => {
  if (!u) return '';
  if (u.startsWith('data:') || u.startsWith('blob:')) return u;
  if (u.startsWith('http')) {
    return u.replace(/(https?:\/\/[^/]+)\/uploads\//i, `$1/api/uploads/`);
  }
  const path = u.startsWith('/uploads/') ? `/api${u}` : u;
  return `${API_URL}${path}`;
};

/* ── Countdown ─────────────────────────────────────────────────────── */
const CountdownTile = ({ v, l, accent }) => (
  <div className="flex flex-col items-center px-3 sm:px-4 py-2 rounded-2xl backdrop-blur"
    style={{
      background: 'rgba(255,248,220,0.08)',
      border: '1px solid rgba(255,248,220,0.18)',
      minWidth: 60,
    }}>
    <span className="text-2xl sm:text-3xl font-semibold" style={{ color: accent }}>
      {String(v).padStart(2, '0')}
    </span>
    <span className="text-[10px] sm:text-xs uppercase tracking-[0.18em]"
      style={{ color: 'rgba(255,248,220,0.85)' }}>{l}</span>
  </div>
);

const Countdown = ({ targetDate, accent }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!targetDate) return null;
  const t = new Date(targetDate).getTime();
  const diff = t - now;
  if (Number.isNaN(t)) return null;
  if (diff <= 0) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur"
        style={{
          background: 'rgba(255,248,220,0.08)',
          border: '1px solid rgba(255,248,220,0.18)',
          color: accent,
        }}
        data-testid="celebration-countdown-done">
        <Sparkles className="w-4 h-4" /> The day has arrived.
      </div>
    );
  }
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);
  return (
    <div className="flex gap-2 sm:gap-3" data-testid="celebration-countdown">
      <CountdownTile v={days} l="Days" accent={accent} />
      <CountdownTile v={hours} l="Hrs" accent={accent} />
      <CountdownTile v={mins} l="Mins" accent={accent} />
      <CountdownTile v={secs} l="Secs" accent={accent} />
    </div>
  );
};

/* ── Opening curtain — mirrors wedding's cinematic intro ──────────── */
const OpeningCurtain = ({ name, subtitle, accent, gradient, designImage, onDone, previewMode = true }) => {
  useEffect(() => {
    const id = setTimeout(onDone, 1900);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <motion.div
      key="curtain"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[300] grid place-items-center"
      style={{
        background: 'radial-gradient(ellipse at center,#1f1612 0%,#0b0908 70%, #000 100%)',
      }}
      data-testid="celebration-opening-curtain"
    >
      {/* BUG FIX: show the SELECTED DESIGN in the opening curtain too —
          this is the first thing the guest sees and it should match the
          chosen artwork (cake/balloons/floral) not a generic gradient. */}
      {designImage && (
        <motion.img
          src={designImage}
          alt=""
          initial={{ scale: 1.18, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.55 }}
          transition={{ duration: 2.2, ease: 'easeOut' }}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="absolute inset-0 opacity-30" style={{ background: gradient }} />
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(11,9,8,0.45) 0%, rgba(11,9,8,0.85) 100%)',
      }} />
      <div className="relative text-center px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="text-[10px] sm:text-xs tracking-[0.42em] uppercase mb-5"
          style={{ color: accent }}
        >
          ✦  {previewMode ? 'Sample Invitation Preview' : 'You Are Cordially Invited'}  ✦
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, scale: 0.7, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-5xl sm:text-7xl md:text-8xl leading-none"
          style={{ color: '#FFF8DC', letterSpacing: '-0.01em' }}
          data-testid="celebration-opening-name"
        >
          {name}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.7 }}
          className="text-base sm:text-xl uppercase tracking-[0.32em] mt-4"
          style={{ color: 'rgba(255,248,220,0.85)' }}
        >
          {subtitle}
        </motion.p>
      </div>
    </motion.div>
  );
};

/* ── Demo pill (preview-only) ─────────────────────────────────────── */
const DemoPill = ({ accent, label }) => (
  <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur shadow-lg"
    style={{
      background: 'rgba(11,9,8,0.78)',
      border: `1px solid ${accent}66`,
      color: '#FFF8DC',
    }}
    data-testid="celebration-demo-pill">
    <Sparkles className="w-3 h-3" style={{ color: accent }} />
    <span className="text-[10px] tracking-[0.32em] uppercase">{label}</span>
  </div>
);

/* ── Sticky "Use this design" CTA at bottom (preview-only) ────────── */
const UseThisDesignCTA = ({ accent, targetUrl }) => (
  <div
    className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl backdrop-blur"
    style={{
      background: 'rgba(11,9,8,0.92)',
      border: `1px solid ${accent}66`,
      color: '#FFF8DC',
    }}
    data-testid="celebration-use-design-cta"
  >
    <Sparkles className="w-3.5 h-3.5" style={{ color: accent }} />
    <span className="text-[11px] tracking-[0.28em] uppercase">Sample preview</span>
    <span className="w-px h-3" style={{ background: 'rgba(255,248,220,0.2)' }} />
    {targetUrl
      ? (
        <Link
          to={targetUrl}
          className="inline-flex items-center gap-1 text-[11px] tracking-[0.22em] uppercase hover:opacity-80 transition-opacity"
          style={{ color: accent }}
          data-testid="celebration-use-design-link"
        >
          Use this design <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )
      : (
        <button
          type="button"
          onClick={() => window.history.length > 1 ? window.history.back() : (window.location.href = '/')}
          className="inline-flex items-center gap-1 text-[11px] tracking-[0.22em] uppercase hover:opacity-80 transition-opacity"
          style={{ color: accent }}
          data-testid="celebration-use-design-link"
        >
          Back to designs <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    <Link
      to="/"
      className="ml-1 w-6 h-6 rounded-full grid place-items-center hover:bg-white/10 transition-colors"
      aria-label="Close preview"
      data-testid="celebration-close-preview"
    >
      <X className="w-3 h-3" />
    </Link>
  </div>
);

/* ── RSVP form ─────────────────────────────────────────────────────
 * In preview mode the submission is mocked (no backend hit) so testers
 * can play with the form without polluting the DB. In live mode it
 * POSTs to /api/rsvp?slug=... like before. */
const RSVPInline = ({ slug, accent, verb, previewMode }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(1);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('yes');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Please enter your name'); return; }
    if (!previewMode && !/^\+[1-9]\d{1,14}$/.test(phone.trim())) {
      setErr('Phone must be in E.164 format (e.g. +919876543210)');
      return;
    }
    setSubmitting(true); setErr('');
    try {
      if (previewMode) {
        // Demo mode — just simulate a 600 ms delay
        await new Promise((r) => setTimeout(r, 600));
        setDone(true);
        return;
      }
      await axios.post(`${API_URL}/api/rsvp?slug=${slug}`, {
        guest_name: name.trim(),
        guest_phone: phone.trim(),
        status,
        guest_count: Math.max(1, Math.min(10, Number(guests) || 1)),
        message: message.trim() || null,
      });
      setDone(true);
    } catch (e2) {
      const d = e2.response?.data?.detail;
      setErr(typeof d === 'string' ? d : (Array.isArray(d) ? d.map((x) => x.msg).join('; ') : 'Could not submit RSVP. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-8" data-testid="rsvp-success">
        <Sparkles className="w-10 h-10 mx-auto mb-2" style={{ color: accent }} />
        <p className="text-lg font-medium" style={{ color: '#FFF8DC' }}>
          Thank you! Your blessing has been received.
        </p>
      </div>
    );
  }

  const inputStyle = {
    background: 'rgba(255,248,220,0.05)',
    border: '1px solid rgba(255,248,220,0.18)',
    color: '#FFF8DC',
  };

  return (
    <form onSubmit={submit} className="space-y-3.5" data-testid="rsvp-form">
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-4 py-3 rounded-xl focus:outline-none placeholder:opacity-50"
        style={inputStyle}
        data-testid="rsvp-name"
      />
      <input
        type="tel"
        placeholder={previewMode ? 'Phone (any format for demo)' : 'Phone (e.g. +919876543210)'}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full px-4 py-3 rounded-xl focus:outline-none placeholder:opacity-50"
        style={inputStyle}
        data-testid="rsvp-phone"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-4 py-3 rounded-xl focus:outline-none"
          style={inputStyle}
          data-testid="rsvp-status"
        >
          <option value="yes">I will attend</option>
          <option value="maybe">Maybe</option>
          <option value="no">Cannot make it</option>
        </select>
        <input
          type="number"
          min="1"
          max="10"
          placeholder="Guests"
          value={guests}
          onChange={(e) => setGuests(e.target.value)}
          className="px-4 py-3 rounded-xl focus:outline-none placeholder:opacity-50"
          style={inputStyle}
          data-testid="rsvp-guests"
        />
      </div>
      <textarea
        rows={3}
        placeholder="Leave a message (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full px-4 py-3 rounded-xl focus:outline-none resize-none placeholder:opacity-50"
        style={inputStyle}
        data-testid="rsvp-message"
      />
      {err && <p className="text-sm" style={{ color: '#ff8788' }} data-testid="rsvp-error">{err}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-xl font-medium disabled:opacity-60 transition-transform hover:scale-[1.01]"
        style={{ background: accent, color: '#1c1410' }}
        data-testid="rsvp-submit"
      >
        {submitting ? 'Sending…' : `${verb} →`}
      </button>
    </form>
  );
};

/* ── PHOTO GALLERY ────────────────────────────────────────────────── */
const PhotoGallery = ({ photos, accent, title }) => {
  const reduce = useReducedMotion();
  if (!photos || photos.length === 0) return null;
  return (
    <section className="px-6 md:px-12 py-16" data-testid="celebration-gallery">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <span className="text-xs tracking-[0.32em] uppercase"
            style={{ color: accent }}>
            Moments to remember
          </span>
          <h2 className="font-display text-3xl sm:text-5xl mt-2"
            style={{ color: '#FFF8DC' }}>
            {title || 'Cherished Photos'}
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {photos.map((url, idx) => (
            <motion.div
              key={idx}
              initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 16 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.5, delay: Math.min(idx * 0.06, 0.6), ease: 'easeOut' }}
              className="aspect-square rounded-2xl overflow-hidden shadow-2xl"
              style={{
                background: 'rgba(255,248,220,0.05)',
                border: '1px solid rgba(255,248,220,0.1)',
              }}
              data-testid={`celebration-photo-${idx}`}
            >
              <img
                src={resolveUrl(url)}
                alt={`Memory ${idx + 1}`}
                loading="lazy"
                className="w-full h-full object-cover hover:scale-110 transition-transform duration-700"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── LIVE PHOTO WALL ──────────────────────────────────────────────
   Real-time photo wall section for the published invitation. Pulls
   /api/public/gallery/{slug}/photos for an initial paint, then
   subscribes to /ws/gallery/{wedding_id} for live `photo_added` events
   exactly like the wedding viewer. Provides two side-by-side guest
   entry points: scan QR or enter passkey to find their own photos via
   AI face match.
*/
// ponytail: mirrors useGalleryAccess.js's loadStored() semantics inline —
// this section doesn't need the full hook (privacy fetch, unlock flow),
// just the trusted-device token so the WS can pass a protected gallery's
// 4401 check.
const getStoredGalleryToken = (slug) => {
  try {
    const tok = localStorage.getItem(`gallery_device_token_${slug}`);
    const exp = localStorage.getItem(`gallery_device_exp_${slug}`);
    if (tok && exp && Date.parse(exp) > Date.now()) return tok;
  } catch (_) { /* Safari private mode / SSR — ignore */ }
  return null;
};

const LivePhotoWallSection = ({ slug, accent, primary, softBg, softBorder, eventLabel, celebrantFirst, showGallery = true, showSelfie = true }) => {
  const reduce = useReducedMotion();
  const [photos, setPhotos] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const wsRef = useRef(null);

  // Initial paint
  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/api/public/gallery/${slug}/photos?limit=30`)
      .then((r) => { if (alive) setPhotos(r.data?.photos || []); })
      .catch(() => { /* live wall is optional */ });
    return () => { alive = false; };
  }, [slug]);

  // Live websocket subscription
  useEffect(() => {
    if (!slug || typeof window === 'undefined') return undefined;
    let cancelled = false;
    axios.get(`${API_URL}/api/invite/${slug}`)
      .then((r) => {
        if (cancelled) return;
        const weddingId = r.data?.id;
        if (!weddingId) return;
        const wsBase = API_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
        try {
          // Core serves the WS at /api/ws/gallery/... — the /api prefix was
          // missing here, so this connected to the SPA fallback and failed.
          // Protected galleries (gallery_privacy.enabled) close with 4401
          // unless a valid unlocked-device token rides along as ?token=.
          // The token is stored under the slug (see useGalleryAccess.js),
          // not weddingId, even though the WS path itself uses weddingId.
          const token = getStoredGalleryToken(slug);
          const wsUrl = `${wsBase}/api/ws/gallery/${weddingId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data);
              if (msg.type === 'photo_added' && msg.photo) {
                setPhotos((arr) => [msg.photo, ...arr].slice(0, 60));
              } else if (msg.type === 'photo_deleted') {
                setPhotos((arr) => arr.filter((p) => p.id !== msg.photo_id));
              }
            } catch (_) { /* ignore */ }
          };
        } catch (_) { /* websocket optional */ }
      })
      .catch(() => { /* swallow */ });
    return () => {
      cancelled = true;
      try { wsRef.current?.close?.(); } catch (_) { /* ignore */ }
    };
  }, [slug]);

  const publicLink = useMemo(
    () => (typeof window !== 'undefined' ? `${window.location.origin}/i/${slug}` : ''),
    [slug],
  );
  const qrSrc = useMemo(
    () => `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=2&color=${
      accent.replace('#', '')}&bgcolor=FFF8DC&data=${encodeURIComponent(publicLink)}`,
    [accent, publicLink],
  );

  return (
    <ScrollSection className="px-6 md:px-12 py-16" data-testid="celebration-live-wall">
      <div className="max-w-5xl mx-auto">
        <span className="block text-[10px] tracking-[0.42em] uppercase mb-3 text-center" style={{ color: accent }}>
          ◆ Live Photo Wall
        </span>
        <h3 className="text-center font-display text-3xl md:text-4xl leading-tight mb-3"
          style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
          Photos appear{' '}
          <em className="font-script not-italic" style={{ color: accent }}>live</em>
          {' '}as the {eventLabel.toLowerCase()} unfolds.
        </h3>
        <p className="text-center text-sm md:text-base mb-8 max-w-2xl mx-auto"
          style={{ color: 'rgba(255,248,220,0.85)' }}>
          Every photo posted by {celebrantFirst}&apos;s family streams here in real time. Scan the QR or tap{' '}
          <strong style={{ color: '#FFF8DC' }}>“Get my photos”</strong>{' '}
          and our AI will find every shot you appear in.
        </p>

        {/* Photo grid */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-8">
            {photos.slice(0, 12).map((p, idx) => (
              <motion.div key={p.id}
                initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.5, delay: Math.min(idx * 0.06, 0.6), ease: 'easeOut' }}
                className="aspect-square rounded-lg overflow-hidden"
                style={{ border: `1px solid ${softBorder}`, background: softBg }}>
                <img src={`${API_URL}${p.thumb_url || p.url}`} alt="" loading="lazy"
                  className="w-full h-full object-cover" />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl px-6 py-10 text-center mb-8"
            style={{ background: softBg, border: `1px dashed ${softBorder}`, color: 'rgba(255,248,220,0.8)' }}>
            <ImageIcon className="w-7 h-7 mx-auto mb-2" style={{ color: accent }} />
            <p className="text-sm">The wall is waiting for its first photo.</p>
          </div>
        )}

        {/* Dual CTAs — Scan QR + Get my photos
            Stacked vertically (QR on top, AI face-match directly below)
            so the AI option doesn't drift to the side on wider screens. */}
        <div className="flex flex-col items-stretch gap-3 max-w-sm mx-auto">
          {/* Scan QR — live gallery pack (qr_live_gallery / enhanced_gallery) */}
          {showGallery && (
          <button type="button" onClick={() => setShowQR(true)}
            className="rounded-xl px-5 py-4 inline-flex items-center justify-center gap-2 text-[11px] tracking-[0.3em] uppercase font-medium w-full"
            style={{ background: '#FFF8DC', color: '#1A130B', border: `1px solid ${accent}` }}
            data-testid="celebration-live-wall-qr-btn">
            <QrCode className="w-4 h-4" /> Scan QR
          </button>
          )}
          {/* Get my photos — AI face-match pack (ai_face_match / selfie_search) */}
          {showSelfie && (
          <button type="button" onClick={() => setShowFind(true)}
            className="rounded-xl px-5 py-4 inline-flex items-center justify-center gap-2 text-[11px] tracking-[0.3em] uppercase font-medium w-full"
            style={{ background: accent, color: '#1A130B', border: `1px solid ${accent}` }}
            data-testid="celebration-live-wall-find-btn">
            <Search className="w-4 h-4" /> Get my photos (AI face match)
          </button>
          )}
        </div>
        <p className="text-center text-[11px] tracking-[0.25em] uppercase mt-3"
          style={{ color: 'rgba(255,248,220,0.62)' }}>
          No QR scanner handy? Tap the second button — enter the passkey from the host.
        </p>

        {/* QR modal */}
        <AnimatePresence>
          {showQR && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] flex items-center justify-center px-6"
              style={{ background: 'rgba(8,5,3,0.85)', backdropFilter: 'blur(8px)' }}
              onClick={() => setShowQR(false)} data-testid="celebration-qr-modal"
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92 }}
                className="rounded-2xl px-8 py-9 text-center max-w-md w-full relative"
                style={{ background: '#1A130B', border: `1px solid ${accent}44` }}
                onClick={(e) => e.stopPropagation()}
              >
                <button onClick={() => setShowQR(false)}
                  className="absolute top-3 right-3 p-2 rounded-full"
                  style={{ color: 'rgba(255,248,220,0.85)' }} data-testid="celebration-qr-close">
                  <X className="w-4 h-4" />
                </button>
                <span className="block text-[10px] tracking-[0.4em] uppercase mb-3" style={{ color: accent }}>
                  ◆ Live Photo Wall
                </span>
                <h4 className="font-display text-2xl mb-4"
                  style={{ color: '#FFF8DC', fontFamily: '"Cormorant Garamond", serif' }}>
                  Scan to open on your phone.
                </h4>
                <div className="p-4 inline-block rounded-xl mb-4" style={{ background: '#FFF8DC' }}>
                  <img src={qrSrc} alt="Open this invitation on phone"
                    width={240} height={240} style={{ display: 'block' }} />
                </div>
                <button type="button"
                  onClick={() => { try { navigator.clipboard?.writeText(publicLink); } catch (_) { /* ignore */ } }}
                  className="block w-full px-4 py-2.5 rounded-md text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: accent, border: `1px solid ${accent}55`, background: 'transparent' }}>
                  Copy invitation link
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Find my photos modal — reuses wedding-side AI face match flow.
            Already supports BOTH camera (selfie) AND gallery/file upload —
            the modal's IntroStep shows two buttons: "Take Selfie" (uses
            `capture="user"` to ask for the camera) and "Choose Photo" (file
            picker → camera roll). User uploads any photo of themselves, the
            backend AI face-matches it against the whole gallery and returns
            their photos. */}
        {showSelfie && (
        <FindMyPhotosModal
          open={showFind}
          onClose={() => setShowFind(false)}
          slug={slug}
          accent={accent}
        />
        )}
      </div>
    </ScrollSection>
  );
};

/* ── MAIN VIEWER ──────────────────────────────────────────────────── */
/* Module-level cache so navigating between published invitations of the
   same category doesn't re-hit the API. Mirrors the same pattern used
   by CelebrationInvitationPreview. */
const _designCache = new Map();
const _designFetches = new Map();

const fetchDesignsForCategory = (category) => {
  if (_designCache.has(category)) return Promise.resolve(_designCache.get(category));
  if (_designFetches.has(category)) return _designFetches.get(category);
  const p = axios
    .get(`${API_URL}/api/event-categories/${category}/designs`)
    .then((res) => {
      const designs = res?.data?.designs || [];
      _designCache.set(category, designs);
      return designs;
    })
    .catch(() => { _designCache.set(category, []); return []; })
    .finally(() => { _designFetches.delete(category); });
  _designFetches.set(category, p);
  return p;
};

const CelebrationPublicView = ({ data, previewMode = false, previewExitTo = null }) => {
  const cat = data?.invitation_category || 'baby_birthday';
  // Unified Pricing Engine — feature-pack visibility (permissive when granted_features
  // is null: legacy / grandfathered / new_pricing_enabled OFF).
  const canFeat = featureGate(data);
  const canLiveGallery = canFeat('qr_live_gallery') || canFeat('enhanced_gallery');
  const canFaceMatch   = canFeat('ai_face_match') || canFeat('selfie_search');
  const theme = CATEGORY_THEME[cat] || CATEGORY_THEME.baby_birthday;
  const ci = data?.celebrant_info || {};

  // Each non-wedding category now has its OWN culturally-resonant particle
  // dictionary inside ThemeAnimatedBackground (balloons & cake for baby,
  // peacock & bell florals for half saree, turmeric blossoms & lamps for
  // Manjal Neerattu, coconut leaves & jasmine for Vetti Kattum Vizha).
  // The same canvas applies to BOTH the homepage preview AND the final
  // published invitation link, so guests always see the cinematic ambient
  // animation matching the ceremony.
  const BG_THEME_FOR_CATEGORY = {
    baby_birthday: 'baby_birthday',
    half_saree:    'half_saree',
    puberty:       'puberty',
    dhoti:         'dhoti',
  };
  const bgTheme = BG_THEME_FOR_CATEGORY[cat] || 'baby_birthday';

  // Apply per-category theme to the body so the page background extends
  // edge-to-edge in the design's colour family (no more "naked black void"
  // above/around the hero card). We override BOTH the solid fallback AND the
  // cinematic gradient CSS vars so .luxe::after also paints in this theme.
  // Restored to previous values on unmount.
  useEffect(() => {
    const root = document.documentElement;
    const prevBg = document.body.style.background;
    const prevSolid = root.style.getPropertyValue('--lux-bg-solid');
    const prevBgVar = root.style.getPropertyValue('--lux-bg');
    document.body.classList.add('luxe');
    // Paint the body itself with the category's hero gradient so it shows
    // through every transparent wrapper (e.g. .luxe .min-h-screen).
    document.body.style.background = theme.heroGradient;
    // Override the luxe gradient backdrop CSS variables so .luxe::after
    // (the fixed pseudo-element behind the canvas) blends with the theme
    // instead of drawing the default near-black wash.
    root.style.setProperty('--lux-bg-solid', theme.sectionBg);
    root.style.setProperty('--lux-bg', theme.heroGradient);
    return () => {
      document.body.classList.remove('luxe');
      document.body.style.background = prevBg;
      if (prevSolid) root.style.setProperty('--lux-bg-solid', prevSolid);
      else root.style.removeProperty('--lux-bg-solid');
      if (prevBgVar) root.style.setProperty('--lux-bg', prevBgVar);
      else root.style.removeProperty('--lux-bg');
    };
  }, [theme.sectionBg, theme.heroGradient]);

  const [opening, setOpening] = useState(() => {
    // Show the cinematic opening once per browser session per slug.
    // In preview mode it always plays.
    if (previewMode) return true;
    try {
      const k = `maja_celebration_opening_seen_${data?.slug || 'x'}`;
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (window.sessionStorage.getItem(k)) return false;
      }
    } catch (_) { /* ignore */ }
    return true;
  });

  const handleOpeningDone = useCallback(() => {
    setOpening(false);
    try {
      const k = `maja_celebration_opening_seen_${data?.slug || 'x'}`;
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(k, '1');
      }
    } catch (_) { /* ignore */ }
  }, [data?.slug]);

  // Safety net — never leave a user on a black curtain
  useEffect(() => {
    if (!opening) return;
    const id = setTimeout(handleOpeningDone, 4500);
    return () => clearTimeout(id);
  }, [opening, handleOpeningDone]);

  const celebrantName = ci.celebrant_name || data?.groom_name || 'Our Star';
  const firstName = celebrantName.split(' ')[0];
  const nickname = ci.nickname_visible ? ci.nickname : null;
  const father = ci.father_name || '';
  const mother = ci.mother_name || '';
  const parents = [father, mother].filter(Boolean).join(' & ');
  const story = ci.story || data?.love_story || '';
  const extras = Array.isArray(ci.extra_photos) ? ci.extra_photos.filter(Boolean) : [];
  const coverPhoto = data?.couple_photo_url || data?.bride_photo_url || data?.groom_photo_url || '';
  const allPhotos = [coverPhoto, ...extras].filter(Boolean);

  /* ── BUG: SELECTED DESIGN NOT RENDERED ─────────────────────────────
   * Previously the hero only used theme.heroGradient + coverPhoto, so
   * the published invitation looked identical regardless of which
   * design the photographer/family picked from the gallery. Now we
   * look up the selected design's preview_image and render it as the
   * full-bleed hero backdrop (the design's cake / balloons / floral
   * artwork). The gradient stays as a fallback for legacy invitations
   * that have no design_id and as a tint over the design image.
   *
   * design_id resolution order:
   *   1. data.design_id (form submission default)
   *   2. data.design_selections[cat]   (per-category selection map)
   *   3. data.design_selections.default
   * ─────────────────────────────────────────────────────────────── */
  const selectedDesignId =
    data?.design_id ||
    data?.design_selections?.[cat] ||
    data?.design_selections?.default ||
    '';

  const [categoryDesigns, setCategoryDesigns] = useState(
    () => _designCache.get(cat) || null
  );
  // Mirror the pattern used by CelebrationInvitationPreview: fire the
  // fetch outside of a useEffect so React doesn't flag the resolved
  // setState as a set-state-in-effect. The module-level cache + the
  // fetchPromises de-dupe map make this safe across re-renders.
  if (cat && !_designCache.has(cat) && !_designFetches.has(cat)) {
    fetchDesignsForCategory(cat).then(setCategoryDesigns);
  } else if (cat && categoryDesigns === null && _designFetches.has(cat)) {
    _designFetches.get(cat).then(setCategoryDesigns);
  }

  const selectedDesign = useMemo(() => {
    if (!Array.isArray(categoryDesigns) || categoryDesigns.length === 0) return null;
    if (selectedDesignId) {
      const found = categoryDesigns.find((d) => d.design_id === selectedDesignId);
      if (found) return found;
    }
    // Fallback: first design in the category so something cinematic
    // always shows even if the stored id is no longer valid.
    return categoryDesigns[0];
  }, [categoryDesigns, selectedDesignId]);

  const designBackdrop = useMemo(
    () => resolveUrl(selectedDesign?.preview_image || selectedDesign?.thumbnail || ''),
    [selectedDesign]
  );

  const eventDate = data?.event_date ? new Date(data.event_date) : null;
  const formattedDate = eventDate
    ? eventDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBA';
  const formattedTime = eventDate
    ? eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const venue = data?.venue || '';
  const city = data?.city || '';
  const mapLink = data?.map_settings?.map_link || '';
  // Parking info — saved by CelebrationProfileForm on celebrant_info.parking
  // (with parking_info as a legacy text fallback).
  const parking = ci.parking || null;
  const parkingEnabled = !!(parking?.enabled);
  const parkingText = parking?.text || data?.parking_info || '';
  const parkingMapLink = parking?.google_map_link || '';
  const venueLine = [venue, city].filter(Boolean).join(' · '); // single-line label for the hero panel
  const videoLink = ci.video_link || '';
  const liveLink = ci.live_link || '';
  const closingMsg = ci.closing_message || theme.closing;

  const subtitle = useMemo(() => {
    if (cat === 'baby_birthday' && ci.age_turning) {
      return `Turning ${ordinal(Number(ci.age_turning))}`;
    }
    return theme.eyebrow;
  }, [cat, ci.age_turning, theme.eyebrow]);

  /* ── RENDER ─────────────────────────────────────────────────────── */
  return (
    <div className="luxe-page min-h-screen relative"
      data-testid="celebration-public-view"
      data-category={cat}
      style={{ background: 'transparent', color: '#FFF8DC' }}
    >
      {/* Page background — mirror the home-page preview: the chosen DESIGN IMAGE
          blurred full-bleed, instead of a generic dark "maja" page. Negative
          z-index keeps it behind the particle canvas (z:-1) and all content. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -3, pointerEvents: 'none', background: '#1A130B' }} />
      {designBackdrop && (
        <>
          <img aria-hidden src={designBackdrop} alt="" draggable={false} loading="eager" decoding="async"
            style={{
              position: 'fixed', inset: 0, zIndex: -3, pointerEvents: 'none',
              width: '100%', height: '100%', objectFit: 'cover',
              filter: 'blur(18px) saturate(1.1)', transform: 'scale(1.1)', opacity: 0.85,
            }}
            data-testid="celebration-public-backdrop" />
          <div aria-hidden style={{
            position: 'fixed', inset: 0, zIndex: -2, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(11,9,8,0.45) 0%, rgba(11,9,8,0.8) 100%)',
          }} />
        </>
      )}

      {/* Ambient themed particle canvas — each non-wedding category now
          has its OWN dedicated particle dictionary in ThemeAnimatedBackground
          (balloons / peacock / turmeric / coconut motifs). Same canvas
          appears on the published invitation link so guests see the
          identical cinematic ambience the photographer previewed. */}
      <ThemeAnimatedBackground theme={bgTheme} />

      {/* Interactive touch/mouse particle bursts — spawns category-specific
          flower / balloon / lamp particles wherever the guest taps, moves
          the mouse or scrolls. Works on both desktop AND mobile (the
          ambient ThemeAnimatedBackground bails out on mobile for perf, but
          this lightweight burst-on-event canvas plays everywhere). Mounted
          only after the opening curtain finishes so the heaviest paints
          don't land at the same moment. */}
      {!opening && <TouchParticles theme={bgTheme} />}

      {/* Celebratory petal burst — fires after the opening curtain finishes,
          and again on RSVP submit (when the user is in interactive mode). */}
      <PetalConfetti
        trigger={!opening}
        count={previewMode ? 32 : 22}
        duration={5200}
        palette={theme.petals}
      />

      {/* Preview-only watermark + demo pill */}
      {previewMode && <WatermarkOverlay text={`${theme.label} · MAJA Demo`} />}
      {previewMode && <DemoPill accent={theme.accent} label={`Preview · ${theme.label}`} />}

      {/* ── OPENING CURTAIN — cinematic intro for both preview & public ─
           Public mode shows it once per session (sessionStorage gate).
           Mirrors what guests see on the home-page preview. */}
      <AnimatePresence>
        {opening && (
          <OpeningCurtain
            name={firstName}
            subtitle={previewMode ? subtitle : (theme.eyebrowShort || theme.label)}
            accent={theme.accent}
            gradient={theme.heroGradient}
            designImage={designBackdrop}
            onDone={handleOpeningDone}
            previewMode={previewMode}
          />
        )}
      </AnimatePresence>

      {/* ── HERO — CONTAINED CARD on a BLURRED design backdrop ─────────
          REDESIGN (Jul 2026 — round 2): the previous hero stretched the
          design image edge-to-edge across 100vh, which cropped out the
          decorative floral/cake/balloon corners every design has. The
          photographer chose a design that looked great in the preview
          (a portrait card), so the published page MUST mirror that
          composition exactly:

              ┌─────────────────────────────────────────────────────┐
              │  blurred design image (full viewport, behind)       │
              │                                                     │
              │      ┌───────────────────────────────────┐          │
              │      │ design art (sharp, portrait card) │          │
              │      │   ◇  FIRST BIRTHDAY  ◇            │          │
              │      │     ┌───┐                         │          │
              │      │     │ ● │  ← photo bubble         │          │
              │      │     └───┘                         │          │
              │      │  cream panel: name / date / venue │          │
              │      └───────────────────────────────────┘          │
              │       ▾ Scroll for the full story                   │
              └─────────────────────────────────────────────────────┘

          Everything below the hero (countdown / story / gallery /
          RSVP / etc.) stays exactly as before. */}
      <motion.section
        className="relative overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: opening ? 0 : 1 }}
        transition={{ duration: 0.8 }}
        data-testid="celebration-hero"
        data-design-id={selectedDesign?.design_id || ''}
        style={{ minHeight: '100vh', background: theme.heroGradient }}
      >
        {/* L0 — BLURRED full-viewport design backdrop (poster behind the card).
            Same treatment as CelebrationInvitationPreview's SoftDesignBackdrop
            so the published page reads as the same artwork as the preview. */}
        {designBackdrop ? (
          <>
            <img
              aria-hidden
              src={designBackdrop}
              alt=""
              draggable={false}
              loading="eager"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{
                filter: 'blur(22px) saturate(1.1)',
                transform: 'scale(1.12)',
                opacity: 0.78,
                willChange: 'transform',
                zIndex: 0,
              }}
              data-testid="celebration-public-backdrop"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, rgba(11,9,8,0.25) 0%, rgba(11,9,8,0.55) 100%)',
                zIndex: 1,
              }}
            />
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                left: '4vw', top: '40vh', width: 240, height: 240,
                background: `radial-gradient(circle, ${theme.cardAccent}40 0%, transparent 70%)`,
                filter: 'blur(24px)',
                zIndex: 1,
              }}
            />
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                right: '4vw', top: '55vh', width: 280, height: 280,
                background: `radial-gradient(circle, ${theme.cardAccent}33 0%, transparent 70%)`,
                filter: 'blur(26px)',
                zIndex: 1,
              }}
            />
          </>
        ) : (
          /* No design → fall back to the category gradient so the page never looks empty */
          <div className="absolute inset-0" style={{ background: theme.heroGradient, zIndex: 0 }} />
        )}

        {/* Decorative monogram corners — sit on top of the blurred backdrop, OUTSIDE the card */}
        <div className="absolute top-5 left-5 sm:top-8 sm:left-8 text-xl sm:text-3xl opacity-80 z-30"
          style={{ color: theme.accent }}>✦</div>
        <div className="absolute top-5 right-5 sm:top-8 sm:right-8 text-xl sm:text-3xl opacity-80 z-30"
          style={{ color: theme.accent }}>✦</div>

        {/* ── CARD WRAPPER — centered portrait card that mirrors the preview ── */}
        <div
          className="relative z-20 grid place-items-center px-5 sm:px-8"
          style={{ minHeight: '100vh', paddingTop: '5.5rem', paddingBottom: '4.5rem' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto overflow-hidden rounded-2xl"
            style={{
              width: 'min(580px, 92vw)',
              aspectRatio: '3 / 4',
              background: '#161210',
              boxShadow: '0 40px 80px rgba(0,0,0,0.45), 0 12px 28px rgba(0,0,0,0.25)',
              border: '1px solid rgba(212,175,55,0.22)',
              filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.35))',
            }}
            data-testid="celebration-public-hero-card"
          >
            {/* L1 — sharp design artwork inside the card (this is what makes
                the floral/cake/balloon corners visible like the preview) */}
            {designBackdrop ? (
              <motion.img
                src={designBackdrop}
                alt={selectedDesign?.name || theme.label}
                initial={{ scale: 1.06 }}
                animate={{ scale: 1 }}
                transition={{ duration: 14, ease: 'easeOut' }}
                className="absolute inset-0 w-full h-full object-cover"
                data-testid="hero-design-backdrop"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="absolute inset-0" style={{ background: theme.heroGradient }} />
            )}

            {/* L1c — soft top wash so the eyebrow stays readable on busy art */}
            <div
              aria-hidden
              className="absolute top-0 inset-x-0 h-28 pointer-events-none"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)' }}
            />

            {/* L2 — Top eyebrow pill */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="absolute top-5 sm:top-6 inset-x-0 flex justify-center px-4 z-10"
              data-testid="hero-eyebrow-pill"
            >
              <span
                className="font-display text-[10px] sm:text-[12px] tracking-[0.36em] uppercase px-3.5 sm:px-4 py-1.5 rounded-full whitespace-nowrap"
                style={{
                  color: '#FFF8DC',
                  background: 'rgba(15,10,6,0.55)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  border: `1px solid ${theme.cardAccent}88`,
                  textShadow: '0 1px 6px rgba(0,0,0,0.6)',
                  letterSpacing: '0.32em',
                }}
              >
                ◇ {theme.eyebrowShort || theme.label} ◇
              </span>
            </motion.div>

            {/* L3 — Circle celebrant photo bubble (positioned by absolute parent) */}
            <div
              className="absolute z-10"
              style={{ top: '20%', left: '50%', transform: 'translateX(-50%)' }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                className="relative"
                data-testid="hero-photo-bubble"
              >
                {coverPhoto ? (
                  <>
                    <div
                      className="rounded-full overflow-hidden"
                      style={{
                        width: 'min(40vw, 156px)',
                        height: 'min(40vw, 156px)',
                        border: `4px solid ${theme.cardAccent}`,
                        boxShadow: '0 8px 28px rgba(0,0,0,0.45), inset 0 0 0 4px rgba(255,255,255,0.95)',
                        background: '#fff',
                      }}
                    >
                      <img
                        src={resolveUrl(coverPhoto)}
                        alt={celebrantName}
                        className="w-full h-full"
                        style={{ objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
                      />
                    </div>
                    <div aria-hidden className="absolute -inset-2 rounded-full pointer-events-none"
                      style={{ border: `1.5px dashed ${theme.cardAccent}80` }} />
                  </>
                ) : (
                  /* No photo — tasteful initial bubble */
                  <div
                    className="rounded-full overflow-hidden grid place-items-center"
                    style={{
                      width: 'min(40vw, 156px)',
                      height: 'min(40vw, 156px)',
                      border: `4px solid ${theme.cardAccent}`,
                      boxShadow: '0 8px 28px rgba(0,0,0,0.45), inset 0 0 0 4px rgba(255,255,255,0.9)',
                      background: `linear-gradient(135deg, ${theme.cardAccent}, ${theme.accent})`,
                    }}
                  >
                    <span
                      className="font-display text-5xl sm:text-6xl"
                      style={{ color: '#FFF8DC', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
                    >
                      {(firstName || 'A')[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </motion.div>
            </div>

            {/* L4 — Bottom cream / tinted invitation panel (mirrors the preview card EXACTLY) */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
              className="absolute bottom-0 inset-x-0 px-5 pt-16 pb-7 text-center"
              style={{
                background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${theme.panelTint} 38%, ${theme.panelTint} 100%)`,
              }}
              data-testid="hero-invitation-panel"
            >
              <span
                className="block text-[10px] sm:text-[11px] tracking-[0.32em] uppercase mb-2"
                style={{ color: `${theme.panelText}AA` }}
                data-testid="hero-family-line"
              >
                {theme.familyLine}
              </span>

              <h1
                className="font-display leading-tight"
                style={{
                  color: theme.panelText,
                  fontFamily: '"Cormorant Garamond", serif',
                  fontSize: 'clamp(1.8rem, 5vw, 3rem)',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                }}
                data-testid="hero-celebrant-name"
              >
                {celebrantName}
              </h1>

              {nickname && (
                <p
                  className="italic mt-1"
                  style={{
                    color: theme.panelText, opacity: 0.7,
                    fontFamily: '"Cormorant Garamond", serif',
                    fontSize: 'clamp(0.95rem, 1.6vw, 1.15rem)',
                  }}
                  data-testid="hero-nickname"
                >
                  {`"${nickname}"`}
                </p>
              )}

              {eventDate && (
                <span
                  className="block text-[10px] sm:text-[12px] tracking-[0.28em] uppercase mt-3 font-medium"
                  style={{ color: theme.panelText }}
                  data-testid="hero-date"
                >
                  {formattedDate}
                  {formattedTime && (
                    <>
                      <span className="mx-2 opacity-60">·</span>
                      {formattedTime}
                    </>
                  )}
                </span>
              )}

              {venueLine && (
                <span
                  className="block text-[9px] sm:text-[11px] tracking-[0.22em] uppercase mt-1.5"
                  style={{ color: `${theme.panelText}AA` }}
                  data-testid="hero-venue"
                >
                  {venueLine}
                </span>
              )}

              {parents && (
                <span
                  className="block text-[9px] sm:text-[10px] tracking-[0.28em] uppercase mt-3"
                  style={{ color: `${theme.panelText}77` }}
                  data-testid="hero-parents"
                >
                  {cat === 'baby_birthday' ? 'Beloved child of ' : 'Daughter of '}
                  <span className="font-medium" style={{ color: `${theme.panelText}AA` }}>{parents}</span>
                </span>
              )}

              {subtitle && (
                <span
                  className="block text-[9px] sm:text-[11px] tracking-[0.32em] uppercase mt-2 italic"
                  style={{ color: `${theme.panelText}99`, fontFamily: 'serif' }}
                  data-testid="hero-subtitle"
                >
                  {subtitle}
                </span>
              )}
            </motion.div>
          </motion.div>

          {/* "Scroll for the full story" indicator (matches preview) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            transition={{ delay: 1.4, duration: 0.8 }}
            className="text-center mt-8 sm:mt-10 z-20 relative"
          >
            <span
              className="text-[10px] tracking-[0.5em] uppercase"
              style={{ color: theme.accent }}
            >
              ▾ Scroll for the full story
            </span>
          </motion.div>
        </div>
      </motion.section>

      {/* ── Countdown band (kept separate so the hero stays card-clean) ── */}
      {eventDate && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative px-6 py-10 text-center"
          style={{ background: theme.sectionBg }}
          data-testid="celebration-countdown-band"
        >
          <span
            className="block text-[10px] sm:text-[12px] tracking-[0.32em] uppercase mb-3"
            style={{ color: theme.accent }}
          >
            Counting Down To The Joy
          </span>
          <Countdown targetDate={data?.event_date} accent={theme.accent} />
        </motion.div>
      )}

      {/* ── CELEBRANT PHOTO SHOWCASE (3 large cards) ─────────────── */}
      {allPhotos.length > 0 && (
        <ScrollSection
          as="section"
          className="px-6 md:px-12 py-20 relative"
          testid="celebration-showcase"
        >
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{ background: theme.heroGradient }}
          />
          <div className="max-w-5xl mx-auto relative">
            <div className="text-center mb-10">
              <span className="text-xs tracking-[0.32em] uppercase"
                style={{ color: theme.accent }}>
                {cat === 'baby_birthday' ? 'Our Little One' : 'The Celebrant'}
              </span>
              <h2 className="font-display text-3xl sm:text-5xl mt-2" style={{ color: '#FFF8DC' }}>
                {firstName}
              </h2>
            </div>
            <div className={`grid gap-5 ${allPhotos.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : allPhotos.length === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto' : 'grid-cols-1 sm:grid-cols-3'}`}>
              {allPhotos.slice(0, 3).map((url, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 24, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.8, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className={`aspect-[3/4] rounded-3xl overflow-hidden shadow-2xl ${idx === 1 ? 'sm:-mt-6' : ''}`}
                  style={{
                    background: 'rgba(255,248,220,0.05)',
                    border: '1px solid rgba(255,248,220,0.1)',
                  }}
                >
                  <img
                    src={resolveUrl(url)}
                    alt={`${celebrantName} ${idx + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </ScrollSection>
      )}

      {/* ── STORY ─────────────────────────────────────────────────── */}
      {story && (
        <ScrollSection
          as="section"
          className="px-6 md:px-12 py-20"
          testid="celebration-story"
        >
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-xs tracking-[0.32em] uppercase"
              style={{ color: theme.accent }}>
              Our Story
            </span>
            <h2 className="font-display text-3xl sm:text-5xl mt-2 mb-3"
              style={{ color: '#FFF8DC' }}>
              {theme.storyHeading}
            </h2>
            <div
              className="w-16 h-px mx-auto my-6"
              style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)` }}
            />
            {/* H2 (Stored XSS) fix: render story as TEXT — React auto-escapes,
                so couple/AI-supplied content can't inject HTML/script. The
                whitespace-pre-line class preserves line breaks. */}
            <div className="text-base sm:text-lg leading-relaxed whitespace-pre-line"
              style={{ color: 'rgba(255,248,220,0.85)' }}>{story}</div>
          </div>
        </ScrollSection>
      )}

      {/* ── PHOTO GALLERY (full) ──────────────────────────────────── */}
      {allPhotos.length > 1 && (
        <ScrollSection className="" testid="celebration-gallery-scroll">
          <PhotoGallery photos={allPhotos} accent={theme.accent} title="Cherished Photos" />
        </ScrollSection>
      )}

      {/* ── VENUE + MAP ────────────────────────────────────────────── */}
      {(venue || city || mapLink || (parkingEnabled && (parkingText || parkingMapLink))) && (
        <ScrollSection
          as="section"
          className="px-6 md:px-12 py-20"
          testid="celebration-venue"
        >
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <span className="text-xs tracking-[0.32em] uppercase"
                style={{ color: theme.accent }}>
                {theme.venueHeading}
              </span>
              <h2 className="font-display text-3xl sm:text-5xl mt-2"
                style={{ color: '#FFF8DC' }}>Venue</h2>
            </div>
            <div className="rounded-3xl overflow-hidden shadow-2xl"
              style={{
                background: theme.softBg,
                border: `1px solid ${theme.softBorder}`,
                backdropFilter: 'blur(6px)',
              }}>
              <div className="p-8 text-center">
                <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: theme.accent }} />
                {venue && <p className="text-xl font-medium mb-1"
                  style={{ color: '#FFF8DC' }}>{venue}</p>}
                {city && <p className="text-base opacity-75 mb-4"
                  style={{ color: 'rgba(255,248,220,0.85)' }}>{city}</p>}
                {mapLink && (
                  <a
                    href={mapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-transform hover:scale-[1.03]"
                    style={{ background: theme.accent, color: '#1c1410' }}
                    data-testid="celebration-map-link"
                  >
                    Open in Maps <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              {mapLink && mapLink.includes('google.com/maps') && (
                <iframe
                  title="Venue map"
                  src={mapLink.replace('/maps/', '/maps/embed?pb=&q=')}
                  className="w-full"
                  style={{ height: 320, border: 0 }}
                  loading="lazy"
                />
              )}

              {/* Parking sub-card — only when the host enabled it */}
              {parkingEnabled && (parkingText || parkingMapLink) && (
                <div className="px-8 py-6 border-t text-center"
                  style={{ borderColor: theme.softBorder }}
                  data-testid="celebration-parking-card">
                  <span className="text-[10px] tracking-[0.4em] uppercase block mb-2"
                    style={{ color: theme.accent }}>
                    ◆ Parking
                  </span>
                  {parkingText && (
                    <p className="text-sm leading-relaxed mb-3"
                      style={{ color: 'rgba(255,248,220,0.85)' }}
                      data-testid="celebration-parking-text">
                      {parkingText}
                    </p>
                  )}
                  {parkingMapLink && (
                    <a
                      href={parkingMapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] tracking-[0.28em] uppercase font-medium"
                      style={{ background: 'transparent', color: theme.accent, border: `1px solid ${theme.accent}` }}
                      data-testid="celebration-parking-map-link"
                    >
                      Parking on Maps <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollSection>
      )}

      {/* ── VIDEO / LIVE LINKS ────────────────────────────────────── */}
      {(videoLink || liveLink) && (
        <ScrollSection
          as="section"
          className="px-6 md:px-12 py-12"
          testid="celebration-media-links"
        >
          <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-4">
            {videoLink && (
              <a
                href={videoLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl p-6 flex items-center gap-4 hover:shadow-2xl transition-all hover:scale-[1.02]"
                style={{
                  background: theme.softBg,
                  border: `1px solid ${theme.softBorder}`,
                  color: '#FFF8DC',
                }}
                data-testid="celebration-video-link"
              >
                <div className="w-12 h-12 rounded-full grid place-items-center"
                  style={{ background: theme.accent }}>
                  <ImageIcon className="w-6 h-6" style={{ color: '#1c1410' }} />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] opacity-70">Watch the Story</div>
                  <div className="font-medium">Open Video</div>
                </div>
              </a>
            )}
            {liveLink && (
              <a
                href={liveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl p-6 flex items-center gap-4 hover:shadow-2xl transition-all hover:scale-[1.02]"
                style={{
                  background: theme.softBg,
                  border: `1px solid ${theme.softBorder}`,
                  color: '#FFF8DC',
                }}
                data-testid="celebration-live-link"
              >
                <div className="w-12 h-12 rounded-full grid place-items-center"
                  style={{ background: theme.accent }}>
                  <Radio className="w-6 h-6" style={{ color: '#1c1410' }} />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] opacity-70">Live Stream</div>
                  <div className="font-medium">Join Live</div>
                </div>
              </a>
            )}
          </div>
        </ScrollSection>
      )}

      {/* ── RSVP ──────────────────────────────────────────────────── */}
      {/* BUG Q FIX (matches Bug 27 on wedding view): honour the
          sections_enabled.rsvp toggle. Default to "show" so existing
          celebrations created before this toggle was enforced keep their
          RSVP form visible. */}
      {(data?.sections_enabled?.rsvp !== false) && (
      <ScrollSection
        as="section"
        className="px-6 md:px-12 py-20"
        testid="celebration-rsvp"
      >
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-xs tracking-[0.32em] uppercase"
              style={{ color: theme.accent }}>
              Your Presence is a Gift
            </span>
            <h2 className="font-display text-3xl sm:text-5xl mt-2"
              style={{ color: '#FFF8DC' }}>RSVP</h2>
          </div>
          <div className="rounded-3xl p-6 sm:p-8 shadow-2xl"
            style={{
              background: theme.softBg,
              border: `1px solid ${theme.softBorder}`,
              backdropFilter: 'blur(8px)',
            }}>
            <RSVPInline
              slug={data?.slug}
              accent={theme.accent}
              verb={theme.rsvpVerb}
              previewMode={previewMode}
            />
          </div>
        </div>
      </ScrollSection>
      )}

      {/* ── BLESSINGS / WISHES WALL ───────────────────────────────── */}
      <ScrollSection
        as="section"
        className="px-6 md:px-12 py-20"
        testid="celebration-blessings"
      >
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <Heart className="w-8 h-8 mx-auto mb-2" style={{ color: theme.accent }} />
            <span className="text-xs tracking-[0.32em] uppercase"
              style={{ color: theme.accent }}>
              {theme.blessingVerb}
            </span>
            <h2 className="font-display text-3xl sm:text-5xl mt-2"
              style={{ color: '#FFF8DC' }}>Blessings Wall</h2>
          </div>
          {previewMode ? (
            /* Demo wishes — wedding viewer uses the same approach */
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { name: 'Anita Aunty', message: `Many wishes to dear ${firstName}! May happiness be your forever companion.` },
                { name: 'Vikram Uncle', message: `Such a beautiful moment. Sending love and blessings.` },
                { name: 'Priya', message: `So happy for ${firstName}! Wishing health, joy and laughter.` },
                { name: 'Cousin Tara', message: `Can't wait to celebrate this special day with the family!` },
              ].map((w, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.6, delay: idx * 0.06 }}
                  className="rounded-2xl p-4"
                  style={{
                    background: theme.softBg,
                    border: `1px solid ${theme.softBorder}`,
                  }}
                  data-testid={`celebration-demo-wish-${idx}`}
                >
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,248,220,0.92)' }}>
                    “{w.message}”
                  </p>
                  <p className="text-xs mt-3 tracking-[0.18em] uppercase"
                    style={{ color: theme.accent }}>
                    — {w.name}
                  </p>
                </motion.div>
              ))}
            </div>
          ) : (
            <WishesWallSection slug={data?.slug} />
          )}
        </div>
      </ScrollSection>

      {/* ── THANK-YOU section moved AFTER Live Photo Wall (Bug 7) ──── */}

      {/* ── LIVE PHOTO WALL ───────────────────────────────────────
          Same logic as wedding side: the host (logged in) uploads
          photos from their dashboard which appear here in real time.
          Guests get two ways to find / take their own photos:
            ① scan the QR  (good for guests next to the screen)
            ② tap "Get my photos" → passkey → selfie → AI match
       */}
      {!previewMode && data?.slug && (canLiveGallery || canFaceMatch) && (
        <LivePhotoWallSection
          slug={data.slug}
          accent={theme.accent}
          primary={theme.primary}
          softBg={theme.softBg}
          softBorder={theme.softBorder}
          eventLabel={theme.label}
          celebrantFirst={firstName}
          showGallery={canLiveGallery}
          showSelfie={canFaceMatch}
        />
      )}

      {/* ── MAJA FOOTER ──────────────────────────────────────────── */}
      <div className="px-6 md:px-12 pb-10">
        <MajaReferralCTA />
      </div>

      {/* ── CINEMATIC CLOSING — Bug 7 fix ─────────────────────────
          Replaces the previous static "Thank You" mid-page section.
          Now uses the same ClosingOrchestrator/CinematicClosing the
          wedding viewer uses → reverse Ken-Burns, falling petals,
          letterbox bars, dedication fade-up — and is placed RIGHT
          before the footer so it really is the page outro. */}
      {!opening && (
        <ClosingOrchestrator
          themeId={cat}
          eventType={cat}
          image={designBackdrop}
          bride={firstName}
          groom={parents || ''}
          date={formattedDate}
        />
      )}

      {/* ── HEARTFELT GRATITUDE — kept as a tiny "with love" line that
          sits over the closing motif so the closing_message text the
          host wrote is still shown. */}
      <ScrollSection
        as="section"
        className="relative px-6 md:px-12 py-16 text-center overflow-hidden"
        testid="celebration-closing"
      >
        <div className="absolute inset-0 opacity-10" style={{ background: theme.heroGradient }} />
        <div className="relative max-w-2xl mx-auto">
          <Sparkles className="w-8 h-8 mx-auto mb-4" style={{ color: theme.accent }} />
          <span className="text-xs tracking-[0.42em] uppercase block mb-3"
            style={{ color: theme.accent }}>
            With Heartfelt Gratitude
          </span>
          <p className="font-display text-xl sm:text-2xl italic leading-relaxed"
            style={{ color: 'rgba(255,248,220,0.92)' }}
            data-testid="celebration-closing-message">
            {closingMsg}
          </p>
          <p className="text-sm mt-5 tracking-[0.32em] uppercase"
            style={{ color: theme.accent }}>
            — The {parents ? parents.split(' & ').slice(-1)[0] : firstName} Family
          </p>
        </div>
      </ScrollSection>

      {/* ── FOOTER (celebrant name + brand) ──────────────────────── */}
      <footer className="relative px-6 md:px-12 pt-10 pb-16 text-center"
        style={{ borderTop: `1px solid ${theme.softBorder}` }}
        data-testid="celebration-footer">
        <p className="font-display text-3xl sm:text-4xl"
          style={{ color: '#FFF8DC' }}>
          {celebrantName}
        </p>
        <p className="text-xs tracking-[0.32em] uppercase mt-3"
          style={{ color: theme.accent, opacity: 0.85 }}>
          Crafted with reverence · MAJA Invites
        </p>
      </footer>

      {/* ── Sticky CTA (preview only) ────────────────────────────── */}
      {previewMode && (
        <UseThisDesignCTA
          accent={theme.accent}
          targetUrl={previewExitTo}
        />
      )}

      {/* ── "Share your photo" floating button removed per host request —
          guests should only use the "Get my photos (AI face match)" option
          inside the Live Photo Wall section, not push photos themselves. */}
    </div>
  );
};

export default CelebrationPublicView;
