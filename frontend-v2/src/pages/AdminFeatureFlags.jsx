import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Feature-flag switchboard.
//
// There are TWO stores, and conflating them is a real trap:
//
//   db.feature_flags  — the free-form flags in the first panel, read by the
//                       public /api/feature-flags map.
//   db.app_settings   — the module rollout switches in the second panel. This
//                       is what event_registry.module_enabled() reads.
//
// Creating `ganesh_module_enabled` in the first panel looks like it worked and
// changes nothing: the event engine never reads that collection, so every
// /api/events/* route keeps answering 404. The second panel is the only thing
// that opens that gate, which is why it is here rather than left to a DB write.

// What each rollout switch actually turns on, in the owner's terms.
const MODULE_NOTE = {
  ganesh_module_enabled:
    'The Dynamic Event Engine — Ganesh Chaturthi events, their invitation designs and the public /e/ pages. Off means every /api/events route answers 404.',
  storage_pool_enabled: 'Multi-drive storage pool for studio media.',
  new_pricing_enabled: 'The reworked pricing model.',
};

export default function AdminFeatureFlags() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [newOn, setNewOn] = useState(false);
  const [confirmKey, setConfirmKey] = useState(null);

  const { data, error, loading, reload } = useAsync(() => Promise.all([
    api.featureFlags().then((r) => r.data),
    // Never fail the page on this: the module-flag route lives in the event
    // admin router, which a deployment without that module will not mount.
    api.moduleFlags().then((r) => r.data).catch(() => null),
  ]).then(([flagData, mods]) => ({ ...flagData, __modules: mods })));

  const moduleFlags = data?.__modules?.flags || null;

  const flags = data?.flags || (Array.isArray(data) ? data : Object.entries(data || {}).map(([key, v]) => ({
    key, enabled: typeof v === 'object' ? v.enabled : !!v, ...(typeof v === 'object' ? v : {}),
  })));
  const list = Array.isArray(flags) ? flags : [];

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      setConfirmKey(null);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'The flag did not change.');
    } finally { setBusy(null); }
  };

  const enabledCount = list.filter((f) => f.enabled).length;

  return (
    <AdminModule
      active="Feature flags"
      title="Feature flags"
      sub="These change production behaviour immediately, for everyone. There is no staged rollout — treat every toggle as a deploy."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Flags defined', value: loading ? '—' : numberFmt.format(list.length) },
        { label: 'Enabled', value: loading ? '—' : numberFmt.format(enabledCount) },
        { label: 'Disabled', value: loading ? '—' : numberFmt.format(list.length - enabledCount) },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {moduleFlags && (
            <Panel
              title="Module rollout"
              sub="Whole product modules, off by default. These are stored separately from the flags below — adding a key of the same name there does nothing."
              pad={false}
            >
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr><th>Module</th><th>State</th><th /></tr></thead>
                  <tbody>
                    {Object.entries(moduleFlags).map(([key, on]) => (
                      <tr key={key}>
                        <td>
                          <code style={{ fontSize: 12.5 }}>{key}</code>
                          <br />
                          <span className="wmod-td-muted">{MODULE_NOTE[key] || 'Rollout switch.'}</span>
                        </td>
                        <td><span className={`wmod-pill wmod-pill--${on ? 'yes' : 'neutral'}`}>{on ? 'On' : 'Off'}</span></td>
                        <td className="wmod-td-actions">
                          <button
                            type="button"
                            className={`wmod-btn wmod-btn--sm ${on ? 'wmod-btn--ghost' : 'wmod-btn--primary'}`}
                            disabled={busy === key}
                            onClick={() => run(key, () => api.setModuleFlag(key, !on), `${key} turned ${on ? 'off' : 'on'}.`)}
                          >
                            {busy === key ? 'Saving…' : on ? 'Turn off' : 'Turn on'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel title="Flags" sub="Toggling is immediate and affects live traffic." pad={false}>
            {list.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty title="No flags defined" body="Add one below. A flag that does not exist reads as OFF everywhere in the backend." />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Key</th><th>State</th><th>Updated</th><th /></tr>
                  </thead>
                  <tbody>
                    {list.map((f) => (
                      <tr key={f.key}>
                        <td><code style={{ fontSize: 12.5 }}>{f.key}</code>
                          {f.description && <><br /><span className="wmod-td-muted">{f.description}</span></>}
                        </td>
                        <td>
                          <span className={`wmod-pill wmod-pill--${f.enabled ? 'yes' : 'neutral'}`}>{f.enabled ? 'On' : 'Off'}</span>
                        </td>
                        <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{f.updated_at ? relTime(f.updated_at) : '—'}</td>
                        <td className="wmod-td-actions">
                          <button
                            type="button"
                            className={`wmod-btn wmod-btn--sm ${f.enabled ? 'wmod-btn--ghost' : 'wmod-btn--primary'}`}
                            disabled={busy === f.key}
                            onClick={() => run(f.key, () => api.setFeatureFlag({ key: f.key, enabled: !f.enabled }), `${f.key} turned ${f.enabled ? 'off' : 'on'}.`)}
                          >
                            {busy === f.key ? 'Saving…' : f.enabled ? 'Turn off' : 'Turn on'}
                          </button>
                          {confirmKey === f.key ? (
                            <>
                              <button
                                type="button"
                                className="wmod-btn wmod-btn--danger wmod-btn--sm"
                                style={{ marginLeft: 8 }}
                                disabled={busy === `del-${f.key}`}
                                onClick={() => run(`del-${f.key}`, () => api.deleteFeatureFlag(f.key), `${f.key} deleted.`)}
                              >
                                Confirm delete
                              </button>
                              <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ marginLeft: 6 }} onClick={() => setConfirmKey(null)}>Cancel</button>
                            </>
                          ) : (
                            <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" style={{ marginLeft: 8 }} onClick={() => setConfirmKey(f.key)}>
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Add a flag" sub="Use the exact key the backend reads. A typo creates a second, permanently-off flag rather than an error.">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="wmod-field" style={{ flex: '1 1 260px' }}>
                <label className="wmod-label" htmlFor="flag-key">Flag key</label>
                <input
                  id="flag-key"
                  data-mj-field
                  className="wmod-input"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                  placeholder="storage_pool_enabled"
                />
              </div>
              <label className="wmod-check">
                <input type="checkbox" checked={newOn} onChange={(e) => setNewOn(e.target.checked)} />
                Start enabled
              </label>
              <button
                type="button"
                className="wmod-btn wmod-btn--primary"
                disabled={busy === 'new' || !newKey.trim()}
                onClick={() => run('new', async () => {
                  await api.setFeatureFlag({ key: newKey.trim(), enabled: newOn });
                  setNewKey('');
                  setNewOn(false);
                }, 'Flag created.')}
              >
                {busy === 'new' ? 'Creating…' : 'Add flag'}
              </button>
            </div>
          </Panel>
        </>
      )}

      <Toast message={toast} />
    </AdminModule>
  );
}
