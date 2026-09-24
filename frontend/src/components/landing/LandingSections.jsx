/**
 * Landing page sections that other public pages reuse.
 *
 * These lived in pages/LandingPage.jsx and were imported straight from it by
 * FaqPage / FeaturesPage / PlansPage / StoryPage. Because that module also
 * imports masterThemes, UniversalDesignRenderer and HeroMandala3D at module
 * scope, those four pages each pulled the whole landing page and all 10 theme
 * chunks just to render one section. Nothing here touches the theme registry.
 *
 * LandingPage imports these back and re-exports them, so existing imports of
 * `{ Pricing } from '@/pages/LandingPage'` keep working.
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import axios from 'axios';
import {
  Camera, Check, ChevronDown, Globe2, Headphones, Heart,
  Image as ImageIcon, IndianRupee, Layers, MapPin,
  MessageCircle, Music, QrCode, Send, ShieldCheck, ShoppingBag,
  Smartphone, Sparkles, Star, Users, Wallet, Zap,
} from 'lucide-react';
import { usePricing } from '@/hooks/usePricing';
import { SPRING } from '@/motion/presets';
import TiltCard from '@/motion/TiltCard';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.8, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
};

export const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

export const FEATURES = [
  { icon: Heart,       title: 'Done-for-You Invitations',  copy: 'Choose a design and share your details — our team builds and delivers your invitation link. You approve; we build.' },
  { icon: Camera,      title: 'Live Photo Gallery',        copy: 'Guests scan a QR at your event and add photos from their phones, so everyone’s memories land in one live gallery.' },
  { icon: Layers,      title: 'Every Celebration',         copy: 'Weddings, baby & birthday, half-saree, ritu kala samskaram (puberty) and dhoti / upanayanam.' },
  { icon: ImageIcon,   title: '3D Wax-Seal Opening',       copy: 'A cinematic unfolding intro with parallax depth on supported designs — the invite opens like a film begins.' },
  { icon: MessageCircle, title: 'RSVP & Guest Wishes',     copy: 'A wishes wall and RSVP form built into every invitation, with a countdown to the date.' },
  { icon: Music,       title: 'Ambient Music Library',     copy: 'Curated tracks that crossfade between sections so the moment is never broken.' },
  { icon: QrCode,      title: 'Guest Check-In · QR',       copy: 'A scan-to-mark-attendance check-in form for your event.' },
  { icon: IndianRupee, title: 'Digital Shagun · UPI',      copy: 'Collect gifts directly via UPI and Razorpay, right from the invitation.' },
  { icon: Globe2,      title: 'Multi-Language Invites',    copy: 'Publish the same invitation in Hindi, Tamil, Telugu and English.' },
  { icon: Send,        title: 'Smart Photo Delivery',      copy: 'Deliver your photos to guests over WhatsApp and email.' },
  { icon: Camera,      title: 'Photographer Platform',     copy: 'A studio panel — portfolio website, client CRM, cloud storage, discovery listing and a scoped client portal.' },
  { icon: Users,       title: 'Pixora Community',          copy: 'The photographers’ network: a feed of posts, reels and stories, discovery, challenges and a gigs board.' },
  { icon: ShoppingBag, title: 'Vendor Marketplace',        copy: 'Discover and review verified wedding vendors — makeup, décor, venues, planners and more.' },
  { icon: ShieldCheck, title: 'Private & Secure',          copy: 'Passcode-locked invites, role-based access and full audit trails.' },
];

const sectionHeader3D = {
  hidden:  { opacity: 0, y: 48, rotateX: 14 },
  visible: { opacity: 1, y: 0, rotateX: 0, transition: { staggerChildren: 0.09, duration: 0.85, ease: [0.22, 1, 0.36, 1] } },
};

export const SectionHeader = ({ eyebrow, title, kicker }) => {
  const reduce = useReducedMotion();
  return (
  <div style={{ perspective: 1100 }} className="max-w-3xl mb-16">
    <motion.div
      variants={sectionHeader3D} initial={reduce ? 'visible' : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.4 }}
      style={{ transformStyle: 'preserve-3d', willChange: 'transform, opacity' }}
    >
      <motion.span variants={fadeUp} className="lux-eyebrow block mb-5">◆ {eyebrow}</motion.span>
      <motion.h2 variants={fadeUp} className="font-display text-[2.4rem] md:text-[3.6rem] leading-[1.05] tracking-tight" style={{ color: 'var(--lux-text)' }}>
        {title}
      </motion.h2>
      {kicker && (
        <motion.p variants={fadeUp} className="mt-5 text-[1.02rem] leading-relaxed max-w-xl" style={{ color: 'var(--lux-text-muted)' }}>
          {kicker}
        </motion.p>
      )}
    </motion.div>
  </div>
  );
};

export const Features = () => (
  <section id="features" className="relative px-6 md:px-16 py-28 z-10">
    <SectionHeader
      eyebrow="What MAJA Does"
      title="Everything your invitation — and your studio — needs."
      kicker="Done-for-you invitations with guest tools built in, and a full platform for the photographers who capture the day."
    />
    <motion.div
      variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
      data-testid="features-grid"
    >
      {FEATURES.map((f, i) => (
        <motion.div
          key={f.title} variants={fadeUp} custom={i}
          className="lux-glass p-7 flex flex-col gap-4 hover:scale-[1.01] transition-transform duration-700"
          data-testid={`feature-card-${i}`}
        >
          <div className="w-11 h-11 rounded-xl grid place-items-center"
            style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(139,0,0,0.18))', border: '1px solid var(--lux-border-strong)' }}>
            <f.icon className="w-5 h-5" style={{ color: '#D4AF37' }} strokeWidth={1.6} />
          </div>
          <h3 className="font-heading text-xl" style={{ color: 'var(--lux-text)' }}>{f.title}</h3>
          <p className="text-[0.95rem] leading-relaxed" style={{ color: 'var(--lux-text-muted)' }}>{f.copy}</p>
        </motion.div>
      ))}
    </motion.div>
  </section>
);

export const Story = () => (
  <section id="story" className="relative px-6 md:px-16 py-28 z-10">
    {/* items-start (not center) so the testimonial column can pin via
        position:sticky while the philosophy text scrolls past on desktop —
        a native, jank-free "pinned storytelling" beat. On mobile the grid
        is single-column so sticky has nothing to pin against (untouched). */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
      <motion.div
        variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}
      >
        <motion.span variants={fadeUp} className="lux-eyebrow block mb-5">◆ Our Mission</motion.span>
        <motion.h2 variants={fadeUp} className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.1] mb-7" style={{ color: 'var(--lux-text)' }}>
          Celebrations, made <span className="text-gold italic font-script">effortless.</span>
        </motion.h2>
        <motion.p variants={fadeUp} className="text-[1.05rem] leading-[1.85] mb-6" style={{ color: 'var(--lux-text)' }}>
          Building a digital invitation, chasing RSVPs and collecting everyone&apos;s photos is fragmented and
          time-consuming. MAJA takes that work off your hands: you choose a design and share your details,
          and our team builds the invitation end-to-end — with RSVP, guest wishes, a live photo gallery and
          delivery all built in.
        </motion.p>
        <motion.p variants={fadeUp} className="text-[1.05rem] leading-[1.85]" style={{ color: 'var(--lux-text)' }}>
          It works for every occasion — a wedding, a child&apos;s first birthday, a half-saree, a ritu kala
          samskaram or a dhoti ceremony. And it gives the photographers who capture those days a real
          platform around them: a portfolio, discovery, cloud storage and a client portal.
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, rotateY: -15, scale: 0.94 }} whileInView={{ opacity: 1, rotateY: 0, scale: 1 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} viewport={{ once: true, amount: 0.1 }}
        className="lux-glass p-10 relative lg:sticky lg:top-24 lg:self-start"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="absolute -top-3 -right-3 w-16 h-16 rounded-full grid place-items-center"
          style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}>
          <ShieldCheck className="w-6 h-6" style={{ color: '#16110C' }} />
        </div>
        <div className="lux-eyebrow mb-4">What We Stand For</div>
        <p className="font-heading text-xl md:text-[1.4rem] leading-[1.5] mb-6" style={{ color: 'var(--lux-text)' }}>
          Clarity over hype. Honest pricing — any discount is shown against the real price, never a fabricated one.
          Reviews come from genuine customers only. And your invitation is done for you, so the work is ours, not yours.
        </p>
        <div className="lux-hairline mb-4" />
        <ul className="space-y-2 text-sm" style={{ color: 'var(--lux-text)' }}>
          {['Done-for-you — you approve, we build', 'One-time invitation pricing, no surprises', 'Real reviews and honest anchoring only'].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#D4AF37' }} />{t}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  </section>
);

