import { useEffect, useState } from 'react';
import StudioModule, {
  Panel, Toast, InlineError, useFlash, useAsync, Loading, ErrorPanel,
} from '@/components/StudioModule';
import * as api from '@/api/studioOps';

// White-label branding. Plan-gated server-side; if the studio is not entitled
// the GET comes back with enabled:false and this page says so plainly rather
// than showing a form that will 403 on save.

const FIELDS = [
  ['brand_name', 'Studio name', 'Shown instead of "MAJA Invites" on your clients\' pages.'],
  ['logo_url', 'Logo URL', 'A transparent PNG or SVG works best.'],
  ['support_email', 'Support email', 'Where your couples write when they need help.'],
  ['website_url', 'Website', 'Linked from the invitation footer.'],
];

export default function StudioWhiteLabel() {
  const [toast, flash] = useFlash();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const { data, error, loading, reload } = useAsync(
    () => api.whiteLabel().then((r) => r.data),
  );

  useEffect(() => { if (data) setForm(data); }, [data]);

  const entitled = data?.enabled !== false && data?.entitled !== false;
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErr(null); };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const { data: saved } = await api.saveWhiteLabel(form);
      setForm(saved?.white_label || saved || form);
      flash('Branding saved.');
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not save your branding.');
    } finally { setSaving(false); }
  };

  return (
    <StudioModule
      active="White label"
      title="Branding"
      sub="Put your studio's name on the invitations you deliver, instead of ours."
    >
      {loading && <Loading rows={1} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && !entitled && (
        <Panel title="Not on your plan yet">
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--mj-muted)', margin: '0 0 16px', maxWidth: '62ch' }}>
            White-label branding is part of the higher studio plans. Your couples
            currently see MAJA branding in the invitation footer. Upgrading swaps
            it for yours on every link you have already delivered, not just new
            ones.
          </p>
          <a className="wmod-btn wmod-btn--primary" href="/studio/plans">See plans</a>
        </Panel>
      )}

      {!loading && !error && entitled && form && (
        <>
          <InlineError message={err} />
          <Panel title="Your brand">
            <div className="wmod-grid">
              {FIELDS.map(([key, label, hint]) => (
                <div className="wmod-field" key={key}>
                  <label className="wmod-label" htmlFor={`wl-${key}`}>{label}</label>
                  <input
                    id={`wl-${key}`}
                    data-mj-field
                    className="wmod-input"
                    value={form[key] || ''}
                    onChange={(e) => set(key, e.target.value)}
                    inputMode={key.endsWith('_url') ? 'url' : undefined}
                    type={key === 'support_email' ? 'email' : 'text'}
                  />
                  <p className="wmod-hint">{hint}</p>
                </div>
              ))}
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="wl-accent">Accent colour</label>
                <input
                  id="wl-accent"
                  type="color"
                  className="wmod-input"
                  style={{ padding: 4, height: 46 }}
                  value={form.accent_color || '#6D28D9'}
                  onChange={(e) => set('accent_color', e.target.value)}
                />
                <p className="wmod-hint">Used for buttons and links on your invitations.</p>
              </div>
            </div>

            <label className="wmod-check" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={!!form.hide_maja_branding}
                onChange={(e) => set('hide_maja_branding', e.target.checked)}
              />
              Hide &ldquo;Built with MAJA&rdquo; from the invitation footer
            </label>

            <button type="button" className="wmod-btn wmod-btn--primary" style={{ marginTop: 18 }} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save branding'}
            </button>
          </Panel>

          <Panel title="Preview">
            <div style={{
              border: '1px solid var(--mj-border)', borderRadius: 'var(--mj-radius-card-inner)',
              padding: 20, background: 'var(--mj-section)', textAlign: 'center',
            }}
            >
              {form.logo_url ? (
                <img src={form.logo_url} alt={`${form.brand_name || 'Studio'} logo`} style={{ maxHeight: 48, margin: '0 auto 12px' }} />
              ) : (
                <p style={{ fontFamily: 'var(--mj-font-display)', fontSize: 20, margin: '0 0 8px', color: form.accent_color || 'var(--mj-primary)' }}>
                  {form.brand_name || 'Your studio'}
                </p>
              )}
              <p style={{ fontSize: 12.5, color: 'var(--mj-muted)', margin: 0 }}>
                {form.hide_maja_branding
                  ? `Photographs and invitation by ${form.brand_name || 'your studio'}`
                  : `Photographs by ${form.brand_name || 'your studio'} · Built with MAJA`}
              </p>
            </div>
          </Panel>
        </>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
