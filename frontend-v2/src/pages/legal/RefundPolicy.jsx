// TEMPLATE - not legal advice. This page is drafted to be Razorpay-KYC
// compatible (a clear, published refund policy is required for Razorpay
// onboarding) but every [BRACKETED] placeholder and clause must be reviewed
// and signed off by a qualified Indian lawyer before this page goes live.
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK, SUPPORT_EMAIL } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import './legal.css';

export default function RefundPolicy() {
  // Without this the tab keeps whatever title the previous route set, and
  // a crawler landing here gets the app shell's default.
  useSeo({ title: 'Refund Policy', description: 'When an invitation order can be cancelled or refunded, and how long a refund takes to reach you.' });
  return (
    <div className="mjl-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora mjl-hero">
        <div className="mjl-hero-inner">
          <p className="mjl-eyebrow">Legal</p>
          <h1 className="mjl-h1">Refund Policy</h1>
          <p className="mjl-updated">Last updated: 11 August 2026</p>
        </div>
      </header>

      <main id="main-content" className="mjl-body">
        <p className="mjl-intro">
          MAJA Invites is a digital, done-for-you service: once our team
          starts building your invitation, real design and development work
          is underway. This policy sets out when a refund applies, in plain
          terms, and works with our payment processor Razorpay's refund
          rules.
        </p>

        <section className="mjl-section">
          <h2>1. Overview</h2>
          <p>
            How much of a refund you are entitled to depends on how far your
            order has progressed at the time you cancel:
          </p>
          <ul>
            <li><strong>Before design work starts:</strong> full refund.</li>
            <li><strong>After work starts, before delivery:</strong> 50% refund.</li>
            <li><strong>After your invitation link is delivered:</strong> no refund, except for non-delivery or an uncorrected defect (Section 4).</li>
          </ul>
        </section>

        <section className="mjl-section">
          <h2>2. Cancel Before Design Work Starts - Full Refund</h2>
          <p>
            If you cancel your order before our team has begun designing or
            building your invitation, you are entitled to a full refund of
            the amount paid.
          </p>
        </section>

        <section className="mjl-section">
          <h2>3. Cancel After Work Starts, Before Delivery - 50% Refund</h2>
          <p>
            If you cancel after our team has started design or build work
            on your invitation, but before it is delivered to you, you are
            entitled to a 50% refund of the amount paid, reflecting the
            work already completed.
          </p>
        </section>

        <section className="mjl-section">
          <h2>4. After Delivery</h2>
          <p>
            Once your invitation link has been delivered, the order is
            considered complete and is not eligible for a refund, except in
            either of these cases:
          </p>
          <ul>
            <li><strong>Non-delivery</strong> - you were charged but never received a working invitation link.</li>
            <li><strong>An uncorrected defect</strong> - your invitation has a defect (for example, a broken link, missing content you supplied, or a feature that does not work as sold) that MAJA is unable to fix within 72 hours of you reporting it.</li>
          </ul>
          <p>
            In either case, you are entitled to a full refund of the amount
            paid.
          </p>
        </section>

        <section className="mjl-section">
          <h2>5. How Refunds Are Processed</h2>
          <p>
            Approved refunds are issued to your original payment method
            through Razorpay and typically arrive within 5-7 business days,
            depending on your bank or payment provider's own processing
            time.
          </p>
        </section>

        <section className="mjl-section">
          <h2>6. How to Request a Refund</h2>
          <p>
            Write to us at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or via
            our <Link to="/contact">Contact page</Link>, with your order ID
            and the reason for your request. We will confirm your refund
            eligibility under this policy and, where approved, process it
            promptly.
          </p>
        </section>

        <section className="mjl-section">
          <h2>7. Digital Shagun Transfers</h2>
          <p>
            Digital shagun (gift money) that guests send to a couple through
            MAJA is a guest-to-couple transfer processed via UPI/Razorpay.
            These transfers are out of scope of this refund policy - MAJA
            is a conduit for the payment, not a party to it, and any
            dispute over a shagun transfer should be resolved directly
            between the guest and the couple, or through Razorpay/UPI's own
            dispute process.
          </p>
        </section>

        <section className="mjl-section">
          <h2>8. Chargebacks</h2>
          <p>
            If you initiate a chargeback with your bank or card issuer
            instead of contacting us first, we reserve the right to suspend
            your invitation link while the chargeback is investigated, and
            to contest chargebacks that do not meet the conditions in this
            policy (for example, where the invitation was delivered and
            working as sold). We would always rather resolve a problem
            directly - please reach out to{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> first.
          </p>
        </section>
      </main>

      <footer className="mjl-footer">
        <div className="mjl-footer-links">
          <Link to={LINK.terms}>Terms of Service</Link>
          <Link to={LINK.privacy}>Privacy Policy</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <p>&copy; 2026 MAJA Creations</p>
      </footer>
    </div>
  );
}
