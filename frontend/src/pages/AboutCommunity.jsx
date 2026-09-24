/* AboutCommunity — public page telling couples & photographers what MAJA Invites
   is: a community that bridges wedding photographers and the families they serve.
   Content is factual — it describes features that exist in the product. */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  Camera, Users, Heart, Image as ImageIcon, Trophy, Briefcase, Cloud, LayoutGrid,
  MessageCircle, BadgeCheck, ShoppingBag, Megaphone, CalendarDays,
  TrendingUp, FileText, BarChart3, GraduationCap, Award, UserPlus,
} from 'lucide-react';
import PublicChrome from '@/components/PublicChrome';
import '@/styles/luxury.css';

// Studio tools — the professional side of the photographer panel.
const PHOTOG = [
  { icon: LayoutGrid, title: 'Portfolio site', desc: 'A public studio page with up to 15 sections and pretty URLs — hero, journey, services, featured work, testimonials, awards and more. Basic is instant; Premium is crafted for you.' },
  { icon: BadgeCheck, title: 'Verified studios', desc: 'Earn a verified badge through a real review process. Verified studios rank higher in the directory and build instant trust with couples.' },
  { icon: UserPlus, title: 'Lead collection', desc: 'A contact form on your portfolio captures enquiries, so couples can reach you directly from your public page.' },
  { icon: FileText, title: 'Client CRM', desc: 'Track every lead from first enquiry to delivery — follow-ups, bookings, timelines and priority leads in one place.' },
  { icon: BarChart3, title: 'Studio analytics', desc: 'See how your posts and reels perform — reach, saves, follower growth and your best time to post.' },
  { icon: Cloud, title: 'Cloud storage & backup', desc: 'Back up client media into named folders. Every plan includes storage; QR-gallery photos save straight into it.' },
];

// Pixora — the creative network inside MAJA.
const COMMUNITY = [
  { icon: ImageIcon, title: 'A shared feed', desc: 'Share showcases, tips and critique requests, and give each other structured feedback on composition, lighting and editing.' },
  { icon: Users, title: 'Mentors, teams & network', desc: 'Follow studios, request mentorship, connect with peers and build a team profile — the community learns together.' },
  { icon: Trophy, title: 'Challenges & awards', desc: 'Monthly challenges, community awards and a computed reputation score — recognition is earned from real work, never bought.' },
  { icon: GraduationCap, title: 'Learning & certification', desc: 'Courses and articles you can complete to earn badges that show on your profile.' },
  { icon: CalendarDays, title: 'Events worldwide', desc: 'Workshops, meetups and webinars with country and timezone support — filter to what is near you or join online.' },
  { icon: Briefcase, title: 'Hiring & gigs', desc: 'Post gigs, apply to shoots, and grow your studio through the network.' },
];

// Business & marketplace — the money side.
const BUSINESS = [
  { icon: ShoppingBag, title: 'Vendor marketplace', desc: 'Discover and review verified wedding vendors — makeup, décor, venues, planners and more — across categories and cities.' },
  { icon: Megaphone, title: 'Brand deals', desc: 'Brands post paid campaigns; creators apply, deliver and track approvals — a marketplace that turns your craft into income.' },
  { icon: Award, title: 'Talent agency', desc: 'Apply to be represented and get matched with premium shoots and opportunities curated by MAJA.' },
  { icon: TrendingUp, title: 'Wedding workspaces', desc: 'Turn each wedding into a project — team, tasks, bookings, guests and a planning checklist, all coordinated in one space.' },
];

const COUPLE = [
  { icon: Heart, title: 'Find your photographer', desc: 'Browse real portfolios and reviews (ratings computed from genuine reviews), filter by city and skill, then choose the studio that fits your day.' },
  { icon: UserPlus, title: 'Hire trusted vendors', desc: 'Beyond photographers — find and compare verified vendors for every part of your celebration.' },
  { icon: Camera, title: 'Living invitations', desc: 'Your invitation collects RSVPs, wishes and a live photo gallery your guests can add to via QR.' },
  { icon: ImageIcon, title: 'Your photos, together', desc: 'Guests upload from their phones; you keep everything in one place — with the studio you chose right beside you.' },
];

