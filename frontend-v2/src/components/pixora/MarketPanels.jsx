import { useState } from 'react';
import * as api from '@/api/pixora';
import { adminUploadImage } from '@/api/studio';
import {
  Section, Stats, Empty, Loading, ErrorNote, Rows, Pill, Toast, Field, Segments,
  PlanGate, useAsync, useFlash, inr,
} from './PixoraShell';

// Marketplace — Marketplace · Upgrades · Brand Deals · Resources · Presets · Templates.
//
// Two different money surfaces sit in this group and they are not the same
// thing: `/api/pixora/marketplace` is studios selling to each other, while
// `/api/monetization/*` is the platform selling storage, featured placement and
// verification. Resources / Presets / Templates are filtered views over the
// first — they were never separate features, and inventing separate storage for
// them would have been a fabrication.

const num = new Intl.NumberFormat('en-IN');
const LISTING_KINDS = ['preset', 'template', 'overlay', 'guide'];

function money(amount, currency = 'INR') {
  if (!currency || currency === 'INR') return inr(amount);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 })
      .format(Number(amount) || 0);
  } catch { return `${currency} ${num.format(amount || 0)}`; }
}

// ════════════════════════════════════════════════════════════ Marketplace

export function Marketplace() {
  const [tab, setTab] = useState('browse');
  return (
    <>
      <Segments
        value={tab}
        onChange={setTab}
        options={[['browse', 'Browse'], ['sell', 'Sell'], ['purchases', 'My purchases']]}
      />
      {tab === 'browse' && <Listings />}
      {tab === 'sell' && <SellResource />}
      {tab === 'purchases' && <Purchases />}
    </>
  );
}

/** Shared browser. `kind` narrows it to one type — that is all Resources,
 *  Presets and Templates are. */
