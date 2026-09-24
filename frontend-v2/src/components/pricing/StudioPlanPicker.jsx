import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as pp from '@/api/publicPricing';
import { LINK } from '@/lib/marketingLinks';
import BillingCycleToggle from './BillingCycleToggle';
import './studioPlanPicker.css';

// Studio plans, priced the way the backend actually prices them.
//
// Pricing redesign 2026 (docs/PRICING_REDESIGN_2026.md): five portfolio plans
// (Basic/Pro/Advanced/Premium/Custom) instead of three, each cycle carrying a
// full breakdown the server already computed — list price, final price, the
// rupee and percent saved, whether the round-down beat the advertised percent
// ("extra_saving"), the effective monthly rate, and a verbatim storage label
// (Basic is "512 MB", never a computed "0.5 GB"). This component renders
// those fields; it never derives a price from another price.
//
// One identity gotcha the old dedup logic got wrong for the new catalogue:
// `portfolio_tier` is a FEATURE-GATING key, not a plan identity — Pro,
// Advanced, Premium and Custom all map to portfolio_tier "premium" (they
// unlock the same sections; storage is what differentiates them). Deduping
// by portfolio_tier would collapse four of the five plans into one card.
// Dedup by `plan_id` instead.

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// `pct_off`/`extra_saving` are server-sent per cycle; this only chooses which
// of the two approved sentences to show, per docs/PRICING_REDESIGN_2026.md §3.
function cycleBadgeText(c) {
  const pct = Number(c?.pct_off || 0);
  if (pct <= 0) return null;
  return c.extra_saving ? `${pct}% OFF + Special Pricing` : `SAVE ${pct}%`;
}