/* ──────────────────────────────────────────────────────────────
   Invitation Options — all features included in an invitation link
   with default credit pricing visible to visitors.
   ────────────────────────────────────────────────────────────── */

const INVITATION_OPTIONS = [
  // `key` matches a row in the Super-Admin Pricing Hub → "Invitation option prices"
  // for the `normal_user` audience. When admin updates the row, `usePricing`
  // reads the new credits and the badge here updates on next page-load.
  // `tier` groups each feature under the plan that unlocks it (Classic/Premium/
  // Royal). Kept in sync with the plan perks in <Pricing>.
  { key: 'wax_seal_opening',  icon: Heart,         title: 'Wax-Seal Opening',       desc: 'Cinematic 3D unfolding intro.',                     credits: 0,  included: true,  tier: 'Classic' },
  { key: 'couple_photos',     icon: ImageIcon,     title: 'Couple + Bride/Groom Photos', desc: 'Portrait gallery with full bios.',             credits: 0,  included: true,  tier: 'Classic' },
  { key: 'countdown_timer',   icon: Sparkles,      title: 'Live Countdown',         desc: 'Real-time ticker to the muhurat.',                  credits: 0,  included: true,  tier: 'Classic' },
  { key: 'rsvp_basic',        icon: MessageCircle, title: 'Guest Wishes & RSVP',    desc: 'Public wishes wall + RSVP form.',                   credits: 0,  included: true,  tier: 'Classic' },
  { key: 'venue_maps',        icon: MapPin,        title: 'Smart Venue Maps',       desc: 'Per-event Google Maps + parking guidance.',         credits: 1,  included: false, tier: 'Classic' },
  { key: 'background_music',  icon: Music,         title: 'Background Music',       desc: '30+ curated tracks across 8 categories.',           credits: 1,  included: false, tier: 'Premium' },
  { key: 'multi_language',    icon: Globe2,        title: 'Multi-language Invite',  desc: 'Hindi · Tamil · Telugu · English',                  credits: 1,  included: false, tier: 'Premium' },
  { key: 'gift_registry',     icon: IndianRupee,   title: 'Digital Shagun · UPI/QR',desc: 'Accept gifts via Razorpay / UPI / QR.',             credits: 3,  included: false, tier: 'Premium' },
  { key: 'live_gallery',      icon: Camera,        title: 'Live Photo Gallery',     desc: 'Stream wedding moments to guests in real-time.',    credits: 3,  included: false, tier: 'Royal' },
  { key: 'guest_check_in',    icon: QrCode,        title: 'Guest Check-In · QR',    desc: 'Scan-to-mark-attendance check-in form.',            credits: 2,  included: false, tier: 'Royal' },
  { key: 'passcode_lock',     icon: ShieldCheck,   title: 'Passcode-Protected Link',desc: 'Private invite — only your guests can enter.',      credits: 1,  included: false, tier: 'Royal' },
];

