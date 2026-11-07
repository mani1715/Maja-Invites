import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LINK, NAV_LINKS } from '@/lib/marketingLinks';
import * as store from '@/api/store';
import ThemeShowcase from '@/components/landing/ThemeShowcase';
import CommunityStrip from '@/components/community/CommunityStrip';
import './Landing.css';
import useSeo from '@/lib/useSeo';

// WhatsApp support line — deliberately NOT hard-coded. 919876543210 is the
// standard Indian placeholder number; shipping it as a "WhatsApp us" link
// would present an unmonitored line as a real support channel. Set
// VITE_SUPPORT_WHATSAPP (bare digits, e.g. 91XXXXXXXXXX) at build time to a
// REAL, staffed WhatsApp Business number to turn the CTA back on.
const SUPPORT_WHATSAPP_URL = (() => {
  const n = (import.meta.env.VITE_SUPPORT_WHATSAPP || '').trim();
  return n ? `https://wa.me/${n}` : '';
})();

// Ported from "MAJA Invites Landing.dc.html". The hero nav is bespoke (scroll-fade
// chrome + full-screen mobile drawer) so it stays local rather than going through
// the shared MarketingNav used by the 5 secondary pages.
const FEATURES = [
  { title: 'Done-for-You Invitations', desc: 'You send the couple’s details; our team builds and delivers the invitation link.' },
  { title: 'Live Photo Gallery', desc: 'Guests scan a QR at the event and add photos from their phones, so every candid lands in one place alongside yours.' },
  { title: 'Every Celebration', desc: 'Weddings, baby & birthday, half-saree, ritu kala samskaram and dhoti / upanayanam.' },
  { title: 'Wax-Seal Opening', desc: 'A cinematic unfolding intro with parallax depth on supported designs.' },
  { title: 'RSVP & Guest Wishes', desc: 'A wishes wall and RSVP form built into every invitation, with a countdown to the date.' },
  { title: 'Ambient Music Library', desc: 'Curated tracks that crossfade between sections so the moment is never broken.' },
  { title: 'Guest Check-In · QR', desc: 'A scan-to-mark-attendance check-in form for the event.' },
  { title: 'Digital Shagun · UPI', desc: 'The couple collects gifts via UPI and Razorpay, right from the invitation.' },
  { title: 'Multi-Language Invites', desc: 'Publish the same invitation in Hindi, Tamil, Telugu and English.' },
  { title: 'Smart Photo Delivery', desc: 'Deliver finished photos to guests over WhatsApp and email.' },
  { title: 'Portfolio Website', desc: 'A fifteen-section portfolio site on your own link, in one of ten designs.' },
  { title: 'Discovery Listing', desc: 'A public profile in the MAJA directory, searchable by city and by what you shoot.' },
  { title: 'Client Portal & CRM', desc: 'A scoped login for each couple, plus the bookings, messages and client work behind it.' },
  { title: 'Studio Cloud Storage', desc: 'Album delivery, backups and a storage pool that scales with your plan.' },
  { title: 'Pixora Community', desc: 'The photographers’ network: posts, reels, stories, discovery, challenges and a gigs board.' },
  { title: 'Private & Secure', desc: 'Passcode-locked invites, staff roles and a full audit trail on your studio.' },
];

// Prices are NOT here. The four figures this page used to hard-code had already
// drifted: it advertised Royal at ₹5,999 while `/api/store/packages` — the same
// source /pricing and the checkout quote from — says ₹4,999. A home page that
// quotes a price the checkout will not honour is worse than one that quotes
// none, so the tier NAMES and what each covers stay editorial here and the
// amount is fetched. If the fetch fails, no figure is shown.
const TIERS = [
  { key: 'classic', name: 'Classic', blurb: 'Core invitation — everything you need to invite beautifully.', options: [
    { title: 'Wax-Seal Opening', desc: 'Cinematic 3D unfolding intro.' },
    { title: 'Couple + Family Photos', desc: 'Portrait gallery with full bios.' },
    { title: 'Live Countdown', desc: 'Real-time ticker to the muhurat.' },
  ] },
  { key: 'premium', name: 'Premium', blurb: 'Classic + richer storytelling, music, language & gifting.', options: [
    { title: 'Background Music', desc: '30+ curated tracks across 8 categories.' },
    { title: 'Multi-language Invite', desc: 'Hindi · Tamil · Telugu · English' },
    { title: 'Digital Shagun · UPI/QR', desc: 'Accept gifts via Razorpay / UPI / QR.' },
  ] },
  { key: 'royal', name: 'Royal', blurb: 'Premium + live gallery, guest check-in & private access.', options: [
    { title: 'Live Photo Gallery', desc: 'Stream wedding moments to guests in real time.' },
    { title: 'Guest Check-In · QR', desc: 'Scan-to-mark-attendance check-in form.' },
    { title: 'Passcode-Protected Link', desc: 'Private invite — only invited guests can enter.' },
  ] },
  { key: 'bespoke', name: 'Bespoke', blurb: 'Everything + a dedicated designer and white-glove concierge.', options: [
    { title: 'Full Concierge Build', desc: 'Everything in Classic, Premium & Royal, fully tailored.' },
  ] },
];

