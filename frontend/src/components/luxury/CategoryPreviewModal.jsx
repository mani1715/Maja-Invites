/**
 * CategoryPreviewModal — preview the entire invitation category (Wedding,
 * Baby Birthday, Half Saree, Puberty, Dhoti) BEFORE the customer signs up.
 *
 * Shows:
 *   • Category hero (icon + label + tagline)
 *   • Sample designs (mini grid)
 *   • Full list of features included in this invitation type
 *   • Credit pricing summary
 *   • CTAs:  "Browse all designs"  →  scroll to themes section with this tab active
 *           "Sign in & create"     →  auth modal then design picker
 *
 * July 2026 — fixes the user complaint: "I clicked on Baby Birthday card but
 * couldn't see any preview, it just sent me to login".
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Coins, Sparkles, Check, ArrowRight, Heart, Music, Camera,
  ImageIcon, QrCode, Globe2, MessageCircle, MapPin, ShieldCheck, Clock,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const resolveImg = (u) => {
  if (!u) return '';
  if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('blob:')) return u;
  return `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`;
};

/* Default feature list for wedding (matches the homepage "Invitation Options"
   section so the preview tells the same story). */
const WEDDING_FEATURES = [
  { key: 'wax_seal_opening',  label: 'Wax-Seal 3D Unfolding Intro',  default: true,  credits: 0, icon: '✨' },
  { key: 'couple_photos',     label: 'Couple + Bride/Groom Gallery', default: true,  credits: 0, icon: '🖼️' },
  { key: 'background_music',  label: 'Curated Background Music',     default: true,  credits: 0, icon: '🎵' },
  { key: 'countdown',         label: 'Live Muhurat Countdown',       default: true,  credits: 0, icon: '⏱️' },
  { key: 'rsvp',              label: 'Guest Wishes + RSVP',          default: true,  credits: 0, icon: '✉️' },
  { key: 'venue_maps',        label: 'Smart Venue Maps',             default: false, credits: 1, icon: '📍' },
  { key: 'multi_language',    label: 'Multi-language Invite',        default: false, credits: 1, icon: '🌐' },
  { key: 'passcode_lock',     label: 'Passcode-Protected Link',      default: false, credits: 1, icon: '🔒' },
  { key: 'qr_code_pass',      label: 'QR Code Entry Pass',           default: false, credits: 2, icon: '🪪' },
  { key: 'ai_story',          label: 'AI Story Composer',            default: false, credits: 2, icon: '🤖' },
  { key: 'live_gallery',      label: 'Live Photo Gallery',           default: false, credits: 3, icon: '📷' },
  { key: 'gift_registry',     label: 'Digital Shagun · UPI/QR',      default: false, credits: 3, icon: '💝' },
];

const FALLBACK_HERO = {
  wedding:       { icon: '💍', label: 'Wedding',             tagline: 'Crafted wedding invitations — engagement, haldi, mehendi, marriage, reception.', color: '#D4AF37', gradient: 'linear-gradient(135deg,#8B0000 0%,#D4AF37 100%)' },
  baby_birthday: { icon: '🎂', label: 'Baby Birthday',       tagline: 'Sweet, joyful invitations for 1st to 5th birthdays.',                              color: '#FF69B4', gradient: 'linear-gradient(135deg,#FFB6C1 0%,#87CEEB 100%)' },
  half_saree:    { icon: '👗', label: 'Half Saree Ceremony', tagline: "A girl's traditional half-saree ceremony — silk, gold and grace.",                color: '#C71585', gradient: 'linear-gradient(135deg,#FF1493 0%,#FFD700 100%)' },
  puberty:       { icon: '🌸', label: 'Puberty Ceremony',    tagline: 'A blessed coming-of-age — turmeric, blessings and family.',                       color: '#FF8C00', gradient: 'linear-gradient(135deg,#FFD700 0%,#FF8C00 100%)' },
  dhoti:         { icon: '👔', label: 'Dhoti Ceremony',      tagline: "A boy's coming-of-age — dhoti, family pride and tradition.",                      color: '#7B68EE', gradient: 'linear-gradient(135deg,#4B0082 0%,#FFD700 100%)' },
};

