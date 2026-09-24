import AdminModule, {
  Panel, StatRow, Empty, useAsync, Loading, ErrorPanel, numberFmt, shortDate,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// QR gallery analytics. `/super-admin/qr-analytics` redirected to /admin/bi,
// which is a different report — the scan-to-upload funnel had no screen.
//
// Contract (qr_analytics.py → compute_qr_analytics): takes no params, returns
//   { generated_at, galleries, total_scans, total_uploads, guest_uploads,
//     studio_uploads, failed_uploads, scan_to_upload_pct,
//     uploads_per_gallery_avg, storage_bytes, storage_gb,
//     top_events: [{ wedding_id, uploads, scans, storage_mb }] }

const n = (v) => numberFmt.format(Number(v) || 0);

export default function AdminQrAnalytics() {
  const { data, error, loading, reload } = useAsync(() => api.qrAnalytics().then((r) => r.data));

  const d = data || {};
  const top = d.top_events || [];
  const conversion = Number(d.scan_to_upload_pct) || 0;

  return (
    <AdminModule
      active="QR analytics"
      title="QR analytics"
      sub="How guest QR galleries actually perform — how many people scan, how many go on to upload, and what that costs in storage."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <StatRow items={[
            { label: 'Galleries', value: n(d.galleries) },
            { label: 'QR scans', value: n(d.total_scans) },
            { label: 'Uploads', value: n(d.total_uploads) },
            { label: 'Scan → upload', value: `${conversion}%` },
            { label: 'Avg per gallery', value: n(d.uploads_per_gallery_avg) },
            { label: 'Storage', value: `${n(d.storage_gb)} GB` },
          ]}
          />

          <Panel
            title="Who is uploading"
            sub="Guests scanning the QR code versus the studio's own uploads."
          >
            <StatRow items={[
              { label: 'Guest uploads', value: n(d.guest_uploads) },
              { label: 'Studio uploads', value: n(d.studio_uploads) },
              { label: 'Failed uploads', value: n(d.failed_uploads) },
            ]}
            />
            {Number(d.failed_uploads) > 0 && (
              <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '12px 0 0', lineHeight: 1.6 }}>
                Failed uploads usually mean a guest lost signal mid-upload or hit a file-size
                limit. A persistent count here is worth investigating against the storage logs.
              </p>
            )}
          </Panel>

          <Panel
            title="Busiest galleries"
            sub="Ranked by uploads. Scans without uploads usually mean the QR was seen but the upload flow was abandoned."
          >
            {top.length === 0 ? (
              <Empty
                title="No gallery activity yet"
                body="Once a wedding's QR code is scanned and guests upload, the busiest galleries appear here."
              />
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr>
                      <th>Wedding</th>
                      <th>Scans</th>
                      <th>Uploads</th>
                      <th>Conversion</th>
                      <th>Storage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((e) => {
                      const pct = e.scans ? Math.min(100, Math.round((e.uploads / e.scans) * 100)) : null;
                      return (
                        <tr key={e.wedding_id}>
                          <td style={{ overflowWrap: 'anywhere' }}>{e.wedding_id}</td>
                          <td>{n(e.scans)}</td>
                          <td>{n(e.uploads)}</td>
                          <td>{pct === null ? '—' : `${pct}%`}</td>
                          <td>{n(e.storage_mb)} MB</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {d.generated_at && (
            <p style={{ fontSize: 12, color: 'var(--mj-faint)', margin: 0 }}>
              Generated {shortDate(d.generated_at)}
            </p>
          )}
        </>
      )}
    </AdminModule>
  );
}
