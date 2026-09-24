import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { LINK } from '@/lib/marketingLinks';
import './HowItWorks.css';
import useSeo from '@/lib/useSeo';

// Ported from "MAJA How It Works.dc.html" — fully editorial content, no data surface.
const STEPS = [
  ['01', 'Browse designs with your client', 'Filter by celebration and language. Every design opens as a live invitation on a phone, because that is where it will be read.'],
  ['02', 'Order from your studio panel', 'You choose the design and link duration and pay through Razorpay — cards, UPI, net-banking and wallets. The order sits in your panel with the booking.'],
  ['03', 'Send the details', 'One form: names, events, venues, timings, the blessing at the top. Save it and come back — or give the couple their scoped client login and let them fill it in.'],
  ['04', 'We build it', 'A designer sets the details into the design, checks the typography in both scripts, and proofs it end to end.'],
  ['05', 'We deliver a live link', 'You get a link and a QR code. Approve it, or send one round of corrections — that is included.'],
  ['06', 'You hand it over', 'WhatsApp, SMS, email, printed card. It opens instantly, on any phone, without an app.'],
];
const GUEST_FEATURES = [
  ['RSVP in one tap', 'Attending or not, plus a head count. No account, no password.'],
  ['Leave a blessing', 'Wishes collect on one page, moderated and featured from your panel.'],
  ['Add their photos', 'Guests scan the venue QR and upload straight into the event gallery.'],
  ['Send shagun', 'UPI transfer to the couple’s account, with a note attached to the gift.'],
];
const LIVE_FEATURES = [
  ['Live gallery', 'Photos appear as guests upload, no moderation queue unless you want one.'],
  ['QR at the venue', 'One printed code per table. Scans and uploads are counted for you.'],
  ['Face search', 'Guests find their own photos without scrolling three thousand frames.'],
  ['Passcode protection', 'Turn the link private at any point. Old links stop working immediately.'],
];
const STUDIO_FEATURES = [
  ['Portfolio', 'Sections you edit, your domain.'],
  ['Calendar', 'Availability, bookings and vacation in one month view.'],
  ['Contracts', 'E-signed by the couple, with signature and IP recorded.'],
  ['Proofing', 'Clients pick favourites; you see the selection count.'],
  ['Cloud backup', 'Client media off your cards, organised by event.'],
  ['Earnings', 'Income and expense ledger, by month and category.'],
];
const TRUST = [
  ['No ads, ever', 'The invitation is not an advertising surface. Nobody buys space on it.'],
  ['No resale of guest data', 'RSVPs and contact details stay in your studio. We do not sell or share them.'],
  ['Payments you recognise', 'Razorpay handles cards, UPI, net-banking and wallets. We never see your card.'],
  ['Photos under your account', 'Guest photos are stored under your studio account and governed by your plan.'],
];

export default function HowItWorks() {
  useSeo({ title: 'How it works', description: 'You send the brief, our team builds the invitation, you hand your client one link. The whole process, for photographers.' });
  return (
    <div className="mjh-page">
      <MarketingNav />

      <section className="px-aurora mjh-hero">
        <span aria-hidden="true" className="px-petal" style={{ left: '7%', animationDelay: '-2s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '28%', width: 10, height: 14, opacity: .4, animationDuration: '18s', animationDelay: '-9s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '54%', width: 14, height: 18, opacity: .5, animationDuration: '12s', animationDelay: '-5s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '73%', animationDuration: '16s', animationDelay: '-11s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '91%', width: 10, height: 14, opacity: .45, animationDuration: '20s', animationDelay: '-3s' }} />
        <div className="mjh-hero-inner">
          <p className="mjh-eyebrow">How it works</p>
          <h1 className="mjh-h1">You send the brief. <span className="mjh-accent">We build the invitation.</span></h1>
          <p className="mjh-lead">No editor to learn, no template to fight. Pick a design, send us the wedding, and we hand back a live link your client can share on WhatsApp the same week.</p>
          <div className="mjh-hero-actions">
            <Link to={LINK.browseThemes} className="mjh-btn-primary">Browse designs</Link>
            <Link to="/pricing" className="mjh-btn-secondary">See pricing</Link>
          </div>
        </div>
      </section>

      <section className="mjh-section">
        <h2 data-reveal>Six steps, start to share</h2>
        <p data-reveal className="mjh-section-sub">Under twenty minutes of studio time per wedding.</p>
        <div data-mj-stagger className="mjh-steps">
          {STEPS.map(([num, title, body]) => (
            <div data-reveal="fade" key={num} className="mjh-step">
              <p className="mjh-step-num">{num}</p>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mjh-section">
        <h2 data-reveal>What the guests can do</h2>
        <p data-reveal className="mjh-section-sub">One tap, no app, no sign-up.</p>
        <div data-mj-stagger className="mjh-guest-grid">
          {GUEST_FEATURES.map(([title, body]) => (
            <div data-reveal="blur" key={title} className="mjh-guest-card">
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mjh-dark">
        <div className="mjh-dark-inner">
          <div data-reveal="l">
            <p className="mjh-dark-eyebrow">Beyond the invitation</p>
            <h2>The link keeps working after the wedding.</h2>
            <p>Guests scan a QR at the venue and drop their photos into the event gallery. Blessings collect on one page. Shagun goes straight to the couple&rsquo;s account. Everything sits under your studio plan, not a stranger&rsquo;s cloud.</p>
          </div>
          <div data-reveal="r" className="mjh-live-grid">
            {LIVE_FEATURES.map(([title, body]) => (
              <div key={title} className="mjh-live-card">
                <p className="mjh-live-title">{title}</p>
                <p className="mjh-live-body">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mjh-section">
        <div className="mjh-studio-grid">
          <div data-reveal="l">
            <p className="mjh-eyebrow-sm">For studios</p>
            <h2>A studio platform sits behind every invitation.</h2>
            <p className="mjh-studio-body">Photographers who work with MAJA get a portfolio, a booking calendar, contracts, proofing, cloud backup and a finance ledger. Couples get a studio that already has their details.</p>
            <Link to={LINK.forPhotographers} data-mj-link className="mjh-link">See what studios get &rarr;</Link>
          </div>
          <div data-mj-stagger className="mjh-studio-cards">
            {STUDIO_FEATURES.map(([title, body]) => (
              <div data-reveal="blur" key={title} className="mjh-studio-card">
                <p className="mjh-studio-card-title">{title}</p>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mjh-section">
        <div data-reveal="scale" className="mjh-trust">
          <h2>What we will not do</h2>
          <div className="mjh-trust-grid">
            {TRUST.map(([title, body]) => (
              <div key={title}>
                <p className="mjh-trust-title">{title}</p>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mjh-cta">
        <span aria-hidden="true" className="px-ripple" />
        <div className="mjh-cta-inner">
          <h2 data-reveal="blur">Find the design first. <span className="mjh-accent">The rest is a conversation.</span></h2>
          <p data-reveal>Prices are shown at checkout, per design and per link duration.</p>
          <Link to={LINK.browseThemes} data-reveal="blur" className="mjh-btn-primary">Browse designs</Link>
        </div>
      </section>

      <footer className="mjh-footer">
        <p>&copy; 2026 MAJA Invites</p>
        <div className="mjh-footer-links">
          <Link to="/#story" data-mj-link>Story</Link>
          <Link to="/faq" data-mj-link>FAQ</Link>
          <Link to={LINK.terms} data-mj-link>Legal</Link>
        </div>
      </footer>
    </div>
  );
}
