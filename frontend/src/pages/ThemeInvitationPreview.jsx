/**
 * ThemeInvitationPreview
 * -----------------------------------------------------------------------------
 * A pure "demo" version of the public wedding invitation. It renders the same
 * cinematic layout used by LuxuryPublicInvitation but populates every section
 * with theme-specific dummy data from `sampleData.js` instead of fetching
 * from the backend. This lets a homepage visitor preview EXACTLY what the
 * final invitation will look like — without ever logging in, picking events
 * or buying credits.
 *
 * Route: /preview/theme/:themeId
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Send, Sparkles, MessageCircle, Heart, Gift, Plane, Hotel, Building2, ChevronRight, Eye } from 'lucide-react';
import { toast, Toaster } from 'sonner';

import { OpeningOrchestrator, ClosingOrchestrator } from '@/themes/shared/ThemeAnimationOrchestrator';
import PetalConfetti from '@/components/luxury/PetalConfetti';
import WatermarkOverlay from '@/components/luxury/WatermarkOverlay';
import ScrollSection from '@/components/luxury/ScrollSection';
import ThemeAnimatedBackground from '@/components/ThemeAnimatedBackground';
import TouchParticles from '@/components/TouchParticles';
import UniversalDesignRenderer from '@/themes/UniversalDesignRenderer';
import { getThemeById } from '@/themes/masterThemes';
import { resolveDesign, resolveHeroDesign, normaliseEvent, pageBgForDesign, useResolvedThemeDesigns } from '@/themes/themeDesignResolver';
import { getThemeSampleData } from '@/themes/sampleData';
import { HeroCover, Countdown, BrideGroomCoupleShowcase } from './LuxuryPublicInvitation';
import { DEFAULT_COUPLE_PHOTO, DEFAULT_BRIDE_PHOTO, DEFAULT_GROOM_PHOTO } from '@/themes/samplePhotos';
import '@/styles/luxury.css';

const EVENT_TYPE_GUESS = (title = '') => {
  const t = title.toLowerCase();
  if (t.includes('engage') || t.includes('roka') || t.includes('ashirbaad')) return 'Engagement';
  if (t.includes('haldi') || t.includes('pellikuthuru') || t.includes('gaye holud')) return 'Haldi';
  if (t.includes('mehndi') || t.includes('mehendi') || t.includes('mehandi') || t.includes('chooda')) return 'Mehandi';
  if (t.includes('sangeet') || t.includes('sangeeth') || t.includes('cocktail')) return 'Sangeeth';
  if (t.includes('reception') || t.includes('walima') || t.includes('bou bhaat')) return 'Reception';
  // default: marriage, nikah, biye, muhurtham, holy matrimony, phera wedding, vows, baraat
  return 'Marriage';
};

const ThemeInvitationPreview = () => {
  const { themeId } = useParams();
  const navigate = useNavigate();
  // Load this theme's catalogue chunk — resolveDesign() reads the cache
  // synchronously and this re-renders us when the chunk lands.
  useResolvedThemeDesigns(themeId);
  const sample = getThemeSampleData(themeId);
  const theme = getThemeById(themeId) || getThemeById('royal_mughal');
  const bride = sample.bride;
  const groom = sample.groom;
  const monogram = `${sample.bride_initial} & ${sample.groom_initial}`;
  const weddingDate = new Date(sample.weddingDateISO);
  const formattedDate = weddingDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const [openingDone, setOpeningDone] = useState(false);
  const [rsvpConfetti, setRsvpConfetti] = useState(false);

  // SAFETY: never trap users on a blank screen. If the opening animation chunk
  // takes longer than 4.5 s (slow network, low-end mobile, lazy chunk still
  // downloading) we declare the opening done so the real content fades in.
  useEffect(() => {
    if (openingDone) return;
    const id = setTimeout(() => setOpeningDone(true), 4500);
    return () => clearTimeout(id);
  }, [openingDone]);

  // Resolve hero + per-event designs from the master design catalogue using
  // sample event titles. Each event gets its own design so the preview shows
  // the full ceremony-specific artwork — not the same hero on repeat.
  const heroResolved = resolveHeroDesign(themeId);
  const resolvedPerEvent = (sample.events || []).map((evt, i) => {
    const evtKey = normaliseEvent(EVENT_TYPE_GUESS(evt.title));
    // Vary design index across events of the same type so consecutive
    // events with the same key don't render the same artwork.
    const r = resolveDesign(themeId, evtKey, i % 3);
    return r ? { evt, ...r } : { evt, theme: null, design: null, event: evtKey };
  });

  const primaryEventType = (() => {
    const marriageEvt = (sample.events || []).find((e) => EVENT_TYPE_GUESS(e.title) === 'Marriage');
    return marriageEvt ? 'Marriage' : EVENT_TYPE_GUESS(sample.events?.[0]?.title || 'Marriage');
  })();

  useEffect(() => {
    document.body.classList.add('luxe');
    document.body.classList.remove('luxe-grain', 'luxe-vignette');
    document.body.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)';
    return () => {
      document.body.classList.remove('luxe');
      document.body.style.background = '';
    };
  }, []);

  const demoBlock = (label) => {
    toast.info(`Demo preview · ${label} works on real invitations`, {
      description: 'Pick this theme to enable it for your wedding.',
      duration: 2800,
    });
  };

  return (
    <>
      <Toaster theme="dark" position="top-center" richColors />
      <ThemeAnimatedBackground theme={themeId || 'temple'} />
      <TouchParticles theme={themeId || 'temple'} />

      {!openingDone && (
        <OpeningOrchestrator
          themeId={themeId}
          eventType={primaryEventType}
          image={heroResolved?.design?.image}
          bride={bride}
          groom={groom}
          date={formattedDate}
          monogram={monogram}
          onComplete={() => setOpeningDone(true)}
        />
      )}

      <div
        className="luxe min-h-screen relative"
        data-testid="theme-invitation-preview"
        style={{
          opacity: openingDone ? 1 : 0,
          transition: 'opacity 0.55s ease',
          pointerEvents: openingDone ? 'auto' : 'none',
        }}
      >
        {/* Demo Watermark */}
        <WatermarkOverlay />

        {/* DEMO floating pill */}
        <DemoPill themeName={theme?.name} />

        {/* Hero */}
        <HeroCover bride={bride} groom={groom} date={weddingDate} theme={theme} />

        {/* Featured design card */}
        {heroResolved && (
          <ScrollSection className="px-6 md:px-16 py-16 max-w-3xl mx-auto" testid="section-featured-design">
            <span className="lux-eyebrow block mb-4 text-center">◆ The Invitation</span>
            <h2 className="font-display text-[2rem] md:text-[2.8rem] leading-[1.05] mb-8 text-center" style={{ color: '#FFF8DC' }}>
              Our <span className="text-gold italic font-script">card.</span>
            </h2>
            <UniversalDesignRenderer
              design={heroResolved.design}
              theme={heroResolved.theme}
              bride={bride}
              groom={groom}
              date={formattedDate}
              venue={sample.venue}
              photo={DEFAULT_COUPLE_PHOTO}
              testId="featured-design"
              style={{ maxWidth: 540, margin: '0 auto' }}
            />
          </ScrollSection>
        )}

        {/* Bride / Groom / Couple Showcase — uses universal sample photos so
            every preview surface (normal-user homepage, photographer, admin)
            looks identical to the actual public link layout. */}
        <BrideGroomCoupleShowcase
          bride={bride}
          groom={groom}
          bridePhoto={DEFAULT_BRIDE_PHOTO}
          groomPhoto={DEFAULT_GROOM_PHOTO}
          couplePhoto={DEFAULT_COUPLE_PHOTO}
          brideAbout={`${bride} is one half of our story — a soul shaped by music, books and quiet kindness.`}
          groomAbout={`${groom} is the other half — steady, curious and always the first to laugh.`}
          loveStory={sample.story}
          eventType={primaryEventType}
        />

        {/* Story */}
        {sample.story && (
          <ScrollSection className="px-6 md:px-16 py-24 max-w-4xl mx-auto" testid="section-story">
            <span className="lux-eyebrow block mb-5">◆ Our Story</span>
            <h2 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-8" style={{ color: '#FFF8DC' }}>
              How <span className="text-gold italic font-script">we</span> met
            </h2>
            <p className="font-heading text-[1.1rem] md:text-[1.25rem] leading-[1.85] whitespace-pre-wrap"
              style={{ color: 'rgba(255,248,220,0.9)' }}>
              {sample.story}
            </p>
          </ScrollSection>
        )}

        {/* Events section removed per requirement — Haldi/Mehendi/Sangeet/Engagement etc. no longer shown */}

        {/* Venue */}
        {sample.venue && (
          <ScrollSection className="px-6 md:px-16 py-24 max-w-4xl mx-auto" testid="section-venue">
            <span className="lux-eyebrow block mb-5">◆ Venue</span>
            <h2 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-6" style={{ color: '#FFF8DC' }}>
              The <span className="text-gold italic font-script">where.</span>
            </h2>
            <p className="text-[1.05rem] leading-relaxed mb-2" style={{ color: 'rgba(255,248,220,0.8)' }}>{sample.venue}</p>
            {sample.city && <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(255,248,220,0.8)' }}>{sample.city}</p>}
            <a target="_blank" rel="noreferrer" href={sample.mapsLink} className="lux-btn lux-btn-ghost">
              Open in Maps <MapPin className="w-3.5 h-3.5" />
            </a>
          </ScrollSection>
        )}

        {/* Countdown */}
        <Countdown date={weddingDate} />

        {/* RSVP — demo (no API) */}
        <ScrollSection className="px-6 md:px-16 py-24" testid="section-rsvp">
          <div className="max-w-2xl mx-auto">
            <span className="lux-eyebrow block mb-5">◆ Will you be there?</span>
            <h2 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-8" style={{ color: '#FFF8DC' }}>
              Kindly <span className="text-gold italic font-script">respond.</span>
            </h2>
            <DemoRSVPForm onSuccess={() => { setRsvpConfetti(true); demoBlock('RSVP'); }} />
          </div>
        </ScrollSection>

        {/* Wishes wall — static sample */}
        <DemoWishesWall wishes={sample.wishes} onAddWish={() => demoBlock('Wishes Wall')} />

        {/* Live Photo Wall teaser — demo */}
        <DemoLivePhotoWall onTap={() => demoBlock('Live Photo Wall')} />

        {/* Find my photos CTA — demo */}
        <section className="px-6 md:px-12 py-12 md:py-16 text-center" data-testid="find-photos-cta">
          <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.7 }} className="max-w-2xl mx-auto">
            <span className="lux-eyebrow inline-block mb-3">◆ AI-powered photo search</span>
            <h2 className="font-display text-[1.9rem] md:text-[2.6rem] mb-3" style={{ color: '#FFF8DC' }}>
              Get <span className="font-script italic text-gold">your photos</span> from the wedding
            </h2>
            <p className="text-sm md:text-base mb-6" style={{ color: 'rgba(255,248,220,0.85)' }}>
              Upload one selfie and share your contact — we’ll send you every photo you’re in.
            </p>
            <button onClick={() => demoBlock('Get Your Photos')} className="lux-btn inline-flex items-center gap-2"
              data-testid="open-find-photos">
              <Sparkles className="w-4 h-4" /> Get Your Photos
            </button>
          </motion.div>
        </section>

        {/* Travel / Venues section — sample */}
        <DemoVenuesSection items={sample.travel} />

        {/* Gift registry — sample */}
        <DemoGiftRegistry gifts={sample.gifts} />

        {/* Digital Shagun — sample */}
        <DemoDigitalShagun shagun={sample.shagun} couple={`${bride} & ${groom}`} />

        {/* Photographer referral CTA — demo (visible) */}
        <DemoReferralCTA />

        {/* Closing animation */}
        {openingDone && (
          <ClosingOrchestrator
            themeId={themeId}
            eventType={primaryEventType}
            image={heroResolved?.design?.image}
            bride={bride}
            groom={groom}
            date={formattedDate}
          />
        )}

        {/* Use This Theme CTA — sticky, gold */}
        <UseThisThemeCTA onClick={() => navigate(`/themes/${themeId}/events`)} />

        {/* Footer */}
        <footer className="px-6 md:px-16 py-14 text-center border-t" style={{ borderColor: 'var(--lux-border)' }} data-testid="invitation-footer">
          <div className="font-script text-3xl text-gold mb-2 italic">{bride} & {groom}</div>
          <div className="text-xs tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>
            Crafted with reverence · MAJA Invites
          </div>
        </footer>

        <PetalConfetti trigger={rsvpConfetti ? Date.now() : false} count={42} duration={5200} />
      </div>
    </>
  );
};