const CategoryPreviewModal = ({
  open,
  category,         // 'wedding' | 'baby_birthday' | ...
  onClose,
  onBrowseDesigns,  // (categoryId) => void
  onSignIn,         // (categoryId) => void
}) => {
  const [meta, setMeta] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [features, setFeatures] = useState([]);
  const [pricing, setPricing] = useState({ design_credits: null, feature_credits: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !category) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setDesigns([]);
      setFeatures([]);
      try {
        // Always load category metadata
        const metaRes = await axios.get(`${API_URL}/api/event-categories/${category}`).catch(() => null);
        if (alive && metaRes?.data?.category) setMeta(metaRes.data.category);

        // Designs gallery (small preview tiles)
        const designsRes = await axios
          .get(`${API_URL}/api/event-categories/${category}/designs`)
          .catch(() => null);
        if (alive) setDesigns((designsRes?.data?.designs || []).slice(0, 6));

        // Features list
        if (category === 'wedding') {
          if (alive) setFeatures(WEDDING_FEATURES);
        } else {
          const featsRes = await axios
            .get(`${API_URL}/api/event-categories/${category}/features`)
            .catch(() => null);
          if (alive) setFeatures(featsRes?.data?.features || []);
        }

        // Pricing for normal user (homepage flow)
        const priceRes = await axios
          .get(`${API_URL}/api/event-categories/${category}/pricing?user_type=normal_user`)
          .catch(() => null);
        if (alive && priceRes?.data) setPricing(priceRes.data);
      } catch (e) {
        console.warn('CategoryPreviewModal load', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [open, category]);

  if (!open) return null;
  const hero = meta || FALLBACK_HERO[category] || FALLBACK_HERO.wedding;
  const accent = hero.primary_color || hero.color || '#D4AF37';
  const gradient = hero.hero_gradient || hero.gradient || 'linear-gradient(135deg,#8B0000 0%,#D4AF37 100%)';
  const baseDesignCredits = pricing.design_credits ?? 1;

  return (
    <AnimatePresence>
      <motion.div
        key="category-preview-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[200] grid place-items-center px-3 py-6 overflow-y-auto"
        style={{ background: 'rgba(11,9,8,0.92)', backdropFilter: 'blur(14px)' }}
        data-testid="category-preview-modal"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-5xl my-auto rounded-3xl overflow-hidden shadow-2xl flex flex-col"
          style={{
            background: 'linear-gradient(180deg,#171210 0%, #0d0a08 100%)',
            border: '1px solid rgba(212,175,55,0.25)',
            maxHeight: '94vh',
          }}
        >
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full grid place-items-center hover:bg-white/10 transition-colors"
            style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,248,220,0.2)' }}
            aria-label="Close preview"
            data-testid="category-preview-close"
          >
            <X className="w-4 h-4 text-white" />
          </button>

          {/* Hero strip */}
          <div className="relative w-full px-6 sm:px-10 py-8 sm:py-10 flex items-center gap-5"
            style={{ background: gradient }}>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0) 0%, rgba(11,9,8,0.55) 100%)' }} />
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl grid place-items-center text-3xl sm:text-4xl shrink-0"
              style={{ background: 'rgba(11,9,8,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,248,220,0.3)' }}>
              {hero.icon}
            </div>
            <div className="relative">
              <span className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase block mb-1"
                style={{ color: 'rgba(255,248,220,0.85)' }}>
                Invitation Type Preview
              </span>
              <h2 className="font-display text-2xl sm:text-4xl leading-tight" style={{ color: '#FFF8DC' }}
                data-testid="category-preview-label">
                {hero.label}
              </h2>
              {hero.label_traditional && (
                <p className="text-xs mt-1.5 tracking-wider" style={{ color: 'rgba(255,248,220,0.85)' }}>
                  {hero.label_traditional}
                </p>
              )}
              <p className="text-sm sm:text-[15px] mt-2 max-w-xl leading-relaxed"
                style={{ color: 'rgba(255,248,220,0.85)' }}>
                {hero.tagline}
              </p>
            </div>
          </div>

          {/* Body — two columns on desktop */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-5 gap-7"
            style={{ color: '#FFF8DC' }}>

            {/* LEFT — sample designs grid */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] tracking-[0.32em] uppercase"
                  style={{ color: 'rgba(255,248,220,0.78)' }}>
                  Sample Designs
                </span>
                <span className="text-[10px] tracking-wider uppercase"
                  style={{ color: 'rgba(255,248,220,0.62)' }}>
                  {designs.length > 0 ? `${designs.length} of many` : ''}
                </span>
              </div>
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[0,1,2,3,4,5].map((i) => (
                    <div key={i} className="aspect-[3/4] rounded-xl"
                      style={{ background: 'rgba(255,248,220,0.05)' }} />
                  ))}
                </div>
              ) : designs.length === 0 && category === 'wedding' ? (
                /* Wedding has separate masterThemes — show a poetic placeholder */
                <div className="rounded-2xl p-6 text-center"
                  style={{ background: 'rgba(255,248,220,0.04)', border: '1px solid rgba(212,175,55,0.18)' }}>
                  <div className="text-3xl mb-3">💍</div>
                  <p className="text-sm" style={{ color: 'rgba(255,248,220,0.85)' }}>
                    10 cinematic master themes — Royal Mughal, South Indian Temple,
                    Modern Minimal, Beach Destination, Punjabi Sangeet, Bengali Traditional,
                    Christian Elegant, Muslim Nikah, Nature Eco, Kerala Backwaters.
                  </p>
                  <p className="text-xs mt-3" style={{ color: 'rgba(255,248,220,0.7)' }}>
                    Each theme unfolds into 6 events and 18+ designs.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                  data-testid="category-preview-designs-grid">
                  {designs.map((d) => (
                    <div key={d.design_id} className="aspect-[3/4] rounded-xl overflow-hidden relative group"
                      style={{ border: '1px solid rgba(212,175,55,0.18)' }}
                      data-testid={`category-preview-design-${d.design_id}`}>
                      <img src={resolveImg(d.preview_image || d.thumbnail)} alt={d.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
                      <div className="absolute inset-x-0 bottom-0 px-2 py-1.5"
                        style={{ background: 'linear-gradient(180deg, transparent, rgba(11,9,8,0.92))' }}>
                        <p className="text-[10px] truncate" style={{ color: '#FFF8DC' }}>
                          {d.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* What does the invitation flow look like */}
              <div className="mt-6 rounded-2xl p-5"
                style={{ background: 'rgba(255,248,220,0.04)', border: '1px solid rgba(255,248,220,0.08)' }}>
                <span className="text-[10px] tracking-[0.32em] uppercase block mb-3"
                  style={{ color: 'rgba(255,248,220,0.78)' }}>
                  How it looks for guests
                </span>
                <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,248,220,0.85)' }}>
                  {[
                    'Cinematic opening with the celebrant\'s photo & blessings',
                    'Smooth scroll storytelling — never feels like a form',
                    'RSVP, wishes & gallery sections built-in',
                    'Mobile-first, share via WhatsApp or QR — one tap to open',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accent }} />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* RIGHT — feature list + pricing + CTAs */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              {/* Features included */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] tracking-[0.32em] uppercase"
                    style={{ color: 'rgba(255,248,220,0.78)' }}>
                    Features in this invitation
                  </span>
                  <span className="text-[10px] tracking-wider uppercase"
                    style={{ color: accent }}>
                    {features.length} total
                  </span>
                </div>
                {loading && features.length === 0 ? (
                  <div className="space-y-2">
                    {[0,1,2,3,4].map((i) => (
                      <div key={i} className="h-9 rounded-lg"
                        style={{ background: 'rgba(255,248,220,0.05)' }} />
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1"
                    data-testid="category-preview-features-list">
                    {features.map((f) => {
                      const included = f.default || (f.credits || 0) === 0;
                      const featCost = (pricing.feature_credits && pricing.feature_credits[f.key] != null)
                        ? pricing.feature_credits[f.key]
                        : (f.credits || 0);
                      return (
                        <li
                          key={f.key}
                          className="flex items-center justify-between px-3 py-2 rounded-lg"
                          style={{
                            background: included ? 'rgba(138,154,91,0.10)' : 'rgba(212,175,55,0.07)',
                            border: included
                              ? '1px solid rgba(138,154,91,0.25)'
                              : '1px solid rgba(212,175,55,0.2)',
                          }}
                          data-testid={`category-preview-feature-${f.key}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm shrink-0">{f.icon || '◆'}</span>
                            <span className="text-[13px] truncate" style={{ color: '#FFF8DC' }}>
                              {f.label}
                            </span>
                          </div>
                          {included || featCost === 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase shrink-0"
                              style={{ color: '#A8C076' }}>
                              <Check className="w-3 h-3" strokeWidth={3} />
                              Included
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 shrink-0"
                              style={{ color: accent }}>
                              <Coins className="w-3 h-3" />
                              <span className="text-xs font-medium">+{featCost}</span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-[11px] mt-3" style={{ color: 'rgba(255,248,220,0.7)' }}>
                  Pick exactly the features you want in the next step — pay only for what you use.
                </p>
              </div>

              {/* Price summary */}
              <div className="rounded-2xl p-4"
                style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }}
                data-testid="category-preview-price">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] tracking-[0.32em] uppercase block"
                      style={{ color: 'rgba(255,248,220,0.8)' }}>
                      Base design starts at
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <Coins className="w-5 h-5 self-center" style={{ color: accent }} />
                      <span className="font-display text-3xl" style={{ color: '#FFF8DC' }}>
                        {baseDesignCredits}
                      </span>
                      <span className="text-xs" style={{ color: 'rgba(255,248,220,0.82)' }}>
                        credit{baseDesignCredits === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] tracking-[0.32em] uppercase"
                      style={{ color: 'rgba(255,248,220,0.7)' }}>
                      Same as
                    </span>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,248,220,0.85)' }}>
                      Wedding payment flow
                    </p>
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="mt-auto space-y-2">
                <button
                  type="button"
                  onClick={() => onBrowseDesigns?.(category)}
                  className="lux-btn w-full justify-center"
                  data-testid="category-preview-browse"
                >
                  <Sparkles className="w-4 h-4" />
                  Browse all {hero.label} designs
                  <ArrowRight className="w-4 h-4" />
                </button>
                {onSignIn && (
                  <button
                    type="button"
                    onClick={() => onSignIn(category)}
                    className="w-full py-2.5 rounded-full text-[11px] tracking-[0.25em] uppercase hover:opacity-80 transition-opacity"
                    style={{
                      background: 'rgba(255,248,220,0.06)',
                      color: 'rgba(255,248,220,0.85)',
                      border: '1px solid rgba(255,248,220,0.15)',
                    }}
                    data-testid="category-preview-signin"
                  >
                    Sign in to create
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 text-[11px] tracking-[0.25em] uppercase hover:opacity-80 transition-opacity"
                  style={{ color: 'rgba(255,248,220,0.78)' }}
                  data-testid="category-preview-close-cta"
                >
                  Keep browsing
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CategoryPreviewModal;