// Plan tiers in ascending order — each unlocks everything in the tiers below it.
const OPTION_TIERS = [
  { name: 'Classic', price: 1499, blurb: 'Core invitation — everything you need to invite beautifully.' },
  { name: 'Premium', price: 2999, blurb: 'Classic + richer storytelling, music, language & gifting.', featured: true },
  { name: 'Royal',   price: 5999, blurb: 'Premium + live gallery, guest check-in & private access.' },
  { name: 'Bespoke', price: 9999, blurb: 'Everything + a dedicated designer and white-glove concierge.' },
];

export const InvitationOptions = () => {
  const pricing = usePricing('normal_user');

  // One option card. `included` = baked into every link at no extra cost.
  const OptionCard = (opt, i) => {
    const credits  = pricing.optionCredits(opt.key, opt.credits);
    const included = pricing.optionIsFree(opt.key, opt.included) || credits === 0;
    return (
      <motion.div
        key={opt.title} variants={fadeUp} custom={i}
        whileHover={{ y: -4 }}
        className="lux-glass p-6 relative overflow-hidden"
        data-testid={`option-card-${opt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      >
        {included && (
          <div
            className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(138,154,91,0.85), rgba(100,120,70,0.85))',
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)', border: '1px solid rgba(255,248,220,0.3)',
            }}
            data-testid={`option-credit-${opt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          >
            <Check className="w-3 h-3" style={{ color: '#0F1A06' }} strokeWidth={3} />
            <span className="font-display text-[10px] tracking-wider uppercase leading-none" style={{ color: '#0F1A06', fontWeight: 700 }}>
              Included
            </span>
          </div>
        )}
        <div className="w-11 h-11 rounded-xl grid place-items-center mb-4"
          style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(139,0,0,0.18))',
                   border: '1px solid var(--lux-border-strong)' }}>
          <opt.icon className="w-5 h-5" style={{ color: '#D4AF37' }} strokeWidth={1.6} />
        </div>
        <h3 className="font-heading text-lg mb-2 pr-20" style={{ color: 'var(--lux-text)' }}>{opt.title}</h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--lux-text-muted)' }}>{opt.desc}</p>
      </motion.div>
    );
  };

  return (
  <section id="invitation-options" className="relative px-6 md:px-16 py-28 z-10">
    <SectionHeader
      eyebrow="What's Inside The Invite"
      title="Every feature, grouped by plan."
      kicker="Four tiers, one ladder — each plan unlocks everything in the tiers below it, plus the features shown under it. Pick the plan that fits your day."
    />
    <div className="space-y-16" data-testid="invitation-options-tiers">
      {OPTION_TIERS.map((tier) => {
        const opts = INVITATION_OPTIONS.filter((o) => o.tier === tier.name);
        return (
          <div key={tier.name} data-testid={`option-tier-${tier.name.toLowerCase()}`}>
            {/* Tier band: name · blurb · price */}
            <div
              className="flex items-end justify-between flex-wrap gap-4 mb-7 pb-4"
              style={{ borderBottom: '1px solid var(--lux-border-strong)' }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="font-display text-sm tracking-[0.2em] uppercase px-3 py-1.5 rounded-full"
                  style={tier.featured
                    ? { color: '#16110C', background: '#D4AF37' }
                    : { color: 'var(--lux-text)', background: 'rgba(212,175,55,0.14)', border: '1px solid var(--lux-border-strong)' }}
                >
                  {tier.name}
                </span>
                <span className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{tier.blurb}</span>
              </div>
              <div className="font-display text-3xl text-gold whitespace-nowrap">
                ₹{tier.price.toLocaleString('en-IN')}
                <span className="text-[10px] tracking-[0.25em] uppercase ml-2" style={{ color: 'var(--lux-text-muted)' }}>one-time</span>
              </div>
            </div>

            {opts.length > 0 ? (
              <motion.div
                variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.05 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
                data-testid={`option-grid-${tier.name.toLowerCase()}`}
              >
                {opts.map((o, i) => OptionCard(o, i))}
              </motion.div>
            ) : (
              <div className="lux-glass p-7" data-testid="option-tier-bespoke-card">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--lux-text)' }}>
                  Everything in Classic, Premium &amp; Royal — plus a dedicated designer,
                  unlimited revisions and white-glove concierge delivery, fully tailored to your celebration.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>

    <motion.p
      initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="text-center text-xs tracking-[0.25em] uppercase mt-12"
      style={{ color: 'var(--lux-text-muted)' }}
      data-testid="invitation-options-note"
    >
      ◆ Each plan includes everything in the tiers below it · Pay only when you publish ◆
    </motion.p>
  </section>
  );
};

const PERK_PRESETS = {
  // Soft mapping keyed by pack label so admins can rename packs in the hub
  // and the perk list still shows reasonable copy. Unknown labels fall back
  // to a credits-based perk list.
  Free:    ['Watermark', 'Royal Mughal theme', 'Basic analytics', 'Email support'],
  Starter: ['No watermark', '4 themes unlocked', 'Full analytics', 'Priority support'],
  Pro:     ['More themes unlocked', 'Live gallery', 'Digital shagun (UPI/QR)', 'Priority build'],
  Elite:   ['All 10 themes', '3D invitations', 'Dedicated manager', 'Bonus rewards'],
  Partner: ['All themes + early access', '3D invitations', 'Dedicated manager', 'Highest rewards'],
};
const _formatRupees = (n) => {
  if (typeof n !== 'number') return '';
  if (n === 0) return '₹0';
  return `₹${n.toLocaleString('en-IN')}`;
};

// Perk copy is static (packages don't store perks); label/price/featured are LIVE
// from /api/store/packages so admin edits update the home page automatically.
export const PLAN_PERKS = {
  classic: ['All core invitation sections', 'RSVP + wishes wall', 'Venue maps + save-the-date', 'Done-for-you build'],
  premium: ['Everything in Classic', 'Photo gallery + background music', 'Multi-language + cinematic opening', 'Digital shagun (UPI/QR)'],
  royal: ['Everything in Premium', 'Live photo gallery', 'Guest check-in QR + passcode', 'Smart photo delivery (WhatsApp + email)'],
  bespoke: ['Fully custom concierge', 'Dedicated designer', 'Unlimited revisions', 'White-glove delivery'],
};
export const PLAN_FALLBACK = [
  { key: 'classic', label: 'Classic', price: { english: 1499 } },
  { key: 'premium', label: 'Premium', price: { english: 2999 }, featured: true },
  { key: 'royal', label: 'Royal', price: { english: 5999 } },
  { key: 'bespoke', label: 'Bespoke', price: { english: 9999 } },
];

export const Pricing = () => {
  const [packs, setPacks] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/api/store/packages`)
      .then(({ data }) => setPacks((data?.packages || []).length ? data.packages : null))
      .catch(() => setPacks(null));
  }, []);
  const tiers = (packs || PLAN_FALLBACK).map((p) => ({
    name: p.label,
    price: (p.price && typeof p.price === 'object') ? (p.price.english ?? 0) : (p.price ?? 0),
    featured: !!p.featured,
    perks: PLAN_PERKS[p.key] || [],
  }));
  return (
  <section id="pricing" className="relative px-6 md:px-16 py-28 z-10">
    <SectionHeader
      eyebrow="Simple Pricing"
      title="One design. One price."
      kicker="No hidden fees, no subscriptions. Pick a design, pay once in ₹, share your details — our studio builds your invitation for you."
    />
    <motion.div
      variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5"
      data-testid="pricing-grid"
    >
      {tiers.map((tier, i) => {
        const featured = !!tier.featured;
        return (
          <TiltCard key={tier.name} className="block w-full h-full">
          <motion.div
            variants={fadeUp} custom={i}
            whileHover={{ y: -6 }}
            className={`lux-glass p-7 flex flex-col h-full ${featured ? 'ring-1' : ''}`}
            style={featured ? { borderColor: 'var(--lux-gold)', background: 'rgba(212,175,55,0.07)' } : undefined}
            data-testid={`plan-card-${tier.name.toLowerCase()}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>{tier.name}</h3>
              {featured && <span className="text-[10px] tracking-[0.25em] uppercase px-2 py-1 rounded-full" style={{ color: '#16110C', background: '#D4AF37' }}>Most Popular</span>}
            </div>
            <div className="font-display text-5xl text-gold mb-1">₹{tier.price.toLocaleString('en-IN')}</div>
            <div className="text-xs tracking-[0.2em] uppercase mb-5" style={{ color: 'var(--lux-text-muted)' }}>one-time</div>
            <div className="lux-hairline mb-5" />
            <ul className="flex-1 space-y-3 text-sm" style={{ color: 'var(--lux-text)' }}>
              {tier.perks.map((perk) => (
                <li key={perk} className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full" style={{ background: '#D4AF37' }} />
                  {perk}
                </li>
              ))}
            </ul>
            <a href="/themes" className={`mt-7 ${featured ? 'lux-btn' : 'lux-btn lux-btn-ghost'} justify-center no-underline`} data-testid={`plan-cta-${tier.name.toLowerCase()}`}>
              Choose {tier.name}
            </a>
          </motion.div>
          </TiltCard>
        );
      })}
    </motion.div>
  </section>
  );
};

