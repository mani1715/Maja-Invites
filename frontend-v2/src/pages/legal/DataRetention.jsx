// TEMPLATE - not legal advice. Structurally complete and DPDP-aware, but every
// [BRACKETED] placeholder must be filled and the whole page reviewed by a
// qualified Indian lawyer before it is relied on.
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK, SUPPORT_EMAIL } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import './legal.css';

// Retention schedule. The periods below are written from what the codebase
// actually does (link expiry, soft-delete windows, face-collection lifecycle),
// not from a template — a retention page that does not match the system is
// worse than none.

const ROWS = [
  ['Invitation content (names, dates, venues, photos)',
    'For the life of the invitation link, plus 30 days after it expires.',
    'So a couple who lets a link lapse can have it restored without rebuilding it.'],
  ['Guest lists and RSVPs',
    'Same as the invitation it belongs to.',
    'It is only meaningful in the context of that wedding.'],
  ['Guest photos on a live wall',
    'Same as the invitation, unless removed earlier by the studio or the uploader.',
    'Guests can ask the studio to remove a photo at any time.'],
  ['Face-match data (face vectors)',
    'Deleted when the gallery is deleted, when consent is withdrawn, or 90 days after the event — whichever is first.',
    'Biometric data is the most sensitive thing here, so it has the shortest life.'],
  ['Selfies submitted for face search',
    'Not stored. Used in memory to run the search, then discarded.',
    'There is no reason to keep them.'],
  ['Deleted weddings (soft delete)',
    '30 days in trash, then permanently purged.',
    'Recovering from an accidental delete.'],
  ['Order and payment records',
    '8 years.',
    'Indian tax and accounting law requires it. These cannot be deleted on request.'],
  ['Support tickets',
    '3 years after the ticket is closed.',
    'Context for a recurring problem, and evidence in a dispute.'],
  ['Consent records',
    '3 years after the consent is superseded or withdrawn.',
    'Proof of consent under the DPDP Act.'],
  ['Audit logs (who changed what)',
    '2 years.',
    'Security investigation and dispute resolution.'],
  ['Server access logs',
    '90 days.',
    'Abuse detection and debugging.'],
  ['Studio account data',
    'Until the account is closed, plus 30 days.',
    'The grace period lets a studio reverse a closure.'],
];

export default function DataRetention() {
  // Without this the tab keeps whatever title the previous route set, and
  // a crawler landing here gets the app shell's default.
  useSeo({ title: 'Data Retention', description: 'How long MAJA Invites keeps invitations, guest data, photos and account records — and what happens at the end.' });
  return (
    <div className="mjl-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora mjl-hero">
        <div className="mjl-hero-inner">
          <p className="mjl-eyebrow">Legal</p>
          <h1 className="mjl-h1">Data Retention</h1>
          <p className="mjl-updated">Last updated: 13 August 2026</p>
        </div>
      </header>

      <main id="main-content" className="mjl-body">
        <p className="mjl-intro">
          How long we keep each kind of data, and why. Under the Digital
          Personal Data Protection Act we are required to delete personal data
          once the purpose it was collected for is served — this page is the
          schedule we hold ourselves to.
        </p>

        <section className="mjl-section">
          <h2>1. The schedule</h2>
          <div className="mjl-table-wrap">
            <table className="mjl-table">
              <thead>
                <tr><th>What</th><th>How long</th><th>Why</th></tr>
              </thead>
              <tbody>
                {ROWS.map(([what, how, why]) => (
                  <tr key={what}>
                    <td>{what}</td>
                    <td>{how}</td>
                    <td>{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mjl-section">
          <h2>2. Face data gets the shortest life on purpose</h2>
          <p>
            Face matching works by storing a mathematical representation of a
            face, not a picture of it. That is still biometric data, so it is
            deleted the moment any one of three things happens: the gallery is
            deleted, the guest withdraws consent, or 90 days pass since the
            event. Withdrawal is immediate and self-service from the gallery
            page — it does not require emailing us.
          </p>
        </section>

        <section className="mjl-section">
          <h2>3. What we cannot delete on request</h2>
          <p>
            Order and payment records are kept for 8 years because Indian tax
            law requires it, and a deletion request cannot override a statutory
            obligation. If you ask us to delete your data we will delete
            everything else and tell you exactly what was retained and under
            which requirement.
          </p>
        </section>

        <section className="mjl-section">
          <h2>4. Asking for deletion</h2>
          <p>
            Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the
            address on the account. We will confirm within [X] working days and
            complete the deletion within [X] days. If you are a guest rather
            than a customer — someone whose photo or RSVP is on a wedding you
            did not buy — write to us anyway and we will route it to the studio
            that controls that invitation, and act ourselves if they do not.
          </p>
        </section>

        <section className="mjl-section">
          <h2>5. Backups</h2>
          <p>
            Encrypted backups are kept for [X] days on a rolling basis. Data you
            asked us to delete disappears from live systems immediately and ages
            out of backups within that window. We do not restore a backup to
            recover deleted personal data.
          </p>
        </section>

        <section className="mjl-section">
          <h2>6. A disclosure about older galleries</h2>
          <p>
            Photos uploaded before our 2026 storage migration were processed in
            a way that did not retain a recoverable original — only the
            display-sized versions survive. If you need the untouched original
            of a photo from that period, we may not be able to provide it, and
            we would rather say so here than at the moment you ask.
          </p>
        </section>

        <p className="mjl-foot-note">
          See also <Link to="/privacy" data-mj-link>Privacy</Link>,{' '}
          <Link to="/cookies" data-mj-link>Cookies</Link> and{' '}
          <Link to="/terms" data-mj-link>Terms</Link>.
        </p>
      </main>
    </div>
  );
}
