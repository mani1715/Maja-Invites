// PortfolioDesignsShowcase — the four portfolio tiers, on the home page.
//
// WHY IT EXISTS
// The tiers were only reachable from the "Portfolio Designs" nav link — one word
// among six — so showing them in a live demo depended on the presenter
// remembering it was there. This puts them where the pitch happens.
//
// It shows the same four tiers as /portfolio-samples, from the same source
// (portfolioTierDemos.js). That matters: a home page advertising ten designs and
// a samples page showing four reads as a broken site to the person being demoed
// to, and there is no worse moment to notice it.
//
// Each miniature is painted from the tier's own tokens, never a screenshot —
// screenshots go stale silently the moment a design changes.
import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { TIER_COMPARISON, TIER_DEMOS } from '@/data/portfolioTierDemos';

export default function PortfolioDesignsShowcase() {
  return (
    <section
      id="portfolio-designs"
      className="relative px-6 md:px-16 py-24 z-10"
      data-testid="landing-portfolio-designs"
    >
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
          <div>
            <span className="lux-eyebrow block mb-3">◆ For photographers</span>
            <h2
              className="font-display text-3xl md:text-5xl mb-3"
              style={{ color: 'var(--lux-text)' }}
            >
              Four portfolio tiers. All of them live.
            </h2>
            <p
              className="text-sm md:text-base max-w-[640px]"
              style={{ color: 'var(--lux-text-muted)' }}
            >
              The same wedding, told four ways — identical content, four levels of
              art direction. Open one and you are looking at a real, working page.
            </p>
          </div>
          <Link
            to="/portfolio-samples"
            className="lux-btn no-underline shrink-0"
            data-testid="landing-see-all-designs"
          >
            See all tiers
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {TIER_DEMOS.map((t) => (
            <a
              key={t.id}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className="lux-glass overflow-hidden no-underline flex flex-col transition-transform hover:scale-[1.02]"
              data-testid={`landing-tier-${t.id}`}
            >
              <div className="h-32 relative" style={{ background: t.bg }}>
                <div className="absolute inset-0 p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[8px] tracking-[0.3em] uppercase"
                      style={{ color: t.ink, opacity: 0.6 }}
                    >
                      {t.index}
                    </span>
                    <span className="flex gap-1">
                      <span className="w-4 h-[2px]" style={{ background: t.ink, opacity: 0.3 }} />
                      <span className="w-4 h-[2px]" style={{ background: t.accent }} />
                    </span>
                  </div>
                  <div>
                    <div
                      className="text-lg leading-none"
                      style={{ color: t.ink, fontFamily: t.heading }}
                    >
                      Aarav &amp; Riya
                    </div>
                    <div className="h-[2px] w-9 mt-2" style={{ background: t.accent }} />
                  </div>
                </div>
              </div>

              <div className="p-3.5 flex flex-col flex-1">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-display text-base" style={{ color: 'var(--lux-text)' }}>
                    {t.name}
                  </span>
                  <span
                    className="text-[8px] uppercase tracking-[0.18em] shrink-0"
                    style={{ color: 'var(--lux-text-faint)' }}
                  >
                    {t.oneWord}
                  </span>
                </div>
                <p className="text-[11px] mb-3 flex-1" style={{ color: 'var(--lux-text-muted)' }}>
                  {t.line}
                </p>
                <span
                  className="mt-auto text-[10px] inline-flex items-center gap-1"
                  style={{ color: '#E8C97A' }}
                >
                  Open live <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </div>
            </a>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
          <p className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>
            Sample portfolios — the studio, reviews and awards are demo content.
            Only the design is real.
          </p>
          <a
            href={TIER_COMPARISON.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs inline-flex items-center gap-1.5 no-underline"
            style={{ color: '#E8C97A' }}
            data-testid="landing-tier-compare"
          >
            Compare all four <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </section>
  );
}