const FAQ_ITEMS = [
  {
    icon: Users,
    q: 'Do I design the invitation myself?',
    a: 'No — it is done for you. You choose a design and share your details (names, dates, venue, photos, language), and our team builds and delivers your invitation as a live link. Previewing designs is always free; you only pay when you choose one.',
  },
  {
    icon: Wallet,
    q: 'How does pricing work? Are there subscriptions?',
    a: 'Invitations are a one-time price per invitation — no subscription. Plans run from Classic (₹1,499) to Premium (₹2,999), Royal (₹5,999) and Bespoke (₹9,999), and you can attach add-ons like Smart Photo Delivery, Live Gallery, QR Check-In and Digital Shagun. Photographers, separately, use a monthly or yearly portfolio plan.',
  },
  {
    icon: Layers,
    q: 'Which occasions are supported?',
    a: 'Weddings, baby & birthday, half-saree, ritu kala samskaram (puberty) and dhoti / upanayanam. Every design has a live sample you can preview before you order.',
  },
  {
    icon: Camera,
    q: 'How do guests add and receive photos?',
    a: 'At your event, guests scan a QR and upload photos from their phones straight into your live gallery — no app or account needed. Your photos can then be delivered to guests through Smart Photo Delivery over WhatsApp and email.',
  },
  {
    icon: Globe2,
    q: 'In which languages can the invitation be published?',
    a: 'Hindi, Tamil, Telugu and English. Multi-language is included in Premium and above, or available as an add-on; guests pick their language when they open the invitation.',
  },
  {
    icon: IndianRupee,
    q: 'How do guests send digital shagun / gifts?',
    a: 'Your invitation can show a Digital Shagun button. Guests send gifts directly via UPI and Razorpay from their phone. You can also enable a gift registry.',
  },
  {
    icon: QrCode,
    q: 'What is guest check-in?',
    a: 'An optional scan-to-mark-attendance QR at your event, so you can see who has arrived. It is included in Royal or available as an add-on.',
  },
  {
    icon: ShieldCheck,
    q: 'Is my invitation private?',
    a: 'You choose. An invitation can be public (anyone with the link) or passcode-protected, so only guests with your code can open it. Published links are rate-limited and protected against scraping.',
  },
  {
    icon: Smartphone,
    q: 'Do my guests need an app?',
    a: 'No. The invitation opens in any modern browser — WhatsApp, Chrome, Safari, Instagram’s in-app browser. RSVP, wishes, the live gallery and shagun all work on a normal mobile browser.',
  },
  {
    icon: Star,
    q: 'Is the Pixora community free?',
    a: 'Browsing the community, following photographers and engaging (like, comment, save, share) are free. Publishing reels and stories is a Premium feature on the photographer plans.',
  },
  {
    icon: Camera,
    q: 'What do photographers get?',
    a: 'A professional portfolio website, a discovery listing, studio cloud storage with backup, a CRM, a scoped client portal for the couples you work with, and access to the Pixora community. Plans run from Free to Pro Studio.',
  },
  {
    icon: Headphones,
    q: 'Who builds and delivers my invitation, and how do I share it?',
    a: 'The MAJA team builds it end-to-end; Bespoke includes a dedicated designer and unlimited revisions. Once it is ready you receive a short shareable link you can send on WhatsApp, email or SMS — guests just tap to open it.',
  },
];