function Grid({ items, testid }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid={testid}>
      {items.map(({ icon: Icon, title, desc }) => (
        <div key={title} className="lux-glass p-5">
          <div className="w-10 h-10 rounded-xl grid place-items-center mb-3" style={{ background: 'rgba(212,175,55,0.14)', border: '1px solid var(--lux-border)' }}>
            <Icon className="w-5 h-5" style={{ color: '#D4AF37' }} />
          </div>
          <h3 className="font-display text-lg mb-1.5" style={{ color: 'var(--lux-text)' }}>{title}</h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--lux-text-muted)' }}>{desc}</p>
        </div>
      ))}
    </div>
  );
}

const Section = ({ eyebrow, title, kicker, children }) => (
  <section className="max-w-5xl mx-auto px-5 md:px-8 mb-16">
    <div className="mb-6">
      <span className="lux-eyebrow block mb-2">◆ {eyebrow}</span>
      <h2 className="font-display text-[1.8rem] md:text-[2.6rem] leading-[1.1]" style={{ color: 'var(--lux-text)' }}>{title}</h2>
      {kicker && <p className="mt-2 text-sm md:text-base max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>{kicker}</p>}
    </div>
    {children}
  </section>
);

export default function AboutCommunity() {
  return (
    <PublicChrome title="About Pixora — MAJA Community" description="Pixora is MAJA's photographer community — Reels, Stories, Posts, portfolios, a marketplace and networking that bridge wedding photographers and the families they serve.">
      <div data-testid="about-community">
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-5 md:px-8 text-center mb-16">
          <span className="lux-eyebrow block mb-4">◆ About Pixora</span>
          <h1 className="font-display text-[2.2rem] md:text-[3.4rem] leading-[1.05]" style={{ color: 'var(--lux-text)' }}>
            The photographer <span className="font-script italic text-gold">community.</span>
          </h1>
          <p className="mt-4 text-sm md:text-lg max-w-2xl mx-auto" style={{ color: 'var(--lux-text-muted)' }}>
            Pixora is the creative network inside MAJA — <b>Reels</b>, <b>Stories</b> and <b>Posts</b>, real portfolios, a vendor
            marketplace and networking, all built for photographers, videographers, studios and editors — and the couples and
            families they serve.
          </p>
          <div className="mt-6 flex gap-3 justify-center flex-wrap">
            <Link to="/photographers" className="lux-btn no-underline">Find photographers</Link>
            <Link to="/vendors" className="lux-btn lux-btn-ghost no-underline">Explore vendors</Link>
            <Link to="/designs" className="lux-btn lux-btn-ghost no-underline">Browse designs</Link>
          </div>
        </section>

        <Section eyebrow="For photographers" title="Your studio, supercharged." kicker="Everything a wedding photographer needs to show work, win clients and run the business — portfolio, verification, AI review, CRM, analytics and storage.">
          <Grid items={PHOTOG} testid="community-photog" />
        </Section>

        <Section eyebrow="Pixora — the creative network" title="Grow together, not alone." kicker="Pixora is the photographers' community inside MAJA — a shared feed, mentorship, challenges, learning and events across the country and beyond.">
          <Grid items={COMMUNITY} testid="community-network" />
        </Section>

        <Section eyebrow="Business & marketplace" title="Turn your craft into a business." kicker="A vendor marketplace, brand campaigns, a talent agency and full wedding workspaces — the tools that turn a photographer into a studio.">
          <Grid items={BUSINESS} testid="community-business" />
        </Section>

        <Section eyebrow="For couples & families" title="Your day, beautifully connected." kicker="Choose a photographer and vendors you trust, and give guests a living invitation they can be part of.">
          <Grid items={COUPLE} testid="community-couple" />
        </Section>

        {/* Closing CTA */}
        <section className="max-w-3xl mx-auto px-5 md:px-8 text-center mb-20">
          <div className="lux-glass p-8">
            <h3 className="font-display text-2xl md:text-3xl mb-2" style={{ color: 'var(--lux-text)' }}>One community, two sides of the same celebration.</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--lux-text-muted)' }}>Photographers build their craft and their business. Families find the right studio and a living invitation. MAJA is the bridge.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link to="/studio/login" className="lux-btn no-underline">I'm a photographer</Link>
              <Link to="/designs" className="lux-btn lux-btn-ghost no-underline">I'm planning an event</Link>
            </div>
          </div>
        </section>
      </div>
    </PublicChrome>
  );
}
