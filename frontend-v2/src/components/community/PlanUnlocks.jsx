import { useEffect, useState } from 'react';
import * as pp from '@/api/publicPricing';
import './planUnlocks.css';

// What a portfolio plan unlocks in the community.
//
// The gating is real and has been for a while — community_gating.py derives
// every community capability from the studio's PORTFOLIO tier, so buying a
// portfolio is what turns on photo posts, then reels, stories, CRM and the
// rest. But the only way to READ that was /api/pixora/capabilities, which
// needs a login. A photographer deciding whether to buy could not see what
// buying would give them; they found out afterwards, or by hitting a 403.
//
// This reads /api/public/community/capabilities, which returns the same matrix
// WITH the admin's Pricing Hub overrides applied. That last part matters: the
// hardcoded defaults and the configured matrix can differ, and a page that
// promised the default while the server enforced the override would be lying
// to the person paying.
//
// Renders nothing if the matrix cannot be loaded — an invented feature list on
// a pricing page is a promise the product has not made.

const TIER_META = {
  free: { label: 'Free', note: 'No portfolio plan' },
  basic: { label: 'Basic', note: 'Basic portfolio plan' },
  premium: { label: 'Premium', note: 'Premium portfolio plan' },
};

export default function PlanUnlocks({ heading = 'What a portfolio plan unlocks in the community' }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pp.communityCapabilities()
      .then(({ data: d }) => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed || !data || !(data.capabilities || []).length) return null;

  const tiers = data.tiers || ['free', 'basic', 'premium'];
  // Group by the step that first unlocks each capability, which is the shape a
  // buyer reads: what everyone gets, then what each paid step adds.
  const groups = tiers.map((t) => ({
    tier: t,
    ...TIER_META[t],
    items: data.capabilities.filter((c) => c.min_tier === t),
  })).filter((g) => g.items.length);

  return (
    <section className="punlock" aria-labelledby="punlock-title">
      <h2 id="punlock-title" className="punlock-title">{heading}</h2>
      <p className="punlock-sub">
        One plan drives both. Your portfolio subscription sets what you can do in
        the photographer community — there is no separate community subscription.
      </p>

      <div className="punlock-grid">
        {groups.map((g) => (
          <div key={g.tier} className={`punlock-col punlock-col--${g.tier}`}>
            <p className="punlock-tier">{g.label}</p>
            <p className="punlock-note">{g.note}</p>
            <ul className="punlock-list">
              {g.items.map((c) => (
                <li key={c.capability}>{c.label}</li>
              ))}
            </ul>
            {g.tier !== 'free' && (
              <p className="punlock-plus">
                …plus everything in {g.tier === 'premium' ? 'Basic' : 'Free'}.
              </p>
            )}
          </div>
        ))}
      </div>

      {!data.enforced && (
        // The kill-switch is off, so nothing is actually locked right now. Say
        // so rather than showing a tier table that is not being applied.
        <p className="punlock-flag">
          Community plan limits are currently switched off platform-wide — every
          studio has full access regardless of plan.
        </p>
      )}
    </section>
  );
}
