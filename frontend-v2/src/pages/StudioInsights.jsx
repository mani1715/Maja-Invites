import { useState } from 'react';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, useAsync, Loading, ErrorPanel, numberFmt,
} from '@/components/StudioModule';
import * as api from '@/api/studioOps';

// Studio-wide insights. The dashboard already reads two numbers off this
// endpoint for its KPI tiles; everything else it returns — QR performance,
// face-match usage, storage trend — had no reader.

const RANGES = [
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '365', label: '12 months' },
];

function Bars({ points, valueKey = 'count', labelKey = 'date' }) {
  const max = Math.max(1, ...points.map((p) => Number(p[valueKey] || 0)));
  return (
    <div className="wmod-bars">
      {points.slice(-45).map((p, i) => (
        <div className="wmod-bar-col" key={p[labelKey] || i} title={`${p[labelKey]}: ${p[valueKey]}`}>
          <span className="wmod-bar" style={{ height: `${Math.round((Number(p[valueKey] || 0) / max) * 100)}%` }} />
          <span className="wmod-bar-label">{String(p[labelKey] || '').slice(-2)}</span>
        </div>
      ))}
    </div>
  );
}

export default function StudioInsights() {
  const [days, setDays] = useState('90');
  const { data, error, loading, reload } = useAsync(
    () => api.insights(days).then((r) => r.data),
    [days],
  );

  const d = data || {};
  const qr = d.qr || {};
  const face = d.face || {};
  const storage = d.storage || {};
  const daily = qr.daily || d.daily || [];

  return (
    <StudioModule
      active="Insights"
      title="Insights"
      sub="How your invitations, QR galleries and face matching are actually being used, across every wedding you run."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'QR scans', value: loading ? '—' : numberFmt.format(qr.total_scans ?? 0), hint: `last ${days} days` },
        { label: 'Gallery photos', value: loading ? '—' : numberFmt.format(face.total_photos ?? 0) },
        { label: 'Face searches', value: loading ? '—' : numberFmt.format(face.total_searches ?? face.searches ?? 0), hint: 'Guests looking for themselves' },
        { label: 'Storage used', value: loading ? '—' : (storage.used_gb != null ? `${Number(storage.used_gb).toFixed(1)} GB` : '—') },
      ]}
      />

      <Segmented ariaLabel="Date range" value={days} onChange={setDays} options={RANGES} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="QR scans over time" sub="Scans are the clearest signal that guests actually reached the gallery.">
            {daily.length === 0 ? (
              <Empty title="No scans in this window" body="Print or share a gallery QR at the next event and this fills in." />
            ) : <Bars points={daily} />}
          </Panel>

          <Panel title="Face matching" sub="How much work the AI pipeline is doing for you.">
            <Row label="Photos indexed" value={numberFmt.format(face.total_photos ?? 0)} />
            <Row label="Searches run" value={numberFmt.format(face.total_searches ?? face.searches ?? 0)} />
            <Row label="Matches returned" value={numberFmt.format(face.total_matches ?? face.matches ?? 0)} />
            <Row label="Weddings with the gallery on" value={numberFmt.format(face.enabled_profiles ?? 0)} last />
          </Panel>

          <Panel title="Storage" sub="Across originals, previews and thumbnails.">
            <Row label="Used" value={storage.used_gb != null ? `${Number(storage.used_gb).toFixed(2)} GB` : '—'} />
            <Row label="Files" value={numberFmt.format(storage.file_count ?? 0)} />
            <Row label="Plan allowance" value={storage.quota_gb != null ? `${storage.quota_gb} GB` : 'Not on a paid plan'} last />
          </Panel>
        </>
      )}
    </StudioModule>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--mj-border)', fontSize: 13.5 }}>
      <span className="wmod-td-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
