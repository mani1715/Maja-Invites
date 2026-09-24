import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import * as studioApi from '@/api/studio';
import * as pp from '@/api/publicPricing';
import {
  readPricingSelection, clearPricingSelection, selectionTotal,
} from '@/lib/pricingSelection';
import './StudioDashboard.css';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const SHORT_COMPONENT_LABEL = { digital: 'Digital', video: 'Video', physical: 'Physical' };
const tierLabel = (key) => (key ? key[0].toUpperCase() + key.slice(1) : key);

// docs/PRICING_REDESIGN_2026.md §9.8 — the pricing page's invitation stash
// had no consumer in the sign-up funnel. A signed-out studio lands here after
// auth (App.jsx's default post-login route); a one-time check of the stash on
// mount offers to finish the order it started on /pricing. Dismissing or
// starting the order clears the stash, so it never reoffers a stale intent.
function usePendingSuiteOrder() {
  const [selection, setSelection] = useState(() => readPricingSelection());
  const [total, setTotal] = useState(null);

  useEffect(() => {
    if (!selection) return;
    let live = true;
    pp.invitationPlans()
      .then(({ data }) => { if (live) setTotal(selectionTotal(selection, data.tiers)); })
      .catch(() => { /* banner still shows tier + pieces without a total */ });
    return () => { live = false; };
  }, [selection]);

  const dismiss = () => { clearPricingSelection(); setSelection(null); };
  return { selection, total, dismiss };
}

// Ported from "MAJA Studio Dashboard.dc.html".
const STATUS_TABS = ['all', 'published', 'draft', 'archived'];
const TAB_LABEL = { all: 'All', published: 'Published', draft: 'Draft', archived: 'Archived' };
const STATUS_PILL = {
  PUBLISHED: { bg: '#ddd6fe', color: '#2e1065' },
  DRAFT: { bg: '#f5f3ff', color: '#4b5563' },
};

function statusOf(w) {
  if (w.archived_at) return 'Archived';
  if (w.status === 'PUBLISHED' || w.is_published) return 'Published';
  return 'Draft';
}

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

