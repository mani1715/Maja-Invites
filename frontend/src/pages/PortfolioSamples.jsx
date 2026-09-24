// PortfolioSamples — the four portfolio tiers, each as a live demo.
//
// REPLACED the ten token-design samples that used to live here. Those linked to
// seeded /p/sample-<id> portfolios; these are the new tier demos from the Claude
// Design project, served as self-contained pages from public/portfolio-demos/.
//
// The ten token designs still exist and are still pickable inside the studio —
// only this showcase changed. What a photographer is choosing between here is a
// TIER, not a colour scheme, which is why the page now reads as an upgrade path
// (Basic → Premium → Advanced → Pro Plus) rather than a palette grid.
//
// Each demo opens in a new tab on purpose: they are full-page experiences with
// their own runtime, their own scroll behaviour and their own fixed navigation.
// Rendering one inside the SPA would fight the app's own chrome, and going
// "back" mid-demo would lose the visitor's place on this page.
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Sparkles } from 'lucide-react';
import PublicChrome from '@/components/PublicChrome';
import Seo from '@/components/Seo';
import { TIER_COMPARISON, TIER_DEMOS } from '@/data/portfolioTierDemos';
import '@/styles/luxury.css';

export default function PortfolioSamples() {
  return (
    <PublicChrome>
      <Seo
        title="Portfolio tiers — live demos | MAJA Invites"
        description="Four photographer portfolio tiers, each published as a real, working page. The same wedding, told four ways."
        canonical="/portfolio-samples"
      />
      <section className="px-6 md:px-16 py-16 max-w-[1400px] mx-auto">
        <span className="lux-eyebrow block mb-3">◆ Photographer portfolios</span>
        <h1 className="font-display text-3xl md:text-5xl mb-3" style={{ color: 'var(--lux-text)' }}>
          The same wedding, told four ways.
        </h1>
        <p className="text-sm md:text-base max-w-[680px] mb-3" style={{ color: 'var(--lux-text-muted)' }}>
          Every tier below is a real, working page. They use identical content —
          the same studio, the same photographs, the same enquiries. What changes
          is art direction, storytelling depth and how far the page will go to win
          the booking.
        </p>
        {/* Said once, plainly, before anyone reads a testimonial and believes it. */}
        <p className="text-xs mb-10" style={{ color: 'var(--lux-text-faint)' }}>
          Sample portfolios. The studio is fictional and the reviews, awards and
          contact details are demo content — only the design is real.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {TIER_DEMOS.map((t) => (
            <a
              key={t.id}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className="lux-glass overflow-hidden no-underline flex flex-col transition-transform hover:scale-[1.01]"
              data-testid={`tier-demo-${t.id}`}
            >
              {/* Miniature painted from the tier's own tokens — not a screenshot,
                  which would go stale the moment the design moves. */}
              <div className="h-44 relative" style={{ background: t.bg }}>
                <div className="absolute inset-0 p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="text-[10px] tracking-[0.3em] uppercase"
                      style={{ color: t.ink, opacity: 0.6 }}
                    >
                      {t.index} · {t.oneWord}
                    </span>
                    <span className="flex gap-1.5">
                      <span className="w-6 h-[3px]" style={{ background: t.ink, opacity: 0.35 }} />
                      <span className="w-6 h-[3px]" style={{ background: t.ink, opacity: 0.35 }} />
                      <span className="w-6 h-[3px]" style={{ background: t.accent }} />
                    </span>
                  </div>
                  <div>
                    <div
                      className="text-2xl md:text-3xl leading-none"
                      style={{ color: t.ink, fontFamily: t.heading }}
                    >
                      Aarav &amp; Riya
                    </div>
                    <div className="h-[2px] w-14 mt-3" style={{ background: t.accent }} />
                  </div>
                </div>
              </div>

              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>
                    {t.name}
                  </span>
                  <span
                    className="text-[9px] uppercase tracking-[0.18em]"
                    style={{ color: '#E8C97A' }}
                  >
                    {t.philosophy}
                  </span>
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--lux-text-muted)' }}>{t.line}</p>

                <ul className="flex flex-wrap gap-1.5 mb-4">
                  {t.highlights.map((h) => (
                    <li
                      key={h}
                      className="text-[10px] px-2 py-1 rounded-full"
                      style={{ background: 'rgba(212,175,55,0.10)', color: 'var(--lux-text-muted)' }}
                    >
                      {h}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex items-center justify-between gap-3 pt-3"
                  style={{ borderTop: '1px solid var(--lux-border)' }}>
                  <span className="text-[10px] uppercase tracking-[0.15em]"
                    style={{ color: 'var(--lux-text-faint)' }}>
                    Best for — {t.bestFor}
                  </span>
                  <span className="text-xs inline-flex items-center gap-1.5 shrink-0"
                    style={{ color: '#E8C97A' }}>
                    Open live <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>

        <a
          href={TIER_COMPARISON.href}
          target="_blank"
          rel="noopener noreferrer"
          className="lux-glass p-6 mt-5 flex flex-wrap items-center justify-between gap-4 no-underline transition-transform hover:scale-[1.005]"
          data-testid="tier-demo-compare"
        >
          <div>
            <div className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>
              {TIER_COMPARISON.title}
            </div>
            <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              {TIER_COMPARISON.line}
            </div>
          </div>
          <span className="text-xs inline-flex items-center gap-1.5 shrink-0" style={{ color: '#E8C97A' }}>
            Open comparison <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </a>

        <div className="lux-glass p-6 mt-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>
              Ready to build yours?
            </div>
            <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              Pick a tier and we'll set the portfolio up with your own work.
            </div>
          </div>
          <Link to="/studio/plans" className="lux-btn no-underline" data-testid="samples-see-plans">
            <Sparkles className="w-4 h-4" /> See plans
          </Link>
        </div>
      </section>
    </PublicChrome>
  );
}
