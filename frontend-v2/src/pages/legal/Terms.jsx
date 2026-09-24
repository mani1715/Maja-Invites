// TEMPLATE - not legal advice. This page is drafted to be structurally
// complete and DPDP/Razorpay-aware, but every [BRACKETED] placeholder and
// every clause on it must be reviewed and signed off by a qualified Indian
// lawyer before this page goes live or is linked from checkout/KYC.
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK, SUPPORT_EMAIL } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import './legal.css';

export default function Terms() {
  // Without this the tab keeps whatever title the previous route set, and
  // a crawler landing here gets the app shell's default.
  useSeo({ title: 'Terms of Service', description: 'The terms that govern your use of MAJA Invites — orders, invitation links, refunds, liability and governing law.' });
  return (
    <div className="mjl-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora mjl-hero">
        <div className="mjl-hero-inner">
          <p className="mjl-eyebrow">Legal</p>
          <h1 className="mjl-h1">Terms of Service</h1>
          <p className="mjl-updated">Last updated: 11 August 2026</p>
        </div>
      </header>

      <main id="main-content" className="mjl-body">
        <p className="mjl-intro">
          These Terms of Service ("Terms") govern your use of MAJA Invites, a
          done-for-you digital wedding invitation service operated by
          [LEGAL ENTITY NAME, e.g. "MAJA Creations"], a sole proprietorship
          with its registered address at [REGISTERED ADDRESS], India
          ("MAJA", "we", "us"). By purchasing an invitation, creating an
          account, or accessing an invitation link, you agree to these Terms.
          If you do not agree, please do not use the service.
        </p>

        <section className="mjl-section">
          <h2>1. What MAJA Invites Is</h2>
          <p>
            MAJA is a done-for-you service: our team designs and builds a
            digital wedding invitation - a hosted, shareable web link - on
            your behalf, based on the details, photos, and preferences you
            provide at checkout. We do not sell a self-serve design tool;
            every order is built by a person on the MAJA team.
          </p>
          <p>
            Each invitation link is sold with a fixed validity duration
            (shown at checkout and on your order confirmation). After that
            duration expires, the link, and the guest data collected through
            it (RSVPs, wishes, uploaded photos, face-match data), may be
            taken down and deleted as described in our{' '}
            <Link to={LINK.privacy}>Privacy Policy</Link>.
          </p>
        </section>

        <section className="mjl-section">
          <h2>2. Accounts</h2>
          <p>MAJA recognises two kinds of accounts:</p>
          <ul>
            <li>
              <strong>Couple / buyer accounts</strong> - the person or people
              who purchase an invitation, provide the wedding details, and
              own the resulting invitation link.
            </li>
            <li>
              <strong>Studio / photographer accounts</strong> - independent
              photographers and studios who use MAJA to deliver photo
              galleries to a couple's guests, and who may list their work in
              a MAJA portfolio.
            </li>
          </ul>
          <p>
            You are responsible for keeping your account credentials
            confidential and for all activity under your account. You must
            provide accurate information at signup and keep your contact
            details current so we can reach you about your order.
          </p>
        </section>

        <section className="mjl-section">
          <h2>3. Acceptable Use</h2>
          <p>You agree not to use MAJA to:</p>
          <ul>
            <li>Upload content you do not have the right to share, including photos of guests who have not consented to appear in a wedding gallery;</li>
            <li>Upload unlawful, obscene, defamatory, or infringing content;</li>
            <li>Attempt to access another couple's or guest's data, gallery, or account;</li>
            <li>Scrape, reverse-engineer, or interfere with the service, including the face-match feature;</li>
            <li>Use the digital shagun or payment features for anything other than genuine wedding gifting; or</li>
            <li>Resell, sublicense, or white-label MAJA-built invitations without our written consent.</li>
          </ul>
        </section>

        <section className="mjl-section">
          <h2>4. Your Content and the Licence You Grant Us</h2>
          <p>
            "Your Content" means the photos, names, dates, wording, and any
            other material you or your guests provide for your invitation
            (including guest wishes and gallery uploads).
          </p>
          <p>
            You keep ownership of Your Content. You grant MAJA a
            non-exclusive, worldwide, royalty-free licence to host, store,
            reproduce, resize, and display Your Content solely to build,
            operate, and deliver your invitation and its guest-facing
            features (RSVP, wishes wall, photo gallery, face match, digital
            check-in), and for the duration your link is active plus any
            retention window described in our{' '}
            <Link to={LINK.privacy}>Privacy Policy</Link>.
          </p>
          <p>
            <strong>You warrant that:</strong> (a) you have the right to
            share every photo and detail you upload; and (b) where a photo
            or feature involves a named guest (for example, tagging a guest
            or enabling face-match on their photo), you have that guest's
            permission, or the feature is guest-facing and the guest gives
            their own consent directly in-product before it is used, as is
            the case for face match (see our{' '}
            <Link to={LINK.privacy}>Privacy Policy</Link> for how consent is
            collected and enforced).
          </p>
        </section>

        <section className="mjl-section">
          <h2>5. Guest-Facing Features</h2>
          <p>
            Your invitation link may offer guests the ability to RSVP, leave
            written wishes, upload photos to a live gallery, check in at the
            event via QR code, and find their own photos using selfie-based
            face match. These features are optional per invitation and are
            configured by the couple or by MAJA on the couple's behalf.
          </p>
          <p>
            Guests use these features under this same set of Terms and our{' '}
            <Link to={LINK.privacy}>Privacy Policy</Link>. Where a feature
            processes a guest's own facial data, we collect that guest's own
            explicit consent before any face-matching selfie is processed -
            see the Face Match section of our Privacy Policy.
          </p>
        </section>

        <section className="mjl-section">
          <h2>6. Payments</h2>
          <p>
            All payments on MAJA are processed by Razorpay, a licensed
            third-party payment gateway. MAJA does not store your card,
            UPI, or net-banking credentials - Razorpay handles that
            directly. By paying through Razorpay you also agree to
            Razorpay's own terms.
          </p>
          <p>
            Prices are shown in Indian Rupees (INR) and are inclusive of
            applicable taxes (GST) unless stated otherwise at checkout. We
            reserve the right to change prices for future orders; the price
            you paid for your order will not change once your order is
            confirmed.
          </p>
        </section>

        <section className="mjl-section">
          <h2>7. Delivery Timelines</h2>
          <p>
            Standard build and delivery timelines are shown at checkout and
            in your order confirmation (for example, "delivered within
            [X] business days" for standard orders, or a shorter window for
            rush orders). Timelines depend on how promptly you provide the
            details, photos, and approvals we need to build your
            invitation. Delays caused by late or incomplete information on
            your side are not treated as late delivery by MAJA.
          </p>
        </section>

        <section className="mjl-section">
          <h2>8. Intellectual Property</h2>
          <p>
            The MAJA name, logo, invitation templates, layouts, design
            system, and underlying software remain the property of MAJA and
            are protected by applicable intellectual property law. Nothing
            in these Terms transfers ownership of MAJA's designs, templates,
            or platform to you.
          </p>
          <p>
            Your personal content - your photos, names, wording, wishes, and
            uploaded guest photos - remains yours (or your guests', where
            applicable), subject to the licence you grant us in Section 4.
          </p>
        </section>

        <section className="mjl-section">
          <h2>9. Termination</h2>
          <p>
            You may stop using MAJA at any time. We may suspend or terminate
            your access if you breach these Terms, misuse guest data, use
            the service unlawfully, or where required by law or by a
            payment or hosting partner (Razorpay, AWS). We will make
            reasonable efforts to notify you before suspending an active,
            paid invitation link where practical.
          </p>
        </section>

        <section className="mjl-section">
          <h2>10. Liability</h2>
          <p>
            To the maximum extent permitted by Indian law, MAJA's total
            liability to you arising out of or relating to these Terms or
            your use of the service is limited to the amount you actually
            paid MAJA for the order giving rise to the claim. MAJA is not
            liable for indirect, incidental, or consequential loss,
            including loss of guest data caused by events outside our
            reasonable control.
          </p>
        </section>

        <section className="mjl-section">
          <h2>11. Governing Law and Jurisdiction</h2>
          <p>
            These Terms are governed by the laws of India. Any dispute
            arising out of or relating to these Terms will be subject to the
            exclusive jurisdiction of the courts of [CITY], India.
          </p>
        </section>

        <section className="mjl-section">
          <h2>12. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time, for example to
            reflect a new feature or a change in law. We will post the
            updated Terms here with a new "Last updated" date, and for
            material changes we will make reasonable efforts to notify
            active customers (for example by email). Continued use of MAJA
            after a change takes effect means you accept the updated Terms.
          </p>
        </section>

        <p className="mjl-intro">
          Questions about these Terms? Write to us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or visit our{' '}
          <Link to="/contact">Contact page</Link>.
        </p>
      </main>

      <footer className="mjl-footer">
        <div className="mjl-footer-links">
          <Link to={LINK.privacy}>Privacy Policy</Link>
          <Link to={LINK.refund}>Refund Policy</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <p>&copy; 2026 MAJA Creations</p>
      </footer>
    </div>
  );
}