// ============================================================================
// Sub-components used only in the preview
// ============================================================================

const DemoPill = ({ themeName }) => (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.4, duration: 0.6 }}
    className="fixed top-4 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-4 py-2 rounded-full"
    style={{
      background: 'rgba(22,17,12,0.85)',
      backdropFilter: 'blur(14px)',
      border: '1px solid rgba(212,175,55,0.45)',
      boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
    }}
    data-testid="demo-preview-pill"
  >
    <Eye className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
    <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: '#FFF8DC' }}>
      Demo preview {themeName ? `· ${themeName}` : ''}
    </span>
  </motion.div>
);

const UseThisThemeCTA = ({ onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 1.2, duration: 0.7 }}
    className="fixed bottom-6 right-6 z-50"
    data-testid="use-this-theme-cta-wrap"
  >
    <button
      onClick={onClick}
      className="lux-btn inline-flex items-center gap-2 shadow-2xl"
      data-testid="use-this-theme-cta"
      style={{
        boxShadow: '0 16px 40px rgba(212,175,55,0.35), 0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
      <Sparkles className="w-4 h-4" /> Use this Theme <ChevronRight className="w-4 h-4" />
    </button>
  </motion.div>
);

const DemoRSVPForm = ({ onSuccess }) => {
  const [form, setForm] = useState({ guest_name: '', email: '', guest_phone: '+91', status: 'yes', guest_count: 1, message: '' });
  const [done, setDone] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setDone(true);
    onSuccess?.();
  };

  if (done) return (
    <div className="lux-glass p-8 text-center" data-testid="demo-rsvp-success">
      <Sparkles className="w-5 h-5 mx-auto mb-3" style={{ color: '#D4AF37' }} />
      <h3 className="font-display text-2xl mb-2" style={{ color: '#FFF8DC' }}>Thank you.</h3>
      <p className="text-sm" style={{ color: 'rgba(255,248,220,0.85)' }}>This was a demo — your real invitation will receive responses here.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="lux-glass p-7 space-y-4" data-testid="demo-rsvp-form">
      <Row>
        <LField label="Your Name"><input required type="text" value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} style={lInput} data-testid="demo-rsvp-name" /></LField>
        <LField label="Phone (with +91)"><input required type="tel" value={form.guest_phone} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} placeholder="+919876543210" style={lInput} data-testid="demo-rsvp-phone" /></LField>
      </Row>
      <Row>
        <LField label="Attending"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ ...lInput, cursor: 'pointer', appearance: 'none' }} data-testid="demo-rsvp-attending">
          <option value="yes" style={{ background: '#1A130B' }}>Yes, with joy</option>
          <option value="no" style={{ background: '#1A130B' }}>Regretfully no</option>
          <option value="maybe" style={{ background: '#1A130B' }}>Trying my best</option>
        </select></LField>
        <LField label="Guests"><input type="number" min={1} max={10} value={form.guest_count} onChange={(e) => setForm({ ...form, guest_count: e.target.value })} style={lInput} data-testid="demo-rsvp-guests" /></LField>
      </Row>
      <LField label="Message (optional)"><textarea rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} style={{ ...lInput, resize: 'vertical' }} data-testid="demo-rsvp-message" /></LField>
      <button type="submit" className="lux-btn w-full justify-center" data-testid="demo-rsvp-submit">
        Send RSVP <Send className="w-3.5 h-3.5" />
      </button>
    </form>
  );
};

