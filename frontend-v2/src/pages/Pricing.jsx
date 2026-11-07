import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import * as pp from '@/api/publicPricing';
import { LINK } from '@/lib/marketingLinks';
import { writePricingSelection, COMPONENT_LABELS } from '@/lib/pricingSelection';
import './Pricing.css';
import useSeo from '@/lib/useSeo';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Fallback tier data so pricing is immediately visible without waiting or failing
const DEFAULT_PORTFOLIO_PLANS = [
  {
    plan_id: 'plan_portfolio_free',
    tier: 'Free',
    name: 'Free',
    storage_label: 'Free',
    popular: false,
    monthly: 0,
    yearly_effective: 0,
    features: ['Studio Profile Listing', 'Basic Portfolio Website', 'Pixora Community Access', 'Follow Other Creators', 'Basic Analytics'],
  },
  {
    plan_id: 'plan_portfolio_basic',
    tier: 'Basic',
    name: 'Basic',
    storage_label: '512 MB',
    popular: false,
    monthly: 499,
    yearly_effective: 416,
    yearly_total: 4999,
    features: ['1 Portfolio Design', 'Client Photo Galleries', 'WhatsApp & Social Integration', 'Client Inquiry Inbox', 'Standard Studio Panel'],
  },
  {
    plan_id: 'plan_portfolio_pro',
    tier: 'Pro',
    name: 'Pro',
    storage_label: '2 GB',
    popular: false,
    monthly: 899,
    yearly_effective: 758,
    yearly_total: 9099,
    features: ['All 10 Portfolio Designs', '2 GB Cloud Storage', 'Client Booking & Calendar', 'SEO & Advanced Analytics', 'Testimonials & Rate Cards'],
  },
  {
    plan_id: 'plan_portfolio_advanced',
    tier: 'Advanced',
    name: 'Advanced',
    storage_label: '10 GB',
    popular: true,
    monthly: 1399,
    yearly_effective: 1183,
    yearly_total: 14199,
    features: ['Everything in Pro', '10 GB Cloud Storage', '3D Animations & Premium Themes', 'Multi-Event Client Portals', 'Priority Studio Support'],
  },
  {
    plan_id: 'plan_portfolio_premium',
    tier: 'Premium',
    name: 'Premium',
    storage_label: '20 GB',
    popular: false,
    monthly: 1999,
    yearly_effective: 1699,
    yearly_total: 20399,
    features: ['Full Studio Operating Suite', '20 GB High-Speed Storage', 'Custom Domain Configuration', 'Dedicated Setup Concierge', 'VIP Partner Opportunities'],
  },
];

const DEFAULT_INVITATIONS = [
  {
    key: 'basic',
    name: 'Basic Suite',
    components: { digital: 5000, video: 2000, physical: 2000 },
    blurb: 'Essential digital wedding suite with RSVP tracking and directions.',
  },
  {
    key: 'premium',
    name: 'Premium Suite',
    components: { digital: 8000, video: 4000, physical: 4000 },
    blurb: 'Rich animated invitation with video teaser, music and guest registry.',
    popular: true,
  },
  {
    key: 'custom',
    name: 'Custom Luxury Suite',
    components: { digital: 10000, video: 5000, physical: 5000 },
    blurb: 'Bespoke hand-crafted multi-event celebration suite with foil print.',
  },
];

