import { useCallback, useEffect, useState } from 'react';
import AdminModule, { Panel, Segmented, Empty, useFlash } from '@/components/AdminModule';
import { Toast, InlineError } from '@/components/WeddingModule';
import ConfirmModal from '@/components/adminpricing/ConfirmModal';
import * as api from '@/api/adminPlatform';
import { THEME_ABBR } from '@/lib/designCode';

// AdminPlatform — super_admin_v2.py's platform settings / homepage CMS /
// theme rollout / coupons / broadcast / login-history. All six had zero
// frontend callers before this page. Real prefix verified against
// build_super_admin_v2_router: /api/super-admin/v2/*.

const TABS = [
  { key: 'settings', label: 'Platform Settings' },
  { key: 'cms', label: 'Homepage CMS' },
  { key: 'themes', label: 'Theme Rollout' },
  { key: 'coupons', label: 'Coupons' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'logins', label: 'Login History' },
];

export default function AdminPlatform() {
  const [tab, setTab] = useState('settings');
  const [toast, flash] = useFlash();

  return (
    <AdminModule
      active="Platform"
      title="Platform"
      sub="Site settings, homepage content, theme visibility, coupons and broadcasts. Everything here is either public-facing or reaches every admin who loads a gated screen — save actions confirm explicitly."
    >
      <Segmented ariaLabel="Section" value={tab} onChange={setTab} options={TABS.map((t) => ({ id: t.key, label: t.label }))} />

      {tab === 'settings' && <SettingsTab flash={flash} />}
      {tab === 'cms' && <CmsTab flash={flash} />}
      {tab === 'themes' && <ThemesTab flash={flash} />}
      {tab === 'coupons' && <CouponsTab flash={flash} />}
      {tab === 'broadcast' && <BroadcastTab flash={flash} />}
      {tab === 'logins' && <LoginHistoryTab />}

      <Toast message={toast} />
    </AdminModule>
  );
}

function diffRows(before, after, fields) {
  return fields
    .filter(([key]) => String(before?.[key] ?? '') !== String(after?.[key] ?? ''))
    .map(([key, label]) => ({ label, from: String(before?.[key] ?? '—'), to: String(after?.[key] ?? '—') }));
}

// --------------------------------------------------------------------------
// Platform settings
// --------------------------------------------------------------------------
const SETTINGS_FIELDS = [
  ['site_name', 'Site name'], ['favicon_url', 'Favicon URL'],
  ['razorpay_mode', 'Razorpay mode'], ['gst_percent', 'GST %'],
  ['support_email', 'Support email'], ['maintenance_mode', 'Maintenance mode'],
  ['maintenance_message', 'Maintenance message'],
];

