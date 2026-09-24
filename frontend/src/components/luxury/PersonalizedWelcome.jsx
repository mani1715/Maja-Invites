import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Crown, Sparkles, Volume2, Heart } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Prompt 14 — Personalized Guest Welcome
 *
 * When a guest visits ?g={token} on a wedding invitation, this component
 * fetches their personalized data and shows a cinematic welcome card
 * with their name, table, meal preference, events, and optional voice message
 * recorded by the couple.
 *
 * Props:
 *  - slug: wedding slug
 *  - token: 12-char guest token from URL ?g={...}
 *  - onDismiss?: optional callback when guest closes the welcome
 *
 * Behaviour:
 *  - Shows for 7s on first visit, then fades to a small floating bookmark
 *  - Bookmark can be re-opened any time to replay the voice or see details
 */
const PersonalizedWelcome = ({ slug, token }) => {
  const [guest, setGuest] = useState(null);
  const [open, setOpen] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!slug || !token) return;
    axios.get(`${API_URL}/api/invite/${slug}/guest/${token}`)
      .then((r) => setGuest(r.data))
      .catch(() => setInvalid(true));
  }, [slug, token]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };

  if (invalid) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
        style={{ background: 'rgba(6,4,2,0.95)' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="lux-glass text-center p-10 max-w-md"
          style={{ background: 'rgba(14,10,6,0.97)' }}>
          <Sparkles className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--lux-gold)' }} />
          <h2 className="font-display text-3xl mb-3" style={{ color: '#FFF8DC' }}>
            This <span className="font-script italic text-gold">invitation</span><br />was not for this guest.
          </h2>
          <p className="text-sm" style={{ color: 'rgba(255,248,220,0.62)' }}>
            The personal link may have a typo. You may still enjoy the invitation by visiting it without the personal code.
          </p>
        </motion.div>
      </div>
    );
  }

  if (!guest) return null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-6"
            style={{
              background: 'radial-gradient(circle at 50% 40%, rgba(74,14,42,0.5), rgba(6,4,2,0.96) 70%)',
              backdropFilter: 'blur(20px)',
            }}
            data-testid="personalized-welcome"
          >
            {/* Floating petals */}
            <Petals />

            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              className="relative max-w-lg w-full text-center"
            >
              <div className="lux-glass p-10 md:p-12 relative overflow-hidden"
                style={{ background: 'rgba(14,10,6,0.92)' }}>

                {guest.is_vip && (
                  <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(139,0,0,0.18))', border: '1px solid var(--lux-border-strong)' }}>
                    <Crown className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
                    <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: '#D4AF37' }}>VIP Guest</span>
                  </div>
                )}

                <span className="lux-eyebrow block mb-4">◆ A note for you</span>

                <motion.h1
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4, duration: 1.2 }}
                  className="font-display text-3xl md:text-5xl leading-[1.1] mb-1"
                  style={{ color: '#FFF8DC' }}
                >
                  Dear
                </motion.h1>

                <NameReveal name={guest.name} />

                {guest.relationship && (
                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 0.9 }}
                    className="font-script italic text-xl text-gold mt-2"
                  >
                    {guest.relationship}
                  </motion.p>
                )}

                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7 }}
                  className="mt-6 text-base leading-[1.85]" style={{ color: 'rgba(255,248,220,0.9)' }}
                >
                  We've kept a special place for you at <span className="text-gold">{guest.couple}'s</span> celebration.
                </motion.p>

                {/* Details strip */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 }}
                  className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-7"
                >
                  {guest.table_number && (
                    <Detail label="Table" value={`T${guest.table_number}${guest.seat_number ? ' · S' + guest.seat_number : ''}`} />
                  )}
                  {guest.meal_preference && guest.meal_preference !== 'unspecified' && (
                    <Detail label="Meal" value={guest.meal_preference.replace('_', ' ')} />
                  )}
                  {guest.events_invited?.length > 0 && (
                    <Detail label="Events" value={`${guest.events_invited.length} Event${guest.events_invited.length > 1 ? 's' : ''}`} />
                  )}
                </motion.div>

                {/* Voice message */}
                {guest.voice_message_url && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.3 }}
                    className="mt-6 p-4 rounded-xl"
                    style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid var(--lux-border)' }}
                  >
                    <div className="flex items-center gap-3">
                      <button onClick={togglePlay} className="w-12 h-12 rounded-full grid place-items-center transition-transform hover:scale-105"
                        style={{ background: 'linear-gradient(135deg, #B8902B, #D4AF37, #E8C766)', color: '#16110C' }}
                        data-testid="welcome-voice-play">
                        {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                      </button>
                      <div className="flex-1 text-left">
                        <div className="text-xs tracking-[0.22em] uppercase mb-0.5" style={{ color: 'var(--lux-gold)' }}>
                          A voice message
                        </div>
                        <div className="text-[11px]" style={{ color: 'rgba(255,248,220,0.8)' }}>
                          From the couple, for you
                        </div>
                      </div>
                      <Volume2 className="w-4 h-4" style={{ color: 'rgba(255,248,220,0.4)' }} />
                    </div>
                    {/* Waveform animation while playing */}
                    {playing && <Waveform />}
                    <audio
                      ref={audioRef}
                      src={`${API_URL}${guest.voice_message_url}`}
                      onEnded={() => setPlaying(false)}
                      onPause={() => setPlaying(false)}
                      preload="metadata"
                    />
                  </motion.div>
                )}

                <motion.button
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }}
                  onClick={() => setOpen(false)}
                  className="lux-btn mt-8 w-full justify-center"
                  data-testid="welcome-continue"
                >
                  <Sparkles className="w-4 h-4" /> Open the invitation
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating bookmark to reopen */}
      {!open && (
        <motion.button
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => setOpen(true)}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-[60] px-3 py-3 rounded-l-2xl text-xs tracking-[0.18em] uppercase"
          style={{
            background: 'rgba(14,10,6,0.92)',
            border: '1px solid var(--lux-border-strong)',
            borderRight: 'none',
            color: 'var(--lux-gold)',
            writingMode: 'vertical-rl',
            backdropFilter: 'blur(10px)',
          }}
          data-testid="welcome-bookmark"
        >
          <Heart className="w-3 h-3 inline mb-2" /> &nbsp;Dear {guest.name?.split(' ')[0]}
        </motion.button>
      )}
    </>
  );
};

