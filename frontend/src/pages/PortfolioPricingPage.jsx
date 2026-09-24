// PortfolioPricingPage — the public pricing page (/portfolio-plans) with two audiences.
//
//   For Photographers : founding-aware Portfolio plans + Storage add-ons.
//   For Couples       : one-time Invitation plans + Add-ons + individually-priced Designs.
//
// All money comes from /api/public/pricing/*. Honest throughout: a strike-through is
// only ever the real regular/original price, and a discount shows only when the buyer
// genuinely pays less. Reuses the one <PricingCard>.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, Sparkles, Timer, Camera, Heart, Eye, ShoppingBag } from 'lucide-react';
import PricingCard from '@/components/pricing/PricingCard';
import useSeo from '@/hooks/useSeo';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const PERIODS = [
  { key: 'm', label: 'Monthly',     p: '1',  s: '30' },
  { key: 'q', label: 'Quarterly',   p: '3',  s: '90' },
  { key: 'h', label: 'Half-Yearly', p: '6',  s: '180' },
  { key: 'y', label: 'Yearly',      p: '12', s: '365' },
];

function CycleToggle({ period, onChange }) {
  return (
    <div className="mx-auto mb-8 inline-flex flex-wrap justify-center gap-1 rounded-full p-1"
      style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }} data-testid="pricing-cycle-toggle">
      {PERIODS.map((p) => (
        <button key={p.key} onClick={() => onChange(p)}
          className="rounded-full px-4 py-2 text-[12px] font-medium uppercase tracking-[0.12em] transition-all"
          style={period.key === p.key ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#1A0F08' } : { color: 'var(--lux-text-muted)' }}
          data-testid={`cycle-${p.key}`}>
          {p.label}{p.key === 'y' && <span className="ml-1 text-[9px]" style={{ color: period.key === p.key ? '#1A0F08' : '#4ADE80' }}>SAVE MORE</span>}
        </button>
      ))}
    </div>
  );
}

function FoundingBanner({ founding }) {
  if (!founding || founding.mode !== 'founding') return null;
  return (
    <div className="mx-auto mb-6 flex max-w-xl items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-[13px]"
      style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(212,175,55,0.15))', border: '1px solid rgba(232,201,122,0.4)', color: '#F3E4B8' }} data-testid="founding-banner">
      <Timer className="h-4 w-4 shrink-0" style={{ color: '#E8C97A' }} />
      <span><b>Founding offer</b> — only <b>{founding.slots_left}</b> of {founding.limit} founding seats left. Lock your rate for life.</span>
    </div>
  );
}

function SectionHead({ eyebrow, title, subtitle }) {
  return (
    <div className="mb-8 text-center">
      {eyebrow && <span className="lux-eyebrow">◆ {eyebrow}</span>}
      <h2 className="font-display mt-1 text-3xl md:text-4xl" style={{ color: 'var(--lux-text)' }}>{title}</h2>
      {subtitle && <p className="mx-auto mt-2 max-w-2xl text-sm" style={{ color: 'var(--lux-text-muted)' }}>{subtitle}</p>}
    </div>
  );
}

