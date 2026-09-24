import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import * as pp from '@/api/publicPricing';
import { LINK } from '@/lib/marketingLinks';
import { writePricingSelection, COMPONENT_LABELS } from '@/lib/pricingSelection';
import './Pricing.css';
import useSeo from '@/lib/useSeo';

// PUBLIC pricing = the individual/couple offering only: done-for-you
// invitations. Photographer-facing pricing (portfolio plan cycles, storage
// add-ons, face-match photo packs) is priced against a specific studio and now
// lives behind sign-in — /studio/plans, /studio/studio-storage and each
// event's gallery — so a visitor is never shown a yearly studio price out of
// the context that makes it mean anything.
//
// The invitation tiers keep the model from docs/PRICING_REDESIGN_2026.md: a
// tier plus independent components. The frontend never invents a price; it
// only sums the component figures the server sent (the one addition the plan
// explicitly allows), and the backend recomputes the total at order time.
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function Pricing() {
  useSeo({ title: 'Invitation pricing', description: 'Done-for-you wedding and celebration invitation pricing in INR — pick a tier, pick the pieces, see the exact total. No credits, no GST on top.' });
  const navigate = useNavigate();

  const [invites, setInvites] = useState({ status: 'loading', data: null });

  // Named + retryable so a failed fetch gets a "Try again" button instead of
  // a dead end — never fake a price when one can't be loaded.
  const loadInvites = useCallback(() => {
    setInvites({ status: 'loading', data: null });
    pp.invitationPlans()
      .then(({ data }) => setInvites({ status: 'ready', data }))
      .catch(() => setInvites({ status: 'error', data: null }));
  }, []);
  useEffect(() => { loadInvites(); }, [loadInvites]);

  // Ordering is photographer-only (store_features.py: every /api/store/order
  // route requires a studio Bearer JWT — couples never hold accounts). A
  // signed-in studio browsing pricing goes straight to the order page, which
  // re-reads this same stash; a signed-out visitor (maybe a studio who
  // hasn't logged in yet) goes to sign-in with the stash intact, and a
  // one-time banner on the studio dashboard offers to finish the order after
  // any successful auth (see StudioDashboard.jsx).
  const chooseInvitation = (tier, componentKeys) => {
    writePricingSelection({ type: 'invitation_suite', invitation_tier: tier.key, components: componentKeys });
    let signedIn = false;
    try { signedIn = !!localStorage.getItem('admin_token'); } catch (_e) { /* private mode */ }
    navigate(signedIn ? '/studio/order/invitation-suite' : '/auth');
  };

  return (
    <div className="mjp-page">
      <MarketingNav />

      <header className="px-aurora mjp-hero">
        <span aria-hidden="true" className="px-petal" style={{ left: '8%', animationDelay: '-2s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '26%', width: 10, height: 14, opacity: .4, animationDuration: '18s', animationDelay: '-9s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '63%', width: 14, height: 18, opacity: .5, animationDuration: '12s', animationDelay: '-5s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '89%', animationDuration: '16s', animationDelay: '-11s' }} />
        <div className="mjp-hero-inner">
          <p className="mjp-eyebrow">Plans &amp; pricing</p>
          <h1 className="mjp-h1">Priced for how far <span className="mjp-accent">you want to take it.</span></h1>
          <p className="mjp-sub">
            Done-for-you invitations, priced piece by piece in INR &mdash; no credits, no GST on top.
            Studio plans, storage and face-match packs are priced inside your studio panel.
          </p>
        </div>
      </header>

      {/* ---- Studio plans: signposted here, PRICED in the panel ---------
          Photographer-facing pricing (portfolio plans and their billing
          cycles, storage add-ons, face-match photo packs) lives behind sign-in
          on /studio/plans, /studio/studio-storage and each event's gallery.
          Those pages read the same canonical backend pricing this page used
          to render, so nothing was duplicated to make this move — the public
          page simply stopped being a second place the same numbers appear.
          This section is a pointer, not a price list. --------------------- */}
      <section className="mjp-body" id="portfolio">
        <h2 className="mjp-section-h2">For photographers</h2>
        <p className="mjp-section-sub">
          Your portfolio plan, storage and AI face-match packs are priced against your own
          studio &mdash; current plan, what you have used and what an upgrade costs, all in one
          place. Sign in to see yours.
        </p>
        <div className="mjp-grid">
          <div className="mjp-card">
            <p className="mjp-card-eyebrow">Studio portfolio</p>
            <p className="mjp-card-desc">
              One subscription runs your studio panel &mdash; portfolio site, client galleries
              and Pixora. Ten portfolio designs; your plan decides how many you can reach.
            </p>
            <Link to="/studio/plans" className="mjp-card-cta">See your plan</Link>
          </div>
          <div className="mjp-card">
            <p className="mjp-card-eyebrow">Storage</p>
            <p className="mjp-card-desc">
              What is included, what you have used and what is left &mdash; with the upgrade
              tiers available to your studio.
            </p>
            <Link to="/studio/studio-storage" className="mjp-card-cta">See your storage</Link>
          </div>
          <div className="mjp-card">
            <p className="mjp-card-eyebrow">Wave Face Match + QR</p>
            <p className="mjp-card-desc">
              Guests scan one QR and find their own face across every album. Photo packs are
              bought per event, and each event shows its allocated, used and remaining photos.
            </p>
            <Link to="/studio/dashboard" className="mjp-card-cta">See your events</Link>
          </div>
        </div>
        <p className="mjp-portfolio-link">
          Not signed up yet? <Link to="/portfolio-samples" data-mj-link>See the ten portfolio designs &rarr;</Link>
        </p>
      </section>

      {/* ---- Invitations ------------------------------------------------ */}
      <section className="mjp-body" id="invitations">
        <h2 className="mjp-section-h2">Invitation pricing</h2>
        <p className="mjp-section-sub">
          Pick a tier, then check the pieces you want. The total updates instantly and is
          exact — no GST on top, no rounding. Come through your photographer to order.
        </p>
        {invites.status === 'loading' && (
          <div className="mjp-skel-grid" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="mjp-skel-card" />)}
          </div>
        )}
        {invites.status === 'error' && (
          <p className="mjp-state mjp-state-error">
            Couldn&rsquo;t load pricing right now. <button type="button" className="mjp-card-alt" onClick={loadInvites}>Try again</button>
          </p>
        )}
        {invites.status === 'ready' && (
          <div data-mj-stagger className="mjp-grid">
            {(invites.data?.tiers || []).map((tier) => (
              <InvitationTierCard key={tier.key} tier={tier} onContinue={chooseInvitation} />
            ))}
          </div>
        )}
        <p className="mjp-sub" style={{ marginTop: 20 }}>
          Planning your wedding? These invitations come through our partner photographers &mdash; ask
          yours for MAJA Invites. <Link to="/photographers" data-mj-link>Find a photographer &rarr;</Link>
        </p>
      </section>

      <footer className="mjp-footer">
        <p>&copy; 2026 MAJA Invites</p>
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
  // The one place the frontend adds server-sent prices together — a pure sum
  // of the components the buyer checked, recomputed server-side at order time.
  const total = keys.reduce((sum, k) => sum + (checked.has(k) ? Number(tier.components[k] || 0) : 0), 0);

  return (
    <div className="mjp-card" data-reveal="blur">
      <p className="mjp-card-eyebrow">{tier.name || tier.key}</p>
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
        <span>Your total</span>
        <span>{inr(total)}</span>
      </div>
      <button type="button" className="mjp-card-cta" disabled={total <= 0} onClick={() => onContinue(tier, [...checked])}>
        Continue
      </button>
    </div>
  );
}