const FAQItem = ({ icon: Icon, q, a, isOpen, onToggle, idx }) => (
  <motion.div
    variants={fadeUp} custom={idx}
    className="lux-glass overflow-hidden"
    data-testid={`faq-item-${idx}`}
  >
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-start gap-4 p-5 md:p-6 text-left transition-colors hover:bg-[rgba(212,175,55,0.04)]"
      aria-expanded={isOpen}
    >
      <span
        className="shrink-0 w-10 h-10 rounded-xl grid place-items-center"
        style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(139,0,0,0.18))', border: '1px solid var(--lux-border-strong)' }}
      >
        <Icon className="w-5 h-5" style={{ color: '#D4AF37' }} strokeWidth={1.6} />
      </span>
      <span className="flex-1 font-heading text-[1rem] md:text-[1.1rem] leading-snug pr-3" style={{ color: 'var(--lux-text)' }}>
        {q}
      </span>
      <ChevronDown
        className="shrink-0 mt-1 transition-transform duration-300"
        style={{
          color: '#D4AF37',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      />
    </button>
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SPRING.gentle}
        >
          <div className="px-5 md:px-6 pb-5 md:pb-6 pl-[4.5rem] text-[0.95rem] leading-[1.7]" style={{ color: 'var(--lux-text)' }}>
            {a}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
);