function AddonCard({ a, onSelect }) {
  return (
    <div className="lux-glass flex flex-col justify-between p-4" data-testid={`addon-${a.key}`}>
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>{a.name}</div>
        {(a.features || []).length > 0 && (
          <div className="mt-1 text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>{a.features.join(' · ')}</div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="font-display text-lg" style={{ color: '#E8C97A' }}>{inr(a.price)}</span>
        <button onClick={() => onSelect(a)} className="lux-btn lux-btn-ghost !px-3 !py-1.5 text-[11px]">Add</button>
      </div>
    </div>
  );
}

function DesignCard({ d, onBuy, onPreview }) {
  return (
    <div className="lux-glass overflow-hidden" data-testid={`design-${d.design_id}`}>
      <div className="relative" style={{ aspectRatio: '3 / 4', background: 'var(--lux-panel)' }}>
        {d.thumbnail_url
          ? <img src={d.thumbnail_url} alt={d.name} loading="lazy" className="h-full w-full object-cover" />
          : <div className="grid h-full w-full place-items-center"><Sparkles className="h-6 w-6" style={{ color: 'rgba(212,175,55,0.5)' }} /></div>}
        {d.discount_pct > 0 && (
          <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: 'rgba(46,160,67,0.9)', color: '#fff' }}>{d.discount_pct}% OFF</span>
        )}
      </div>
      <div className="p-3">
        <div className="truncate text-sm" style={{ color: 'var(--lux-text)' }}>{d.name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          {d.strikethrough && <span className="text-[12px] line-through" style={{ color: 'var(--lux-text-faint)' }}>{inr(d.strikethrough)}</span>}
          <span className="font-display text-lg" style={{ color: '#E8C97A' }}>{inr(d.price)}</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          <button onClick={() => onBuy(d)} className="lux-btn flex-1 justify-center !px-2 !py-1.5 text-[11px]">
            <ShoppingBag className="h-3.5 w-3.5" /> Buy
          </button>
          <button onClick={() => onPreview(d)} className="lux-btn lux-btn-ghost !px-2 !py-1.5 text-[11px]">
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPricingPage() {
  useSeo({
    title: 'Pricing — Portfolio Plans, Wedding Invitations & Storage | MAJA',
    description: 'Founding-member pricing for photographer portfolios and storage, plus one-time wedding invitation plans and designs.',
    type: 'website',
  });
  const navigate = useNavigate();
  const [audience, setAudience] = useState('photographers');
  const [period, setPeriod] = useState(PERIODS[0]);
  const [portfolio, setPortfolio] = useState(null);
  const [storage, setStorage] = useState(null);
  const [invitations, setInvitations] = useState(null);
  const [designs, setDesigns] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      axios.get(`${API_URL}/api/public/pricing/portfolio`),
      axios.get(`${API_URL}/api/public/pricing/storage`),
      axios.get(`${API_URL}/api/public/pricing/invitations`),
      axios.get(`${API_URL}/api/public/pricing/designs`, { params: { limit: 24 } }),
    ]).then(([p, s, i, d]) => {
      if (!alive) return;
      setPortfolio(p.data); setStorage(s.data); setInvitations(i.data); setDesigns(d.data);
    }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);

  const selectPlan = (card) => navigate(card.tier === 'Free' ? '/studio/signup' : '/studio/plans');
  const selectStorage = () => navigate('/studio/storage');
  const selectInvitation = () => navigate('/browse');
  const buyDesign = () => navigate('/browse');
  const previewDesign = (d) => { if (d.preview_url) window.open(d.preview_url, '_blank', 'noopener'); else navigate('/browse'); };

  if (err) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center" style={{ background: 'var(--lux-bg)' }}>
        <div className="lux-glass p-10 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8" style={{ color: '#E8C97A' }} />
          <div className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>Pricing is loading elsewhere</div>
          <p className="mt-2 text-sm" style={{ color: 'var(--lux-text-muted)' }}>Please try again in a moment.</p>
        </div>
      </div>
    );
  }
  if (!portfolio || !storage || !invitations || !designs) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center" style={{ background: 'var(--lux-bg)' }}>
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: '#E8C97A' }} />
      </div>
    );
  }

  return (
    <div className="luxe min-h-screen" style={{ background: 'var(--lux-bg)' }} data-testid="portfolio-pricing-page">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        {/* audience tabs */}
        <div className="mx-auto mb-10 flex w-fit gap-1 rounded-full p-1" style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }} data-testid="audience-tabs">
          {[['photographers', 'For Photographers', Camera], ['couples', 'For Couples', Heart]].map(([k, label, Icon]) => (
            <button key={k} onClick={() => setAudience(k)} data-testid={`audience-${k}`}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] transition-all"
              style={audience === k ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#1A0F08' } : { color: 'var(--lux-text-muted)' }}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {audience === 'photographers' ? (
          <>
            <div className="mb-4 text-center">
              <span className="lux-eyebrow">◆ Pixora Portfolio</span>
              <h1 className="font-display mt-2 text-4xl md:text-5xl" style={{ color: 'var(--lux-text)' }}>Choose Your Portfolio Plan</h1>
              <p className="mx-auto mt-3 max-w-2xl text-sm md:text-base" style={{ color: 'var(--lux-text-muted)' }}>
                Build your photography brand, showcase your work, grow your studio, and connect with clients worldwide.
              </p>
            </div>
            <FoundingBanner founding={portfolio.founding} />
            <div className="text-center"><CycleToggle period={period} onChange={setPeriod} /></div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <PricingCard card={{ ...portfolio.free }} onSelect={selectPlan} />
              {portfolio.plans.map((c) => <PricingCard key={c.plan_id || c.tier} card={c} cycle={period.p} onSelect={selectPlan} />)}
            </div>

            <div className="mt-20">
              <SectionHead title="Storage Upgrades" subtitle="Need more space? Upgrade anytime without changing your portfolio plan." />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {storage.tiers.map((t) => (
                  <PricingCard key={t.gb_limit} onSelect={selectStorage} cycle={period.s}
                    card={{ tier: t.label, name: t.label, popular: t.popular, badge: t.badge, cta: 'Add Storage',
                      features: [`${t.label} cloud storage`, 'No plan change needed', 'Keep your founding rate'], cycles: t.cycles }} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-8 text-center">
              <span className="lux-eyebrow">◆ MAJA Invites</span>
              <h1 className="font-display mt-2 text-4xl md:text-5xl" style={{ color: 'var(--lux-text)' }}>Create Your Wedding Website</h1>
              <p className="mx-auto mt-3 max-w-2xl text-sm md:text-base" style={{ color: 'var(--lux-text-muted)' }}>
                Beautiful invitation websites for modern weddings.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {invitations.plans.map((p) => (
                <PricingCard key={p.tier} onSelect={selectInvitation}
                  card={{ tier: p.tier, name: p.tier, price: p.price,
                    strikethrough: p.strikethrough, discount_pct: p.discount_pct,
                    popular: p.popular, badge: p.badge, cta: p.cta, features: p.features }} />
              ))}
            </div>

            <div className="mt-20">
              <SectionHead title="Enhance Your Wedding Experience" subtitle="Optional add-ons — pick only what you need." />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {invitations.addons.map((a) => <AddonCard key={a.key} a={a} onSelect={selectInvitation} />)}
              </div>
            </div>

            <div className="mt-20">
              <SectionHead title="Invitation Designs" subtitle="Every design, individually priced. No bundles, no categories to unlock." />
              {designs.designs.length === 0 ? (
                <div className="lux-glass p-8 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>Designs are being curated — check back soon.</div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {designs.designs.map((d) => <DesignCard key={d.design_id} d={d} onBuy={buyDesign} onPreview={previewDesign} />)}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
