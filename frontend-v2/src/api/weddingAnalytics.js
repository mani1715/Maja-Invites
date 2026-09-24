import client from './client';

// Per-wedding analytics — server.py AnalyticsResponse / AnalyticsSummary.
//   /analytics          full series: daily_views, hourly_distribution,
//                       language_views, device split, interaction counters
//   /analytics/summary  the five headline numbers
export const analytics = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/analytics`);

export const summary = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/analytics/summary`);
