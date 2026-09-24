import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { LINK, SUPPORT_EMAIL } from '@/lib/marketingLinks';
import * as store from '@/api/store';
import './Faq.css';
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

// Ported from "MAJA FAQ.dc.html". Rewritten for the actual customer: accounts
// on MAJA are STUDIO accounts, so these are a photographer's questions, with
// the guest-facing facts kept where they matter.
//
// PRICES ARE NOT HARD-CODED HERE ANY MORE. The old copy read "Royal is ₹5,999"
// under a comment claiming the figures matched `store_features.py` — they did
// not: PACKAGES has Royal at 4,999, and so does `/api/store/packages`, which
// is what the cart quotes and the card charges. Two marketing pages advertised
// a price a thousand rupees above the real one. `buildData` now takes the live
// map and writes the sentence from it; with no map it names no figure.
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

function costAnswer(prices) {
  const named = ['classic', 'royal', 'bespoke']
    .filter((k) => typeof prices[k] === 'number')
    .map((k) => `${k[0].toUpperCase()}${k.slice(1)} is ${inr(prices[k])}`);
  const figures = named.length
    ? `${named.join(', ')} — each `
    : 'Each invitation tier is ';
  return `${figures}a one-time payment for the whole wedding, paid by you from the studio panel when you place the order. Nothing renews, and it is separate from your studio subscription.`;
}

const buildData = (prices) => [
  { title: 'Before you order', blurb: 'What you need in hand, and what it costs.', items: [
    ['How far ahead should we start?', 'Four to six weeks before the couple wants to send it is comfortable. We can build in a week if you are close to the date — tell us the deadline and we will say honestly whether it is possible.'],
    ['What do you need from us to begin?', 'Names, the events with dates and venues, and how the families should be named. Everything else — story, photographs, music, languages — can come later while we are building.'],
    ['What does it cost?', costAnswer(prices)],
    ['Can the couple see it before anyone pays?', 'Yes. Every collection has a live sample you can open with them before you order, and once you do we show a first draft for approval. Cancel before we start building and there is nothing to refund.'],
    ['Do our clients need a MAJA account?', 'No. There is no customer sign-up on MAJA — accounts are studio accounts. The couple gets a scoped client login for their own wedding only, and guests need nothing at all.'],
  ] },
  { title: 'The invitation itself', blurb: 'What guests see and what it can hold.', items: [
    ['Do guests need an app or an account?', 'No. It opens in whatever browser is already on the phone. No download, no login, no sign-up page — which matters when it is going to grandparents.'],
    ['Can each event have its own page?', 'Yes, and it is the part most studios come to us for. Mehendi, sangeet, muhurtham and reception each get their own page, their own timing and their own share link.'],
    ['Which languages can it be in?', 'Hindi, Tamil, Telugu and English. Guests switch language at the top of the page; the higher tiers include more of them.'],
    ['Can details change after it is sent?', 'Yes, and this is why a link beats a printed card. Change a venue or a time and every guest who opens the link sees the new version. Nobody needs a new URL.'],
    ['Can it be kept private?', 'Yes. Turn on a passcode and only people given the code can open it. Specific events can also be hidden from specific guest groups.'],
  ] },
  { title: 'RSVPs and guests', blurb: 'Collecting replies without chasing people.', items: [
    ['How do RSVPs work?', 'A short form on the invitation — coming or not, how many, and food preference if it is asked for. Replies arrive in your panel as they come in, filtered by event, and export as a spreadsheet.'],
    ['Can reminders go out?', 'On the higher tiers, yes. WhatsApp reminders go to the people who have not replied. You choose when, and you see who read it.'],
    ['The couple already has a guest list in a sheet.', 'Send it across and we will import it — names, numbers, and which side of the family. Nobody retypes anything.'],
  ] },
  { title: 'Photographs and gifts', blurb: 'The parts that happen on and after the day.', items: [
    ['How does the live gallery work?', 'Guests scan a QR code on the table and add photographs from their phone during the event. You approve what goes up.'],
    ['Can guests get their own photographs?', 'If you enable it, a guest uploads a selfie and your studio uses that to find and send the photographs they appear in. It is always the guest’s choice to ask.'],
    ['What is digital shagun?', 'Guests can send money by UPI through the invitation, with a note if they want to. It settles to the couple’s account, never the studio’s, and the total is never shown publicly.'],
    ['Can there be a gift registry instead?', 'Yes. The couple lists what they actually want, with a link to where to buy it. Guests claim an item so two people do not bring the same gift.'],
  ] },
  { title: 'Running the studio', blurb: 'The panel behind your sign-in.', items: [
    ['What does a studio subscription include?', 'A portfolio site, a directory listing, bookings, client galleries, cloud storage and Pixora. Priced in INR per billing cycle — see the pricing page. What each plan unlocks in the community is listed there too.'],
    ['Can we run it under our own brand?', 'On the plans that include white-label branding, yes — your name, your mark, and no mention of MAJA anywhere the client can see. Your panel tells you whether your current plan covers it.'],
    ['Do you take a cut of what we charge clients?', 'No. You keep your pricing and your client relationship. We charge you for the subscription and for each invitation you order, and nothing else.'],
    ['Can our team have their own logins?', 'Yes. Staff get their own access with roles, and every action is recorded in your studio’s audit log.'],
    ['What is Pixora?', 'A community for the studios on MAJA — work in progress, hiring, referrals, second shooters, presets, pricing benchmarks and courses. Included with every studio plan.'],
  ] },
  { title: 'Not a wedding', blurb: 'Other celebrations we build for.', items: [
    ['Do you do birthdays and other functions?', 'Yes — first birthdays, half-sarees, ritu kala samskaram, dhoti ceremonies, naming ceremonies, housewarmings, engagements and anniversaries. Tell us what it is and we shape the invitation around that occasion instead of a wedding.'],
    ['Can you do a corporate or ticketed event?', 'Not yet as a self-serve product. Write to us if you have one and we will tell you honestly whether we can help.'],
  ] },
];

