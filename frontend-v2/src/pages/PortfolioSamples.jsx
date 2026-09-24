import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { LINK } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import { PORTFOLIO_DESIGNS } from '@/lib/portfolioDesigns';
import './PortfolioSamples.css';

/**
 * The ten portfolio designs, in public, before anyone pays.
 *
 * WHAT WAS HERE. `/portfolio-samples` was `<Navigate to="/photographers" />` —
 * it sent a photographer researching which plan to buy to the directory of
 * other photographers. The designs themselves were visible only from inside
 * `/studio/portfolio`, which needs an account, which needs a plan. So the one
 * question a buyer has before subscribing — "what will my site actually look
 * like?" — could only be answered after subscribing.
 *
 * WHAT THESE CARDS ARE. Each design is a self-contained visual DIRECTION:
 * an exact palette, a display and body face, and a ground the photographs sit
 * on (see the header of lib/portfolioDesigns.js, which is where every token
 * below is read from — nothing here is a second copy). So each card is
 * rendered IN its own design rather than described in prose: real background,
 * real surface, real accent, real type. That is the honest form of this
 * preview, and it is why the tiles carry no stand-in photographs — inventing
 * someone's photography to sell a palette would be showing work that does not
 * exist. The tiles are the ground; your pictures go on it.
 */

const TIERS = [
  { key: 'all', label: 'All ten' },
  { key: 'free', label: 'Free' },
  { key: 'basic', label: 'Basic' },
  { key: 'premium', label: 'Premium' },
];

const TIER_NOTE = {
  free: 'Included on every studio account, free ones too.',
  basic: 'Unlocked by the Basic plan and everything above it.',
  premium: 'Unlocked by the Premium plan and everything above it.',
};

// How many designs each tier ITSELF adds. Not TIER_UNLOCKS — that maps a plan
// to the tiers it can reach ({basic: ['free','basic']}), so reading its length
// would have printed "2 designs at this tier" for the three Basic ones.
const COUNT_BY_TIER = PORTFOLIO_DESIGNS.reduce((acc, d) => {
  acc[d.tier] = (acc[d.tier] || 0) + 1;
  return acc;
}, {});

/** A miniature of the design, painted in the design's own tokens. */
function DesignCard({ d }) {
  const siblings = COUNT_BY_TIER[d.tier] || 0;
  return (
    <article className="pfs-card" style={{ '--d-line': d.line }}>
      <div
        className={`pfs-stage ${d.dark ? 'is-dark' : ''}`}
        style={{ background: d.bg, color: d.ink, fontFamily: d.body }}
      >
        <p className="pfs-stage-name" style={{ fontFamily: d.heading, color: d.ink }}>
          Your Studio
        </p>
        <p className="pfs-stage-sub" style={{ color: d.inkSoft }}>
          Wedding photography &middot; Hyderabad
        </p>
        <span className="pfs-stage-rule" style={{ background: d.accent }} />
        {/* Decorative ground only — deliberately not photographs. */}
        <div className="pfs-stage-grid" aria-hidden="true">
          <span style={{ background: d.surface, borderColor: d.line }} />
          <span style={{ background: d.surface, borderColor: d.line }} />
          <span style={{ background: d.surface, borderColor: d.line }} />
        </div>
        <span
          className="pfs-stage-chip"
          style={{ background: d.accent, color: d.accentInk, fontFamily: d.body }}
        >
          Enquire
        </span>
      </div>

      <div className="pfs-meta">
        <div className="pfs-meta-head">
          <h3 className="pfs-name">{d.name}</h3>
          <span className={`pfs-tier pfs-tier--${d.tier}`}>{d.tier}</span>
        </div>
        <p className="pfs-vibe">{d.vibe}</p>
        <p className="pfs-note">
          {TIER_NOTE[d.tier]}
          {siblings > 1 && ` ${siblings} designs at this tier.`}
        </p>
        <dl className="pfs-tokens">
          <div>
            <dt>Palette</dt>
            <dd>
              <span className="pfs-swatches" aria-hidden="true">
                {[d.bg, d.surface, d.accent, d.ink].map((hex, i) => (
                  <span key={i} style={{ background: hex }} />
                ))}
              </span>
            </dd>
          </div>
          {d.depth && <div><dt>Motion</dt><dd>3D scroll depth</dd></div>}
          {d.signature && d.signature !== 'none' && (
            <div><dt>Ground</dt><dd>{d.signature.replace(/_/g, ' ')}</dd></div>
          )}
        </dl>
      </div>
    </article>
  );
}

export default function PortfolioSamples() {
  useSeo({
    title: 'Portfolio designs for photographers',
    description: 'The ten portfolio designs a MAJA studio site can use — palette, typography and ground for each, and which plan unlocks it. Look before you subscribe.',
  });
  const [tier, setTier] = useState('all');

  const shown = useMemo(
    () => (tier === 'all' ? PORTFOLIO_DESIGNS : PORTFOLIO_DESIGNS.filter((d) => d.tier === tier)),
    [tier],
  );

  return (
    <div className="pfs-page">
      <MarketingNav />

      <header className="px-aurora pfs-hero">
        <div className="pfs-hero-inner">
          <p className="pfs-eyebrow">Portfolio designs</p>
          <h1 className="pfs-h1">
            Ten directions for your site. <span className="pfs-accent">Look before you subscribe.</span>
          </h1>
          <p className="pfs-lead">
            Your MAJA portfolio is a fifteen-section site on your own link. These are the
            grounds it can sit on — each an exact palette, a type pairing and a surface
            treatment. Pick one at any time from your studio panel; changing it takes a click.
          </p>
        </div>
      </header>

      <div className="pfs-filters" role="tablist" aria-label="Plan tier">
        {TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tier === t.key}
            className={tier === t.key ? 'is-on' : ''}
            onClick={() => setTier(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main id="main-content" className="pfs-body">
        <div className="pfs-grid">
          {shown.map((d) => <DesignCard key={d.id} d={d} />)}
        </div>

        <p className="pfs-fineprint">
          The tiles inside each card are the design&rsquo;s own surfaces, not sample
          photographs — your pictures go there. Fonts fall back to the nearest system face
          on this page.
        </p>

        <section className="pfs-cta">
          <div>
            <h2>Which plan unlocks which?</h2>
            <p>Free gets one design, Basic adds three, Premium opens all ten.</p>
          </div>
          <div className="pfs-cta-actions">
            <Link to="/pricing" className="pfs-btn pfs-btn--primary">See studio plans</Link>
            <Link to={LINK.signUp} className="pfs-btn">Set up your studio</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