const FAQS = [
  { q: 'Who is MAJA for?', a: 'Wedding photographers and studios. Accounts on MAJA are studio accounts — couples do not sign up, and there is no separate customer login. You order the invitation from your studio panel and hand your client a link.' },
  { q: 'Do I design the invitation myself?', a: 'No — it is done for you. You pick a design and send the couple’s details, and our team builds and delivers the invitation as a live link. Previewing designs is always free; you only pay when you order one.' },
  { q: 'How does pricing work? Are there subscriptions?', a: 'Two separate things. An invitation is a one-time price per invitation — the four tiers and what each covers are listed above, priced live from the store. Your studio panel — portfolio, client galleries, storage and Pixora — is a subscription, priced per cycle on the pricing page.' },
  { q: 'How does my client see and use it?', a: 'The couple gets a scoped client login for their own wedding: their details, their guest list, their gallery. They never build the page, and they never hold a MAJA account beyond that one event.' },
  { q: 'Whose brand is on it?', a: 'Yours, on the plans that include white-label branding — your studio’s name and mark on the portfolio and the client-facing surfaces. Your panel tells you whether your current plan covers it.' },
  { q: 'Which occasions are supported?', a: 'Weddings, baby & birthday, half-saree, ritu kala samskaram (puberty) and dhoti / upanayanam. Every collection has a live sample you can open before you order.' },
  { q: 'How do guests add and receive photos?', a: 'At the event, guests scan a QR and upload photos from their phones straight into the live gallery — no app or account needed. Delivery back to guests goes over WhatsApp and email.' },
  { q: 'In which languages can the invitation be published?', a: 'Hindi, Tamil, Telugu and English. Guests pick their language when they open the invitation.' },
  { q: 'How do guests send digital shagun / gifts?', a: 'The invitation can show a Digital Shagun button. Guests send gifts directly via UPI and Razorpay from their phone.' },
  { q: 'Is the invitation private?', a: 'The couple chooses. An invitation can be public or passcode-protected, so only guests with the code can open it.' },
  { q: 'Do guests need an app?', a: 'No. The invitation opens in any modern browser — RSVP, wishes, the live gallery and shagun all work on a normal mobile browser.' },
  { q: 'Is the Pixora community free?', a: 'Browsing, following and engaging are free. Publishing reels and stories is a Premium feature on the photographer plans.' },
  { q: 'What exactly does the studio panel include?', a: 'A portfolio website, a discovery listing in the directory, studio cloud storage and album delivery, a client CRM with a scoped portal per couple, a booking calendar, earnings and insights, staff roles with an audit trail, and the Pixora community.' },
  { q: 'Who builds and delivers the invitation, and how do I share it?', a: 'The MAJA team builds it end-to-end. Once it is ready you get a short shareable link — you review it privately, then pass it to your client.' },
];

