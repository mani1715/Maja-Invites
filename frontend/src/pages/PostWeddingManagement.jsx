import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Moon, Heart, Sparkles, Calendar, Images } from 'lucide-react';
import ThankYouMessageEditor from '@/components/ThankYouMessageEditor';
import WeddingAlbumUploader from '@/components/WeddingAlbumUploader';
import '@/styles/luxury.css';

const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: 'blur(8px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 1.0, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
};

/**
 * Prompt 15 — Wedding Memory Archive (luxury edition)
 */
const PostWeddingManagement = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  // BUG L FIX: include `loading` so we don't bounce the photographer to
  // /admin/login while the auth context is still hydrating from localStorage.
  // Without this, every page-load briefly saw `admin === null` and redirected
  // before the JWT was parsed.
  const { admin, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!admin) navigate('/studio/login', { replace: true });
  }, [admin, authLoading, navigate]);

  return (
    <div className="luxe min-h-screen relative" data-testid="post-wedding-management">
      {/* Decorative orbits + nostalgic glow */}
      <div className="lux-orbit" style={{ width: 900, height: 900, top: -260, right: -300 }} />
      <div className="lux-orbit" style={{ width: 1200, height: 1200, top: -420, right: -460, opacity: 0.35 }} />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(900px 500px at 70% 10%, rgba(232,196,184,0.08), transparent 70%)' }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 py-10">
        <button
          onClick={() => navigate('/studio/dashboard')}
          className="lux-btn lux-btn-ghost text-xs mb-6"
          data-testid="pw-back"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Studio
        </button>

        {/* Hero */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-12">
          <span className="lux-eyebrow block mb-4">◆ Memory Archive · Forever Preserved</span>
          <h1 className="font-display text-[2.6rem] md:text-[4.4rem] leading-[1.02]" style={{ color: 'var(--lux-text)' }}>
            The story is <span className="text-gold font-script italic">complete</span>.<br />
            The memory begins.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-[1.85]" style={{ color: 'var(--lux-text-muted)' }}>
            When the wedding day passes, the invitation transforms into a permanent cinematic archive —
            a thank-you letter, a final album, a digital heirloom that lasts forever.
          </p>
        </motion.div>

        {/* Memory mode quick stats */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={1}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
        >
          {[
            { icon: Heart,    label: 'Thank You Message', sub: 'Text or video' },
            { icon: Images,   label: 'Wedding Album',     sub: 'Lifetime access' },
            { icon: Moon,     label: 'Memory Mode',       sub: 'Auto-activates' },
            { icon: Calendar, label: 'Same URL',          sub: 'Forever live' },
          ].map((t) => (
            <div key={t.label} className="lux-glass p-5">
              <t.icon className="w-5 h-5 mb-3" style={{ color: 'var(--lux-gold)' }} strokeWidth={1.4} />
              <div className="font-heading text-base mb-1" style={{ color: 'var(--lux-text)' }}>{t.label}</div>
              <div className="text-[0.7rem] tracking-[0.22em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>{t.sub}</div>
            </div>
          ))}
        </motion.div>

        {/* Thank you message */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={2} className="lux-glass p-6 md:p-10 mb-8">
          <div className="flex items-center gap-3 mb-5">
            <Heart className="w-5 h-5" style={{ color: 'var(--lux-gold)' }} />
            <h2 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--lux-text)' }}>
              A note of <span className="font-script italic text-gold">gratitude</span>
            </h2>
          </div>
          <ThankYouMessageEditor profileId={profileId} />
        </motion.div>

        {/* Album uploader */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3} className="lux-glass p-6 md:p-10 mb-8">
          <div className="flex items-center gap-3 mb-5">
            <Images className="w-5 h-5" style={{ color: 'var(--lux-gold)' }} />
            <h2 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--lux-text)' }}>
              The final <span className="font-script italic text-gold">album</span>
            </h2>
          </div>
          <WeddingAlbumUploader profileId={profileId} />
        </motion.div>

        {/* Memory mode explainer */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={4}
          className="lux-glass p-8 md:p-12 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(74,14,42,0.25), rgba(212,175,55,0.06))' }}
        >
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full grid place-items-center"
            style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}>
            <Moon className="w-7 h-7" style={{ color: '#16110C' }} />
          </div>
          <span className="lux-eyebrow block mb-3">◆ About Memory Mode</span>
          <h3 className="font-display text-3xl mb-5" style={{ color: 'var(--lux-text)' }}>
            From event page → eternal album.
          </h3>
          <p className="text-base leading-[1.85] mb-5" style={{ color: 'var(--lux-text-muted)' }}>
            After your wedding date passes, the invitation gracefully transforms into a Memory Mode experience —
            calm, nostalgic, and built to be revisited for years.
          </p>
          <ul className="space-y-2.5 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            {[
              'RSVP form quietly retires',
              'Countdown timer dissolves into history',
              'Focus shifts to photos, videos, and your thank-you',
              'Cinematic Memory Mode UI replaces event urgency',
              'Guests revisit anytime — forever',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Sparkles className="w-3.5 h-3.5 mt-1" style={{ color: 'var(--lux-gold)' }} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-7 italic text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            “A wedding is one day. The memory is forever.”
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default PostWeddingManagement;