export default function Pricing() {
  useSeo({
    title: 'Pricing & Plans — Pixora & MAJA Invites',
    description: 'Transparent pricing for photographer studios, portfolios, cloud storage, AI face match, and bespoke wedding invitations in INR. No hidden fees.',
  });

  const navigate = useNavigate();
  const [tab, setTab] = useState('studio'); // 'studio' | 'invitations'
  const [cycle, setCycle] = useState('12'); // '1' (monthly) | '12' (yearly)
  const [portfolioData, setPortfolioData] = useState(null);
  const [invites, setInvites] = useState({ status: 'ready', data: { tiers: DEFAULT_INVITATIONS } });

  // Load live portfolio plans
  useEffect(() => {
    pp.portfolioPlans()
      .then(({ data }) => setPortfolioData(data))
      .catch(() => {});
  }, []);

  // Load live invitation plans
  const loadInvites = useCallback(() => {
    pp.invitationPlans()
      .then(({ data }) => {
        if (data?.tiers?.length) {
          setInvites({ status: 'ready', data });
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => { loadInvites(); }, [loadInvites]);

  const chooseInvitation = (tier, componentKeys) => {
    writePricingSelection({ type: 'invitation_suite', invitation_tier: tier.key, components: componentKeys });
    let signedIn = false;
    try { signedIn = !!localStorage.getItem('admin_token'); } catch (_e) { /* private */ }
    navigate(signedIn ? '/studio/order/invitation-suite' : '/signin');
  };

  const handleStudioPlan = (planId) => {
    let signedIn = false;
    try { signedIn = !!localStorage.getItem('admin_token'); } catch (_e) { /* private */ }
    navigate(signedIn ? `/studio/plans?select=${planId}` : `/signup?plan=${planId}`);
  };

  return (
    <div className="mjp-page">
      <MarketingNav />

      {/* Hero Header */}
      <header className="px-aurora mjp-hero">
        <span aria-hidden="true" className="px-petal" style={{ left: '8%', animationDelay: '-2s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '26%', width: 10, height: 14, opacity: 0.4, animationDuration: '18s', animationDelay: '-9s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '63%', width: 14, height: 18, opacity: 0.5, animationDuration: '12s', animationDelay: '-5s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '89%', animationDuration: '16s', animationDelay: '-11s' }} />
        <div className="mjp-hero-inner">
          <p className="mjp-eyebrow">PLANS &amp; PRICING</p>
          <h1 className="mjp-h1">
            Priced for how far <span className="mjp-accent">you want to take it.</span>
          </h1>
          <p className="mjp-sub">
            Clear, honest pricing in INR. All studio portfolio plans and bespoke digital invitations include full support &mdash; no credits, no surprise fees.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="mjp-tabs-row">
          <div className="mjp-tabs">
            <button
              type="button"
              className={tab === 'studio' ? 'is-on' : ''}
              onClick={() => setTab('studio')}
            >
              Studio &amp; Portfolio Plans
            </button>
            <button
              type="button"
              className={tab === 'invitations' ? 'is-on' : ''}
              onClick={() => setTab('invitations')}
            >
              Wedding Invitation Suites
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mjp-body">
        {/* =====================================================================
            TAB 1: STUDIO & PORTFOLIO PLANS
            ===================================================================== */}
        {tab === 'studio' && (
          <section id="studio-plans">
            {/* Billing Cycle Toggle */}
            <div className="mjp-cycle-toggle">
              <span className={cycle === '1' ? 'is-active' : ''}>Monthly billing</span>
              <button
                type="button"
                className="mjp-toggle-switch"
                role="switch"
                aria-checked={cycle === '12'}
                onClick={() => setCycle(cycle === '1' ? '12' : '1')}
                aria-label="Toggle annual billing discount"
              >
                <span className="mjp-toggle-handle" />
              </button>
              <span className={cycle === '12' ? 'is-active' : ''}>
                Yearly billing <span className="mjp-discount-pill">Save 15%</span>
              </span>
            </div>

            {/* Plans Grid */}
            <div className="mjp-plans-grid">
              {DEFAULT_PORTFOLIO_PLANS.map((plan) => {
                // Find matching live plan if available
                const live = portfolioData?.plans?.find((p) => p.plan_id === plan.plan_id);
                const isFree = plan.monthly === 0;
                const monthlyPrice = live?.cycles?.['1']?.effective_price ?? plan.monthly;
                const yearlyEffective = live?.cycles?.['12']?.effective_monthly_inr ?? plan.yearly_effective;
                const yearlyTotal = live?.cycles?.['12']?.final_inr ?? plan.yearly_total;
                const displayPrice = isFree ? 0 : cycle === '12' ? yearlyEffective : monthlyPrice;

                return (
                  <div
                    key={plan.plan_id}
                    className={`mjp-plan-card ${plan.popular ? 'is-popular' : ''}`}
                  >
                    {plan.popular && <span className="mjp-plan-badge">MOST POPULAR</span>}

                    <div className="mjp-plan-header">
                      <h2 className="mjp-plan-name">{plan.name}</h2>
                      <p className="mjp-plan-storage">Storage: {plan.storage_label}</p>
                    </div>

                    <div className="mjp-plan-price-block">
                      <div className="mjp-plan-price">
                        {isFree ? (
                          <span className="mjp-amount">Free</span>
                        ) : (
                          <>
                            <span className="mjp-currency">₹</span>
                            <span className="mjp-amount">{displayPrice.toLocaleString('en-IN')}</span>
                            <span className="mjp-period">/ mo</span>
                          </>
                        )}
                      </div>
                      {!isFree && (
                        <p className="mjp-plan-billing-note">
                          {cycle === '12'
                            ? `Billed annually (₹${yearlyTotal.toLocaleString('en-IN')} / yr)`
                            : 'Billed monthly, cancel anytime'}
                        </p>
                      )}
                    </div>

                    <ul className="mjp-plan-features">
                      {plan.features.map((feat) => (
                        <li key={feat}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      className={`mjp-plan-cta ${plan.popular ? 'mjp-cta-primary' : 'mjp-cta-outline'}`}
                      onClick={() => handleStudioPlan(plan.plan_id)}
                    >
                      {isFree ? 'Get Started Free' : `Choose ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Storage & Face Match Add-ons */}
            <div className="mjp-addons-section">
              <div className="mjp-addons-head">
                <p className="mjp-eyebrow">STUDIO ADD-ONS</p>
                <h3 className="mjp-section-h2">Expandable storage &amp; AI face match</h3>
                <p className="mjp-section-sub">
                  Need extra capacity for high-volume seasons? Add high-speed storage packs or guest face-match QR tokens anytime.
                </p>
              </div>

              <div className="mjp-addons-row">
                <div className="mjp-addon-box">
                  <h4>Cloud Storage Packs</h4>
                  <ul>
                    <li><span>50 GB Cloud Storage</span><strong>+₹199 / mo</strong></li>
                    <li><span>100 GB Cloud Storage</span><strong>+₹349 / mo</strong></li>
                    <li><span>250 GB Cloud Storage</span><strong>+₹799 / mo</strong></li>
                    <li><span>500 GB Cloud Storage</span><strong>+₹1,499 / mo</strong></li>
                    <li><span>1 TB Cloud Storage</span><strong>+₹2,799 / mo</strong></li>
                  </ul>
                </div>
                <div className="mjp-addon-box">
                  <h4>Wave Face Match AI</h4>
                  <ul>
                    <li><span>500 Photo QR Scan Pack</span><strong>₹499 one-time</strong></li>
                    <li><span>2,000 Photo QR Scan Pack</span><strong>₹1,499 one-time</strong></li>
                    <li><span>5,000 Photo QR Scan Pack</span><strong>₹2,999 one-time</strong></li>
                    <li><span>Unlimited Enterprise Events</span><strong>Custom Quote</strong></li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================================
            TAB 2: WEDDING INVITATION SUITES
            ===================================================================== */}
        {tab === 'invitations' && (
          <section id="invitations-section">
            <div className="mjp-invites-intro">
              <h2 className="mjp-section-h2">Done-for-you celebration suites</h2>
              <p className="mjp-section-sub">
                Select a tier, customize your pieces, and calculate your exact investment in INR. No hidden production costs, no GST on top.
              </p>
            </div>

            <div className="mjp-grid">
              {(invites.data?.tiers || DEFAULT_INVITATIONS).map((tier) => (
                <InvitationTierCard key={tier.key} tier={tier} onContinue={chooseInvitation} />
              ))}
            </div>

            <div className="mjp-invites-footer">
              <p>
                Looking for a custom royal invitation theme?{' '}
                <Link to="/browse" className="mjp-link">Browse 180+ wedding invitation themes &rarr;</Link>
              </p>
            </div>
          </section>
        )}

        {/* Guarantees & FAQ */}
        <section className="mjp-guarantee">
          <div className="mjp-guarantee-card">
            <div className="mjp-guarantee-item">
              <span className="mjp-g-icon">✦</span>
              <div>
                <h4>100% Transparent Pricing</h4>
                <p>Every rupee is accounted for. No hidden convenience fees or checkout surprises.</p>
              </div>
            </div>
            <div className="mjp-guarantee-item">
              <span className="mjp-g-icon">⚡</span>
              <div>
                <h4>Instant Activation</h4>
                <p>Your studio workspace and portfolio templates are provisioned within seconds of sign up.</p>
              </div>
            </div>
            <div className="mjp-guarantee-item">
              <span className="mjp-g-icon">↺</span>
              <div>
                <h4>Change or Cancel Anytime</h4>
                <p>Switch between monthly and yearly cycles or cancel whenever you choose without penalty.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mjp-footer">
        <div className="mjp-footer-inner">
          <p>&copy; {new Date().getFullYear()} Pixora by MAJA Invites &middot; Powered by metechq</p>
          <div className="mjp-footer-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/refund">Refund Policy</Link>
            <Link to="/contact">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function InvitationTierCard({ tier, onContinue }) {
  const keys = Object.keys(COMPONENT_LABELS).filter((k) => tier.components?.[k] != null);
  const [checked, setChecked] = useState(() => new Set(keys));
  const toggle = (k) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const total = keys.reduce((sum, k) => sum + (checked.has(k) ? Number(tier.components[k] || 0) : 0), 0);

  return (
    <div className={`mjp-card ${tier.popular ? 'is-featured' : ''}`}>
      {tier.popular && <span className="mjp-badge">POPULAR</span>}
      <p className="mjp-card-eyebrow">{tier.name || tier.key}</p>
      {tier.blurb && <p className="mjp-card-desc">{tier.blurb}</p>}

      <div className="mjp-invite-rows">
        {keys.map((k) => (
          <label key={k} className="mjp-invite-row">
            <span className="mjp-invite-row-check">
              <input type="checkbox" checked={checked.has(k)} onChange={() => toggle(k)} />
              {COMPONENT_LABELS[k]}
            </span>
            <span className="mjp-invite-row-price">{inr(tier.components[k])}</span>
          </label>
        ))}
      </div>

      <div className="mjp-invite-total">
        <span>Calculated Total</span>
        <strong>{inr(total)}</strong>
      </div>

      <button
        type="button"
        className="mjp-card-cta"
        disabled={total <= 0}
        onClick={() => onContinue(tier, [...checked])}
      >
        Order Invitation Suite &rarr;
      </button>
    </div>
  );
}
