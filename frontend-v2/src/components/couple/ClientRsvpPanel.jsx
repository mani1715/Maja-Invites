import { useCallback, useEffect, useState } from 'react';
import { clientRsvpExport, clientRsvpStats, clientRsvps } from '@/lib/clientAuth';

// GET /api/client/rsvps?status=  -> { rsvps: [...] }
// GET /api/client/rsvps/stats    -> { total_rsvps, attending_count, not_attending_count, maybe_count, total_guest_count }
// GET /api/client/rsvps/export   -> StreamingResponse, text/csv, Content-Disposition attachment
// (photographer_clients.py ~331-372). Export is a plain blob download, same
// pattern the legacy ClientDashboard used — this is the real app, not a
// sandboxed artifact, so a blob URL + synthetic <a download> is fine here.

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'yes', label: 'Attending' },
  { id: 'no', label: 'Not attending' },
  { id: 'maybe', label: 'Maybe' },
];

function Stat({ label, value }) {
  return (
    <div className="cap-card" style={{ padding: '16px 18px' }}>
      <p style={{ fontSize: 11.5, color: '#c4b5fd', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontFamily: "'Spectral',serif", fontSize: 'clamp(20px,2.2vw,24px)', margin: 0 }}>{value}</p>
    </div>
  );
}

export default function ClientRsvpPanel() {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let live = true;
    clientRsvpStats().then(({ data }) => { if (live) setStats(data); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, []);

  const load = useCallback((status) => {
    setRows(null);
    clientRsvps(status || undefined)
      .then(({ data }) => setRows(data.rsvps || []))
      .catch(() => { setErr(true); setRows([]); });
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await clientRsvpExport();
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'rsvps.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (_e) { /* quiet — button just stays available to retry */ }
    setExporting(false);
  };

  if (err && !stats && rows === null) {
    return <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>RSVPs aren&rsquo;t available for this invitation right now.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div data-mj-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
        <Stat label="Total RSVPs" value={stats?.total_rsvps ?? '—'} />
        <Stat label="Attending" value={stats?.attending_count ?? '—'} />
        <Stat label="Guests coming" value={stats?.total_guest_count ?? '—'} />
        <Stat label="Maybe" value={stats?.maybe_count ?? '—'} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div role="group" aria-label="Filter RSVPs by status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`cap-btn ${filter === f.id ? 'cap-btn-solid' : 'cap-btn-outline'}`}
              style={{ minHeight: 40, padding: '0 16px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting || !rows?.length}
          className="cap-btn cap-btn-outline"
          style={{ minHeight: 40, padding: '0 18px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {rows === null ? (
        <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>Loading RSVPs…</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>No RSVPs {filter ? 'in this category' : 'yet'}.</p>
      ) : (
        <div className="cap-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 480 }}>
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Guest RSVPs</caption>
            <thead>
              <tr style={{ textAlign: 'left', color: '#c4b5fd', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                <th scope="col" style={{ padding: '14px 16px' }}>Guest</th>
                <th scope="col" style={{ padding: '14px 16px' }}>Status</th>
                <th scope="col" style={{ padding: '14px 16px' }}>Guests</th>
                <th scope="col" style={{ padding: '14px 16px' }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || i} style={{ borderTop: '1px solid rgba(196,181,253,.14)' }}>
                  <td style={{ padding: '12px 16px' }}>{r.guest_name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      fontSize: 11.5, padding: '3px 10px', borderRadius: 999,
                      background: r.status === 'yes' ? 'rgba(74,222,128,.16)' : r.status === 'no' ? 'rgba(248,113,113,.16)' : 'rgba(229,169,60,.16)',
                      color: r.status === 'yes' ? '#86efac' : r.status === 'no' ? '#fca5a5' : '#e5a93c',
                    }}>
                      {r.status === 'yes' ? 'Attending' : r.status === 'no' ? 'Not attending' : 'Maybe'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{r.guest_count ?? 1}</td>
                  <td style={{ padding: '12px 16px', color: '#c4b5fd' }}>{r.message || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
