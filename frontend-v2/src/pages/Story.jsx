import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK, SUPPORT_EMAIL } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import './Story.css';

// The "why we exist" page. Editorial content, same as Features and HowItWorks —
// there is no API behind it and there should not be. Kept honest and specific
// rather than the usual founder-mythology copy.

const PRINCIPLES = [
  {
    title: 'We build it, you do not',
    body: `Most digital invitation products hand you a drag-and-drop editor and
    call that a service. Planning a wedding is already a second job. You send us
    the names, the dates, the photos and whatever else you have; a person on our
    team builds the invitation and sends it back as a link.`,
  },
  {
    title: 'A guest should never need an account',
    body: `Nobody wants to sign up to see a wedding invitation. Every guest-facing
    thing we make — the invitation, the RSVP, the wishes wall, the photo gallery,
    the face search — works from a link with nothing to install and nothing to
    join.`,
  },
  {
    title: 'Faces are handled carefully or not at all',
    body: `Guests can upload a selfie and get their own photos back. That is
    biometric data, so it is opt-in, the selfie is never stored, consent can be
    withdrawn from the gallery page itself, and the face data is deleted 90 days
    after the event at the latest.`,
  },
  {
    title: 'Photographers are the business, not an afterthought',
    body: `The studios that deliver these weddings needed a portfolio, a client
    portal, galleries, QR codes and a way to get paid — not another subscription
    that only helps us. Most of what we have built in the last year came from
    photographers telling us what was wasting their evenings.`,
  },
  {
    title: 'Rupees, plainly',
    body: `We priced this in INR with no credits, no tokens and no expiring
    wallet. You can read the whole price list on one page before you talk to
    anyone.`,
  },
];

export default function Story() {
  useSeo({
    title: 'Our story',
    description: 'Why MAJA Invites is a done-for-you service rather than another invitation builder, and the principles we hold to.',
  });

  return (
    <div className="sty-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora sty-hero">
        <div className="sty-hero-inner">
          <p className="sty-eyebrow">Our story</p>
          <h1 className="sty-h1">
            An invitation should feel like <span className="sty-hl">an invitation</span>
          </h1>
          <p className="sty-sub">
            Not a form. Not a template you fight with at 1am three weeks before
            the wedding. MAJA started because a photographer kept rebuilding the
            same invitation by hand for every couple, and thought the couple
            should not have to do it either.
          </p>
        </div>
      </header>

      <main id="main-content" className="sty-body">
        <section className="sty-lead">
          <p>
            We are a small team in India building for Indian weddings first —
            multiple ceremonies, several languages on one card, families spread
            across three time zones, and a guest list where half the people will
            open the link on a phone with two bars of signal. Those constraints
            shaped everything here.
          </p>
        </section>

        <section className="sty-principles">
          {PRINCIPLES.map((p, i) => (
            <article className="sty-principle" key={p.title}>
              <span className="sty-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="sty-principle-title">{p.title}</h2>
                <p className="sty-principle-body">{p.body}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="sty-cta">
          <h2 className="sty-cta-title">Where to go next</h2>
          <p className="sty-cta-body">
            If you are a couple, the fastest route is to find a photographer
            already working with us. If you are a studio, set yours up and start
            delivering.
          </p>
          <div className="sty-cta-actions">
            <Link className="sty-btn sty-btn--primary" to={LINK.signUp}>Set up your studio</Link>
            <Link className="sty-btn sty-btn--ghost" to="/photographers">Find a photographer</Link>
            <Link className="sty-btn sty-btn--ghost" to="/browse">Browse designs</Link>
          </div>
          <p className="sty-contact">
            Or just write to us: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </section>
      </main>
    </div>
  );
}
