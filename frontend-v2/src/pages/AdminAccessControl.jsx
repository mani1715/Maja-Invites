import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt,
} from '@/components/AdminModule';
import MfaPanel from '@/components/admin/MfaPanel';
import * as api from '@/api/adminOps';

// Access control. `/super-admin/security` redirected to system health, so the
// RBAC catalogue — which roles exist and what each can actually do — had no
// screen. Reading it matters before you hand somebody a role.
//
// Contract (admin_security.py):
//   GET  /admin/rbac/catalogue -> { permissions: [...], roles: { role: [perm] } }
//   GET  /admin/rbac/me        -> { role, permissions: [...] }
//   POST /admin/rbac/assign    body { admin_id, role }   (super-admin only)
//   MFA: GET /admin/mfa/status, POST /enroll/start|/enroll/verify|/disable
//        — built below in <MfaPanel />.
//
// Impersonation (`POST /admin/impersonate`) is still deliberately NOT wired
// up, and this time it's not a "hasn't been done yet" — it was evaluated and
// rejected. The backend half is fine: it mints a short-lived (30 min),
// audit-logged token carrying an `imp` claim, gated by a required reason.
// The problem is entirely on this side of the fence, and it's structural:
//   - The app keeps exactly one Bearer identity, in localStorage.admin_token,
//     shared by every open tab (@/api/client.js) and mirrored into React
//     state by AuthContext. There is no second, scoped slot to hold an
//     impersonation session next to the super-admin's own.
//   - Swapping that token to "become" the target studio flips admin.role
//     away from super_admin. RequireSuperAdmin (components/RouteGuards.jsx)
//     redirects anything that isn't super_admin off of /admin/* the next
//     time it re-checks — which happens on any reload, and on navigation
//     once AuthContext.refresh() is called. That lands the impersonating
//     super-admin on /studio/* pages this task does not own.
//   - A "stop impersonating" control only helps if it's visible from wherever
//     that redirect lands, and stays visible across a reload. That requires
//     a banner mounted above the router (App.jsx) or inside the Studio*
//     shell — both explicitly out of scope for this task ("Do NOT touch
//     App.jsx... or any Studio* page — others own them").
// Wiring the mint button without that anchor produces exactly the failure
// mode the brief warns against: a super-admin who clicks it, then reloads or
// follows a link, and is stuck looking at a studio's dashboard with no way
// back short of clearing localStorage by hand. Shipping MFA now; impersonation
// needs a persistent cross-route banner owned at the App shell level before
// it can be wired safely — that's a follow-up for whoever owns App.jsx.

const n = (v) => numberFmt.format(Number(v) || 0);

export default function AdminAccessControl() {
  const [assign, setAssign] = useState({ admin_id: '', role: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.rbacCatalogue().then((r) => r.data),
      api.rbacMe().then((r) => r.data).catch(() => null),
    ]).then(([cat, me]) => ({ cat, me })),
  );

  const roles = data?.cat?.roles || {};
  const permissions = data?.cat?.permissions || [];
  const me = data?.me || {};
  const roleNames = Object.keys(roles);

  const submit = async (e) => {
    e.preventDefault();
    if (!assign.admin_id.trim() || !assign.role) return;
    setBusy(true);
    setErr(null);
    try {
      await api.rbacAssign(assign.admin_id.trim(), assign.role);
      flash(`Role set to ${assign.role}.`);
      setAssign({ admin_id: '', role: '' });
      await reload();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not assign that role.');
    } finally { setBusy(false); }
  };

  return (
    <AdminModule
      active="Access control"
      title="Access control"
      sub="Which roles exist, exactly what each one can do, and who holds them. Check here before granting anybody access."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <StatRow items={[
            { label: 'Roles', value: n(roleNames.length) },
            { label: 'Permissions', value: n(permissions.length) },
            { label: 'Your role', value: me.role || '—' },
          ]}
          />

          {me.role && (
            <Panel title="What you can do" sub={`Your account holds the ${me.role} role.`}>
              {(me.permissions || []).length === 0 ? <Empty title="No permissions listed." /> : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {me.permissions.map((p) => (
                    <span className="wmod-pill wmod-pill--yes" key={p}>{p}</span>
                  ))}
                </div>
              )}
            </Panel>
          )}

          <MfaPanel />

          {roleNames.length === 0 ? (
            <Panel><Empty title="No roles defined." /></Panel>
          ) : roleNames.map((role) => (
            <Panel
              key={role}
              title={role}
              sub={`${n((roles[role] || []).length)} of ${n(permissions.length)} permissions`}
              actions={role === me.role ? <span className="wmod-pill wmod-pill--yes">You</span> : null}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {permissions.map((p) => {
                  const has = (roles[role] || []).includes(p);
                  return (
                    <span
                      className={`wmod-pill wmod-pill--${has ? 'yes' : 'no'}`}
                      key={p}
                      style={has ? undefined : { opacity: 0.55 }}
                    >
                      {has ? '' : '✕ '}{p}
                    </span>
                  );
                })}
              </div>
            </Panel>
          ))}

          <Panel
            title="Assign a role"
            sub="Super-admin only. Changing a role takes effect on the account's next request — it does not revoke a token already in flight."
          >
            <InlineError message={err} />
            <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="wmod-field" style={{ flex: '1 1 240px' }}>
                <label className="wmod-label" htmlFor="rbac-admin">Admin id</label>
                <input
                  id="rbac-admin"
                  className="wmod-input"
                  value={assign.admin_id}
                  onChange={(e) => setAssign((a) => ({ ...a, admin_id: e.target.value }))}
                  placeholder="The account's id, not their email"
                />
              </div>
              <div className="wmod-field" style={{ flex: '0 0 200px' }}>
                <label className="wmod-label" htmlFor="rbac-role">Role</label>
                <select
                  id="rbac-role"
                  className="wmod-input"
                  value={assign.role}
                  onChange={(e) => setAssign((a) => ({ ...a, role: e.target.value }))}
                >
                  <option value="">Choose…</option>
                  {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button
                type="submit"
                className="wmod-btn wmod-btn--primary"
                disabled={busy || !assign.admin_id.trim() || !assign.role}
              >
                {busy ? 'Assigning…' : 'Assign role'}
              </button>
            </form>
          </Panel>
        </>
      )}

      <Toast message={toast} />
    </AdminModule>
  );
}
