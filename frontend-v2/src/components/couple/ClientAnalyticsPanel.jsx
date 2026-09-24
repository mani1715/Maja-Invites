import { useEffect, useState } from 'react';
import { clientAnalytics } from '@/lib/clientAuth';

// GET /api/client/analytics -> { total_views, unique_views, mobile_views,
// desktop_views, tablet_views, first_viewed_at, last_viewed_at,
// daily_views: [{date,count}], map_clicks, rsvp_clicks } (photographer_clients.py ~314).
// Renders exactly those fields — no chart library, plain divs for the bars.

function fmtDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Stat({ label, value, sub }) {
  return (
    <div className="cap-card" style={{ padding: '18px 20px' }}>
      <p style={{ fontSize: 11.5, color: '#c4b5fd', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontFamily: "'Spectral',serif", fontSize: 'clamp(20px,2.2vw,26px)', margin: '0 0 4px' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#c4b5fd', margin: 0 }}>{sub}</p>}
    </div>
  );
}

export default function ClientAnalyticsPanel() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    clientAnalytics()
      .then(({ data: d }) => { if (live) setData(d); })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, []);

  if (err) {
    return <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>Analytics aren&rsquo;t available for this invitation right now.</p>;
  }
  if (!data) {
    return <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>Loading analytics…</p>;
  }

  const deviceTotal = (data.mobile_views || 0) + (data.desktop_views || 0) + (data.tablet_views || 0);
  const pct = (n) => (deviceTotal ? `${Math.round((n / deviceTotal) * 100)}%` : '');
  const days = Array.isArray(data.daily_views) ? data.daily_views.slice(-30) : [];
  const max = Math.max(1, ...days.map((d) => Number(d.count) || 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div data-mj-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
        <Stat label="Total opens" value={data.total_views ?? 0} />
        <Stat label="Unique visitors" value={data.unique_views ?? 0} />
        <Stat label="Mobile" value={data.mobile_views ?? 0} sub={pct(data.mobile_views || 0)} />
        <Stat label="Desktop" value={data.desktop_views ?? 0} sub={pct(data.desktop_views || 0)} />
        <Stat label="Tablet" value={data.tablet_views ?? 0} sub={pct(data.tablet_views || 0)} />
        <Stat label="Map clicks" value={data.map_clicks ?? 0} />
        <Stat label="RSVP clicks" value={data.rsvp_clicks ?? 0} />
        <Stat label="First opened" value={fmtDate(data.first_viewed_at) || '—'} />
      </div>

      {days.length > 0 && (
        <div className="cap-card" style={{ padding: '20px 22px' }}>
          <p style={{ fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c4b5fd', margin: '0 0 14px' }}>Opens over time</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 70 }}>
            {days.map((d, i) => {
              const v = Number(d.count) || 0;
              return (
                <div
                  key={d.date || i}
                  title={`${d.date || ''}: ${v}`}
                  style={{ flex: 1, minHeight: v ? 3 : 1, height: `${(v / max) * 100}%`, borderRadius: '3px 3px 0 0', background: 'linear-gradient(180deg,#a78bfa,#6d28d9)' }}
                />
              );
            })}
          </div>
        </div>
      )}

      {!data.total_views && (
        <p style={{ fontSize: 13, color: '#c4b5fd', margin: 0 }}>No opens yet — once your invitation link is shared, activity will show up here.</p>
      )}
      {data.last_viewed_at && (
        <p style={{ fontSize: 12, color: '#a78bfa', margin: 0 }}>Last opened {fmtDate(data.last_viewed_at)}</p>
      )}
    </div>
  );
}