const DemoWishesWall = ({ wishes = [], onAddWish }) => (
  <ScrollSection className="px-6 md:px-16 py-24" testid="section-wishes">
    <div className="max-w-5xl mx-auto">
      <span className="lux-eyebrow block mb-5 text-center">◆ Wishes from loved ones</span>
      <h2 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-10 text-center" style={{ color: '#FFF8DC' }}>
        Blessings & <span className="text-gold italic font-script">wishes.</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        {wishes.map((w, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%', amount: 0.1 }}
            transition={{ duration: 0.7, delay: i * 0.1 }}
            className="lux-glass p-6"
            data-testid={`demo-wish-${i}`}
          >
            <Heart className="w-4 h-4 mb-3" style={{ color: '#D4AF37' }} />
            <p className="font-heading italic text-[0.95rem] leading-relaxed mb-4" style={{ color: 'rgba(255,248,220,0.85)' }}>
              "{w.text}"
            </p>
            <div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>— {w.from}</div>
          </motion.div>
        ))}
      </div>
      <div className="text-center">
        <button onClick={onAddWish} className="lux-btn lux-btn-ghost inline-flex items-center gap-2" data-testid="demo-wish-add">
          <MessageCircle className="w-4 h-4" /> Send your wish
        </button>
      </div>
    </div>
  </ScrollSection>
);

