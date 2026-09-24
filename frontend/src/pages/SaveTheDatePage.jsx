import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, useReducedMotion } from 'framer-motion';
import { Calendar, MapPin, Sparkles, ArrowRight } from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Phase 2A — Save the Date Page
 *
 * A lightweight, single-page teaser meant to be shared early
 * (weeks/months before the actual invitation goes out).
 * Shows: couple names, the date, venue (city only), a live countdown,
 * and a CTA that opens the full invitation when ready.
 */
const SaveTheDatePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(new Date());
  const reduce = useReducedMotion();

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/save-the-date/${slug}`);
        if (!off) setData(data);
      } catch (e) {
        if (!off) setErr(e.response?.data?.detail || 'Invitation not found.');
      }
    })();
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => { off = true; clearInterval(t); };
  }, [slug]);

  const eventDate = useMemo(() => (data?.event_date ? new Date(data.event_date) : null), [data]);

  const countdown = useMemo(() => {
    if (!eventDate) return null;
    const diff = eventDate.getTime() - now.getTime();
    if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0, passed: true };
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000) / 60000);
    const secs  = Math.floor((diff % 60000) / 1000);
    return { days, hours, mins, secs, passed: false };
  }, [eventDate, now]);

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E0A07] text-center px-6">
        <div>
          <div className="font-display text-3xl mb-3" style={{ color: '#FFF8DC' }}>This page is unavailable</div>
          <div className="text-sm" style={{ color: 'rgba(255,248,220,0.8)' }}>{err}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E0A07]">
        <Sparkles className="w-5 h-5 animate-pulse" style={{ color: '#D4AF37' }} />
      </div>
    );
  }

  const couplePhoto = data.couple_photo_url || data.bride_photo_url || data.groom_photo_url;
  const dateStr = eventDate ? eventDate.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) : 'A date soon to be revealed';

  return (
    <div className="min-h-screen overflow-x-hidden relative" style={{
      background: 'radial-gradient(1200px 600px at 50% -10%, rgba(212,175,55,0.18), transparent 60%), #0B0805',
      color: '#FFF8DC',
    }} data-testid="save-the-date-page">
      {/* Decorative gold border frame */}
      <div className="pointer-events-none absolute inset-4 md:inset-8 rounded-[18px]" style={{
        border: '1px solid rgba(212,175,55,0.35)',
        boxShadow: 'inset 0 0 60px rgba(212,175,55,0.08)',
      }} />

      <main className="relative max-w-3xl mx-auto px-6 md:px-12 py-16 md:py-24 text-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          <span className="lux-eyebrow inline-flex items-center gap-2 mb-6">
            <Sparkles className="w-3.5 h-3.5" /> ◆ Save the Date
          </span>
        </motion.div>

        {couplePhoto && (
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-10 relative"
            style={{ width: 220, height: 220 }}
          >
            <div className="absolute -inset-3 rounded-full" style={{
              background: 'conic-gradient(from 90deg, #D4AF37, #8C6A1A, #E8C766, #D4AF37)',
              filter: 'blur(2px)', opacity: 0.6,
            }} />
            <img
              src={couplePhoto}
              alt={`${data.bride_name} & ${data.groom_name}`}
              className="relative rounded-full object-cover w-full h-full"
              style={{ border: '3px solid #D4AF37' }}
              data-testid="save-the-date-photo"
            />
          </motion.div>
        )}

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.15 }}
          className="font-display leading-[1.05] break-words"
          style={{ fontSize: 'clamp(2.2rem, 8vw, 5.4rem)', wordBreak: 'break-word' }}
        >
          <span data-testid="save-the-date-bride">{data.bride_name}</span>
          <span className="block my-2 italic font-script" style={{ color: '#D4AF37', fontSize: '0.55em' }}>&amp;</span>
          <span data-testid="save-the-date-groom">{data.groom_name}</span>
        </motion.h1>

        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.8 }}
          className="mt-6 mb-10"
        >
          <div className="flex items-center justify-center gap-2 text-base md:text-lg" style={{ color: 'rgba(255,248,220,0.85)' }}>
            <Calendar className="w-4 h-4" style={{ color: '#D4AF37' }} />
            <span data-testid="save-the-date-date">{dateStr}</span>
          </div>
          {(data.venue || data.city) && (
            <div className="flex items-center justify-center gap-2 text-sm mt-2" style={{ color: 'rgba(255,248,220,0.82)' }}>
              <MapPin className="w-4 h-4" style={{ color: '#D4AF37' }} />
              <span data-testid="save-the-date-venue">{[data.venue, data.city].filter(Boolean).join(' · ')}</span>
            </div>
          )}
        </motion.div>

        {/* Countdown */}
        {countdown && !countdown.passed && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.8 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 max-w-md mx-auto mb-12"
            data-testid="save-the-date-countdown"
          >
            {[
              { label: 'Days',    val: countdown.days  },
              { label: 'Hours',   val: countdown.hours },
              { label: 'Minutes', val: countdown.mins  },
              { label: 'Seconds', val: countdown.secs  },
            ].map((b) => (
              <div key={b.label} className="lux-glass py-3 sm:py-4 px-2 min-w-0">
                <div className="font-display text-2xl sm:text-3xl md:text-4xl tabular-nums" style={{ color: '#FFF8DC' }}>
                  {String(b.val).padStart(2, '0')}
                </div>
                <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] uppercase mt-1 truncate" style={{ color: 'rgba(255,248,220,0.78)' }}>{b.label}</div>
              </div>
            ))}
          </motion.div>
        )}

        {data.invitation_message && (
          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85 }}
            className="max-w-xl mx-auto italic mb-10 text-sm md:text-base"
            style={{ color: 'rgba(255,248,220,0.85)' }}
          >
            {data.invitation_message}
          </motion.p>
        )}

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          <button
            type="button"
            onClick={() => navigate(`/invite/${slug}`)}
            className="lux-btn"
            data-testid="save-the-date-cta"
          >
            View Full Invitation <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <div className="mt-6 text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.62)' }}>
            ◆ Formal invitation to follow ◆
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default SaveTheDatePage;
