import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import WeddingModule, { Panel, StatRow, Empty, InlineError } from '@/components/WeddingModule';
import * as api from '@/api/weddingAnalytics';

// Analytics tab — replaces the legacy Phase30AnalyticsPage. Charts are plain
// CSS bars rather than a charting library: the data is at most 30 daily points
// and 24 hourly buckets, and frontend-v2 has no chart dependency worth adding
// for that.

const numberFmt = new Intl.NumberFormat('en-IN');
const DEVICES = [['mobile', 'Mobile'], ['desktop', 'Desktop'], ['tablet', 'Tablet']];

export default function WeddingAnalytics() {
  const { weddingId } = useParams();
  return (
    <WeddingModule weddingId={weddingId} active="Analytics" title="Analytics">
      {(profile) => <AnalyticsBody profileId={profile.id} />}
    </WeddingModule>
  );
}

function AnalyticsBody({ profileId }) {
  const [full, setFull] = useState(null);
  const [sum, setSum] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, s] = await Promise.all([
        api.analytics(profileId),
        api.summary(profileId).catch(() => ({ data: null })),
      ]);
      setFull(a.data);
      setSum(s.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load analytics for this wedding.');
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const daily = useMemo(() => (full?.daily_views || []).slice(-30), [full]);
  const maxDaily = useMemo(() => Math.max(1, ...daily.map((d) => d.count || 0)), [daily]);

  const hourly = useMemo(() => {
    const h = full?.hourly_distribution || {};
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: Number(h[String(i)] ?? h[i] ?? 0) }));
  }, [full]);
  const maxHourly = useMemo(() => Math.max(1, ...hourly.map((h) => h.count)), [hourly]);

  const languages = useMemo(() => Object.entries(full?.language_views || {})
    .sort((a, b) => b[1] - a[1]), [full]);

  const deviceTotal = full ? (full.mobile_views + full.desktop_views + full.tablet_views) : 0;

  if (error) return <InlineError message={error} />;
  if (!full) return <div className="wmod-skel" style={{ height: 360 }} />;

  const noData = (full.total_views || 0) === 0;

  return (
    <>
      <StatRow items={[
        { label: 'Total views', value: numberFmt.format(full.total_views || 0), hint: full.first_viewed_at ? `since ${new Date(full.first_viewed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : undefined },
        { label: 'Unique visitors', value: numberFmt.format(full.unique_views || sum?.unique_visitors || 0) },
        { label: 'Map clicks', value: numberFmt.format(full.map_clicks || 0), hint: 'Guests getting directions' },
        { label: 'RSVP clicks', value: numberFmt.format(full.rsvp_clicks || 0), hint: 'Opened the RSVP form' },
      ]}
      />

      {noData ? (
        <Panel>
          <Empty
            title="No views yet"
            body="Analytics start filling in as soon as the first guest opens the invitation. Publish it and share the link to get going."
          />
        </Panel>
      ) : (
        <>
          <Panel title="Views per day" sub={`The last ${daily.length} day${daily.length === 1 ? '' : 's'} with recorded activity.`}>
            {daily.length === 0 ? (
              <Empty title="No daily breakdown yet" body="Views are counted but not yet split by day." />
            ) : (
              <div className="wmod-bars">
                {daily.map((d) => (
                  <div className="wmod-bar-col" key={d.date} title={`${d.date}: ${d.count} views`}>
                    <span className="wmod-bar" style={{ height: `${Math.round((d.count / maxDaily) * 100)}%` }} />
                    <span className="wmod-bar-label">{d.date?.slice(8) || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="When guests look" sub={sum?.peak_hour != null ? `Busiest hour: ${formatHour(sum.peak_hour)}.` : 'Views by hour of day.'}>
            <div className="wmod-bars">
              {hourly.map((h) => (
                <div className="wmod-bar-col" key={h.hour} title={`${formatHour(h.hour)}: ${h.count} views`}>
                  <span className="wmod-bar" style={{ height: `${Math.round((h.count / maxHourly) * 100)}%` }} />
                  <span className="wmod-bar-label">{h.hour % 3 === 0 ? h.hour : ''}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Devices" sub="Most wedding invitations are opened on a phone — worth remembering when picking photos.">
            {deviceTotal === 0 ? (
              <Empty title="No device data yet" />
            ) : DEVICES.map(([key, label]) => {
              const v = full[`${key}_views`] || 0;
              const pct = Math.round((v / deviceTotal) * 100);
              return (
                <div key={key} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span>{label}</span>
                    <span className="wmod-td-muted">{numberFmt.format(v)} · {pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--mj-section-deep)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--mj-primary)' }} />
                  </div>
                </div>
              );
            })}
          </Panel>

          {languages.length > 0 && (
            <Panel title="Languages read" sub={sum?.most_viewed_language ? `Most read in ${sum.most_viewed_language}.` : undefined}>
              {languages.map(([lang, count]) => (
                <div key={lang} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--mj-border)', fontSize: 13.5 }}>
                  <span style={{ textTransform: 'capitalize' }}>{lang}</span>
                  <span className="wmod-td-muted">{numberFmt.format(count)}</span>
                </div>
              ))}
            </Panel>
          )}

          <Panel title="Music" sub="Only meaningful if background music is switched on for this wedding.">
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', fontSize: 13.5 }}>
              <span>Played <strong>{numberFmt.format(full.music_plays || 0)}</strong> times</span>
              <span className="wmod-td-muted">Paused {numberFmt.format(full.music_pauses || 0)} times</span>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

function formatHour(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return '—';
  const suffix = n < 12 ? 'am' : 'pm';
  const twelve = n % 12 === 0 ? 12 : n % 12;
  return `${twelve}${suffix}`;
}
