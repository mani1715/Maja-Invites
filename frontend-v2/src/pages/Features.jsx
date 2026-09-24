import { useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { LINK } from '@/lib/marketingLinks';
import './Features.css';
import useSeo from '@/lib/useSeo';

// Ported from "MAJA Features.dc.html". The feature copy and comparison table
// are editorial marketing content (same in the DC source's own hardcoded
// renderVals()) — there's no backend endpoint for it, so it stays static here.
const COUPLE_BLOCKS = [
  { title: 'The invitation', tag: 'Every plan', blurb: 'Built for you by a designer, not assembled by you from parts. You describe the wedding, we build the pages.', items: [
    { name: 'A page for each event', body: 'Mehendi, sangeet, muhurtham, reception — each with its own timing, venue, dress code and share link.', plan: 'Royal and up' },
    { name: 'Written properly', body: 'Family names in the right order, honorifics as your family uses them, ritual sequence as it actually happens.', plan: 'All plans' },
    { name: 'Multiple languages', body: 'Guests switch language at the top of the page.', plan: 'Royal and up' },
    { name: 'Change it after sending', body: 'Move a venue or a time and everyone who opens the link sees the new version.', plan: 'All plans' },
  ] },
  { title: 'Guests and replies', tag: 'Every plan', blurb: 'Getting an answer out of everyone you invited without ringing them one at a time.', items: [
    { name: 'RSVP per event', body: 'Coming or not, headcount, food preference if you ask. Replies land as they arrive.', plan: 'All plans' },
    { name: 'WhatsApp reminders', body: 'Sent to the people who have not replied yet.', plan: 'Royal and up' },
    { name: 'Guest groups', body: 'Bride’s side, groom’s side, friends, colleagues — a group only sees the events you tick for it.', plan: 'Royal and up' },
    { name: 'Import your sheet', body: 'Send the list you already keep and we import it.', plan: 'All plans' },
  ] },
  { title: 'On the day', tag: 'Royal and up', blurb: 'The parts that only matter once everyone has arrived.', items: [
    { name: 'Live photo gallery', body: 'Guests scan a QR and add photographs from their phone as the evening happens.', plan: 'Royal and up' },
    { name: 'Guest check-in', body: 'Scan tickets at the gate from your phone.', plan: 'Add-on' },
    { name: 'Venue maps', body: 'A proper map card with directions and where to park.', plan: 'All plans' },
    { name: 'Video greetings', body: 'Guests who cannot come record a short greeting from the invitation.', plan: 'Bespoke only' },
  ] },
  { title: 'Gifts and afterwards', tag: 'Royal and up', blurb: 'Money, thank-yous, and what happens to it all once the wedding is over.', items: [
    { name: 'Digital shagun', body: 'Guests send money by UPI, straight to your account.', plan: 'Royal and up' },
    { name: 'Gift registry', body: 'List what you actually want, with links.', plan: 'Royal and up' },
    { name: 'Thank-you page', body: 'Replaces the countdown once the wedding is done.', plan: 'All plans' },
    { name: 'Live for a year', body: 'The invitation stays up for twelve months after the date, then archives.', plan: 'All plans' },
  ] },
];

const STUDIO_BLOCKS = [
  { title: 'Your shopfront', tag: 'Every plan', blurb: 'A portfolio you can actually update, and a listing couples can find you through.', items: [
    { name: 'Portfolio site', body: 'Sections you edit yourself — work, story, packages, reviews, enquiry form.', plan: 'All plans' },
    { name: 'Directory listing', body: 'Couples search by city, budget and style.', plan: 'All plans' },
    { name: 'Your own domain', body: 'Run the whole thing on your domain with your logo and colours.', plan: 'Studio and up' },
    { name: 'Built for you', body: 'Send us your work and our team assembles the portfolio for you.', plan: 'Add-on' },
  ] },
  { title: 'Running the work', tag: 'Every plan', blurb: 'Bookings, clients and the files, in one place.', items: [
    { name: 'Occupancy calendar', body: 'What is booked, what is held, what is free.', plan: 'All plans' },
    { name: 'Client galleries', body: 'Proofing, selects and downloads, scoped per couple.', plan: 'All plans' },
    { name: 'Client portal', body: 'The couple gets a login for their wedding alone.', plan: 'All plans' },
    { name: 'Staff logins', body: 'Second shooters and editors get their own scoped access.', plan: 'Studio and up' },
  ] },
  { title: 'Storage and delivery', tag: 'Every plan', blurb: 'Where the files live, and how they reach the couple.', items: [
    { name: 'Cloud storage', body: 'Studio storage that scales with your plan.', plan: 'All plans' },
    { name: 'Google Drive backup', body: 'Connect your own Drive so you are never holding one copy.', plan: 'Studio and up' },
    { name: 'Face search', body: 'A guest uploads a selfie and gets the photographs they appear in.', plan: 'Studio and up' },
    { name: 'Signed delivery links', body: 'Galleries go out on expiring links you control.', plan: 'All plans' },
  ] },
  { title: 'Pixora', tag: 'Every plan', blurb: 'The community of studios on MAJA.', items: [
    { name: 'Referrals and hiring', body: 'Pass on weddings you cannot shoot, find a second shooter in another city.', plan: 'All plans' },
    { name: 'Pricing intelligence', body: 'What studios of your size are actually charging.', plan: 'Studio and up' },
    { name: 'AI portfolio review', body: 'An honest read on your selects and sequencing.', plan: 'Studio and up' },
    { name: 'Learning and presets', body: 'Courses, guides, presets and templates.', plan: 'All plans' },
  ] },
];

const COUPLE_COMP = { heads: ['Classic', 'Royal', 'Bespoke'], rows: [
  ['Designed-for-you invitation', 1, 1, 1], ['A page per event', 0, 1, 1],
  ['Guests', '150', 'Unlimited', 'Unlimited'], ['Languages', '1', '3', 'Unlimited'],
  ['RSVP and guest list', 1, 1, 1], ['WhatsApp reminders', 0, 1, 1],
  ['Live photo gallery', 0, 1, 1], ['Digital shagun and registry', 0, 1, 1],
  ['Video greeting reel', 0, 0, 1], ['Original artwork', 0, 0, 1], ['Designer on WhatsApp', 0, 0, 1],
] };
const STUDIO_COMP = { heads: ['Solo', 'Studio', 'Atelier'], rows: [
  ['Portfolio and listing', 1, 1, 1], ['Weddings a year', '5', 'Unlimited', 'Unlimited'],
  ['Cloud storage', '100 GB', '500 GB', '2 TB'], ['Staff logins', '1', '5', '15'],
  ['Client galleries and portal', 1, 1, 1], ['White-label domain', 0, 1, 1],
  ['Google Drive backup', 0, 1, 1], ['Face search', 0, 1, 1],
  ['Pixora premium tools', 0, 1, 1], ['Account manager', 0, 0, 1], ['API access', 0, 0, 1],
] };

const TAG_COLOR = { 'Every plan': ['var(--mj-section-deep)', 'var(--mj-primary)'], 'Royal and up': ['var(--mj-border-accent)', 'var(--mj-primary-hover)'] };
const planColor = (p) => (p === 'All plans' ? '#047857' : p === 'Bespoke only' ? 'var(--mj-muted)' : 'var(--mj-primary)');

export default function Features() {
  useSeo({ title: 'Features', description: 'RSVP, wishes wall, digital shagun, live photo wall, AI face match, QR galleries and multi-language invitations.' });
  const [audience, setAudience] = useState('couple');
  const blocks = audience === 'couple' ? COUPLE_BLOCKS : STUDIO_BLOCKS;
  const comp = audience === 'couple' ? COUPLE_COMP : STUDIO_COMP;

  return (
    <div className="mjf-page">
      <MarketingNav />

      <header className="px-aurora mjf-hero">
        <span aria-hidden="true" className="px-petal" style={{ left: '9%', animationDelay: '-2s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '31%', width: 10, height: 14, opacity: .4, animationDuration: '18s', animationDelay: '-9s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '58%', width: 14, height: 18, opacity: .5, animationDuration: '12s', animationDelay: '-5s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '86%', animationDuration: '16s', animationDelay: '-11s' }} />
        <div className="mjf-hero-inner">
          <p className="mjf-eyebrow">Features</p>
          <h1 className="mjf-h1">Everything an Indian wedding actually needs, <span className="mjf-accent">and nothing it doesn&rsquo;t.</span></h1>
          <p className="mjf-lead">Most invitation tools assume one date, one venue, one RSVP button. Ours starts from four events across three days and two families who name themselves differently.</p>
        </div>
      </header>

      <div className="mjf-tabs-row">
        {[['couple', 'For couples'], ['studio', 'For studios']].map(([k, label]) => (
          <button key={k} className={audience === k ? 'is-on' : ''} onClick={() => setAudience(k)}>{label}</button>
        ))}
      </div>

      <div className="mjf-body">
        {blocks.map((b) => (
          <section key={b.title} className="mjf-block">
            <div data-reveal className="mjf-block-head">
              <h2>{b.title}</h2>
              <span className="mjf-tag" style={{ background: (TAG_COLOR[b.tag] || ['var(--mj-section-deep)', 'var(--mj-muted)'])[0], color: (TAG_COLOR[b.tag] || ['', 'var(--mj-muted)'])[1] }}>{b.tag}</span>
            </div>
            <p data-reveal className="mjf-block-blurb">{b.blurb}</p>
            <div data-mj-stagger className="mjf-card-grid">
              {b.items.map((i) => (
                <div data-reveal="blur" key={i.name} className="mjf-item-card">
                  <h3>{i.name}</h3>
                  <p>{i.body}</p>
                  <p className="mjf-item-plan" style={{ color: planColor(i.plan) }}>{i.plan}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section data-reveal="scale" className="mjf-comp">
          <h2>What comes with which plan</h2>
          <p className="mjf-comp-sub">{audience === 'couple' ? 'One payment per wedding. Nothing here renews.' : 'Per studio, per cycle.'}</p>
          <div className="mjf-comp-scroll">
            <div className="mjf-comp-table" style={{ minWidth: 560 }}>
              <div className="mjf-comp-row mjf-comp-head">
                <span />
                {comp.heads.map((h) => <span key={h}>{h}</span>)}
              </div>
              {comp.rows.map(([label, ...cells]) => (
                <div className="mjf-comp-row" key={label}>
                  <span className="mjf-comp-label">{label}</span>
                  {cells.map((v, idx) => (
                    <span key={idx} className={v === 1 ? 'mjf-yes' : v === 0 ? 'mjf-no' : 'mjf-val'}>{v === 1 ? '✓' : v === 0 ? '—' : v}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section data-reveal="scale" className="mjf-cta">
          <span aria-hidden="true" className="px-ripple" />
          <div className="mjf-cta-text">
            <h2>Not sure which you need?</h2>
            <p>Tell us what&rsquo;s happening and we&rsquo;ll say which plan fits, before you pay anything.</p>
          </div>
          <div className="mjf-cta-actions">
            <Link to={LINK.signUp} className="mjf-btn-primary">Set up your studio</Link>
            <Link to="/pricing" className="mjf-btn-secondary">See pricing</Link>
          </div>
        </section>
      </div>

      <footer className="mjf-footer">
        <p>&copy; 2026 MAJA Invites</p>
        <div className="mjf-footer-links">
          <Link to="/#story" data-mj-link>Our story</Link>
          <Link to={LINK.terms} data-mj-link>Terms</Link>
          <Link to={LINK.privacy} data-mj-link>Privacy</Link>
          <Link to={LINK.refund} data-mj-link>Refunds</Link>
        </div>
      </footer>
    </div>
  );
}