const NameReveal = ({ name }) => {
  const letters = (name || '').split('');
  return (
    <motion.h2
      initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 0.7, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      className="font-script italic text-5xl md:text-7xl mt-2 whitespace-nowrap overflow-hidden text-ellipsis px-2"
      style={{
        lineHeight: 1.05,
        background: 'linear-gradient(180deg, #F0D67E 0%, #D4AF37 50%, #8C6A1A 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
      }}
    >
      {letters.map((c, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 + i * 0.06, duration: 0.5 }}
          style={{ display: 'inline-block' }}
        >
          {c === ' ' ? '\u00A0' : c}
        </motion.span>
      ))}
    </motion.h2>
  );
};

const Detail = ({ label, value }) => (
  <div className="px-3 py-2 rounded-lg text-left" style={{ border: '1px solid var(--lux-border)', background: 'rgba(255,255,255,0.02)' }}>
    <div className="text-[9px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.7)' }}>{label}</div>
    <div className="text-sm capitalize" style={{ color: '#FFF8DC' }}>{value}</div>
  </div>
);

const Waveform = () => (
  <div className="flex items-end justify-center gap-1 h-6 mt-3">
    {Array.from({ length: 22 }).map((_, i) => (
      <motion.span
        key={i}
        animate={{ height: ['20%', '90%', '40%', '70%', '20%'] }}
        transition={{ duration: 0.9 + Math.random() * 0.6, repeat: Infinity, delay: i * 0.04 }}
        style={{ display: 'inline-block', width: 2, background: 'linear-gradient(180deg, #E8C766, #8C6A1A)', borderRadius: 2 }}
      />
    ))}
  </div>
);

const Petals = () => (
  <>
    {Array.from({ length: 14 }).map((_, i) => (
      <motion.span
        key={i}
        initial={{ y: -40, x: Math.random() * 600 - 300, opacity: 0 }}
        animate={{ y: 800, opacity: [0, 0.8, 0], rotate: 360 }}
        transition={{ duration: 6 + Math.random() * 4, repeat: Infinity, delay: i * 0.4, ease: 'linear' }}
        className="fixed pointer-events-none"
        style={{
          width: 14, height: 14, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #E8C4B8, transparent 65%)',
          filter: 'blur(2px)', left: '50%',
        }}
      />
    ))}
  </>
);

export default PersonalizedWelcome;