export default function StudioDashboard() {
  const vw = useViewportWidth();
  const isMobile = vw < 900;
  const pendingSuite = usePendingSuiteOrder();

  // Every other studio screen gets its tab title from StudioModule; this page
  // builds its own shell, so it set none and inherited whatever the previous
  // route left behind. The common case is the worst one: sign in, land here,
  // and the tab still reads "Sign in — MAJA Invites" — which is also what a
  // bookmark of the dashboard would be saved as.
  useEffect(() => { document.title = 'Your weddings — MAJA Studio'; }, []);

  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [list, setList] = useState(null); // { items, total, total_pages }
  const [listError, setListError] = useState(null);
  const [listLoading, setListLoading] = useState(true);

  const [kpis, setKpis] = useState(null); // { activeInvitations, qrScans, galleryPhotos }
  const [kpiError, setKpiError] = useState(null);

  useEffect(() => { setPage(1); }, [status]);

  const loadList = useCallback(() => {
    setListLoading(true);
    setListError(null);
    studioApi.listProfiles({ page, page_size: 12, status, sort: 'newest' })
      .then(({ data }) => setList(data))
      .catch((e) => setListError(e?.response?.data?.detail || 'Could not load your weddings.'))
      .finally(() => setListLoading(false));
  }, [page, status]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      studioApi.listProfiles({ page: 1, page_size: 1, status: 'all' }),
      studioApi.insights(90),
    ]).then(([activeRes, insightsRes]) => {
      if (cancelled) return;
      setKpis({
        activeInvitations: activeRes.data.total,
        qrScans: insightsRes.data?.qr?.total_scans ?? 0,
        galleryPhotos: insightsRes.data?.face?.total_photos ?? 0,
      });
    }).catch(() => { if (!cancelled) setKpiError(true); });
    return () => { cancelled = true; };
  }, []);

  const shellCols = isMobile ? 'minmax(0,1fr)' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const mainPadding = vw < 400 ? '24px 16px' : (isMobile ? '28px 22px' : (vw < 1200 ? '32px 30px' : '40px 48px'));
  const kpiCols = vw < 560 ? 'minmax(0,1fr)' : 'repeat(auto-fit,minmax(180px,1fr))';
  const cardCols = vw < 560 ? 'minmax(0,1fr)' : (vw < 1024 ? 'repeat(auto-fit,minmax(240px,1fr))' : 'repeat(auto-fit,minmax(280px,1fr))');

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <MobileNav panel="studio" active="Dashboard" />
      <div style={{
        background: 'radial-gradient(70% 45% at 12% -6%,rgba(124,58,237,.13),transparent 62%),radial-gradient(55% 40% at 96% 2%,rgba(167,139,250,.14),transparent 66%),#ffffff',
        color: '#111827', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols,
      }}>
        {!isMobile && <StudioNav active="Dashboard" />}

        <main id="main-content" className="stdash-main" style={{ padding: mainPadding, minWidth: 0 }}>
          {pendingSuite.selection && (
            <div className="stdash-suite-banner" role="status">
              <span className="stdash-suite-banner-text">
                Finish your invitation order &mdash; {tierLabel(pendingSuite.selection.invitation_tier)} &middot;{' '}
                {pendingSuite.selection.components.map((c) => SHORT_COMPONENT_LABEL[c] || c).join(' + ')}
                {pendingSuite.total != null ? ` · ${inr(pendingSuite.total)}` : ''}
              </span>
              <span className="stdash-suite-banner-actions">
                <Link to="/studio/order/invitation-suite" className="stdash-suite-banner-cta">Finish order</Link>
                <button type="button" onClick={pendingSuite.dismiss} className="stdash-suite-banner-dismiss" aria-label="Dismiss">&times;</button>
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20, marginBottom: 36 }}>
            <div>
              <h1 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 'clamp(26px,4vw,38px)', lineHeight: 1.15, margin: '0 0 6px' }}>
                <span>Your </span><span className="stdash-hl">weddings</span>
              </h1>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
                {list ? `${list.total} invitation${list.total === 1 ? '' : 's'}${status !== 'all' ? ` · ${TAB_LABEL[status].toLowerCase()}` : ''}.` : ' '}
              </p>
            </div>
            {/* Phase 2: events are created by MAJA and assigned to the studio —
                photographers no longer self-create, so no "New wedding" CTA. */}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: 16, marginBottom: 36 }}>
            <KpiTile n="1" label="Active invitations" value={kpis ? numberFmt.format(kpis.activeInvitations) : null} error={kpiError} />
            <KpiTile n="2" label="QR gallery scans (90d)" value={kpis ? numberFmt.format(kpis.qrScans) : null} error={kpiError} />
            <KpiTile n="3" label="Gallery photos" value={kpis ? numberFmt.format(kpis.galleryPhotos) : null} error={kpiError} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            {STATUS_TABS.map((s) => {
              const on = s === status;
              return (
                <button
                  key={s}
                  type="button"
                  className="stdash-filter"
                  onClick={() => setStatus(s)}
                  style={{ padding: '0 18px', minHeight: 44, display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: `1px solid ${on ? '#a78bfa' : '#e5e7eb'}`, background: on ? '#a78bfa' : '#ffffff', color: on ? '#2e1065' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {TAB_LABEL[s]}
                </button>
              );
            })}
          </div>

          {listLoading && <CardGridSkeleton cardCols={cardCols} />}

          {!listLoading && listError && (
            <ErrorCard message={listError} onRetry={loadList} />
          )}

          {!listLoading && !listError && list && list.items.length === 0 && (
            <EmptyCard status={status} />
          )}

          {!listLoading && !listError && list && list.items.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: cardCols, gap: 20 }}>
                {list.items.map((w) => {
                  const st = statusOf(w);
                  const pill = STATUS_PILL[st === 'Published' ? 'PUBLISHED' : 'DRAFT'];
                  const names = [w.bride_name, w.groom_name].filter(Boolean).join(' & ') || 'Untitled wedding';
                  const dateStr = w.event_date ? new Date(w.event_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD';
                  return (
                    <Link
                      key={w.id}
                      className="stdash-card"
                      to={`/studio/wedding/${w.id}`}
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, overflow: 'hidden' }}
                    >
                      <div style={{ aspectRatio: '16/10', background: 'repeating-linear-gradient(45deg, #ede9fe 0 2px, transparent 2px 11px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6d28d9', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' }}>
                        {w.event_type || 'wedding'}
                      </div>
                      <div style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 10 }}>
                          <h3 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 17, margin: 0, minWidth: 0 }}>{names}</h3>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, background: pill.bg, color: pill.color, whiteSpace: 'nowrap' }}>{st}</span>
                        </div>
                        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>{dateStr}{w.city ? ` · ${w.city}` : ''}</p>
                        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{numberFmt.format(w.view_count || 0)} views</p>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {list.total_pages > 1 && (
                <div className="stdash-pager" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 32 }}>
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                    style={{ minHeight: 44, padding: '0 18px', borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Prev
                  </button>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>Page {list.page} of {list.total_pages}</span>
                  <button type="button" onClick={() => setPage((p) => Math.min(list.total_pages, p + 1))} disabled={page >= list.total_pages}
                    style={{ minHeight: 44, padding: '0 18px', borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function KpiTile({ n, label, value, error }) {
  return (
    <div className="stdash-tile stdash-glass" data-n={n} style={{ borderRadius: 20, padding: '22px 22px', animationDelay: `${(Number(n) - 1) * 0.08}s` }}>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px', letterSpacing: '.04em' }}>{label}</p>
      {error ? (
        <p style={{ fontFamily: "'Spectral',serif", fontSize: 15, margin: 0, color: '#9ca3af' }}>Unavailable</p>
      ) : value === null ? (
        <div className="stdash-skel" style={{ height: 30, width: '58%', borderRadius: 8 }} />
      ) : (
        <p style={{ fontFamily: "'Spectral',serif", fontSize: 'clamp(26px,6vw,30px)', margin: 0, color: '#2e1065' }}>{value}</p>
      )}
    </div>
  );
}

function CardGridSkeleton({ cardCols }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cardCols, gap: 20 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, overflow: 'hidden' }}>
          <div className="stdash-skel" style={{ aspectRatio: '16/10' }} />
          <div style={{ padding: '18px 20px' }}>
            <div className="stdash-skel" style={{ height: 17, width: '70%', borderRadius: 6, marginBottom: 10 }} />
            <div className="stdash-skel" style={{ height: 13, width: '45%', borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', textAlign: 'center', padding: '56px 24px' }}>
      <p style={{ fontFamily: "'Spectral',serif", fontSize: 18, color: '#111827', margin: '0 0 8px' }}>Couldn&rsquo;t load your weddings.</p>
      <p style={{ fontSize: 13.5, color: '#dc2626', margin: '0 0 18px' }}>{message}</p>
      <button type="button" onClick={onRetry} className="stdash-btn" style={{ background: '#6d28d9', color: '#fff', border: 'none', padding: '0 22px', minHeight: 44, borderRadius: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
        Try again
      </button>
    </div>
  );
}

function EmptyCard({ status }) {
  const isAll = status === 'all';
  const msg = isAll ? 'No weddings yet.' : `No ${TAB_LABEL[status].toLowerCase()} weddings.`;
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', textAlign: 'center', padding: '72px 24px' }}>
      <p style={{ fontFamily: "'Spectral',serif", fontSize: 19, color: '#111827', margin: 0 }}>{msg}</p>
      {isAll && (
        <p style={{ fontSize: 13.5, color: '#6b7280', margin: '10px auto 0', maxWidth: '46ch', lineHeight: 1.65 }}>
          Your MAJA team creates events and assigns them to your studio &mdash; they
          appear here automatically. Nothing to set up.
        </p>
      )}
    </div>
  );
}
