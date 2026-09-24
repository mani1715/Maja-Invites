// PricingCard — the ONE reusable pricing card used by every pricing section.
//
// Honest by design: the struck-through number is the REAL regular price the API
// sends (`strikethrough`), and the discount badge shows the TRUE % off. When the
// buyer isn't paying less than regular (regular mode), no strike-through renders.
//
// Shape it consumes (per the /api/public/pricing/* payload):
//   card = { tier, name, features[], cta, popular, badge, storage_gb,
//            price?            // fixed one-time / free price (no cycles)
//            cycles?: { [key]: { effective_price, strikethrough, pct_off, savings,
//                                is_founding, label } } }
// For plans with cycles, pass the selected `cycle` key; for fixed/free cards omit it.
import React from 'react';
import { Check, Crown, Sparkles, Star, Zap } from 'lucide-react';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const BADGE_ICON = { 'MOST POPULAR': Star, 'BEST VALUE': Crown, 'PROFESSIONAL STUDIOS': Zap };

export default function PricingCard({ card, cycle, onSelect, highlight }) {
  const c = card.cycles ? card.cycles[cycle] : null;
  const isFree = !card.cycles && (Number(card.price) === 0);
  const popular = !!(card.popular || highlight);
  const badge = card.badge || (card.popular ? 'MOST POPULAR' : null);
  const BadgeIcon = BADGE_ICON[badge] || Sparkles;

  // Numbers to show. Cycle cards read their per-cycle block; fixed-price cards
  // (e.g. one-time invitation plans) fall back to the card's own honest launch
  // fields — a strike shows only when a real, higher regular price was set.
  const effective = c ? c.effective_price : (isFree ? 0 : Number(card.price));
  const strike = c ? c.strikethrough : (card.strikethrough || null);
  const pct = c ? c.pct_off : (Number(card.discount_pct) || 0);
  const savings = c ? c.savings
    : (card.strikethrough ? Number(card.strikethrough) - Number(card.price) : 0);
  const perLabel = c ? { '1': '/mo', '3': '/3 mo', '6': '/6 mo', '12': '/yr' }[cycle] : '';

  return (
    <div
      className="pricing-card relative flex flex-col rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1.5"
      data-testid={`pricing-card-${(card.tier || '').toLowerCase().replace(/\s+/g, '-')}`}
      style={{
        background: popular
          ? 'linear-gradient(160deg, rgba(124,58,237,0.22), rgba(30,20,45,0.65) 55%, rgba(20,14,8,0.85))'
          : 'linear-gradient(160deg, rgba(40,30,55,0.35), rgba(20,15,25,0.55))',
        border: popular ? '1px solid rgba(232,201,122,0.55)' : '1px solid var(--lux-border)',
        backdropFilter: 'blur(10px)',
        boxShadow: popular ? '0 20px 60px rgba(124,58,237,0.25), 0 0 0 1px rgba(232,201,122,0.25) inset' : '0 12px 40px rgba(0,0,0,0.35)',
      }}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#1A0F08', boxShadow: '0 6px 20px rgba(212,175,55,0.45)' }}>
            <BadgeIcon className="h-3 w-3" /> {badge}
          </span>
        </div>
      )}

      {/* header */}
      <div className="mb-4">
        <h3 className="font-display text-xl" style={{ color: popular ? '#F3E4B8' : 'var(--lux-text)' }}>{card.name || card.tier}</h3>
        {typeof card.storage_gb === 'number' && card.storage_gb > 0 && (
          <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
            style={{ background: 'rgba(124,58,237,0.18)', color: '#C4A6F5', border: '1px solid rgba(124,58,237,0.35)' }}>
            {card.storage_gb} GB storage
          </span>
        )}
      </div>

      {/* price block */}
      <div className="mb-5 min-h-[70px]">
        {isFree ? (
          <div className="font-display text-4xl" style={{ color: 'var(--lux-text)' }}>Free</div>
        ) : (
          <>
            {strike ? (
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm line-through" style={{ color: 'var(--lux-text-faint)' }}>{inr(strike)}</span>
                {pct > 0 && (
                  <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ background: 'rgba(46,160,67,0.18)', color: '#4ADE80', border: '1px solid rgba(46,160,67,0.4)' }}>
                    {pct}% OFF
                  </span>
                )}
              </div>
            ) : null}
            <div className="flex items-baseline gap-1">
              <span className="font-display text-4xl" style={{ color: popular ? '#F3E4B8' : 'var(--lux-text)' }}>{inr(effective)}</span>
              {perLabel && <span className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{perLabel}</span>}
            </div>
            {savings > 0 && (
              <div className="mt-1 text-[12px]" style={{ color: '#4ADE80' }}>You save {inr(savings)}{c && c.is_founding ? ' · founding rate' : ''}</div>
            )}
          </>
        )}
      </div>

      {/* features */}
      <ul className="mb-6 flex flex-1 flex-col gap-2">
        {(card.features || []).map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--lux-text-muted)' }}>
            <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: popular ? '#E8C97A' : '#7C9CF5' }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={() => onSelect && onSelect(card, cycle)}
        data-testid={`pricing-cta-${(card.tier || '').toLowerCase().replace(/\s+/g, '-')}`}
        className="w-full justify-center rounded-xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] transition-all hover:scale-[1.02]"
        style={popular
          ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#1A0F08', boxShadow: '0 10px 30px rgba(212,175,55,0.35)' }
          : { background: 'linear-gradient(135deg, rgba(124,58,237,0.85), rgba(91,33,182,0.9))', color: '#fff' }}
      >
        {card.cta || `Choose ${card.tier}`}
      </button>
    </div>
  );
}
