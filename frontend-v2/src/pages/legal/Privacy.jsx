// TEMPLATE - not legal advice. This page is drafted to align with India's
// Digital Personal Data Protection Act, 2023 (DPDP Act), but every
// [BRACKETED] placeholder and every clause must be reviewed and signed off
// by a qualified Indian data-protection lawyer before this page goes live.
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK, SUPPORT_EMAIL } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import './legal.css';

export default function Privacy() {
  // Without this the tab keeps whatever title the previous route set, and
  // a crawler landing here gets the app shell's default.
  useSeo({ title: 'Privacy Policy', description: 'What MAJA Invites collects, why, how long it is kept, and the rights you have over it under the DPDP Act.' });
  return (
    <div className="mjl-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora mjl-hero">
        <div className="mjl-hero-inner">
          <p className="mjl-eyebrow">Legal</p>
          <h1 className="mjl-h1">Privacy Policy</h1>
          <p className="mjl-updated">Last updated: 11 August 2026</p>
        </div>
      </header>

      <main id="main-content" className="mjl-body">
        <p className="mjl-intro">
          This Privacy Policy explains how [LEGAL ENTITY NAME, e.g. "MAJA
          Creations"] ("MAJA", "we", "us"), operating MAJA Invites,
          collects, uses, stores, and shares personal data, as a "Data
          Fiduciary" under India's Digital Personal Data Protection Act,
          2023 ("DPDP Act"). It applies to couples/buyers, their wedding
          guests, and photographers who use MAJA.
        </p>

        <section className="mjl-section">
          <h2>1. Data We Collect, by Role</h2>
          <p>
            We collect only what each role needs the service to work. We do
            not sell personal data, and we do not use it for third-party
            advertising.
          </p>
          <div className="mjl-table-wrap">
            <table className="mjl-table">
              <thead>
                <tr><th>Role</th><th>Data collected</th><th>Why</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Couple / buyer</td>
                  <td>Name, email, phone, wedding details, photos and wording for the invitation, payment reference (not card/UPI details - Razorpay holds those), Google sign-in profile if used</td>
                  <td>To build and deliver your invitation, process payment, and support your order</td>
                </tr>
                <tr>
                  <td>Guest</td>
                  <td>RSVP response, written wishes, photos they upload to the gallery, a selfie and derived facial data if they opt into face match, IP-hash-linked consent record</td>
                  <td>To run RSVP, wishes wall, gallery, check-in, and face-match features the couple has enabled</td>
                </tr>
                <tr>
                  <td>Photographer / studio</td>
                  <td>Name, contact details, portfolio images, studio profile</td>
                  <td>To list their work and deliver galleries to a couple's guests</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            We process personal data only for the purposes stated at
            collection, or purposes you would reasonably expect from those
            (purpose limitation) - not for unrelated uses.
          </p>
        </section>

        <section className="mjl-section">
          <h2>2. Face Match: Biometric Data</h2>
          <div className="mjl-callout">
            <p>
              A guest's face is biometric, sensitive personal data. We
              process it only after that guest gives their own explicit,
              in-product consent - never on the couple's behalf, and never
              silently.
            </p>
          </div>
          <p>
            When a guest opens the "find my photos" face-search feature on a
            gallery, they are first asked to explicitly agree to face
            matching for that gallery. That consent is recorded before we
            process anything, is valid for 90 days, and is checked before
            every selfie upload is processed - a guest who has not
            consented, or who has withdrawn consent, is blocked from the
            feature (our backend enforces this as a hard "consent required"
            gate, not a UI-only prompt).
          </p>
          <p>
            Face matching is powered by Amazon Rekognition, running in AWS's
            ap-south-1 (Mumbai) region. When a guest opts in, we compare
            their selfie against face data indexed from gallery photos for
            that event only. We do not run face recognition across
            different weddings or outside a gallery a guest has explicitly
            opted into.
          </p>
          <p>
            <strong>Withdrawal and deletion.</strong> A guest can withdraw
            face-match consent at any time from within the gallery. On
            withdrawal, or on request to{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, we
            delete that guest's uploaded selfie and stop using their face
            data for future matches. All face data (selfies and derived
            face vectors) is also deleted automatically when the event's
            invitation link expires and its storage is cleaned up, whichever
            comes first.
          </p>
        </section>

        <section className="mjl-section">
          <h2>3. Third Parties We Work With</h2>
          <p>
            We share the minimum data needed with the following processors,
            each bound to use it only to provide their service to us:
          </p>
          <div className="mjl-table-wrap">
            <table className="mjl-table">
              <thead>
                <tr><th>Third party</th><th>What they process</th><th>Purpose</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Razorpay</td>
                  <td>Payment details, transaction amount and reference</td>
                  <td>Processing checkout payments and digital shagun transfers</td>
                </tr>
                <tr>
                  <td>Amazon Web Services (S3, CloudFront, Rekognition)</td>
                  <td>Uploaded photos, selfies, derived face vectors</td>
                  <td>Hosting invitation media and running face match, in ap-south-1 (Mumbai)</td>
                </tr>
                <tr>
                  <td>Google Sign-In</td>
                  <td>Name, email, profile photo from your Google account</td>
                  <td>Optional sign-in for couple/buyer accounts</td>
                </tr>
                <tr>
                  <td>WhatsApp</td>
                  <td>Phone number, message content</td>
                  <td>Delivering the invitation link and order/event notifications, where used</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            We may also share data where required by law, or with a
            successor entity in the event of a merger or acquisition, under
            the same confidentiality commitments in this policy.
          </p>
        </section>

        <section className="mjl-section">
          <h2>4. Cookies</h2>
          <p>
            MAJA uses only session/authentication cookies needed to keep you
            signed in and to protect the service from abuse. We do not use
            third-party advertising cookies or ad-tracking pixels.
          </p>
        </section>

        <section className="mjl-section">
          <h2>5. How Long We Keep Data</h2>
          <p>
            Guest data (RSVPs, wishes, gallery photos, face data) is
            retained for the duration of the invitation link you purchased,
            plus a short operational buffer, after which it is deleted or
            anonymised as part of routine cleanup. Couple/buyer account and
            order data is retained for as long as your account is active
            and as needed to meet our tax, accounting, and dispute-handling
            obligations under Indian law.
          </p>
        </section>

        <section className="mjl-section">
          <h2>6. Your Rights as a Data Principal</h2>
          <p>Under the DPDP Act, you have the right to:</p>
          <ul>
            <li>Access a summary of the personal data we hold about you and how it is processed;</li>
            <li>Correct or update inaccurate or incomplete personal data;</li>
            <li>Request erasure of your personal data, subject to our legal retention obligations;</li>
            <li>Withdraw consent (for example, face-match consent) at any time, without affecting processing already carried out before withdrawal; and</li>
            <li>Nominate another individual to exercise these rights on your behalf in the event of death or incapacity.</li>
          </ul>
          <p>
            To exercise any of these rights, write to our grievance officer
            below or to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            We will respond within 30 days.
          </p>
        </section>

        <section className="mjl-section">
          <h2>7. Grievance Officer</h2>
          <div className="mjl-callout">
            <p style={{ margin: 0 }}>
              [GRIEVANCE OFFICER NAME]<br />
              MAJA Invites, [LEGAL ENTITY NAME]<br />
              [REGISTERED ADDRESS]<br />
              Email: [GRIEVANCE OFFICER EMAIL]<br />
              We will acknowledge and respond to grievances within 30 days.
            </p>
          </div>
        </section>

        <section className="mjl-section">
          <h2>8. Data Breach Notification</h2>
          <p>
            If a personal data breach occurs, we will take immediate steps
            to contain it, assess the affected data, and notify the Data
            Protection Board of India and affected data principals as
            required under the DPDP Act and applicable CERT-In rules,
            without undue delay.
          </p>
        </section>

        <section className="mjl-section">
          <h2>9. Children</h2>
          <p>
            MAJA is intended for adults. A couple/buyer account may only be
            created by someone 18 years of age or older. Guests of any age
            may be invited to an event and may appear in gallery photos at
            the couple's discretion; a parent or guardian should supervise
            any RSVP, upload, or face-match consent given on behalf of a
            minor guest.
          </p>
        </section>

        <section className="mjl-section">
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will
            post the updated policy here with a new "Last updated" date,
            and for material changes affecting how biometric or guest data
            is handled, we will make reasonable efforts to notify affected
            users directly.
          </p>
        </section>

        <p className="mjl-intro">
          Questions about this policy? Write to us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or visit our{' '}
          <Link to="/contact">Contact page</Link>.
        </p>
      </main>

      <footer className="mjl-footer">
        <div className="mjl-footer-links">
          <Link to={LINK.terms}>Terms of Service</Link>
          <Link to={LINK.refund}>Refund Policy</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <p>&copy; 2026 MAJA Creations</p>
      </footer>
    </div>
  );
}