export default function StudioPlanPicker() {
  const [data, setData] = useState(null);
  const [storage, setStorage] = useState(null);
  const [caps, setCaps] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [cycle, setCycle] = useState('1');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.allSettled([pp.portfolioPlans(), pp.storagePlans(), pp.communityCapabilities()])
      .then(([p, s, c]) => {
        if (p.status !== 'fulfilled') { setStatus('error'); return; }
        setData(p.value.data);
        if (s.status === 'fulfilled') setStorage(s.value.data);
        if (c.status === 'fulfilled') setCaps(c.value.data);
        setStatus('ready');
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  const cycles = useMemo(() => {
    const labels = data?.cycle_labels || {};
    return Object.keys(labels).sort((a, b) => Number(a) - Number(b))
      .map((k) => [k, labels[k]]);
  }, [data]);

  // capability label lists keyed by the tier that first unlocks them.
  const unlocksByTier = useMemo(() => {
    const out = {};
    for (const c of caps?.capabilities || []) {
      (out[c.min_tier] ||= []).push(c.label);
    }
    return out;
  }, [caps]);

  if (status === 'loading') {
    // Reserves the real grid's footprint so the plans popping in don't shift
    // the page (CLS) — five cards, matching the five portfolio plans.
    return (
      <div className="spp-skel-grid" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="spp-skel-card" />)}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <p className="spp-state spp-state--error">
        Couldn&rsquo;t load studio plans right now. <button type="button" className="spp-retry" onClick={load}>Try again</button>
      </p>
    );
  }

  const founding = data?.founding || {};
  const plans = data?.plans || [];
  const free = data?.free;

  // Two plan rows can share a `plan_id`-distinct row that predates a cleanup
  // (an old and a current one still present in the same response). Dedup by
  // plan_id — the one field guaranteed unique per plan.
  const seen = new Set();
  const shown = plans.filter((p) => {
    if (seen.has(p.plan_id)) return false;
    seen.add(p.plan_id);
    return true;
  });

  const cycleOptions = cycles.map(([k, label]) => ({
    key: k,
    label,
    // A representative sample of server data (the first paid plan's pct_off
    // for this cycle) to label the toggle chip — not a frontend computation.
    save: Number(shown[0]?.cycles?.[k]?.pct_off || 0),
  }));

  // /pricing/portfolio uses months ('1','3','6','12'), /pricing/storage uses
  // days ('30','90','180','365'). Rows are dropped rather than shown at zero
  // when a cycle has no price: quoting ₹0 for paid storage is worse than
  // quoting nothing.
  const CYCLE_DAYS = { 1: '30', 3: '90', 6: '180', 12: '365' };
  const storageRows = (storage?.tiers || [])
    .map((t) => {
      const c = (t.cycles || {})[CYCLE_DAYS[cycle] || cycle] || {};
      const price = c.final_inr;
      if (typeof price !== 'number') return null;
      return {
        gb: t.gb_limit,
        label: t.label || (t.gb_limit ? `${t.gb_limit} GB` : ''),
        price,
        strikethrough: c.strikethrough,
        badgeText: cycleBadgeText(c),
        saveInr: Number(c.save_inr || 0),
        cycleLabel: c.label || (data.cycle_labels || {})[cycle] || 'cycle',
      };
    })
    .filter(Boolean);

  return (
    <div className="spp">
      {/* Only when founding pricing is genuinely live AND seats remain. A
          scarcity banner that is not true is worse than no banner. */}
      {founding.enabled && !founding.sold_out && founding.slots_left > 0 && (
        <p className="spp-founding">
          <strong>Founding studio pricing</strong> — {founding.slots_left} of{' '}
          {founding.limit} places left. The price you join on is the price you keep.
        </p>
      )}

      {cycles.length > 1 && (
        <BillingCycleToggle ariaLabel="Billing cycle" options={cycleOptions} value={cycle} onChange={setCycle} />
      )}

      <div className="spp-grid">
        {free && (
          <article className="spp-card">
            <p className="spp-tier">{free.tier}</p>
            <div className="spp-price"><span>{inr(free.price)}</span></div>
            <p className="spp-meta">
              {free.storage_gb ? `${free.storage_gb} GB storage` : 'No included storage'}
            </p>
            <FeatureList items={free.features} />
            <Unlocks labels={unlocksByTier[free.portfolio_tier || 'free']} />
            <Link to={LINK.signUp} className="spp-cta spp-cta--ghost">{free.cta || 'Get started'}</Link>
          </article>
        )}

        {shown.map((plan) => {
          const c = (plan.cycles || {})[cycle] || {};
          const badgeText = cycleBadgeText(c);
          const listPrice = c.strikethrough ?? c.list_inr;
          const setupFee = Number(plan.setup_fee_inr || 0);
          return (
            <article key={plan.plan_id} className={`spp-card ${plan.popular ? 'is-popular' : ''}`}>
              {plan.badge && <span className="spp-badge">{plan.badge}</span>}
              {!plan.badge && plan.popular && <span className="spp-badge">Most chosen</span>}
              <p className="spp-tier">{plan.name || plan.tier}</p>
              <div className="spp-price">
                <span>{inr(c.final_inr)}</span>
                <span className="spp-suffix">/ {c.label || (data.cycle_labels || {})[cycle] || 'cycle'}</span>
              </div>
              {/* `strikethrough`/`list_inr` are the backend's OWN decision — a
                  real figure only when the buyer genuinely pays less. */}
              {listPrice != null && Number(c.pct_off || 0) > 0 && (
                <p className="spp-was">
                  <s>{inr(listPrice)}</s>{badgeText && <span className="spp-off">{badgeText}</span>}
                </p>
              )}
              {Number(c.save_inr || 0) > 0 && (
                <p className="spp-save">You Save {inr(c.save_inr)}</p>
              )}
              {c.effective_monthly_inr != null && cycle !== '1' && (
                <p className="spp-meta">≈ {inr(c.effective_monthly_inr)} / month</p>
              )}
              <p className="spp-meta">
                {plan.storage_label || (plan.storage_gb ? `${plan.storage_gb} GB storage` : 'No included storage')}
              </p>
              {setupFee > 0 && (
                <p className="spp-setup">+{inr(setupFee)} one-time setup (first purchase only)</p>
              )}
              {plan.first_month_inr != null && (
                <p className="spp-setup">First month {inr(plan.first_month_inr)}</p>
              )}
              <FeatureList items={plan.features} />
              <Unlocks
                labels={unlocksByTier[plan.portfolio_tier]}
                inherits={inheritedFrom(plan.portfolio_tier, unlocksByTier)}
              />
              <Link to={LINK.signUp} className="spp-cta">{plan.cta || `Choose ${plan.tier}`}</Link>
            </article>
          );
        })}
      </div>

      {storageRows.length > 0 && (
        <div className="spp-storage">
          <h3 className="spp-storage-title">Extra storage, on any plan</h3>
          <div className="spp-storage-grid">
            {storageRows.map((row) => (
              <div key={row.gb} className="spp-storage-row">
                <span>{row.label}</span>
                <span className="spp-storage-priceblock">
                  {row.strikethrough != null && row.badgeText && (
                    <span className="spp-storage-was"><s>{inr(row.strikethrough)}</s></span>
                  )}
                  <span className="spp-storage-price">
                    {inr(row.price)}
                    <span className="spp-suffix"> / {row.cycleLabel}</span>
                  </span>
                  {row.badgeText && <span className="spp-off spp-storage-off">{row.badgeText}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureList({ items }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className="spp-features">
      {list.slice(0, 8).map((f) => (
        <li key={f}>{String(f).replace(/_/g, ' ')}</li>
      ))}
    </ul>
  );
}

// Tier order, matching community_gating.TIER_RANK.
const TIER_ORDER = ['free', 'basic', 'premium', 'pro'];

/** The highest tier BELOW this one that unlocks something.
 *
 *  Pro Studio adds storage, not community capabilities — no capability has
 *  min_tier "pro" — so its unlocks list is legitimately empty. Left blank that
 *  reads as a bug on the most expensive card, so it says what is true instead:
 *  everything the tier below it has. */
function inheritedFrom(tier, byTier) {
  const i = TIER_ORDER.indexOf(tier);
  if (i <= 0) return null;
  for (let j = i - 1; j >= 0; j -= 1) {
    const t = TIER_ORDER[j];
    if ((byTier[t] || []).length) return t;
  }
  return null;
}

const TIER_NAME = { free: 'Free', basic: 'Basic', premium: 'Premium', pro: 'Pro Studio' };

/** What this tier ADDS in the photographer community. Silent when the matrix
 *  did not load — better to show no list than a list the server will not honour. */
function Unlocks({ labels, inherits }) {
  const has = labels && labels.length;
  if (!has && !inherits) return null;
  return (
    <div className="spp-unlocks">
      <p className="spp-unlocks-head">
        {has ? 'Unlocks in the community' : 'In the community'}
      </p>
      <p className="spp-unlocks-body">
        {has ? labels.join(' · ') : `Everything in ${TIER_NAME[inherits] || inherits}.`}
      </p>
    </div>
  );
}