export function Listings({ kind, title, sub }) {
  const { data, error, loading, reload } = useAsync(() => api.marketplace().then((r) => r.data));
  const [seller, setSeller] = useState('');
  const [openReviews, setOpenReviews] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();

  const all = data?.listings || [];
  const byKind = kind ? all.filter((l) => l.kind === kind) : all;
  const rows = seller ? byKind.filter((l) => l.seller === seller) : byKind;
  const paid = data?.payments_configured;

  const buy = async (id) => {
    setBusy(id);
    try {
      const { data: res } = await api.buyListing(id);
      if (res.status === 'payment_pending') flash(res.message || 'Payment is not configured yet.');
      else if (res.file_url || res.status === 'purchased') flash('Purchased — the download is under My purchases.');
      else flash(res.message || 'Order created.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not complete that.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      {paid === false && (
        <Section title="Payments are not live yet">
          <p className="pxc-rowbody" style={{ marginTop: 0 }}>
            Buying a paid resource records the order, but the download only unlocks once payments are
            configured. Free resources work normally.
          </p>
        </Section>
      )}

      <Section
        title={title || 'Resources for sale'}
        sub={sub || 'Presets, templates, overlays and guides made by other studios.'}
        actions={seller ? (
          <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => setSeller('')}>
            Clear storefront: {seller}
          </button>
        ) : null}
        flush
      >
        <div style={{ padding: 18 }}>
          {rows.length === 0 ? (
            <Empty title={`No ${kind ? `${kind}s` : 'resources'} listed yet`} body="When a studio publishes one it appears here immediately." />
          ) : (
            <div className="pxc-grid">
              {rows.map((it) => (
                <div className="pxc-card" key={it.id}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <Pill tone="accent">{it.kind}</Pill>
                    <span className="pxc-stat-value" style={{ fontSize: 17 }}>
                      {it.price_inr > 0 ? inr(it.price_inr) : 'Free'}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="pxc-card-title">{it.title}</span>
                    {it.is_featured && <Pill tone="warn">Featured</Pill>}
                  </span>
                  <span className="pxc-card-meta">
                    by{' '}
                    <button
                      type="button"
                      className="pxc-chip"
                      style={{ minHeight: 0, padding: '0 6px', border: 'none', color: 'var(--mj-primary)' }}
                      onClick={() => setSeller(it.seller)}
                    >
                      {it.seller}
                    </button>
                    {` · ${num.format(it.sales || 0)} sold`}
                    {it.rating_count > 0 ? ` · ${Number(it.rating_avg).toFixed(1)}★ (${it.rating_count})` : ' · no ratings yet'}
                  </span>
                  {it.description && <span className="pxc-card-meta">{it.description}</span>}
                  <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" disabled={busy === it.id} onClick={() => buy(it.id)}>
                      {busy === it.id ? 'Working…' : it.price_inr > 0 ? 'Buy' : 'Get it'}
                    </button>
                    <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => setOpenReviews(openReviews === it.id ? null : it.id)}>
                      Reviews
                    </button>
                  </span>
                  {openReviews === it.id && <ListingReviews id={it.id} onRated={reload} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
      <Toast message={toast} />
    </>
  );
}

function ListingReviews({ id, onRated }) {
  const { data, error, loading, reload } = useAsync(() => api.listingReviews(id).then((r) => r.data));
  const [form, setForm] = useState({ rating: 5, body: '' });
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();
  const rows = data?.reviews || [];

  const send = async () => {
    setBusy(true);
    try {
      await api.reviewListing(id, { rating: Number(form.rating), body: form.body });
      setForm({ rating: 5, body: '' });
      flash('Thanks — your review is live.');
      reload();
      onRated?.();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not post that review.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--mj-border)', paddingTop: 12 }}>
      <ErrorNote message={error} onRetry={reload} />
      {loading ? <Loading rows={1} /> : (
        <>
          <div className="pxc-inline" style={{ marginBottom: 10 }}>
            <select
              className="pxc-input"
              style={{ flex: '0 0 90px' }}
              value={form.rating}
              onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
              aria-label="Rating"
            >
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}
            </select>
            <input
              className="pxc-input"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="How was it?"
              aria-label="Review"
            />
            <button type="button" className="pxc-btn pxc-btn--ghost" onClick={send} disabled={busy}>Post</button>
          </div>
          <Rows
            rows={rows}
            empty="No reviews yet — only buyers can leave one."
            render={(r) => (
              <>
                <div className="pxc-rowline">
                  <span className="pxc-rowmain">{r.author || 'A studio'}</span>
                  <span className="pxc-rowmeta">{r.rating}★</span>
                </div>
                {r.body && <p className="pxc-rowbody">{r.body}</p>}
              </>
            )}
          />
        </>
      )}
      <Toast message={toast} />
    </div>
  );
}

function SellResource() {
  const [f, setF] = useState({ title: '', kind: 'preset', price_inr: '', description: '' });
  const [fileUrl, setFileUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState('');
  const [busy, setBusy] = useState(false);
  const [lock, setLock] = useState('');
  const [toast, flash] = useFlash();

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const upload = async (which, file) => {
    if (!file) return;
    setUploading(which);
    try {
      const { data } = await adminUploadImage(file, 'marketplace');
      if (which === 'file') setFileUrl(data?.url || '');
      else setPreviewUrl(data?.url || '');
      flash('Uploaded.');
    } catch { flash('Upload failed.'); }
    finally { setUploading(''); }
  };

  const create = async () => {
    if (!f.title.trim()) { flash('Give the listing a title.'); return; }
    setBusy(true);
    try {
      await api.createListing({
        ...f,
        price_inr: Number(f.price_inr) || 0,
        file_url: fileUrl || null,
        preview_url: previewUrl || null,
      });
      setF({ title: '', kind: 'preset', price_inr: '', description: '' });
      setFileUrl('');
      setPreviewUrl('');
      flash('Listing published.');
    } catch (e) {
      if (e?.response?.status === 403) setLock(e.response.data?.detail || '');
      else flash(e?.response?.data?.detail || 'Could not publish that listing.');
    } finally { setBusy(false); }
  };

  if (lock) return <Section title="Sell a resource"><PlanGate what="Selling on the marketplace" message={lock} /></Section>;

  return (
    <>
      <Section title="Sell a resource" sub="Presets, templates, overlays and guides. Uploads count against your storage.">
        <div className="pxc-formgrid">
          <Field label="Title" htmlFor="ml-title" wide>
            <input id="ml-title" className="pxc-input" value={f.title} onChange={set('title')} placeholder="Warm wedding preset pack" />
          </Field>
          <Field label="Kind" htmlFor="ml-kind">
            <select id="ml-kind" className="pxc-input" value={f.kind} onChange={set('kind')}>
              {LISTING_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Price (₹)" htmlFor="ml-price" hint="0 lists it as free.">
            <input id="ml-price" className="pxc-input" type="number" min="0" value={f.price_inr} onChange={set('price_inr')} />
          </Field>
          <Field label="Preview image" htmlFor="ml-prev" hint={uploading === 'preview' ? 'Uploading…' : previewUrl ? 'Uploaded.' : 'What buyers see first.'}>
            <input id="ml-prev" className="pxc-input" type="file" accept="image/*" onChange={(e) => upload('preview', e.target.files?.[0])} />
          </Field>
          <Field label="The file itself" htmlFor="ml-file" hint={uploading === 'file' ? 'Uploading…' : fileUrl ? 'Uploaded.' : 'Delivered to buyers after purchase.'}>
            <input id="ml-file" className="pxc-input" type="file" onChange={(e) => upload('file', e.target.files?.[0])} />
          </Field>
          <Field label="Description" htmlFor="ml-desc" wide>
            <textarea id="ml-desc" className="pxc-input" rows={3} value={f.description} onChange={set('description')} />
          </Field>
          <div className="pxc-field pxc-field--wide">
            <button type="button" className="pxc-btn pxc-btn--primary" onClick={create} disabled={busy || !!uploading}>
              {busy ? 'Publishing…' : 'Publish listing'}
            </button>
          </div>
        </div>
      </Section>
      <Toast message={toast} />
    </>
  );
}

function Purchases() {
  const { data, error, loading, reload } = useAsync(() => api.myPurchases().then((r) => r.data));
  const rows = data?.purchases || [];
  if (loading) return <Loading rows={2} />;
  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section title="My purchases" sub="Everything you have bought from other studios.">
        <Rows
          rows={rows}
          empty="You have not bought anything yet."
          render={(p) => (
            <div className="pxc-rowline">
              <span style={{ minWidth: 0 }}>
                <span className="pxc-rowmain">{p.title || 'Resource'}</span>
                <p className="pxc-rowbody">
                  {[p.kind, p.seller, p.amount_inr > 0 ? inr(p.amount_inr) : 'Free'].filter(Boolean).join(' · ')}
                </p>
              </span>
              {p.file_url ? (
                <a className="pxc-btn pxc-btn--ghost pxc-btn--sm" href={p.file_url} target="_blank" rel="noreferrer">Download</a>
              ) : (
                <Pill tone={p.status === 'payment_pending' ? 'warn' : 'neutral'}>
                  {p.status === 'payment_pending' ? 'Payment pending' : p.status || '—'}
                </Pill>
              )}
            </div>
          )}
        />
      </Section>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════ Upgrades

const CATEGORY_LABELS = {
  storage: 'More storage',
  featured_photographer: 'Featured placement',
  verification: 'Paid verification',
  featured_listing: 'Featured listing',
};

export function Upgrades() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.monetizationCatalog().then((r) => r.data),
      api.myUpgrades().then((r) => r.data).catch(() => null),
    ]).then(([cat, mine]) => ({ cat, mine })),
  );
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();

  const catalog = data?.cat?.catalog || {};
  const configured = data?.cat?.payments_configured;
  const orders = data?.mine?.orders || [];
  const ent = data?.mine?.entitlements || {};

  const buy = async (sku) => {
    setBusy(sku);
    try {
      const { data: res } = await api.purchaseUpgrade(sku);
      flash(res.message || 'Order created.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not start that purchase.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Stats items={[
        { label: 'Bonus storage', value: `${num.format(ent.storage_bonus_gb || 0)} GB` },
        { label: 'Featured', value: ent.featured ? 'Active' : 'No' },
        { label: 'Orders', value: num.format(orders.length) },
      ]}
      />

      {configured === false && (
        <Section title="Payments are not live yet">
          <p className="pxc-rowbody" style={{ marginTop: 0 }}>
            You can place an order now and it will be recorded, but the upgrade only activates once
            payments are configured. Nothing is charged in the meantime.
          </p>
        </Section>
      )}

      {Object.entries(catalog).map(([category, items]) => (
        <Section key={category} title={CATEGORY_LABELS[category] || category}>
          <div className="pxc-grid">
            {(items || []).map((it) => (
              <div className="pxc-card" key={it.sku}>
                <span className="pxc-card-title">{it.label}</span>
                <span className="pxc-stat-value" style={{ fontSize: 20 }}>{inr(it.price_inr)}</span>
                {it.placements && <span className="pxc-card-meta">Shown on: {it.placements.join(', ')}</span>}
                {it.days && <span className="pxc-card-meta">{it.days} days</span>}
                <button
                  type="button"
                  className="pxc-btn pxc-btn--primary pxc-btn--sm"
                  style={{ marginTop: 6 }}
                  disabled={busy === it.sku}
                  onClick={() => buy(it.sku)}
                >
                  {busy === it.sku ? 'Working…' : 'Buy'}
                </button>
              </div>
            ))}
          </div>
        </Section>
      ))}

      {orders.length > 0 && (
        <Section title="Your orders">
          <Rows
            rows={orders}
            render={(o) => (
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{o.item?.label || o.sku}</span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className="pxc-rowmeta">{inr(o.amount_inr)}</span>
                  <Pill tone={o.status === 'active' ? 'good' : o.status === 'payment_pending' ? 'warn' : 'neutral'}>
                    {String(o.status || '').replace('_', ' ')}
                  </Pill>
                </span>
              </div>
            )}
          />
        </Section>
      )}
      <Toast message={toast} />
    </>
  );
}

// ════════════════════════════════════════════════════════════ Brand Deals

const CAMPAIGN_CATEGORIES = ['photography', 'videography', 'reels', 'editing', 'mixed'];
const CAMPAIGN_BLANK = {
  title: '', brief: '', category: 'photography', deliverables_spec: '',
  region: '', country: '', budget_amount: '', budget_currency: 'INR', slots: 1, deadline: '',
};

export function BrandDeals({ myId }) {
  const [view, setView] = useState('browse');
  return (
    <>
      <Segments
        value={view}
        onChange={setView}
        options={[['browse', 'Open campaigns'], ['mine', 'My deals'], ['post', 'Post a campaign'], ['brand', 'Brand profile']]}
      />
      {view === 'browse' && <CampaignBrowse />}
      {view === 'mine' && <MyDeals myId={myId} />}
      {view === 'post' && <PostCampaign onDone={() => setView('mine')} />}
      {view === 'brand' && <BrandProfile />}
    </>
  );
}

function CampaignBrowse() {
  const [filt, setFilt] = useState({ category: '', country: '', region: '', q: '' });
  const [applied, setApplied] = useState(filt);
  const [openId, setOpenId] = useState(null);

  const { data, error, loading, reload } = useAsync(
    () => api.campaigns(Object.fromEntries(Object.entries(applied).filter(([, v]) => v))).then((r) => r.data),
    [applied],
  );

  const rows = data?.campaigns || [];
  const facets = data?.facets || {};
  const set = (k) => (e) => setFilt((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title="Open brand campaigns" sub="Paid work posted by brands looking for photographers and video teams.">
        <form className="pxc-inline" onSubmit={(e) => { e.preventDefault(); setApplied(filt); }}>
          <input className="pxc-input" value={filt.q} onChange={set('q')} placeholder="Search campaigns…" aria-label="Search campaigns" />
          <select className="pxc-input" style={{ flex: '0 0 170px' }} value={filt.category} onChange={set('category')} aria-label="Category">
            <option value="">Any category</option>
            {(facets.categories || CAMPAIGN_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="pxc-input" style={{ flex: '0 0 160px' }} value={filt.country} onChange={set('country')} aria-label="Country">
            <option value="">Any country</option>
            {(facets.countries || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" className="pxc-btn pxc-btn--primary">Search</button>
        </form>
      </Section>

      {loading ? <Loading rows={2} /> : (
        <Section title={`${rows.length} open`} flush>
          <div style={{ padding: 18 }}>
            {rows.length === 0 ? (
              <Empty title="No campaigns match" body="Brands post here when they need creators. Widening the filters usually helps." />
            ) : (
              <Rows
                rows={rows}
                render={(c) => (
                  <>
                    <div className="pxc-rowline">
                      <span className="pxc-rowmain">{c.title}</span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Pill tone="accent">{c.category}</Pill>
                        <span className="pxc-rowmeta">{money(c.budget_amount, c.budget_currency)}</span>
                      </span>
                    </div>
                    <p className="pxc-rowbody">
                      {[c.brand_name, [c.region, c.country].filter(Boolean).join(', '),
                        c.slots ? `${c.slots} slot${c.slots === 1 ? '' : 's'}` : null,
                        c.deadline ? `apply by ${c.deadline}` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {c.brief && <p className="pxc-rowbody">{c.brief}</p>}
                    {c.deliverables_spec && <p className="pxc-rowbody">Deliverables: {c.deliverables_spec}</p>}
                    {openId === c.id ? (
                      <ApplyForm campaignId={c.id} currency={c.budget_currency} onDone={() => { setOpenId(null); reload(); }} />
                    ) : (
                      <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" style={{ marginTop: 8 }} onClick={() => setOpenId(c.id)}>
                        Apply
                      </button>
                    )}
                  </>
                )}
              />
            )}
          </div>
        </Section>
      )}
    </>
  );
}

function ApplyForm({ campaignId, currency, onDone }) {
  const [f, setF] = useState({ pitch: '', quote_amount: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.applyToCampaign(campaignId, {
        pitch: f.pitch,
        quote_amount: Number(f.quote_amount) || 0,
        quote_currency: currency || 'INR',
      });
      onDone();
    } catch (e) { setErr(e?.response?.data?.detail || 'Could not send that application.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <ErrorNote message={err} />
      <div className="pxc-inline">
        <input
          className="pxc-input"
          value={f.pitch}
          onChange={(e) => setF((p) => ({ ...p, pitch: e.target.value }))}
          placeholder="Why you, in one line"
          aria-label="Your pitch"
        />
        <input
          className="pxc-input"
          style={{ flex: '0 0 140px' }}
          type="number"
          min="0"
          value={f.quote_amount}
          onChange={(e) => setF((p) => ({ ...p, quote_amount: e.target.value }))}
          placeholder={`Quote (${currency || 'INR'})`}
          aria-label="Your quote"
        />
        <button type="button" className="pxc-btn pxc-btn--primary" onClick={send} disabled={busy}>
          {busy ? 'Sending…' : 'Send application'}
        </button>
      </div>
    </div>
  );
}

function MyDeals() {
  const { data, error, loading, reload } = useAsync(() => api.myCampaigns().then((r) => r.data));
  const [openId, setOpenId] = useState(null);

  const asBrand = data?.as_brand || [];
  const asCreator = data?.as_creator || [];

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title="Campaigns you posted" sub="Review applications and sign off deliverables.">
        <Rows
          rows={asBrand}
          empty="You have not posted a campaign yet."
          render={(c) => (
            <>
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{c.title}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Pill tone={c.status === 'closed' ? 'neutral' : 'good'}>{c.status || 'open'}</Pill>
                  <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                    {openId === c.id ? 'Hide' : 'Applications'}
                  </button>
                </span>
              </div>
              <p className="pxc-rowbody">
                {[money(c.budget_amount, c.budget_currency), c.slots ? `${c.slots} slots` : null, c.deadline].filter(Boolean).join(' · ')}
              </p>
              {openId === c.id && <CampaignApplications campaign={c} onChange={reload} />}
            </>
          )}
        />
      </Section>

      <Section title="Campaigns you applied to" sub="Once accepted, submit your deliverables here.">
        <Rows
          rows={asCreator}
          empty="No applications yet."
          render={(a) => (
            <>
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{a.title || a.campaign_title || 'Campaign'}</span>
                <Pill tone={a.status === 'accepted' ? 'good' : a.status === 'rejected' ? 'bad' : 'warn'}>
                  {a.status || 'pending'}
                </Pill>
              </div>
              {a.pitch && <p className="pxc-rowbody">{a.pitch}</p>}
              {a.status === 'accepted' && a.application_id && (
                <DeliverableForm applicationId={a.application_id} onDone={reload} />
              )}
            </>
          )}
        />
      </Section>
    </>
  );
}

function CampaignApplications({ campaign, onChange }) {
  const { data, error, loading, reload } = useAsync(() => api.campaignApplications(campaign.id).then((r) => r.data));
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();
  const rows = data?.applications || [];

  const decide = async (aid, decision) => {
    setBusy(aid);
    try {
      await api.decideApplication(aid, decision);
      flash(decision === 'accepted' ? 'Accepted.' : 'Rejected.');
      reload();
      onChange?.();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not record that decision.'); }
    finally { setBusy(null); }
  };

  const close = async () => {
    if (!window.confirm('Close this campaign to new applications?')) return;
    try { await api.closeCampaign(campaign.id); flash('Campaign closed.'); onChange?.(); }
    catch (e) { flash(e?.response?.data?.detail || 'Could not close it.'); }
  };

  if (loading) return <Loading rows={1} />;

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--mj-border)', paddingTop: 12 }}>
      <ErrorNote message={error} onRetry={reload} />
      <Rows
        rows={rows}
        empty="No applications yet."
        render={(a) => (
          <>
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{a.studio_name || 'A studio'}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="pxc-rowmeta">{money(a.quote_amount, a.quote_currency)}</span>
                {a.status === 'pending' ? (
                  <>
                    <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" disabled={busy === a.id} onClick={() => decide(a.id, 'accepted')}>Accept</button>
                    <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" disabled={busy === a.id} onClick={() => decide(a.id, 'rejected')}>Reject</button>
                  </>
                ) : (
                  <Pill tone={a.status === 'accepted' ? 'good' : 'bad'}>{a.status}</Pill>
                )}
              </span>
            </div>
            {a.pitch && <p className="pxc-rowbody">{a.pitch}</p>}
          </>
        )}
      />
      <CampaignDeliverables campaignId={campaign.id} />
      {campaign.status !== 'closed' && (
        <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" style={{ marginTop: 12 }} onClick={close}>
          Close campaign
        </button>
      )}
      <Toast message={toast} />
    </div>
  );
}

function CampaignDeliverables({ campaignId }) {
  const { data, loading, reload } = useAsync(() => api.campaignDeliverables(campaignId).then((r) => r.data));
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();
  const rows = data?.deliverables || [];

  const review = async (id, status) => {
    setBusy(id);
    try { await api.reviewDeliverable(id, { status }); flash('Recorded.'); reload(); }
    catch (e) { flash(e?.response?.data?.detail || 'Could not record that.'); }
    finally { setBusy(null); }
  };

  if (loading || rows.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <p className="pxc-label">Deliverables</p>
      <Rows
        rows={rows}
        render={(d) => (
          <>
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{d.title}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {d.status === 'submitted' ? (
                  <>
                    <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" disabled={busy === d.id} onClick={() => review(d.id, 'approved')}>Approve</button>
                    <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" disabled={busy === d.id} onClick={() => review(d.id, 'revision')}>Ask for changes</button>
                  </>
                ) : <Pill tone={d.status === 'approved' ? 'good' : 'warn'}>{d.status}</Pill>}
              </span>
            </div>
            {d.url && <p className="pxc-rowbody"><a href={d.url} target="_blank" rel="noreferrer">Open deliverable</a></p>}
            {d.note && <p className="pxc-rowbody">{d.note}</p>}
          </>
        )}
      />
      <Toast message={toast} />
    </div>
  );
}

function DeliverableForm({ applicationId, onDone }) {
  const [f, setF] = useState({ title: '', url: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    if (!f.title.trim()) { setErr('Give the deliverable a title.'); return; }
    setBusy(true);
    setErr('');
    try {
      await api.submitDeliverable(applicationId, f);
      setF({ title: '', url: '', note: '' });
      onDone?.();
    } catch (e) { setErr(e?.response?.data?.detail || 'Could not submit that.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <ErrorNote message={err} />
      <div className="pxc-inline">
        <input className="pxc-input" value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} placeholder="Deliverable title" aria-label="Deliverable title" />
        <input className="pxc-input" type="url" value={f.url} onChange={(e) => setF((p) => ({ ...p, url: e.target.value }))} placeholder="Link" aria-label="Deliverable link" />
        <button type="button" className="pxc-btn pxc-btn--primary" onClick={send} disabled={busy}>
          {busy ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

function PostCampaign({ onDone }) {
  const [f, setF] = useState(CAMPAIGN_BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const create = async () => {
    if (!f.title.trim()) { setErr('Give the campaign a title.'); return; }
    setBusy(true);
    setErr('');
    try {
      await api.createCampaign({
        ...f,
        budget_amount: Number(f.budget_amount) || 0,
        slots: Number(f.slots) || 1,
      });
      setF(CAMPAIGN_BLANK);
      onDone?.();
    } catch (e) { setErr(e?.response?.data?.detail || 'Could not post that campaign.'); }
    finally { setBusy(false); }
  };

  return (
    <Section title="Post a campaign" sub="Describe the work, the budget and how many creators you need.">
      <ErrorNote message={err} />
      <div className="pxc-formgrid">
        <Field label="Title" htmlFor="cp-title" wide>
          <input id="cp-title" className="pxc-input" value={f.title} onChange={set('title')} />
        </Field>
        <Field label="Category" htmlFor="cp-cat">
          <select id="cp-cat" className="pxc-input" value={f.category} onChange={set('category')}>
            {CAMPAIGN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Slots" htmlFor="cp-slots" hint="How many creators you will accept.">
          <input id="cp-slots" className="pxc-input" type="number" min="1" value={f.slots} onChange={set('slots')} />
        </Field>
        <Field label="Budget" htmlFor="cp-budget">
          <input id="cp-budget" className="pxc-input" type="number" min="0" value={f.budget_amount} onChange={set('budget_amount')} />
        </Field>
        <Field label="Currency" htmlFor="cp-ccy">
          <input id="cp-ccy" className="pxc-input" value={f.budget_currency} onChange={set('budget_currency')} />
        </Field>
        <Field label="Country" htmlFor="cp-country"><input id="cp-country" className="pxc-input" value={f.country} onChange={set('country')} /></Field>
        <Field label="Region" htmlFor="cp-region"><input id="cp-region" className="pxc-input" value={f.region} onChange={set('region')} /></Field>
        <Field label="Apply by" htmlFor="cp-deadline">
          <input id="cp-deadline" className="pxc-input" type="date" value={f.deadline} onChange={set('deadline')} />
        </Field>
        <Field label="Brief" htmlFor="cp-brief" wide>
          <textarea id="cp-brief" className="pxc-input" rows={3} value={f.brief} onChange={set('brief')} />
        </Field>
        <Field label="Deliverables" htmlFor="cp-deliv" wide hint="Be specific — this is what you will review against.">
          <textarea id="cp-deliv" className="pxc-input" rows={2} value={f.deliverables_spec} onChange={set('deliverables_spec')} />
        </Field>
        <div className="pxc-field pxc-field--wide">
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={create} disabled={busy}>
            {busy ? 'Posting…' : 'Post campaign'}
          </button>
        </div>
      </div>
    </Section>
  );
}

function BrandProfile() {
  const { data, error, loading, reload } = useAsync(() => api.myBrand().then((r) => r.data));
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const mine = data?.brand || null;
  const form = f ?? {
    name: mine?.name || '', logo_url: mine?.logo_url || '', website: mine?.website || '',
    about: mine?.about || '', industry: mine?.industry || '', country: mine?.country || '',
  };
  const set = (k) => (e) => setF({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.name.trim()) { flash('A brand needs a name.'); return; }
    setBusy(true);
    try {
      await api.saveBrand(form);
      flash('Brand profile saved.');
      setF(null);
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not save that.'); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading rows={2} />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section title="Brand profile" sub="Needed before you can post campaigns — creators see this when deciding whether to apply.">
        <div className="pxc-formgrid">
          <Field label="Brand name" htmlFor="br-name"><input id="br-name" className="pxc-input" value={form.name} onChange={set('name')} /></Field>
          <Field label="Industry" htmlFor="br-ind"><input id="br-ind" className="pxc-input" value={form.industry} onChange={set('industry')} /></Field>
          <Field label="Website" htmlFor="br-web"><input id="br-web" className="pxc-input" type="url" value={form.website} onChange={set('website')} /></Field>
          <Field label="Country" htmlFor="br-country"><input id="br-country" className="pxc-input" value={form.country} onChange={set('country')} /></Field>
          <Field label="Logo URL" htmlFor="br-logo" wide><input id="br-logo" className="pxc-input" type="url" value={form.logo_url} onChange={set('logo_url')} /></Field>
          <Field label="About" htmlFor="br-about" wide>
            <textarea id="br-about" className="pxc-input" rows={3} value={form.about} onChange={set('about')} />
          </Field>
          <div className="pxc-field pxc-field--wide">
            <button type="button" className="pxc-btn pxc-btn--primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : mine ? 'Update brand' : 'Create brand profile'}
            </button>
          </div>
        </div>
      </Section>
      <Toast message={toast} />
    </>
  );
}

// Resources / Presets / Templates — filtered views over the same listings.
export const Resources = () => <Listings kind="guide" title="Resources" sub="Guides and written resources sold by other studios." />;
export const Presets = () => <Listings kind="preset" title="Presets" sub="Colour and edit presets made by other studios." />;
export const Templates = () => <Listings kind="template" title="Templates" sub="Album, deck and social templates." />;
