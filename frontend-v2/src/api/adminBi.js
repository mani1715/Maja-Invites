import client from './client';

// business_intelligence.py — the single overview endpoint AdminBI.jsx never
// called. Everything else BI-related (revenue/leaderboard/activity) lives in
// adminOps.js; this file exists only because that one is owned elsewhere.
//
// GET /api/admin/bi/overview?days=  -> { generated_at, window_days, recurring{},
//   growth{}, funnel{}, revenue{}, referrals{}, coupons{} } — see AdminBI.jsx's
// Overview() component for the exact shape rendered.
export const biOverview = (days = 30) =>
  client.get('/api/admin/bi/overview', { params: { days } });