export default function Faq() {
  useSeo({ title: 'FAQ', description: 'Answers for photographers on invitation pricing, studio plans, white-label branding, languages, guest privacy and delivery times.' });
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(['q0']);
  const [prices, setPrices] = useState({});

  useEffect(() => {
    let live = true;
    store.packages()
      .then(({ data }) => {
        if (!live) return;
        const map = {};
        for (const pkg of data?.packages || []) {
          const amount = pkg.price?.english;
          if (typeof amount === 'number') map[pkg.key] = amount;
        }
        setPrices(map);
      })
      .catch(() => { /* the answer names no figure rather than a stale one */ });
    return () => { live = false; };
  }, []);

  const DATA = useMemo(() => buildData(prices), [prices]);
  const q = query.trim().toLowerCase();
  const filters = useMemo(() => ['All', ...DATA.map((g) => g.title)], [DATA]);

  let groups = filter === 'All' ? DATA : DATA.filter((g) => g.title === filter);
  if (q) {
    groups = DATA.map((g) => ({
      title: g.title, blurb: g.blurb,
      items: g.items.filter(([a, b]) => (a + ' ' + b).toLowerCase().includes(q)),
    })).filter((g) => g.items.length);
  }

  let n = 0;
  const shaped = groups.map((g) => ({
    title: g.title, blurb: g.blurb,
    items: g.items.map(([question, answer]) => {
      const id = 'q' + (n++);
      const isOpen = q ? true : open.includes(id);
      return { id, q: question, a: answer, isOpen };
    }),
  }));
  const toggle = (id) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : o.concat(id)));

  return (
    <div className="mjq-page">
      <MarketingNav />

      <header className="px-aurora mjq-hero">
        <span aria-hidden="true" className="px-petal" style={{ left: '11%', animationDelay: '-2s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '37%', width: 10, height: 14, opacity: .4, animationDuration: '18s', animationDelay: '-9s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '64%', width: 14, height: 18, opacity: .5, animationDuration: '12s', animationDelay: '-5s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '92%', animationDuration: '16s', animationDelay: '-11s' }} />
        <div className="mjq-hero-inner">
          <p className="mjq-eyebrow">Questions</p>
          <h1 className="mjq-h1">Everything studios ask <span className="mjq-accent">before they begin.</span></h1>
          <p className="mjq-lead">If yours isn&rsquo;t here, write to us — we answer within a working day and add the good ones to this page.</p>
          <input
            placeholder="Search the questions…"
            aria-label="Search the questions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-mj-field
            className="mjq-search"
          />
        </div>
      </header>

      <div className="mjq-filters">
        {filters.map((label) => {
          const on = label === filter && !q;
          return (
            <button key={label} className={on ? 'is-on' : ''} onClick={() => { setFilter(label); setQuery(''); }}>{label}</button>
          );
        })}
      </div>

      <div className="mjq-body">
        {shaped.map((g) => (
          <section key={g.title} className="mjq-group">
            <h2 data-reveal>{g.title}</h2>
            <p data-reveal className="mjq-group-blurb">{g.blurb}</p>
            <div data-reveal="scale" className="mjq-accordion">
              {g.items.map((item) => (
                <div key={item.id} className="mjq-item">
                  <button onClick={() => toggle(item.id)} aria-expanded={item.isOpen} className="mjq-q">
                    <span>{item.q}</span>
                    <span className="mjq-icon" style={{ transform: item.isOpen ? 'rotate(45deg)' : 'none' }}>+</span>
                  </button>
                  <div className="mjq-row" style={{ gridTemplateRows: item.isOpen ? '1fr' : '0fr' }}>
                    <div className="mjq-a-wrap"><p>{item.a}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {shaped.length === 0 && (
          <div data-reveal="scale" className="mjq-empty">
            <p className="mjq-empty-title">Nothing matches &ldquo;{query}&rdquo;.</p>
            <p className="mjq-empty-sub">Ask us directly and we&rsquo;ll answer within a working day.</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mjq-btn-primary">Write to us</a>
          </div>
        )}

        <div data-reveal="scale" className="mjq-cta">
          <span aria-hidden="true" className="px-ripple" />
          <div className="mjq-cta-text">
            <h2>Still not sure?</h2>
            <p>Send us the dates and what&rsquo;s happening. We&rsquo;ll tell you what it costs and what we&rsquo;d do, before you pay anything.</p>
          </div>
          <div className="mjq-cta-actions">
            {SUPPORT_WHATSAPP_URL ? (
              <a href={SUPPORT_WHATSAPP_URL} className="mjq-btn-primary">WhatsApp us</a>
            ) : (
              <Link to="/contact" className="mjq-btn-primary">Contact us</Link>
            )}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mjq-btn-secondary">Email</a>
          </div>
        </div>
      </div>

      <footer className="mjq-footer">
        <p>&copy; 2026 MAJA Invites</p>
        <div className="mjq-footer-links">
          <Link to="/#story" data-mj-link>Our story</Link>
          <Link to={LINK.terms} data-mj-link>Terms</Link>
          <Link to={LINK.privacy} data-mj-link>Privacy</Link>
          <Link to={LINK.refund} data-mj-link>Refunds</Link>
        </div>
      </footer>
    </div>
  );
}
