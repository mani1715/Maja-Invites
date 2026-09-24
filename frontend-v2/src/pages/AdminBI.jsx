import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Segmented, Empty, useAsync, Loading, ErrorPanel,
  numberFmt, rupees, shortDate,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';
import { biOverview } from '@/api/adminBi';

// Business intelligence. Merges what the legacy build split across
// SuperAdminBI and SuperAdminProfitability's revenue half: revenue over time,
// who is earning it, and where it goes.

const RANGES = [
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '365', label: '12 months' },
];

export default function AdminBI() {
  const [days, setDays] = useState('90');
  // Money and activity are different questions, and mixing them on one canvas
  // makes both harder to read — hence a view switch rather than more panels.
  const [view, setView] = useState('revenue');

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.revenueSummary({ days }).then((r) => r.data).catch(() => null),
      api.revenueTimeseries({ days }).then((r) => r.data).catch(() => null),
      api.photographerLeaderboard({ days, limit: 20 }).then((r) => r.data).catch(() => null),
    ]).then(([summary, series, leaders]) => ({ summary, series, leaders })),
    [days],
  );

  const s = data?.summary || {};
  const points = data?.series?.points || data?.series?.series || (Array.isArray(data?.series) ? data.series : []);
  const leaders = data?.leaders?.photographers || data?.leaders?.items || (Array.isArray(data?.leaders) ? data.leaders : []);

  const maxPoint = Math.max(1, ...points.map((p) => Number(p.amount ?? p.revenue ?? p.total ?? 0)));

  return (
    <AdminModule
      active="Business intelligence"
      title="Business intelligence"
      sub="Revenue, order mix and who is driving it. All amounts are INR and server-computed — this page never does its own money maths."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Revenue', value: loading ? '—' : rupees.format(s.total_revenue ?? s.revenue ?? 0), hint: `last ${days} days` },
        { label: 'Orders', value: loading ? '—' : numberFmt.format(s.order_count ?? s.orders ?? 0) },
        { label: 'Average order', value: loading ? '—' : rupees.format(s.average_order_value ?? s.aov ?? 0) },
        { label: 'Paying studios', value: loading ? '—' : numberFmt.format(s.active_studios ?? s.paying_studios ?? leaders.length) },
      ]}
      />

      <Segmented
        ariaLabel="View"
        value={view}
        onChange={setView}
        options={[
          { id: 'revenue', label: 'Revenue' },
          { id: 'activity', label: 'Platform activity' },
          { id: 'overview', label: 'Executive overview' },
        ]}
      />

      {view === 'activity' && <Activity />}
      {view === 'overview' && <Overview />}

      {view === 'revenue' && (
      <>
      <Segmented ariaLabel="Date range" value={days} onChange={setDays} options={RANGES} />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="Revenue over time" sub={`Each bar is one bucket in the last ${days} days.`}>
            {points.length === 0 ? (
              <Empty title="No revenue in this window" body="Nothing was paid for in the selected range." />
            ) : (
              <div className="wmod-bars">
                {points.slice(-60).map((p, i) => {
                  const v = Number(p.amount ?? p.revenue ?? p.total ?? 0);
                  const label = p.date || p.day || p.period || '';
                  return (
                    <div className="wmod-bar-col" key={label || i} title={`${label}: ${rupees.format(v)}`}>
                      <span className="wmod-bar" style={{ height: `${Math.round((v / maxPoint) * 100)}%` }} />
                      <span className="wmod-bar-label">{String(label).slice(-2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Top studios" sub="Ranked by revenue they generated in this window." pad={false}>
            {leaders.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty title="No studio revenue yet" body="Nobody has bought anything in this range." />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>#</th><th>Studio</th><th>Revenue</th><th>Orders</th><th>Joined</th></tr>
                  </thead>
                  <tbody>
                    {leaders.map((p, i) => (
                      <tr key={p.admin_id || p.id || i}>
                        <td className="wmod-td-muted">{i + 1}</td>
                        <td>
                          {p.name || p.studio_name || p.email || '—'}
                          {p.email && (p.name || p.studio_name) && <><br /><span className="wmod-td-muted">{p.email}</span></>}
                        </td>
                        <td>{rupees.format(p.revenue ?? p.total ?? 0)}</td>
                        <td className="wmod-td-muted">{numberFmt.format(p.orders ?? p.order_count ?? 0)}</td>
                        <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
      </>
      )}
    </AdminModule>
  );
}

// Platform activity — what people DO here, as opposed to what they pay.
// Two endpoints that had no surface: /admin/analytics/overview (event counts
// and the platform's object counts) and /admin/analytics/global (creator
// geography and 30-day growth).
function Activity() {
  const { data, error, loading, reload } = useAsync(() => Promise.all([
    api.analyticsOverview().then((r) => r.data).catch(() => null),
    api.analyticsGlobal().then((r) => r.data).catch(() => null),
  ]).then(([overview, global]) => ({ overview, global })));

  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} onRetry={reload} />;

  const o = data?.overview || {};
  const g = data?.global || {};
  const byType = o.by_type || [];
  const byDay = o.by_day || [];
  const maxDay = Math.max(1, ...byDay.map((d) => Number(d.events || 0)));

  const list = (label, rows, keyName = 'k', valName = 'v') => (
    <div style={{ flex: '1 1 240px', minWidth: 220 }}>
      <p className="wmod-label" style={{ marginBottom: 8 }}>{label}</p>
      {(!rows || rows.length === 0) ? <p className="wmod-hint">Nothing yet.</p> : (
        <div className="wmod-list">
          {rows.slice(0, 10).map((r, i) => (
            <div className="wmod-item" key={r[keyName] ?? i}>
              <span>{r[keyName] || '—'}</span>
              <span>{numberFmt.format(r[valName] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <StatRow items={[
        { label: 'Studios', value: numberFmt.format(o.studios ?? 0) },
        { label: 'Posts', value: numberFmt.format(o.posts ?? 0) },
        { label: 'Published portfolios', value: numberFmt.format(o.portfolios_published ?? 0) },
        { label: 'Verified', value: numberFmt.format(o.verified ?? 0) },
      ]}
      />

      <Panel title="Tracked events" sub={`${numberFmt.format(o.total_events ?? 0)} recorded in total. Each bar is one day.`}>
        {byDay.length === 0 ? (
          <Empty title="No activity recorded yet" body="Events appear here once people start using the community features." />
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
            {byDay.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${numberFmt.format(d.events)}`}
                style={{
                  flex: 1,
                  height: `${Math.max(2, (Number(d.events || 0) / maxDay) * 100)}%`,
                  background: 'var(--mj-primary)',
                  borderRadius: '3px 3px 0 0',
                  minWidth: 3,
                }}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Where the activity comes from">
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          {list('By event type', byType, 'type', 'count')}
          {list('Creators by country', Object.entries(g.by_country || {}).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v))}
          {list('Creators by state', Object.entries(g.by_state || {}).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v))}
        </div>
      </Panel>

      <Panel title="Community depth" sub="Relationships and pipelines, not page views — these are the numbers that say the product is being used for real work.">
        <StatRow items={[
          { label: 'Accepted connections', value: numberFmt.format(o.connections ?? 0) },
          { label: 'CRM clients', value: numberFmt.format(o.crm_clients ?? 0) },
        ]}
        />
      </Panel>
    </>
  );
}

// Executive overview — GET /api/admin/bi/overview, previously wired to
// nothing. Renders exactly what business_intelligence.compute_bi returns:
// cohorts (recurring revenue), funnel (photographer conversion/activation),
// growth, revenue-over-time, referrals, coupon redemptions. Nothing here
// re-derives a number the server didn't already compute.
function Overview() {
  const [days, setDays] = useState('90');
  const { data, error, loading, reload } = useAsync(
    () => biOverview(Number(days)).then((r) => r.data),
    [days],
  );

  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} onRetry={reload} />;

  const rec = data?.recurring || {};
  const growth = data?.growth || {};
  const funnel = data?.funnel || {};
  const revenue = data?.revenue || {};
  const referrals = data?.referrals || {};
  const coupons = data?.coupons || {};
  const monthly = growth.monthly || [];
  const revMonthly = revenue.monthly || [];
  const maxMonthly = Math.max(1, ...monthly.map((m) => Math.max(m.couples || 0, m.photographers || 0)));
  const maxRev = Math.max(1, ...revMonthly.map((m) => Number(m.revenue_inr || 0)));

  return (
    <>
      <Segmented ariaLabel="Overview window" value={days} onChange={setDays} options={RANGES} />

      <StatRow items={[
        { label: 'MRR', value: rupees.format(rec.mrr_inr ?? 0), hint: 'monthly recurring revenue' },
        { label: 'ARR', value: rupees.format(rec.arr_inr ?? 0) },
        { label: 'Active subscriptions', value: numberFmt.format(rec.active_subscriptions ?? 0) },
        { label: 'Churn', value: `${rec.churn_rate_pct ?? 0}%`, hint: `${numberFmt.format(rec.churned_window ?? 0)} churned in window` },
      ]}
      />

      <Panel title="Photographer funnel" sub="Of every admin account, how many are activated (published a portfolio or paid) vs paying.">
        <StatRow items={[
          { label: 'Conversion', value: `${funnel.photographer_conversion_pct ?? 0}%`, hint: `${numberFmt.format(funnel.paid_photographers ?? 0)} paying` },
          { label: 'Activation', value: `${funnel.photographer_activation_pct ?? 0}%`, hint: `${numberFmt.format(funnel.activated_photographers ?? 0)} activated` },
        ]}
        />
      </Panel>

      <Panel title="Growth" sub={`${numberFmt.format(growth.total_couples ?? 0)} couples · ${numberFmt.format(growth.total_photographers ?? 0)} photographers, all-time. New in window: ${numberFmt.format(growth.new_couples_window ?? 0)} couples, ${numberFmt.format(growth.new_photographers_window ?? 0)} photographers.`}>
        {monthly.length === 0 ? <Empty title="No monthly signup data yet." /> : (
          <div className="wmod-bars">
            {monthly.map((m) => (
              <div className="wmod-bar-col" key={m.month} title={`${m.month}: ${m.couples} couples, ${m.photographers} photographers`}>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 120 }}>
                  <span className="wmod-bar" style={{ height: `${Math.round(((m.couples || 0) / maxMonthly) * 100)}%`, width: 12 }} />
                  <span className="wmod-bar" style={{ height: `${Math.round(((m.photographers || 0) / maxMonthly) * 100)}%`, width: 12, background: 'var(--mj-accent-soft)' }} />
                </div>
                <span className="wmod-bar-label">{m.month.slice(2)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="wmod-hint" style={{ marginTop: 10 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--mj-primary)', marginRight: 6 }} />Couples
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--mj-accent-soft)', margin: '0 6px 0 16px' }} />Photographers
        </p>
      </Panel>

      <Panel title="Revenue over time" sub={`Total ${rupees.format(revenue.total_inr ?? 0)} all-time, ${rupees.format(revenue.window_inr ?? 0)} in the last ${days} days.`}>
        {revMonthly.length === 0 ? <Empty title="No revenue recorded yet." /> : (
          <div className="wmod-bars">
            {revMonthly.map((m) => (
              <div className="wmod-bar-col" key={m.month} title={`${m.month}: ${rupees.format(m.revenue_inr)}`}>
                <span className="wmod-bar" style={{ height: `${Math.round(((m.revenue_inr || 0) / maxRev) * 100)}%` }} />
                <span className="wmod-bar-label">{m.month.slice(2)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Referrals and coupons">
        <StatRow items={[
          { label: 'Total referrals', value: numberFmt.format(referrals.total ?? 0) },
          { label: 'Couple referrals', value: numberFmt.format(referrals.couple_referrals ?? 0) },
          { label: 'Photographer referrals', value: numberFmt.format(referrals.photographer_referrals ?? 0) },
          { label: 'Coupon redemptions', value: numberFmt.format(coupons.redemptions ?? 0) },
        ]}
        />
      </Panel>

      {rec.by_product && Object.keys(rec.by_product).length > 0 && (
        <Panel title="Active subscriptions by product">
          <div className="wmod-list">
            {Object.entries(rec.by_product).map(([k, v]) => (
              <div className="wmod-item" key={k}><span>{k}</span><span>{numberFmt.format(v)}</span></div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
