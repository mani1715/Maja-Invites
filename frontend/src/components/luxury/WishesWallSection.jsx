import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Heart, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { useInvitePrefetch } from '@/context/InvitePrefetchContext';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * PROMPT 07 — Public wishes wall on the invitation page.
 * - Up to 3 featured wishes pinned at top in burgundy spotlight cards
 * - Approved wishes below in a CSS-columns masonry (3 cols desktop, 1 col mobile)
 * - "Leave a Wish" gold CTA opens a modal
 */
// `seedWishes` renders a static wall with no network + no submit: used by the
// theme preview, which has no real invitation (and therefore no slug) behind it.
const WishesWallSection = ({ slug, seedWishes }) => {
  const prefetch = useInvitePrefetch(slug);
  const [wishes, setWishes] = useState(prefetch?.wishes || seedWishes || []);
  const [loading, setLoading] = useState(!prefetch && !seedWishes && !!slug);
  const [modalOpen, setModalOpen] = useState(false);
  // By default the wall stays compact: guests see the "Leave a wish" CTA plus a
  // small taste of recent wishes. They expand to read the rest.
  const [showAll, setShowAll] = useState(false);
  const PREVIEW_COUNT = 3;

  const load = useCallback(async () => {
    if (!slug) { setLoading(false); return; }   // no slug yet (or preview) -> never fetch /invite/undefined/wishes
    try {
      const r = await axios.get(`${API_URL}/api/public/invite/${slug}/wishes?limit=80`);
      setWishes(r.data?.wishes || []);
    } catch (_) {
      setWishes([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // Skip network if prefetch already populated us.
    if (prefetch?.wishes?.length) {
      setWishes(prefetch.wishes);
      setLoading(false);
      return;
    }
    load();
  }, [load, prefetch]);

  const featured = wishes.filter((w) => w.is_featured).slice(0, 3);
  const regular = wishes.filter((w) => !w.is_featured);
  const visibleRegular = showAll ? regular : regular.slice(0, PREVIEW_COUNT);
  const hiddenCount = regular.length - visibleRegular.length;

  return (
    <section className="px-4 md:px-16 py-24" data-testid="section-wishes-wall">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.span initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.1 }}
            className="lux-eyebrow block mb-3">◆ Words of Love</motion.span>
          <motion.h2 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
            className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-6" style={{ color: '#FFF8DC' }}>
            Blessings from <span className="font-script italic text-gold">our circle</span>
          </motion.h2>
          {slug && (
            <motion.button
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
              whileHover={{ y: -2 }}
              onClick={() => setModalOpen(true)}
              className="lux-btn inline-flex items-center gap-2 mt-2"
              data-testid="leave-wish-btn"
            >
              <Heart className="w-4 h-4" /> Leave a wish
            </motion.button>
          )}
        </div>

        {/* Featured spotlight cards */}
        {featured.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12" data-testid="wishes-featured">
            {featured.map((w, i) => (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ delay: i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative p-7 md:p-8"
                style={{
                  background: 'linear-gradient(160deg, #4A0E2A 0%, #2A0617 100%)',
                  border: '1px solid rgba(212,175,55,0.55)',
                  borderRadius: '0.75rem',
                  boxShadow: '0 22px 50px rgba(74,14,42,0.45), inset 0 1px 0 rgba(212,175,55,0.18)',
                }}
                data-testid={`wish-featured-${i}`}
              >
                {/* Spotlight glow */}
                <div className="absolute -top-1 -right-1 w-12 h-12 grid place-items-center rounded-full"
                  style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}>
                  <Sparkles className="w-5 h-5" style={{ color: '#1A0810' }} />
                </div>
                <div className="lux-eyebrow text-[9px] mb-3" style={{ color: 'rgba(232,196,184,0.85)' }}>◆ Featured wish</div>
                <p className="font-display italic text-[1.1rem] md:text-[1.18rem] leading-[1.55] mb-5"
                  style={{ color: '#FFF8DC' }}>
                  “{w.message}”
                </p>
                <div className="font-script text-xl text-gold italic">— {w.guest_name}</div>
                {w.relationship && (
                  <div className="text-[10px] tracking-[0.25em] uppercase mt-1" style={{ color: 'rgba(232,196,184,0.65)' }}>
                    {w.relationship}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Masonry of regular wishes (compact preview by default) */}
        {regular.length > 0 ? (
          <>
          <div className="wishes-masonry" data-testid="wishes-masonry">
            {visibleRegular.map((w, i) => (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px', amount: 0.1 }}
                transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.55 }}
                className="break-inside-avoid mb-4 md:mb-5 p-5 md:p-6 lux-glass"
                data-testid={`wish-${i}`}
              >
                <p className="font-display italic text-[1.02rem] md:text-[1.06rem] leading-[1.65] mb-3"
                  style={{ color: 'rgba(255,248,220,0.95)' }}>
                  “{w.message}”
                </p>
                <div className="font-script text-lg italic text-gold">— {w.guest_name}</div>
                {w.relationship && (
                  <div className="text-[9px] tracking-[0.25em] uppercase mt-0.5" style={{ color: 'rgba(255,248,220,0.62)' }}>
                    {w.relationship}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <div className="text-center mt-8">
              <button
                onClick={() => setShowAll(true)}
                className="lux-btn-ghost inline-flex items-center gap-2"
                data-testid="wishes-view-all"
                style={{
                  padding: '0.6rem 1.4rem', borderRadius: '999px',
                  border: '1px solid rgba(212,175,55,0.4)', color: '#FFF8DC',
                  background: 'rgba(212,175,55,0.08)', fontSize: '0.85rem',
                  letterSpacing: '0.05em', cursor: 'pointer',
                }}
              >
                <MessageCircle className="w-4 h-4" /> View all {regular.length} wishes
              </button>
            </div>
          )}
          </>
        ) : (
          !loading && featured.length === 0 && (
            <div className="lux-glass p-10 text-center" data-testid="wishes-empty">
              <MessageCircle className="w-7 h-7 mx-auto mb-3" style={{ color: '#D4AF37' }} />
              <p className="text-sm md:text-base italic" style={{ color: 'rgba(255,248,220,0.85)' }}>
                Be the first to bless the couple — leave a wish above.
              </p>
            </div>
          )
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <LeaveWishModal
            slug={slug}
            onClose={() => setModalOpen(false)}
            onSubmitted={() => { setShowAll(true); load(); }}
          />
        )}
      </AnimatePresence>

      <style>{`
        .wishes-masonry { column-count: 1; column-gap: 1.25rem; }
        @media (min-width: 768px) { .wishes-masonry { column-count: 2; } }
        @media (min-width: 1100px) { .wishes-masonry { column-count: 3; } }
        .wishes-masonry > * { display: block; }
      `}</style>
    </section>
  );
};

const RELATIONSHIPS = [
  '', 'Family', "Bride's side", "Groom's side", 'Childhood friend',
  'College friend', 'Cousin', 'Colleague', 'Neighbour', 'Other',
];

const LeaveWishModal = ({ slug, onClose, onSubmitted }) => {
  const [form, setForm] = useState({ guest_name: '', relationship: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await axios.post(`${API_URL}/api/invite/${slug}/wishes`, {
        guest_name: form.guest_name.trim(),
        relationship: form.relationship || undefined,
        message: form.message.trim(),
      });
      setDone(true);
      // Auto-approved by default (backend) → refresh the wall so the guest sees
      // their own wish appear straight away instead of "nothing happened".
      onSubmitted?.();
      setTimeout(onClose, 2400);
    } catch (err) {
      const d = err.response?.data?.detail;
      setError(typeof d === 'string' ? d : (d?.[0]?.msg || 'Could not send wish.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-0 md:p-6"
      style={{ background: 'rgba(8,6,4,0.85)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
      data-testid="leave-wish-modal"
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full md:max-w-lg lux-glass"
        style={{
          borderRadius: '1.5rem 1.5rem 0 0',
          padding: '1.75rem',
          background: 'linear-gradient(180deg, rgba(26,20,15,0.98), rgba(15,11,8,0.99))',
          border: '1px solid rgba(212,175,55,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <span className="lux-eyebrow block mb-1.5">◆ A blessing</span>
            <h3 className="font-display text-2xl md:text-3xl" style={{ color: '#FFF8DC' }}>
              Leave a <span className="font-script italic text-gold">wish</span>
            </h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full grid place-items-center"
            style={{ background: 'rgba(255,248,220,0.08)', color: 'rgba(255,248,220,0.8)' }}
            data-testid="leave-wish-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="py-8 text-center" data-testid="leave-wish-success">
            <div className="w-14 h-14 mx-auto rounded-full grid place-items-center mb-3"
              style={{ background: 'linear-gradient(135deg,#D4AF37,#8C6A1A)' }}>
              <Sparkles className="w-6 h-6" style={{ color: '#FFF8DC' }} />
            </div>
            <h4 className="font-display text-xl mb-1.5" style={{ color: '#FFF8DC' }}>Your wish has been received</h4>
            <p className="text-sm italic" style={{ color: 'rgba(255,248,220,0.85)' }}>
              The couple will see it soon ✨
            </p>
          </motion.div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>Your name</label>
              <input type="text" required maxLength={80}
                value={form.guest_name}
                onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-transparent outline-none"
                style={{ color: '#FFF8DC', border: '1px solid var(--lux-border, rgba(212,175,55,0.18))', caretColor: '#D4AF37' }}
                data-testid="leave-wish-name"
              />
            </div>
            <div>
              <label className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>Relationship (optional)</label>
              <select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-transparent outline-none cursor-pointer"
                style={{ color: '#FFF8DC', border: '1px solid var(--lux-border, rgba(212,175,55,0.18))', appearance: 'none' }}
                data-testid="leave-wish-relationship"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r} style={{ background: '#1A130B', color: '#FFF8DC' }}>
                    {r || '— select —'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>Your wish</label>
              <textarea required rows={4} maxLength={600}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="A blessing for the couple…"
                className="w-full px-4 py-3 rounded-lg bg-transparent outline-none resize-y"
                style={{ color: '#FFF8DC', border: '1px solid var(--lux-border, rgba(212,175,55,0.18))', caretColor: '#D4AF37', fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: '1.05rem' }}
                data-testid="leave-wish-message"
              />
              <div className="text-[10px] mt-1 text-right" style={{ color: 'rgba(255,248,220,0.4)' }}>
                {form.message.length}/600
              </div>
            </div>
            {error && (
              <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'rgba(139,0,0,0.18)', color: '#FFD7C9' }}>{error}</div>
            )}
            <button type="submit" disabled={busy}
              className="lux-btn w-full justify-center"
              data-testid="leave-wish-submit">
              <Send className="w-4 h-4" /> {busy ? 'Sending…' : 'Send your wish'}
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
};

export default React.memo(WishesWallSection);