const DemoLivePhotoWall = ({ onTap }) => (
  <ScrollSection className="px-6 md:px-16 py-20 max-w-5xl mx-auto" testid="section-live-photo-wall">
    <div className="lux-glass p-10 text-center">
      <span className="lux-eyebrow block mb-3">◆ Live Photo Wall</span>
      <h3 className="font-display text-[1.7rem] md:text-[2.2rem] mb-3" style={{ color: '#FFF8DC' }}>
        Photos appear <span className="font-script italic text-gold">live</span> as the wedding unfolds
      </h3>
      <p className="text-sm md:text-base mb-6" style={{ color: 'rgba(255,248,220,0.85)' }}>
        Guests will see the photographer's hand-picked moments here, in real time.
      </p>
      <button onClick={onTap} className="lux-btn inline-flex items-center gap-2" data-testid="demo-live-wall-cta">
        <Sparkles className="w-4 h-4" /> View live wall
      </button>
    </div>
  </ScrollSection>
);

const DemoVenuesSection = ({ items = [] }) => {
  if (!items.length) return null;
  const iconFor = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('airport')) return <Plane className="w-4 h-4" />;
    if (t.includes('stay'))    return <Hotel className="w-4 h-4" />;
    return <Building2 className="w-4 h-4" />;
  };
  return (
    <ScrollSection className="px-6 md:px-16 py-24 max-w-5xl mx-auto" testid="section-travel">
      <span className="lux-eyebrow block mb-5">◆ Travel & Stay</span>
      <h2 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-10" style={{ color: '#FFF8DC' }}>
        How to <span className="text-gold italic font-script">reach us.</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {items.map((v, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%', amount: 0.1 }}
            transition={{ duration: 0.7, delay: i * 0.08 }}
            className="lux-glass p-6 flex items-start gap-4"
            data-testid={`demo-travel-${i}`}
          >
            <div className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
              style={{ background: 'rgba(212,175,55,0.18)', color: '#D4AF37' }}>
              {iconFor(v.type)}
            </div>
            <div>
              <div className="lux-eyebrow text-[10px] mb-1">◆ {v.type}</div>
              <div className="font-display text-lg mb-1" style={{ color: '#FFF8DC' }}>{v.name}</div>
              <div className="text-sm" style={{ color: 'rgba(255,248,220,0.85)' }}>{v.note}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </ScrollSection>
  );
};

const DemoGiftRegistry = ({ gifts }) => {
  if (!gifts) return null;
  return (
    <ScrollSection className="px-6 md:px-16 py-24 max-w-3xl mx-auto" testid="section-gifts">
      <div className="lux-glass p-10 text-center">
        <Gift className="w-5 h-5 mx-auto mb-3" style={{ color: '#D4AF37' }} />
        <span className="lux-eyebrow block mb-3">◆ Gifts</span>
        <h3 className="font-display text-[1.8rem] md:text-[2.4rem] mb-4" style={{ color: '#FFF8DC' }}>
          {gifts.headline}
        </h3>
        <p className="font-heading text-[1rem] md:text-[1.05rem] leading-relaxed" style={{ color: 'rgba(255,248,220,0.9)' }}>
          {gifts.message}
        </p>
      </div>
    </ScrollSection>
  );
};

const DemoDigitalShagun = ({ shagun, couple }) => {
  if (!shagun) return null;
  return (
    <ScrollSection className="px-6 md:px-16 py-24 max-w-3xl mx-auto" testid="section-shagun">
      <div className="lux-glass p-10 text-center">
        <span className="lux-eyebrow block mb-3">◆ Digital Shagun</span>
        <h3 className="font-display text-[1.8rem] md:text-[2.4rem] mb-3" style={{ color: '#FFF8DC' }}>
          Send your <span className="font-script italic text-gold">blessings</span>
        </h3>
        <p className="text-sm mb-6" style={{ color: 'rgba(255,248,220,0.85)' }}>{shagun.msg}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-md mx-auto text-left">
          <div className="p-4 rounded-md" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }}>
            <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: 'rgba(255,248,220,0.78)' }}>UPI ID</div>
            <div className="font-mono text-sm" style={{ color: '#FFF8DC' }}>{shagun.upi}</div>
          </div>
          <div className="p-4 rounded-md" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }}>
            <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: 'rgba(255,248,220,0.78)' }}>Payee</div>
            <div className="text-sm" style={{ color: '#FFF8DC' }}>{shagun.payee || couple}</div>
          </div>
        </div>
      </div>
    </ScrollSection>
  );
};