export default function Landing() {
  useSeo({
    title: 'Digital wedding invitations for photographers',
    description: 'MAJA gives wedding studios a done-for-you invitation product to sell, plus a portfolio site, client galleries, storage and a photographer community. Your clients never build a thing.',
  });
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  // {classic: 1499, …} from the same endpoint /pricing and the checkout quote
  // read. Empty until it answers, and stays empty if it fails — see TIERS.
  const [prices, setPrices] = useState({});

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let live = true;
    store.packages()
      .then(({ data }) => {
        if (!live) return;
        const map = {};
        for (const p of data?.packages || []) {
          const inr = p.price?.english;
          if (typeof inr === 'number') map[p.key] = inr;
        }
        setPrices(map);
      })
      .catch(() => { /* no figure rather than a stale one */ });
    return () => { live = false; };
  }, []);

  return (
    <div className="mjl-page">
      <nav className={`mjl-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <a href="#top" className="mjl-brand">
          <span className="mjl-logo">M</span>
          <span className="mjl-name">MAJA Invites</span>
        </a>
        <div className="mjl-desktop-links">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} to={l.to} data-mj-link className="mjl-link">{l.label}</Link>
          ))}
          <Link to={LINK.signIn} data-mj-link className="mjl-link">Sign in</Link>
          <Link to={LINK.signUp} className="mjl-cta">Set up your studio</Link>
        </div>
        <button
          className="mjl-hamburger"
          aria-label="Menu"
          onClick={() => setDrawerOpen((o) => !o)}
        >
          <span className={drawerOpen ? 'l1 open' : 'l1'} />
          <span className={drawerOpen ? 'l2 open' : 'l2'} />
          <span className={drawerOpen ? 'l3 open' : 'l3'} />
        </button>
      </nav>

      {drawerOpen && (
        <div data-mj-drawer className="mjl-drawer">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} to={l.to} onClick={() => setDrawerOpen(false)}>{l.label}</Link>
          ))}
          <Link to={LINK.signIn} onClick={() => setDrawerOpen(false)}>Sign in</Link>
          <Link to={LINK.signUp} className="mjl-drawer-cta" onClick={() => setDrawerOpen(false)}>Set up your studio</Link>
        </div>
      )}

      <header id="top" className="px-aurora mjl-hero">
        <div aria-hidden="true" className="mjl-hero-glow-top" />
        <div aria-hidden="true" className="mjl-hero-orb-a" />
        <div aria-hidden="true" className="mjl-hero-orb-b" />
        <span aria-hidden="true" className="px-petal" style={{ left: '8%', animationDelay: '-2s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '24%', width: 10, height: 14, opacity: .4, animationDuration: '18s', animationDelay: '-9s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '47%', width: 14, height: 18, opacity: .5, animationDuration: '12s', animationDelay: '-5s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '69%', animationDuration: '16s', animationDelay: '-11s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '88%', width: 10, height: 14, opacity: .45, animationDuration: '20s', animationDelay: '-3s' }} />
        <div className="mjl-hero-inner">
          <p className="mjl-eyebrow">MAJA Invites &middot; for photographers</p>
          <h1 className="mjl-h1"><span>Your studio,</span><br /><span className="mjl-h1-accent">with an invitation business inside it.</span></h1>
          <p className="mjl-lead">A done-for-you digital invitation you sell to every couple you book &mdash; and the portfolio, client galleries and storage to run the studio around it. Your clients never build a thing. Neither do you.</p>
          <div className="mjl-hero-actions">
            <Link to={LINK.signUp} className="mjl-btn-primary">Set up your studio</Link>
            <a href="#showcase" className="mjl-btn-secondary">See a live invitation &rarr;</a>
          </div>
        </div>
        <div className="px-glass mjl-trust-bar">
          <p>Built for wedding photographers across India</p>
          <p className="mjl-trust-accent">Scroll to explore &darr;</p>
        </div>
      </header>

      <section className="mjl-section mjl-philosophy">
        {/* Was a striped placeholder box reading "couple portrait, warm film
            tone". This is a real design from the catalogue instead. */}
        <div data-reveal="blur" className="mjl-philosophy-art">
          <img
            src="/designs/opt/Mughal/Marriage/3173d9216524700e93025f232b185831-a6119cd9-480.webp"
            alt="A Royal Mughal marriage invitation design from the MAJA catalogue"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div data-reveal="r">
          <p className="mjl-eyebrow">The difference</p>
          <h2 data-mj-ink className="mjl-h2">We don&rsquo;t hand your client a template. We build it for them.</h2>
          <p className="mjl-body">Send us the names, the dates, the venues and the small details you already collect at booking. A designer on our team builds the invitation around them — you review it privately, before a single guest sees it.</p>
          <p className="mjl-body">No editor for you to learn. No generic layout to apologise for. A finished piece you hand over.</p>
        </div>
      </section>

      <section id="how" className="mjl-section">
        <p data-reveal className="mjl-eyebrow">How it works</p>
        <h2 data-reveal className="mjl-h2 mjl-h2-wide">From a booking to a finished invitation, in three steps.</h2>
        <div data-mj-stagger className="mjl-how-grid">
          {[
            ['01', 'Send us the brief', 'Pick a design, then the names, dates and venues you already take at booking.'],
            ['02', 'We design it, you approve it', 'A private preview, revised until it is right — before it reaches your client.'],
            ['03', 'Hand over the link', 'RSVPs, wishes and photos land in your studio panel, for as long as the season lasts.'],
          ].map(([num, title, body]) => (
            <div data-reveal key={num} className="mjl-how-card">
              <span className="mjl-how-num">{num}</span>
              <h3 className="mjl-how-title">{title}</h3>
              <p className="mjl-body-sm">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="showcase" className="mjl-showcase">
        <div className="mjl-showcase-inner">
          <div className="mjl-showcase-head">
            <div data-reveal="l">
              <p className="mjl-eyebrow">Every tradition, given room</p>
              <h2 className="mjl-h2 mjl-h2-wide">Designed around the ceremony, not the other way round.</h2>
            </div>
            <Link to={LINK.browseThemes} data-mj-link className="mjl-link mjl-link-accent">Browse all designs &rarr;</Link>
          </div>
          {/* The phone is not a drawing of an invitation any more — it is the
              invitation, in an iframe, on the same route the "open full screen"
              link points at. The old caption claimed "Not a mockup" over a
              hand-drawn SVG mockup. */}
          <div data-reveal="scale" className="mjl-showcase-live">
            <div className="mjl-phone-mock">
              <iframe
                className="mjl-phone-frame"
                src="/preview/luxe?theme=royal_mughal&embed=1"
                title="A live sample wedding invitation"
                loading="lazy"
              />
            </div>
            <div className="mjl-showcase-live-text">
              <p className="mjl-live-label">A real invitation, running</p>
              <p className="mjl-live-caption">
                That is the invitation page itself, not a picture of one &mdash; the same page a
                guest opens. Scroll it, open the RSVP, read the blessings. The names and dates
                are sample content; everything else is the product.
              </p>
              <a
                className="mjl-link mjl-link-accent"
                href="/preview/luxe"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open it full screen &rarr;
              </a>
            </div>
          </div>
          <ThemeShowcase />
          <p data-reveal className="mjl-body-sm">
            Planning your wedding? These invitations come through our partner photographers &mdash; ask yours for MAJA Invites. <Link to="/photographers" data-mj-link className="mjl-link mjl-link-accent">Find a photographer &rarr;</Link>
          </p>
        </div>
      </section>

      <section className="mjl-section mjl-craft">
        <div data-reveal="l" className="mjl-craft-text">
          <p className="mjl-eyebrow">In the details</p>
          <h2 className="mjl-h2">Everything a guest needs. Nothing they don&rsquo;t.</h2>
          <div className="mjl-craft-list">
            {[
              ['RSVPs that arrive organised', 'Every response, meal preference, and plus-one, tracked automatically as it comes in.'],
              ['A gallery guests fill in for you', 'A live photo wall collects everyone’s candid shots, from the mehendi to the morning after.'],
              ['Gifting, without the awkwardness', 'A digital shagun and gift registry, handled with the same discretion as the rest of the invitation.'],
              ['Travel, mapped out clearly', 'Venue directions, stay recommendations, and a schedule guests can actually follow.'],
            ].map(([title, body]) => (
              <div key={title} className="mjl-craft-item">
                <h4>{title}</h4>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Was a striped placeholder reading "invitation detail, mobile screen".
            It is the invitation on a mobile screen now — the same iframe as the
            showcase, in a different collection so the two do not repeat. */}
        <div data-reveal="blur" className="mjl-phone-mock mjl-craft-media">
          <iframe
            className="mjl-phone-frame"
            src="/preview/luxe?theme=kerala_backwaters&embed=1"
            title="A live sample invitation in the Kerala Backwaters collection"
            loading="lazy"
          />
        </div>
      </section>

      <section id="features" className="mjl-section">
        <p data-reveal className="mjl-eyebrow">What MAJA does</p>
        <h2 data-mj-ink className="mjl-h2 mjl-h2-wide">Everything the invitation needs, and everything the studio runs on.</h2>
        <p data-reveal className="mjl-body mjl-body-wide">A done-for-you invitation with the guest tools built in — and the portfolio, storage, client portal and community you run the rest of the business from.</p>
        <div data-mj-stagger className="mjl-features-grid">
          {FEATURES.map((f) => (
            <div data-reveal="blur" key={f.title} className="mjl-feature-card">
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="story" className="mjl-story">
        <div className="mjl-story-inner">
          <div data-reveal="l">
            <p className="mjl-eyebrow">Our mission</p>
            <h2 className="mjl-h2">Celebrations, made <em className="mjl-em">effortless</em>.</h2>
            <p className="mjl-body">Every wedding studio ends up doing work nobody booked it for — building an invitation, chasing RSVPs, collecting everyone’s phone photos. MAJA takes that off your desk: you pick a design and send the brief, and our team builds the invitation end-to-end, with RSVP, guest wishes, a live photo gallery and delivery already in it.</p>
            <p className="mjl-body">It covers every occasion your clients celebrate — a wedding, a child’s first birthday, a half-saree, a ritu kala samskaram or a dhoti ceremony. And around it sits the platform the studio itself runs on: a portfolio site, a discovery listing, cloud storage and a client portal.</p>
          </div>
          <div data-reveal="scale" className="mjl-story-card">
            <p className="mjl-story-label">What we stand for</p>
            <p className="mjl-story-quote">&ldquo;Clarity over hype. Honest pricing — any discount is shown against the real price, never a fabricated one. Reviews come from genuine customers only. And the invitation is done for you, so the work is ours, not yours.&rdquo;</p>
            <div className="mjl-story-checks">
              <p>&#10003; Done-for-you — you approve, we build</p>
              <p>&#10003; One-time invitation pricing, no surprises</p>
              <p>&#10003; Real reviews and honest anchoring only</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mjl-section">
        <p data-reveal className="mjl-eyebrow">What&rsquo;s inside the invite</p>
        <h2 data-reveal className="mjl-h2 mjl-h2-wide">Every feature, grouped by plan.</h2>
        <p data-reveal className="mjl-body mjl-body-wide2">Four tiers, one ladder — each plan unlocks everything in the tiers below it, plus the features shown under it. Priced per invitation and ordered from your studio panel; the studio subscription is separate.</p>
        <div className="mjl-tiers">
          {TIERS.map((tier) => (
            <div data-reveal key={tier.name}>
              <div className="mjl-tier-head">
                <span className="mjl-tier-name">{tier.name}</span>
                {typeof prices[tier.key] === 'number' && (
                  <span className="mjl-tier-price">
                    &#8377;{prices[tier.key].toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <p className="mjl-tier-blurb">{tier.blurb}</p>
              <div data-mj-stagger className="mjl-tier-grid">
                {tier.options.map((opt) => (
                  <div data-reveal="blur" key={opt.title} className="mjl-tier-card">
                    <span className="mjl-tier-included">Included</span>
                    <h5>{opt.title}</h5>
                    <p>{opt.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p data-reveal className="mjl-tier-note">&#9670; Each plan includes everything in the tiers below it &middot; Pay only when you publish &#9670;</p>
      </section>

      <section id="faq" className="mjl-faq-section">
        <div className="mjl-faq-inner">
          <p data-reveal className="mjl-eyebrow mjl-center">Frequently asked</p>
          <h2 data-reveal className="mjl-h2 mjl-center">Your questions, answered.</h2>
          <div className="mjl-faq-list">
            {FAQS.map((faq, i) => {
              const open = openFaq === i;
              return (
                <div data-reveal key={faq.q} className="mjl-faq-item">
                  <button onClick={() => setOpenFaq(open ? -1 : i)} className="mjl-faq-q">
                    <span>{faq.q}</span>
                    <span className="mjl-faq-chevron" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>&#9662;</span>
                  </button>
                  <div className="mjl-faq-row" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
                    <div className="mjl-faq-a-wrap"><p className="mjl-faq-a">{faq.a}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div data-reveal className="mjl-faq-cta">
            <p className="mjl-faq-cta-text">Still have a question?</p>
            <div className="mjl-faq-cta-actions">
              <a href="mailto:support@majacreations.com" className="mjl-btn-secondary">Email us</a>
              {SUPPORT_WHATSAPP_URL ? (
                <a href={SUPPORT_WHATSAPP_URL} className="mjl-btn-primary">WhatsApp</a>
              ) : (
                <Link to="/contact" className="mjl-btn-primary">Contact us</Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Live work from the studios on MAJA. Renders nothing at all when the
          community is empty, so a young site never shows an empty shelf. */}
      <CommunityStrip />

      <section id="photographers" className="mjl-section mjl-photographers">
        <div className="mjl-photographers-inner">
          <div data-reveal="l" className="mjl-photographers-text">
            <p className="mjl-eyebrow">The studio panel</p>
            <h2 className="mjl-h2-md">Built around how a wedding studio actually works.</h2>
            <p className="mjl-body">Not a generic CRM with a photography skin. Every panel below is a screen in your studio, and it is the same sign-in that orders invitations.</p>
            <div className="mjl-photographers-links">
              <Link to="/portfolio-samples" data-mj-link className="mjl-link mjl-link-accent">See the ten portfolio designs &rarr;</Link>
              <Link to={LINK.signUp} data-mj-link className="mjl-link mjl-link-accent">Set up your studio &rarr;</Link>
            </div>
          </div>
          {/* Was a striped placeholder reading "studio dashboard preview". A
              screenshot of a panel nobody has signed into yet would be a mockup;
              this is the actual list of screens behind the sign-in. */}
          <ul data-mj-stagger className="mjl-panel-list">
            {[
              ['Weddings', 'Every booking, its invitation, guests, RSVPs and gifts in one place.'],
              ['Portfolio site', 'Fifteen sections, ten designs, published on your own link.'],
              ['Client portal', 'A scoped login per couple — their wedding only, nothing else.'],
              ['Live galleries', 'Guest uploads, face match and album delivery over WhatsApp and email.'],
              ['Studio storage', 'Backups and a storage pool that grows with your plan.'],
              ['Calendar & staff', 'Bookings, second shooters, roles and an audit trail.'],
              ['Earnings & insights', 'What you have made, and where the enquiries come from.'],
              ['Pixora', 'The photographers’ community: posts, reels, gigs and challenges.'],
            ].map(([title, body]) => (
              <li data-reveal="blur" key={title} className="mjl-panel-item">
                <h4>{title}</h4>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="start" className="px-aurora mjl-final-cta">
        <span aria-hidden="true" className="px-ripple" />
        <div className="mjl-final-inner">
          <p data-reveal className="mjl-eyebrow mjl-center">Start here</p>
          <h2 data-reveal="blur" className="mjl-h2-lg">Start with a conversation, <span className="mjl-em">not a form.</span></h2>
          <Link data-reveal="blur" to={LINK.signUp} className="mjl-btn-primary">Set up your studio</Link>
        </div>
      </section>

      <footer className="mjl-footer">
        <div className="mjl-footer-grid">
          <div>
            <span className="mjl-footer-brand">MAJA Invites</span>
            <p className="mjl-footer-tag">Made in India, for weddings and celebrations everywhere.</p>
          </div>
          <div>
            <h5>Explore</h5>
            <Link to={LINK.browseThemes} data-mj-link>All designs</Link>
            <Link to="/how-it-works" data-mj-link>How it works</Link>
            <Link to="/pricing" data-mj-link>Plans &amp; pricing</Link>
            <Link to="/#photographers" data-mj-link>For photographers</Link>
            <Link to="/photographers" data-mj-link>Photographer directory</Link>
            <Link to="/community" data-mj-link>Community</Link>
            <Link to="/community/reels" data-mj-link>Reels</Link>
          </div>
          <div>
            <h5>Company</h5>
            <Link to="/#story" data-mj-link>Our story</Link>
            <Link to="/faq" data-mj-link>FAQ</Link>
            <Link to="/contact" data-mj-link>Contact &amp; support</Link>
          </div>
          <div>
            <h5>Legal</h5>
            <Link to={LINK.terms} data-mj-link>Terms of service</Link>
            <Link to={LINK.privacy} data-mj-link>Privacy policy</Link>
            <Link to={LINK.refund} data-mj-link>Refund policy</Link>
          </div>
        </div>
        <div className="mjl-footer-bottom">
          <p>&copy; 2026 MAJA Invites</p>
          <p>Every invitation, handled with care.</p>
        </div>
      </footer>
    </div>
  );
}