export const FAQSection = () => {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <section id="faq" className="relative px-6 md:px-16 py-28 z-10" data-testid="faq-section">
      <SectionHeader
        eyebrow="Frequently Asked"
        title="Your questions, answered."
        kicker="Couples, families and photographers ask us these every week. If we haven't covered something, drop us a line — we read every message."
      />
      <motion.div
        variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.05 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl mx-auto"
        data-testid="faq-grid"
      >
        {FAQ_ITEMS.map((item, i) => (
          <FAQItem
            key={i}
            idx={i}
            icon={item.icon}
            q={item.q}
            a={item.a}
            isOpen={openIdx === i}
            onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
          />
        ))}
      </motion.div>

      {/* Soft "still have questions" CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl mx-auto mt-12 text-center lux-glass p-7 md:p-9"
        data-testid="faq-still-have-questions"
      >
        <Zap className="w-7 h-7 mx-auto mb-3" style={{ color: '#D4AF37' }} />
        <h3 className="font-display text-2xl md:text-3xl mb-3" style={{ color: 'var(--lux-text)' }}>
          Still have a <span className="text-gold italic font-script">question?</span>
        </h3>
        <p className="text-sm md:text-base mb-5" style={{ color: 'var(--lux-text)' }}>
          Photographers, couples and families — drop us a line and we&apos;ll get back to you.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href="mailto:hello@majacreations.in"
            className="lux-btn"
            data-testid="faq-email-cta"
          >
            <Send className="w-4 h-4" /> Email Us
          </a>
          <a
            href="https://wa.me/919999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="lux-btn lux-btn-ghost"
            data-testid="faq-whatsapp-cta"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        </div>
      </motion.div>
    </section>
  );
};
