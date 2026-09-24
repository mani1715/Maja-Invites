import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, InlineError, useAsync, Loading, ErrorPanel,
  numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// User investigation. The backend has cross-referenced devices, logins, IPs,
// payments, subscriptions, reports and moderation history all along; the v2
// console had no screen for it, and /super-admin/investigation redirected to
// the dashboard — which resolved the URL without restoring the capability.
//
// Contract (user_investigation.py):
//   GET /investigation/search?q&limit
//       -> { results: [{ id, kind, name, email, phone, status }] }
//   GET /investigation/subject/{kind}/{id}
//       -> { subject, counts{}, devices[], login_history[], failed_logins[],
//            otp_failures[], ip_history[], payments[], subscriptions[],
//            reports_filed[], moderation_actions[] }   (404 if unknown)
//
// `kind` is photographer | user. The `user` side only ever returns legacy
// rows — normal accounts are retired — but old records still matter when
// investigating a historic dispute, so both are shown.

const n = (v) => numberFmt.format(Number(v) || 0);

const SECTIONS = [
  ['devices', 'Devices', (r) => [r.device_name || r.user_agent || 'Unknown device', r.ip, r.last_active]],
  ['login_history', 'Successful logins', (r) => [r.ip || 'Unknown IP', r.user_agent, r.created_at]],
  ['failed_logins', 'Failed logins', (r) => [r.ip || 'Unknown IP', r.reason || r.email, r.created_at]],
  ['otp_failures', 'OTP failures', (r) => [r.ip || 'Unknown IP', r.email || r.phone, r.created_at]],
  ['ip_history', 'IP addresses', (r) => [r.ip, `${n(r.count)} events`, r.last_seen]],
  ['payments', 'Payments', (r) => [r.order_id || r.id, r.amount_inr ? `₹${n(r.amount_inr)}` : r.status, r.created_at]],
  ['subscriptions', 'Subscriptions', (r) => [r.plan || r.product || r.id, r.status, r.created_at]],
  ['reports_filed', 'Reports they filed', (r) => [r.target_type || 'Report', r.reason, r.created_at]],
  ['moderation_actions', 'Actions taken against them', (r) => [r.action || 'Action', r.actor_id, r.created_at]],
];

export default function AdminInvestigation() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [subject, setSubject] = useState(null);   // { kind, id, name }

  const search = useAsync(
    () => (applied
      ? api.investigationSearch(applied).then((r) => r.data)
      : Promise.resolve({ results: [] })),
    [applied],
  );

  const report = useAsync(
    () => (subject
      ? api.investigationSubject(subject.kind, subject.id).then((r) => r.data)
      : Promise.resolve(null)),
    [subject ? `${subject.kind}:${subject.id}` : ''],
  );

  const results = search.data?.results || [];
  const rep = report.data;
  const counts = rep?.counts || {};

  return (
    <AdminModule
      active="Investigation"
      title="Investigation"
      sub="Everything the platform knows about one account, in one place — sign-ins, devices, IP addresses, money and moderation history."
    >
      <Panel title="Find a subject" sub="Search photographers and legacy user records by name, email, phone or id.">
        <form
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: results.length ? 16 : 0 }}
          onSubmit={(e) => { e.preventDefault(); setSubject(null); setApplied(q.trim()); }}
        >
          <input
            className="wmod-input"
            style={{ flex: '1 1 260px' }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email, phone or id"
            aria-label="Search subjects"
          />
          <button type="submit" className="wmod-btn wmod-btn--primary" disabled={!q.trim()}>Search</button>
        </form>

        <InlineError message={search.error} />
        {applied && search.loading && <Loading rows={2} />}

        {applied && !search.loading && !search.error && (
          results.length === 0 ? (
            <Empty title={`Nothing matches “${applied}”`} body="Try an email address or the account id." />
          ) : (
            <ul className="wmod-list">
              {results.map((r) => {
                const active = subject && subject.kind === r.kind && subject.id === r.id;
                return (
                  <li className="wmod-item" key={`${r.kind}:${r.id}`}>
                    <div className="wmod-item-head">
                      <span className="wmod-item-title">{r.name || r.email || r.id}</span>
                      <span className="wmod-item-actions">
                        <span className={`wmod-pill wmod-pill--${r.status === 'active' ? 'yes' : 'maybe'}`}>
                          {r.kind}
                        </span>
                        <button
                          type="button"
                          className={`wmod-btn wmod-btn--sm ${active ? 'wmod-btn--primary' : 'wmod-btn--ghost'}`}
                          onClick={() => setSubject({ kind: r.kind, id: r.id, name: r.name })}
                        >
                          {active ? 'Viewing' : 'Investigate'}
                        </button>
                      </span>
                    </div>
                    <p className="wmod-item-body">
                      {[r.email, r.phone, r.status, r.id].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </Panel>

      {subject && report.loading && <Loading />}
      {subject && report.error && <ErrorPanel message={report.error} onRetry={report.reload} />}

      {subject && !report.loading && !report.error && rep && (
        <>
          <StatRow items={[
            { label: 'Devices', value: n(counts.devices) },
            { label: 'Logins', value: n(counts.logins) },
            { label: 'Failed logins', value: n(counts.failed_logins) },
            { label: 'Unique IPs', value: n(counts.unique_ips) },
            { label: 'Payments', value: n(counts.payments) },
            { label: 'Actions against', value: n(counts.moderation_actions) },
          ]}
          />

          {SECTIONS.map(([key, label, cells]) => {
            const rows = rep[key] || [];
            return (
              <Panel
                key={key}
                title={label}
                sub={`${n(rows.length)} record${rows.length === 1 ? '' : 's'}`}
              >
                {rows.length === 0 ? <Empty title="Nothing recorded." /> : (
                  <ul className="wmod-list">
                    {rows.map((r, i) => {
                      const [head, detail, when] = cells(r);
                      return (
                        <li className="wmod-item" key={r.id || `${key}-${i}`}>
                          <div className="wmod-item-head">
                            <span className="wmod-item-title">{head || '—'}</span>
                            {when && <span className="wmod-item-meta">{relTime(when)}</span>}
                          </div>
                          {detail && <p className="wmod-item-body">{detail}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            );
          })}
        </>
      )}
    </AdminModule>
  );
}
