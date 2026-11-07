import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { DESIGNS, accessLabel } from './catalog';
import { demoPortfolio } from './fixture';
import PortfolioRenderer from './PortfolioRenderer';
import useSeo from '@/lib/useSeo';
import './workspace.css';

export default function DesignBoard() {
  useSeo({
    title: 'Portfolio Designs — Pixora',
    description: 'Explore 10 bespoke photography portfolio designs for wedding and editorial studios. Choose your composition, curate your work, and publish.',
  });

  const [query, setQuery] = useSearchParams();
  const [style, setStyle] = useState('All');
  const [tier, setTier] = useState('All');
  const [category, setCategory] = useState('All');

  const id = query.get('design');
  const variant = query.get('content') || 'rich';
  const isThumbnail = query.get('thumbnail') === '1';

  // Standalone thumbnail preview (inside iframe) - no navbars or outer controls
  if (isThumbnail) {
    return <PortfolioRenderer data={demoPortfolio(id, variant)} mode="sample" />;
  }

  // Full design showcase preview
  if (DESIGNS.some((d) => d.id === id)) {
    return (
      <div className="pfw-page">
        <MarketingNav />
        <div className="pfw-preview-bar">
          <div className="pfw-preview-left">
            <Link to="/" className="pfw-preview-logo" aria-label="Pixora Home">
              <span className="pfw-preview-monogram">p✦</span>
              <span className="pfw-preview-brand-name">pixora</span>
            </Link>
            <span className="pfw-preview-divider">/</span>
            <Link to="/portfolio-samples" className="pfw-preview-back">
              &larr; All ten designs
            </Link>
          </div>
          <label className="pfw-preview-content-select">
            <span>Content preview:</span>
            <select
              value={variant}
              onChange={(e) => setQuery({ design: id, content: e.target.value })}
            >
              {['rich', 'sparse', 'empty', 'long', 'commercial', 'portrait'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <PortfolioRenderer data={demoPortfolio(id, variant)} mode="sample" />
      </div>
    );
  }

  // Main portfolio catalogue board
  return (
    <div className="pfw-page">
      <MarketingNav />

      <main className="pfw-board">
        <div className="pfw-top-actions">
          <Link to="/" className="pfw-back-link" aria-label="Go back to Home page">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Home</span>
          </Link>
          <span className="pfw-kicker">MAJA Invites / Pixora &middot; Photographer websites</span>
        </div>

        <h1>
          Ten ways to
          <br />
          <em>frame your work.</em>
        </h1>
        <p className="pfw-lead">
          Distinct compositions, one shared studio. These are refined portfolio previews. Existing
          portfolios keep their current design until their owner previews and publishes an update.
        </p>

        <div className="pfw-filters">
          {[
            ['Style', style, setStyle, ['All', 'Cinematic', 'Editorial', 'Gallery', 'Minimal', 'Contemporary']],
            ['Design category', tier, setTier, ['All', 'free', 'basic', 'premium']],
            [
              'Suitable specialty',
              category,
              setCategory,
              ['All', 'Wedding', 'Portrait', 'Product', 'Fashion', 'Events', 'Travel', 'Maternity'],
            ],
          ].map(([label, value, set, options]) => (
            <label key={label}>
              {label}
              <select aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
                {options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="pfw-board-grid">
          {DESIGNS.filter(
            (d) =>
              (style === 'All' || d.style === style) &&
              (tier === 'All' || d.tier === tier) &&
              (category === 'All' || d.categories.includes(category) || d.categories === 'All specialties')
          ).map((d) => (
            <article key={d.id}>
              <div className="pfw-frame">
                <iframe
                  title={`${d.name} actual layout preview`}
                  tabIndex={-1}
                  loading="lazy"
                  src={`/portfolio-samples?design=${d.id}&thumbnail=1`}
                />
              </div>
              <h2>{d.name}</h2>
              <p>
                {d.style} &middot; {d.categories}
              </p>
              <small>{accessLabel(d.tier)}</small>
              <Link to={`?design=${d.id}`}>Explore design &nearr;</Link>
            </article>
          ))}
        </div>

        <p className="pfw-footnote">
          Specialty suggestions guide selection and never restrict access. Reference photographs do not
          represent the fictional studio&apos;s commissions. No reviews, team identities, prices or awards are
          invented.{' '}
          <a href="/portfolio-reference/credits.html">Photo credits</a>. &middot; <strong>Powered by metechq</strong>
        </p>
      </main>
    </div>
  );
}
