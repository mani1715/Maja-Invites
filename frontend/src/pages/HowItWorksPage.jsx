import React from 'react';
import { Link } from 'react-router-dom';
import PublicChrome from '@/components/PublicChrome';
import {
  Palette, ShoppingBag, FileText, Wand2, LinkIcon, Share2,
  UserCheck, Heart, QrCode, Gift, Languages, Send,
  Camera, Compass, Cloud, KeyRound, Users, ShieldCheck,
} from 'lucide-react';

/**
 * HowItWorksPage — a plain, honest walkthrough of how the platform works for
 * the three people it touches: couples & families, their guests, and
 * photographers. Content is the on-site version of MAJA_HOW_IT_WORKS.md and
 * uses ONLY real, shipped features (no invented "AI" claims). Pricing lives on
 * the Plans page; this page explains the flow, not the packs.
 */

// One step in a numbered flow (couples / photographers).
const Step = ({ n, icon: Icon, title, children }) => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
    <div
      aria-hidden="true"
      style={{
        flexShrink: 0, width: 44, height: 44, borderRadius: 12,
        display: 'grid', placeItems: 'center',
        background: 'rgba(201,168,76,0.12)',
        border: '1px solid rgba(201,168,76,0.35)', color: '#E8D5A3',
        fontFamily: 'var(--font-display, serif)', fontSize: 18,
      }}
    >
      {n}
    </div>
    <div style={{ flex: 1 }}>
      <h3
        className="font-heading"
        style={{ margin: '2px 0 6px', fontSize: 18, color: 'var(--lux-text)', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <Icon size={17} style={{ color: '#E8D5A3' }} /> {title}
      </h3>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--lux-text-muted)' }}>{children}</p>
    </div>
  </div>
);