const DemoReferralCTA = () => (
  <ScrollSection className="px-6 md:px-16 py-20 max-w-4xl mx-auto" testid="section-referral">
    <div className="lux-glass p-10 text-center">
      <Sparkles className="w-5 h-5 mx-auto mb-3" style={{ color: '#D4AF37' }} />
      <span className="lux-eyebrow block mb-3">◆ Loved this invitation?</span>
      <h3 className="font-display text-[1.7rem] md:text-[2.2rem] mb-3" style={{ color: '#FFF8DC' }}>
        Crafted by <span className="font-script italic text-gold">MAJA Invites</span>
      </h3>
      <p className="text-sm md:text-base mb-6" style={{ color: 'rgba(255,248,220,0.85)' }}>
        Want one for your own wedding? Refer your photographer to MAJA and unlock cinematic invitations for any culture.
      </p>
    </div>
  </ScrollSection>
);

// ============================================================================
// shared form bits
// ============================================================================
const lInput = {
  width: '100%', padding: '0.85rem 1rem', background: 'transparent', color: '#FFF8DC',
  border: '1px solid var(--lux-border)', borderRadius: '0.5rem', outline: 'none',
  fontFamily: 'Manrope, sans-serif', fontSize: '0.92rem', caretColor: '#D4AF37',
};

const Row = ({ children }) => <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;

const LField = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>{label}</span>
    {children}
  </label>
);

export default ThemeInvitationPreview;
