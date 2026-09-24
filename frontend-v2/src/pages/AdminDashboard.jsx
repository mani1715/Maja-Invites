import { useEffect, useState } from 'react';
import AdminNav from '@/components/nav/AdminNav';
import * as adminApi from '@/api/admin';
import { CreateStudioPanel, StudioStatusSelect } from '@/components/admin/StudioLifecycle';
import AuditLogPanel from '@/components/admin/AuditLogPanel';
import './AdminDashboard.css';

// Super-admin console. Deep management (pricing hub, disputes, fulfillment)
// still lives in the legacy /super-admin/* console — see the Operations
// note card below. This page used to be pure read-only (a platform-health
// snapshot); it now also owns the one thing a read-only console can't do:
// acting on a studio account (create / block / reactivate) and a
// platform-wide activity feed.
function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

const numberFmt = new Intl.NumberFormat('en-IN');
const MAX_ROWS = 20;

export default function AdminDashboard() {
  const vw = useViewportWidth();
  const isMobile = vw < 900;

  const [admins, setAdmins] = useState(null); // photographer accounts
  const [userTotal, setUserTotal] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adminApi.listPhotographers(),
      adminApi.listUsers({ limit: 200 }),
    ]).then(([adminsRes, usersRes]) => {
      if (cancelled) return;
      setAdmins(adminsRes.data || []);
      setUserTotal(usersRes.data?.count ?? (usersRes.data?.users || []).length);
    }).catch((e) => {
      if (!cancelled) setError(e?.response?.data?.detail || 'Could not load the console.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const photographers = admins || [];
  const activeStudios = photographers.filter((a) => a.status === 'active').length;
  const shownRows = photographers.slice(0, MAX_ROWS);
  const moreCount = photographers.length - shownRows.length;

  const shellCols = isMobile ? 'minmax(0,1fr)' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const mainPadding = vw < 400 ? '24px 16px' : (isMobile ? '28px 22px' : (vw < 1200 ? '32px 30px' : '40px 48px'));
  const kpiCols = vw < 560 ? 'minmax(0,1fr)' : 'repeat(auto-fit,minmax(180px,1fr))';

  return (
    <div style={{ fontFamily: 'var(--mj-font-body)' }}>
      <div style={{ background: 'var(--mj-bg)', color: 'var(--mj-ink)', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols }}>
        {!isMobile && <AdminNav active="Console" />}

        <main id="main-content" className="admdash-main" style={{ padding: mainPadding, minWidth: 0 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 400, fontSize: 'clamp(26px,4vw,38px)', lineHeight: 1.15, margin: '0 0 6px' }}>
              Platform <span className="admdash-hl">console</span>
            </h1>
            <p style={{ fontSize: 14, color: 'var(--mj-muted)', margin: 0 }}>Photographers, studios and users, at a glance.</p>
          </div>

          {error && (
            <div className="admdash-card" style={{ borderColor: 'var(--mj-error)', textAlign: 'center', padding: '40px 24px', marginBottom: 32 }}>
              <p style={{ fontFamily: 'var(--mj-font-display)', fontSize: 17, color: 'var(--mj-ink)', margin: '0 0 6px' }}>Couldn&rsquo;t load the console.</p>
              <p style={{ fontSize: 13.5, color: 'var(--mj-error-text)', margin: 0 }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: 16, marginBottom: 36 }}>
            <StatTile label="Photographers" value={loading ? null : numberFmt.format(photographers.length)} />
            <StatTile label="Active studios" value={loading ? null : numberFmt.format(activeStudios)} />
            <StatTile label="Normal users" value={loading || userTotal === null ? null : numberFmt.format(userTotal)} />
          </div>

          <section style={{ marginBottom: 32 }}>
            <CreateStudioPanel onCreated={(newAdmin) => setAdmins((list) => [newAdmin, ...(list || [])])} />
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 500, fontSize: 20, margin: '0 0 14px' }}>Photographers</h2>
            <div className="admdash-card" style={{ overflowX: 'auto', minWidth: 0 }}>
              {loading ? (
                <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>Loading…</p>
              ) : shownRows.length === 0 ? (
                <p style={{ padding: 24, margin: 0, color: 'var(--mj-muted)', fontSize: 13.5 }}>No photographers yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Email</Th>
                      <Th>Status</Th>
                      <Th>Created</Th>
                      <Th>Change status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.map((a) => (
                      <tr key={a.id} style={{ borderTop: '1px solid var(--mj-border)' }}>
                        <Td>{a.name || a.email}</Td>
                        <Td muted>{a.email}</Td>
                        <Td><StatusPill status={a.status} /></Td>
                        <Td muted>{a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</Td>
                        <Td>
                          <StudioStatusSelect
                            studio={a}
                            onChanged={(updated) => setAdmins((list) => (list || []).map((x) => (x.id === updated.id ? updated : x)))}
                          />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {moreCount > 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--mj-faint)', margin: '10px 2px 0' }}>+{moreCount} more</p>
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 500, fontSize: 20, margin: '0 0 14px' }}>Platform activity</h2>
            <AuditLogPanel />
          </section>

        </main>
      </div>
    </div>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="admdash-card admdash-tile" style={{ padding: '22px 22px' }}>
      <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 10px', letterSpacing: '.04em' }}>{label}</p>
      {value === null ? (
        <div className="admdash-skel" style={{ height: 30, width: '58%', borderRadius: 8 }} />
      ) : (
        <p style={{ fontFamily: 'var(--mj-font-display)', fontSize: 'clamp(26px,6vw,30px)', margin: 0, color: 'var(--mj-ink-deep)' }}>{value}</p>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const on = status === 'active';
  return (
    <span style={{
      fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
      background: on ? 'var(--mj-border-accent)' : 'var(--mj-section)',
      color: on ? 'var(--mj-ink-deep)' : 'var(--mj-muted)',
    }}>
      {status || 'active'}
    </span>
  );
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mj-muted)', whiteSpace: 'nowrap' }}>{children}</th>;
}

function Td({ children, muted }) {
  return <td style={{ padding: '12px 16px', color: muted ? 'var(--mj-muted)' : 'var(--mj-ink)', whiteSpace: 'nowrap' }}>{children}</td>;
}