// A compact "what guests can do" / "privacy" chip card.
const PointCard = ({ icon: Icon, title, children }) => (
  <div
    style={{
      padding: '18px 18px', borderRadius: 14,
      background: 'var(--lux-chrome)', border: '1px solid var(--lux-border)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <Icon size={18} style={{ color: '#E8D5A3' }} />
      <span className="font-heading" style={{ fontSize: 15, color: 'var(--lux-text)' }}>{title}</span>
    </div>
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--lux-text-muted)' }}>{children}</p>
  </div>
);

const SectionTitle = ({ eyebrow, title, sub }) => (
  <div style={{ marginBottom: 26 }}>
    {eyebrow && (
      <div style={{ fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: 10 }}>
        {eyebrow}
      </div>
    )}
    <h2 className="font-display" style={{ margin: 0, fontSize: 30, lineHeight: 1.15, color: 'var(--lux-text)' }}>{title}</h2>
    {sub && <p style={{ margin: '10px 0 0', fontSize: 16, lineHeight: 1.7, color: 'var(--lux-text-muted)' }}>{sub}</p>}
  </div>
);

export default function HowItWorksPage() {
  return (
    <PublicChrome
      title="How It Works — Invitations, Guest Galleries & Photographer Platform | MAJA Invites"
      description="A plain walkthrough of how MAJA works: done-for-you invitations built by our team, a no-app guest experience with RSVP and live photo galleries, UPI shagun, and a full photographer portfolio, storage, client-portal and community platform."
    >
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '8px 20px 90px' }}>
        {/* Hero */}
        <header style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: 12 }}>
            How it works
          </div>
          <h1 className="font-display" style={{ margin: 0, fontSize: 40, lineHeight: 1.1, color: 'var(--lux-text)' }}>
            One platform, three simple journeys
          </h1>
          <p style={{ margin: '16px 0 0', fontSize: 17, lineHeight: 1.7, color: 'var(--lux-text-muted)', maxWidth: 680 }}>
            MAJA is <strong style={{ color: 'var(--lux-text)' }}>done-for-you</strong>. Couples choose a design and
            share their details; our team builds and delivers a living invitation with RSVP, wishes, a live photo
            gallery and gifting. Guests just tap the link — no app, no login. Photographers get a portfolio,
            discovery, cloud storage, a client portal and a community, all around the celebrations they capture.
          </p>
        </header>

        {/* 1 — Couples & families */}
        <section style={{ marginBottom: 56 }}>
          <SectionTitle
            eyebrow="For couples & families"
            title="How a digital invitation works"
            sub="You never build the page yourself — you approve, we build."
          />
          <div style={{ display: 'grid', gap: 22 }}>
            <Step n="1" icon={Palette} title="Browse designs">
              Pick your occasion — wedding, baby &amp; birthday, half-saree, ritu kala samskaram, or dhoti / upanayanam —
              and preview designs for free.
            </Step>
            <Step n="2" icon={ShoppingBag} title="Place your order">
              Choose a design and any extras you want — live gallery, QR check-in, multi-language, digital shagun, and so on.
            </Step>
            <Step n="3" icon={FileText} title="Share your details">
              Fill in your names, dates, venue, photos and preferred language.
            </Step>
            <Step n="4" icon={Wand2} title="We build it">
              The MAJA team crafts your invitation from your details and the design you chose.
            </Step>
            <Step n="5" icon={LinkIcon} title="We deliver a live link">
              You receive a short, shareable link — plus a WhatsApp-ready card and QR code.
            </Step>
            <Step n="6" icon={Share2} title="You share it">
              Send it to guests on WhatsApp, email or SMS. You can review the result and request changes before it goes out.
            </Step>
          </div>
        </section>

        {/* 2 — Guest experience */}
        <section style={{ marginBottom: 56 }}>
          <SectionTitle
            eyebrow="For your guests"
            title="No app, no account"
            sub="Guests tap your link and it opens in any phone browser — WhatsApp, Chrome, Safari, Instagram."
          />
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            <PointCard icon={UserCheck} title="RSVP in one tap">Guests confirm attendance instantly from the invitation.</PointCard>
            <PointCard icon={Heart} title="Wishes & blessings">They leave messages on your wishes wall.</PointCard>
            <PointCard icon={QrCode} title="Add photos at the event">They scan a QR at the venue to add their own photos to your live gallery.</PointCard>
            <PointCard icon={Gift} title="Send shagun">If you enable it, guests send a gift straight from the invitation over UPI.</PointCard>
          </div>
        </section>

        {/* 3 — The pieces that make an invitation live */}
        <section style={{ marginBottom: 56 }}>
          <SectionTitle eyebrow="Inside the invitation" title="Live gallery, shagun, languages & delivery" />
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            <PointCard icon={QrCode} title="Live photo gallery">
              The photographer or family uploads photos, and guests scan a QR to add theirs — all into one shared,
              live gallery. You control access: public or passcode-protected.
            </PointCard>
            <PointCard icon={Gift} title="Digital shagun">
              Connect your UPI / Razorpay details once; guests pay you directly from their phone, instantly.
            </PointCard>
            <PointCard icon={Languages} title="Multi-language">
              Publish the same invitation in Hindi, Tamil, Telugu and English — guests pick their language on open.
            </PointCard>
            <PointCard icon={Send} title="Smart photo delivery">
              After the event, photos can be delivered to guests over WhatsApp and email.
            </PointCard>
          </div>
        </section>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--lux-border)', margin: '8px 0 48px' }} />

        {/* 4 — Photographers */}
        <section style={{ marginBottom: 56 }}>
          <SectionTitle
            eyebrow="For photographers"
            title="A full studio platform"
            sub="It starts with a portfolio website and grows into discovery, storage, a client portal and a community."
          />
          <div style={{ display: 'grid', gap: 22 }}>
            <Step n="1" icon={Camera} title="Build your portfolio">
              Create a studio account and a public portfolio page — multiple categories (weddings, pre-wedding, candid
              and more), your best work, a story section, testimonials and a contact form, on a clean public URL that
              search engines can find.
            </Step>
            <Step n="2" icon={Compass} title="Get discovered">
              Every published studio appears in the photographer directory. Couples search and filter by city,
              specialty and verified status, open your full profile, and contact you directly. Genuine reviews and
              verification help trusted studios rank higher — ratings come from real reviews only.
            </Step>
            <Step n="3" icon={Cloud} title="Back up client media">
              Studio cloud storage backs up client media into named folders per event. Photos uploaded to a wedding's
              gallery can also be saved into the studio's storage. Capacity scales with the plan, with add-ons when you
              need more.
            </Step>
            <Step n="4" icon={KeyRound} title="Give couples a client portal">
              For each invitation you manage, generate a scoped login for the couple. They see only their own event —
              its link analytics, RSVP list &amp; stats (with CSV export), guest wishes (view / add / moderate) and live
              gallery status. The login is locked to their invitation.
            </Step>
            <Step n="5" icon={Users} title="Grow in the Pixora community">
              Post work, reels and stories to a shared feed; discover, follow, like, comment, save and share. There are
              monthly challenges, a leaderboard, a gigs board and a vendor marketplace. Browsing and engaging are free;
              publishing reels and stories is part of the premium photographer plans.
            </Step>
          </div>
        </section>

        {/* 5 — Privacy & security */}
        <section style={{ marginBottom: 52 }}>
          <SectionTitle eyebrow="Privacy & security" title="Your celebration, your control" />
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            <PointCard icon={ShieldCheck} title="No ads, ever">No advertising on any invitation.</PointCard>
            <PointCard icon={KeyRound} title="Passcode protection">Lock the link so only your guests can open it.</PointCard>
            <PointCard icon={Gift} title="Secure payments">Payments run through Razorpay — cards, UPI, net-banking and wallets.</PointCard>
            <PointCard icon={Cloud} title="Your photos, your account">Guest photos are stored under your account and governed by your plan.</PointCard>
          </div>
        </section>

        {/* CTA */}
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'center',
            padding: '28px 22px', borderRadius: 18, textAlign: 'center',
            background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.30)',
          }}
        >
          <p style={{ margin: 0, fontSize: 16, color: 'var(--lux-text)', width: '100%' }}>
            Ready to start? Browse designs or find a photographer near you.
          </p>
          <Link to="/browse" className="lux-btn no-underline" style={{ padding: '12px 22px' }}>Browse designs</Link>
          <Link to="/photographers" className="lux-btn lux-btn-ghost no-underline" style={{ padding: '12px 22px' }}>
            Find photographers
          </Link>
          <Link to="/features" className="lux-btn lux-btn-ghost no-underline" style={{ padding: '12px 22px' }}>
            See all features
          </Link>
        </div>
      </div>
    </PublicChrome>
  );
}