function SettingsTab({ flash }) {
  const [loaded, setLoaded] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.platformSettings().then((r) => { setLoaded(r.data); setForm(r.data); })
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load platform settings.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openConfirm = (e) => {
    e.preventDefault();
    if (!form.site_name?.trim() || !form.support_email?.trim()) {
      setError('Site name and support email are required.');
      return;
    }
    setError(null);
    const rows = diffRows(loaded, form, SETTINGS_FIELDS);
    if (rows.length === 0) { flash('Nothing changed.'); return; }
    setConfirm({
      title: 'Save platform settings',
      rows,
      danger: rows.some((r) => ['Razorpay mode', 'Maintenance mode'].includes(r.label)),
      note: 'These are read by every page on the platform — razorpay_mode controls whether payments are LIVE or test, and maintenance_mode blocks the public site.',
      run: async () => {
        setBusy(true);
        try {
          await api.savePlatformSettings(form);
          setConfirm(null);
          flash('Platform settings saved.');
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not save platform settings.');
        } finally { setBusy(false); }
      },
    });
  };

  if (!form) return <p className="wmod-hint">Loading…</p>;

  return (
    <>
      <InlineError message={error} />
      <Panel title="Platform settings" sub="A full-replace PUT — every field below is sent back on save, unchanged fields included.">
        <form onSubmit={openConfirm} className="wmod-grid">
          <label className="wmod-field">
            <span className="wmod-label">Site name</span>
            <input className="wmod-input" value={form.site_name || ''} onChange={(e) => setForm({ ...form, site_name: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Favicon URL</span>
            <input className="wmod-input" value={form.favicon_url || ''} onChange={(e) => setForm({ ...form, favicon_url: e.target.value })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Support email</span>
            <input className="wmod-input" type="email" value={form.support_email || ''} onChange={(e) => setForm({ ...form, support_email: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Razorpay mode</span>
            <select className="wmod-input" value={form.razorpay_mode || 'test'} onChange={(e) => setForm({ ...form, razorpay_mode: e.target.value })}>
              <option value="test">test</option>
              <option value="live">live</option>
            </select>
          </label>
          <label className="wmod-field">
            <span className="wmod-label">GST %</span>
            <input className="wmod-input" type="number" min="0" step="0.1" value={form.gst_percent ?? ''} onChange={(e) => setForm({ ...form, gst_percent: Number(e.target.value) })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Default credits for new admins</span>
            <input className="wmod-input" type="number" value={form.default_new_admin_credits ?? 0} onChange={(e) => setForm({ ...form, default_new_admin_credits: Number(e.target.value) })} />
          </label>
          <p className="wmod-hint wmod-field--wide" style={{ margin: '-8px 0 0' }}>
            Credits are permanently retired platform-wide — this field is a dead vestige of the pydantic model with
            no reader anywhere in the codebase. It is kept only because this save replaces the whole settings document.
          </p>
          <label className="wmod-check">
            <input type="checkbox" checked={!!form.maintenance_mode} onChange={(e) => setForm({ ...form, maintenance_mode: e.target.checked })} /> Maintenance mode
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Maintenance message</span>
            <textarea className="wmod-input" value={form.maintenance_message || ''} onChange={(e) => setForm({ ...form, maintenance_message: e.target.value })} />
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <button type="submit" className="wmod-btn wmod-btn--primary">Review & save</button>
          </div>
        </form>
      </Panel>
      {confirm && (
        <ConfirmModal title={confirm.title} rows={confirm.rows} note={confirm.note} danger={confirm.danger} busy={busy}
          confirmLabel="Save settings" onConfirm={confirm.run} onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Homepage CMS
// --------------------------------------------------------------------------
function CmsTab({ flash }) {
  const [form, setForm] = useState(null);
  const [socialText, setSocialText] = useState('');
  const [testimonialsText, setTestimonialsText] = useState('[]');
  const [faqsText, setFaqsText] = useState('[]');
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.homepageCms().then((r) => {
      setForm(r.data);
      setSocialText(Object.entries(r.data.social_links || {}).map(([k, v]) => `${k}=${v}`).join('\n'));
      setTestimonialsText(JSON.stringify(r.data.testimonials || [], null, 2));
      setFaqsText(JSON.stringify(r.data.faqs || [], null, 2));
    }).catch((e) => setError(e?.response?.data?.detail || 'Could not load homepage CMS content.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openConfirm = (e) => {
    e.preventDefault();
    if (!form.hero_headline?.trim()) { setError('The hero headline cannot be empty.'); return; }
    const themes = (form.featured_themes || []);
    if (themes.length > 6) { setError('Featured themes: at most 6 allowed.'); return; }
    let testimonials; let faqs; let social;
    try { testimonials = JSON.parse(testimonialsText); if (!Array.isArray(testimonials)) throw new Error(); } catch { setError('Testimonials must be valid JSON — an array of objects.'); return; }
    try { faqs = JSON.parse(faqsText); if (!Array.isArray(faqs)) throw new Error(); } catch { setError('FAQs must be valid JSON — an array of objects.'); return; }
    social = {};
    for (const line of socialText.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const idx = line.indexOf('=');
      if (idx < 0) { setError(`Social links: "${line}" is not "platform=url".`); return; }
      social[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    setError(null);
    setConfirm({
      title: 'Publish homepage changes',
      rows: [{ label: 'Hero headline', to: form.hero_headline }, { label: 'Promo banner', to: form.promo_banner_active ? `On — "${form.promo_banner_text}"` : 'Off' }],
      note: 'This replaces the live public homepage content the moment it saves — there is no draft/preview step.',
      run: async () => {
        setBusy(true);
        try {
          await api.saveHomepageCms({ ...form, testimonials, faqs, social_links: social });
          setConfirm(null);
          flash('Homepage saved.');
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not save homepage content.');
        } finally { setBusy(false); }
      },
    });
  };

  if (!form) return <p className="wmod-hint">Loading…</p>;

  return (
    <>
      <InlineError message={error} />
      <Panel title="Hero" sub="The top of the public homepage.">
        <form onSubmit={openConfirm} className="wmod-grid">
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Eyebrow</span>
            <input className="wmod-input" value={form.hero_eyebrow || ''} onChange={(e) => setForm({ ...form, hero_eyebrow: e.target.value })} />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Headline</span>
            <input className="wmod-input" value={form.hero_headline || ''} onChange={(e) => setForm({ ...form, hero_headline: e.target.value })} required />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Subheadline</span>
            <textarea className="wmod-input" value={form.hero_subheadline || ''} onChange={(e) => setForm({ ...form, hero_subheadline: e.target.value })} />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Featured theme IDs (comma-separated, max 6)</span>
            <input className="wmod-input" value={(form.featured_themes || []).join(', ')}
              onChange={(e) => setForm({ ...form, featured_themes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder={Object.keys(THEME_ABBR).slice(0, 2).join(', ')}
            />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Pricing blurb</span>
            <input className="wmod-input" value={form.pricing_blurb || ''} onChange={(e) => setForm({ ...form, pricing_blurb: e.target.value })} />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Footer text</span>
            <input className="wmod-input" value={form.footer_text || ''} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Social links — one per line, "platform=url"</span>
            <textarea className="wmod-input" value={socialText} onChange={(e) => setSocialText(e.target.value)} placeholder={'instagram=https://instagram.com/maja\nfacebook=https://facebook.com/maja'} />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Testimonials — JSON array of objects</span>
            <textarea className="wmod-input" style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12.5 }} value={testimonialsText} onChange={(e) => setTestimonialsText(e.target.value)} />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">FAQs — JSON array of objects</span>
            <textarea className="wmod-input" style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12.5 }} value={faqsText} onChange={(e) => setFaqsText(e.target.value)} />
          </label>
          <label className="wmod-check">
            <input type="checkbox" checked={!!form.promo_banner_active} onChange={(e) => setForm({ ...form, promo_banner_active: e.target.checked })} /> Promo banner active
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Promo banner text</span>
            <input className="wmod-input" value={form.promo_banner_text || ''} onChange={(e) => setForm({ ...form, promo_banner_text: e.target.value })} disabled={!form.promo_banner_active} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Promo banner link</span>
            <input className="wmod-input" value={form.promo_banner_link || ''} onChange={(e) => setForm({ ...form, promo_banner_link: e.target.value })} disabled={!form.promo_banner_active} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Promo banner colour</span>
            <input className="wmod-input" type="color" value={form.promo_banner_bg || '#D4AF37'} onChange={(e) => setForm({ ...form, promo_banner_bg: e.target.value })} style={{ height: 46, padding: 4 }} />
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <button type="submit" className="wmod-btn wmod-btn--primary">Review & publish</button>
          </div>
        </form>
      </Panel>
      {confirm && (
        <ConfirmModal title={confirm.title} rows={confirm.rows} note={confirm.note} busy={busy}
          confirmLabel="Publish" onConfirm={confirm.run} onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Theme rollout
// --------------------------------------------------------------------------
const VISIBILITY = ['all', 'silver', 'gold', 'platinum', 'none'];

function ThemesTab({ flash }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ theme_id: '', visible_to: 'all', coming_soon: false });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.themeRollout().then((r) => setRows(r.data?.items || [])).catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load theme rollout.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.theme_id) { setError('Choose a theme first.'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.saveThemeRollout([form]);
      flash(`${form.theme_id} rollout saved.`);
      load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not save that rollout row.');
    } finally { setSaving(false); }
  };

  return (
    <>
      <InlineError message={error} />
      <Panel title="Set a theme's visibility" sub="Controls which subscription tier can see/use a design theme, and whether it shows as 'coming soon'.">
        <form onSubmit={submit} className="wmod-grid">
          <label className="wmod-field">
            <span className="wmod-label">Theme</span>
            <select className="wmod-input" value={form.theme_id} onChange={(e) => setForm({ ...form, theme_id: e.target.value })} required>
              <option value="">Choose…</option>
              {Object.keys(THEME_ABBR).map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Visible to</span>
            <select className="wmod-input" value={form.visible_to} onChange={(e) => setForm({ ...form, visible_to: e.target.value })}>
              {VISIBILITY.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="wmod-check">
            <input type="checkbox" checked={form.coming_soon} onChange={(e) => setForm({ ...form, coming_soon: e.target.checked })} /> Coming soon
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <button type="submit" className="wmod-btn wmod-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save rollout'}</button>
          </div>
        </form>
      </Panel>
      <Panel title="Current rollout rows" pad={false}>
        {rows === null ? <div className="wmod-panel-body"><Empty title="Loading…" /></div>
          : rows.length === 0 ? <div className="wmod-panel-body"><Empty title="No rollout rows yet." body="Every theme is unrestricted (visible to all) until a row exists here for it." /></div>
          : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Theme</th><th>Visible to</th><th>Coming soon</th><th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.theme_id}>
                      <td>{r.theme_id}</td>
                      <td className="wmod-td-muted">{r.visible_to}</td>
                      <td><span className={`wmod-pill ${r.coming_soon ? 'wmod-pill--maybe' : 'wmod-pill--neutral'}`}>{r.coming_soon ? 'Yes' : 'No'}</span></td>
                      <td className="wmod-td-actions">
                        <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => setForm({ theme_id: r.theme_id, visible_to: r.visible_to, coming_soon: !!r.coming_soon })}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
    </>
  );
}

// --------------------------------------------------------------------------
// Coupons
// --------------------------------------------------------------------------
const emptyCoupon = { code: '', discount_type: 'percent', discount_value: '', max_uses: '0', expires_at: '', applies_to: '', active: true };

function CouponsTab({ flash }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(emptyCoupon);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.coupons().then((r) => setRows(r.data?.items || [])).catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load coupons.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const openConfirm = (e) => {
    e.preventDefault();
    if (!form.code.trim() || form.discount_value === '') { setError('A code and a discount value are required.'); return; }
    setError(null);
    const val = Number(form.discount_value) || 0;
    setConfirm({
      title: `Create coupon "${form.code.toUpperCase()}"`,
      rows: [{ label: 'Discount', to: `${val}${form.discount_type === 'percent' ? '%' : ' flat ₹'}` }, { label: 'Max uses', to: form.max_uses === '0' ? 'Unlimited' : form.max_uses }],
      note: 'Consumed at checkout by subscription and marketplace purchases (subscription_service.py / marketplace_service.py).',
      run: async () => {
        setBusy(true);
        try {
          await api.createCoupon({
            code: form.code.trim().toUpperCase(), discount_type: form.discount_type, discount_value: val,
            max_uses: Number(form.max_uses) || 0, expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
            applies_to: form.applies_to.split(',').map((s) => s.trim()).filter(Boolean), active: form.active,
          });
          setForm(emptyCoupon); setConfirm(null);
          flash('Coupon created.');
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not create that coupon.');
        } finally { setBusy(false); }
      },
    });
  };

  const toggle = async (c) => {
    setError(null);
    try { await api.updateCoupon(c.id, { active: !(c.active !== false) }); flash(`${c.code} ${c.active !== false ? 'deactivated' : 'activated'}.`); load(); }
    catch (e2) { setError(e2?.response?.data?.detail || 'Could not update that coupon.'); }
  };
  const remove = async (c) => {
    setError(null);
    try { await api.deleteCoupon(c.id); flash('Coupon deleted.'); load(); }
    catch (e2) { setError(e2?.response?.data?.detail || 'Could not delete that coupon.'); }
  };

  return (
    <>
      <div className="wmod-inline-error" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
        Coupons created here <strong>do</strong> discount at checkout — the field-name mismatch that made every
        coupon worth ₹0 is fixed (both checkouts now resolve the discount through{' '}
        <code>pricing_engine.coupon_discount_paise</code>). Code, active, expiry and max-uses all gate correctly.
        {' '}One limitation remains: <code>applies_to</code> is stored but not yet read by either checkout, so a
        coupon scoped to specific products currently applies to <strong>everything</strong>. Leave it empty
        unless you are tracking intent for later.
      </div>
      <InlineError message={error} />
      <Panel title="New coupon">
        <form onSubmit={openConfirm} className="wmod-grid">
          <label className="wmod-field">
            <span className="wmod-label">Code</span>
            <input className="wmod-input" minLength={3} maxLength={32} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Type</span>
            <select className="wmod-input" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
              <option value="percent">Percent off</option>
              <option value="flat">Flat ₹ off</option>
            </select>
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Value</span>
            <input className="wmod-input" type="number" min="0" max={form.discount_type === 'percent' ? 100 : undefined} value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Max uses (0 = unlimited)</span>
            <input className="wmod-input" type="number" min="0" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Expires</span>
            <input className="wmod-input" type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Applies to (pack IDs, comma-separated; blank = all)</span>
            <input className="wmod-input" value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })} />
          </label>
          <label className="wmod-check">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <button type="submit" className="wmod-btn wmod-btn--primary">Review & create</button>
          </div>
        </form>
      </Panel>
      <Panel title="Coupons" pad={false}>
        {rows === null ? <div className="wmod-panel-body"><Empty title="Loading…" /></div>
          : rows.length === 0 ? <div className="wmod-panel-body"><Empty title="No coupons yet." /></div>
          : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Expires</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>{c.code}</td>
                      <td className="wmod-td-muted">{c.discount_value}{c.discount_type === 'percent' ? '%' : ' flat'}</td>
                      <td className="wmod-td-muted">{c.uses ?? 0}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                      <td className="wmod-td-muted">{c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-IN') : 'Never'}</td>
                      <td><span className={`wmod-pill ${c.active !== false ? 'wmod-pill--yes' : 'wmod-pill--no'}`}>{c.active !== false ? 'Active' : 'Inactive'}</span></td>
                      <td className="wmod-td-actions">
                        <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => toggle(c)}>{c.active !== false ? 'Deactivate' : 'Activate'}</button>{' '}
                        <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" onClick={() => remove(c)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
      {confirm && (
        <ConfirmModal title={confirm.title} rows={confirm.rows} note={confirm.note} busy={busy}
          confirmLabel="Create coupon" onConfirm={confirm.run} onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Broadcast — outward-facing, hard to undo
// --------------------------------------------------------------------------
const emptyBroadcast = { title: '', body: '', link_url: '', link_label: '', audience: 'all', active: true, expires_at: '' };

function BroadcastTab({ flash }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(emptyBroadcast);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.broadcasts().then((r) => setRows(r.data?.items || [])).catch((e) => { setRows([]); setError(e?.response?.data?.detail || 'Could not load broadcasts.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const openConfirm = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { setError('A title and message body are required.'); return; }
    setError(null);
    setConfirm({
      title: 'Send this broadcast',
      rows: [
        { label: 'Title', to: form.title },
        { label: 'Message', to: form.body.length > 120 ? `${form.body.slice(0, 120)}…` : form.body },
        { label: 'Audience field', to: form.audience },
      ],
      danger: true,
      confirmLabel: 'Send broadcast',
      note: 'Verified against the backend: GET /broadcast/active returns every active broadcast to any admin/photographer whose screen polls it, regardless of the audience field above — "audience" is stored but not enforced server-side. As of this build, no page in this frontend actually polls /broadcast/active, so this will currently reach nobody until a screen is wired to show it.',
      run: async () => {
        setBusy(true);
        try {
          await api.createBroadcast({
            title: form.title.trim(), body: form.body.trim(), link_url: form.link_url || null, link_label: form.link_label || null,
            audience: form.audience, active: form.active, expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
          });
          setForm(emptyBroadcast); setConfirm(null);
          flash('Broadcast created.');
          load();
        } catch (e2) {
          setConfirm(null);
          setError(e2?.response?.data?.detail || 'Could not create that broadcast.');
        } finally { setBusy(false); }
      },
    });
  };

  const remove = async (b) => {
    setError(null);
    try { await api.deleteBroadcast(b.id); flash('Broadcast deleted.'); load(); }
    catch (e2) { setError(e2?.response?.data?.detail || 'Could not delete that broadcast.'); }
  };

  return (
    <>
      <InlineError message={error} />
      <Panel title="New broadcast" sub="Currently reaches nobody automatically — see the confirm note before sending.">
        <form onSubmit={openConfirm} className="wmod-grid">
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Title</span>
            <input className="wmod-input" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </label>
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Message</span>
            <textarea className="wmod-input" maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Link URL (optional)</span>
            <input className="wmod-input" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Link label (optional)</span>
            <input className="wmod-input" value={form.link_label} onChange={(e) => setForm({ ...form, link_label: e.target.value })} />
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Audience (stored, not yet enforced)</span>
            <select className="wmod-input" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="all">all</option>
              <option value="active">active</option>
              <option value="new7d">new7d</option>
            </select>
          </label>
          <label className="wmod-field">
            <span className="wmod-label">Expires</span>
            <input className="wmod-input" type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          </label>
          <label className="wmod-check">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <button type="submit" className="wmod-btn wmod-btn--primary">Review & send</button>
          </div>
        </form>
      </Panel>
      <Panel title="Broadcasts" pad={false}>
        {rows === null ? <div className="wmod-panel-body"><Empty title="Loading…" /></div>
          : rows.length === 0 ? <div className="wmod-panel-body"><Empty title="No broadcasts yet." /></div>
          : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Title</th><th>Audience</th><th>Status</th><th>Expires</th><th /></tr></thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id}>
                      <td>{b.title}</td>
                      <td className="wmod-td-muted">{b.audience}</td>
                      <td><span className={`wmod-pill ${b.active ? 'wmod-pill--yes' : 'wmod-pill--no'}`}>{b.active ? 'Active' : 'Inactive'}</span></td>
                      <td className="wmod-td-muted">{b.expires_at ? new Date(b.expires_at).toLocaleDateString('en-IN') : 'No expiry'}</td>
                      <td className="wmod-td-actions"><button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" onClick={() => remove(b)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
      {confirm && (
        <ConfirmModal title={confirm.title} rows={confirm.rows} note={confirm.note} danger={confirm.danger} busy={busy}
          confirmLabel={confirm.confirmLabel} onConfirm={confirm.run} onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Login history
// --------------------------------------------------------------------------
function LoginHistoryTab() {
  const [adminId, setAdminId] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const id = adminId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.loginHistory(id);
      setRows(data?.items || []);
    } catch (e2) {
      setRows(null);
      setError(e2?.response?.data?.detail || 'Could not load login history for that admin ID.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <Panel title="Look up an admin's login history" sub="No code path in the backend currently writes to this collection, so expect an empty result until a login handler starts logging here.">
        <form onSubmit={submit} className="wmod-grid">
          <label className="wmod-field wmod-field--wide">
            <span className="wmod-label">Admin ID</span>
            <input className="wmod-input" value={adminId} onChange={(e) => setAdminId(e.target.value)} placeholder="e.g. admin_a1b2c3" required />
          </label>
          <div className="wmod-field" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <button type="submit" className="wmod-btn wmod-btn--primary" disabled={loading}>{loading ? 'Looking up…' : 'Look up'}</button>
          </div>
        </form>
      </Panel>
      <InlineError message={error} />
      {rows !== null && (
        rows.length === 0 ? <Empty title="No login history recorded for this admin." /> : (
          <Panel title={`${rows.length} record(s)`} pad={false}>
            <div className="wmod-list" style={{ padding: '0 22px' }}>
              {rows.map((r, i) => (
                <div className="wmod-item" key={r.id || i}>
                  <div className="wmod-item-head">
                    <span className="wmod-item-title">{r.ip || r.ip_address || 'Unknown IP'}</span>
                    <span className="wmod-item-meta">{r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : ''}</span>
                  </div>
                  {(r.user_agent || r.device) && <p className="wmod-item-body">{r.user_agent || r.device}</p>}
                </div>
              ))}
            </div>
          </Panel>
        )
      )}
    </>
  );
}
