import { useCallback, useEffect, useState } from 'react';
import { Hammer, CheckCircle2, User, Phone, MapPin, Calendar, RefreshCw } from '@/components/icons';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import * as studioStore from '@/api/studioStore';
import './StudioOrders.css';

// No exact M12 mock for this page — built on the StudioDashboard shell
// convention (same responsive grid, same card/KPI treatment). Legacy
// reference: frontend/src/pages/AdminBuildQueue.jsx.
//
// Studio build queue — paid, done-for-you orders awaiting build, plus any
// delivered order whose buyer requested a post-delivery edit. build_status
// moves awaiting_payment -> pending_info -> building -> delivered
// (store_features.py); this queue only ever shows pending_info/building/
// edit_requested rows (see GET /api/admin/build-queue).

const STATUS_LABEL = { pending_info: 'Awaiting details', building: 'Ready to build' };
const STATUS_PILL = {
  pending_info: { bg: '#f5f3ff', color: '#6b7280' },
  building: { bg: '#ddd6fe', color: '#2e1065' },
};

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

export default function StudioOrders() {
  const vw = useViewportWidth();
  const isMobile = vw < 900;

  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    studioStore.buildQueue()
      .then(({ data }) => setOrders(data?.orders || []))
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load the build queue.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const markDelivered = async (orderId) => {
    // ponytail: native prompt, matching the legacy admin flow — a modal buys
    // nothing here for a single required field.
    const profileId = window.prompt('Published invitation profile id (or slug) to link:');
    if (!profileId) return;
    setBusyId(orderId);
    try {
      await studioStore.deliverOrder(orderId, profileId);
      setToast('Order marked delivered.');
      load();
    } catch (e) {
      setToast(e?.response?.data?.detail || 'Could not mark this order delivered.');
    } finally {
      setBusyId(null);
    }
  };

  const markEditApplied = async (orderId) => {
    setBusyId(orderId);
    try {
      await studioStore.markEditApplied(orderId);
      setToast('Edit marked as applied.');
      load();
    } catch (e) {
      setToast(e?.response?.data?.detail || 'Could not clear the edit request.');
    } finally {
      setBusyId(null);
    }
  };

  const shellCols = isMobile ? 'minmax(0,1fr)' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const mainPadding = vw < 400 ? '24px 16px' : (isMobile ? '28px 22px' : (vw < 1200 ? '32px 30px' : '40px 48px'));
  const editRequests = orders ? orders.filter((o) => o.edit_requested).length : 0;

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <MobileNav panel="studio" active="Orders" />
      <div style={{
        background: 'radial-gradient(70% 45% at 12% -6%,rgba(124,58,237,.13),transparent 62%),radial-gradient(55% 40% at 96% 2%,rgba(167,139,250,.14),transparent 66%),#ffffff',
        color: '#111827', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols,
      }}>
        {!isMobile && <StudioNav active="Orders" />}

        <main id="main-content" className="storders-main" style={{ padding: mainPadding, minWidth: 0 }} data-testid="studio-orders">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <Hammer size={22} color="#6d28d9" />
            <h1 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 'clamp(26px,4vw,38px)', margin: 0 }}>
              Build <span style={{ color: '#6d28d9', fontStyle: 'italic' }}>queue</span>
            </h1>
            {orders && (
              <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 999, background: 'rgba(109,40,217,.12)', color: '#6d28d9' }}>{orders.length}</span>
            )}
          </div>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 30px' }}>
            {orders ? `Paid orders awaiting build${editRequests ? ` · ${editRequests} edit request${editRequests === 1 ? '' : 's'}` : ''}.` : ' '}
          </p>

          {loading && <ListSkeleton />}

          {!loading && error && (
            <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', textAlign: 'center', padding: '56px 24px' }}>
              <p style={{ fontFamily: "'Spectral',serif", fontSize: 18, margin: '0 0 8px' }}>Couldn&rsquo;t load the build queue.</p>
              <p style={{ fontSize: 13.5, color: '#dc2626', margin: '0 0 18px' }}>{error}</p>
              <button type="button" onClick={load} className="storders-btn" style={{ background: '#6d28d9', color: '#fff', border: 'none', padding: '0 22px', minHeight: 44, borderRadius: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}

          {!loading && !error && orders && orders.length === 0 && (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', textAlign: 'center', padding: '72px 24px' }}>
              <p style={{ fontFamily: "'Spectral',serif", fontSize: 19, margin: 0 }}>No orders yet.</p>
            </div>
          )}

          {!loading && !error && orders && orders.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {orders.map((o) => {
                const info = o.info || {};
                const pill = STATUS_PILL[o.build_status] || STATUS_PILL.pending_info;
                const names = [info.bride_name, info.groom_name].filter(Boolean).join(' & ') || 'Details pending';
                const busy = busyId === o.id;
                return (
                  <div key={o.id} className="storders-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 22 }} data-testid={`order-${o.id}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontFamily: "'Spectral',serif", fontSize: 19 }}>{names}</div>
                        <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 4 }}>
                          {o.design_id ? `Design ${o.design_id} · ` : ''}₹{numberFmt.format(o.amount_inr || 0)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {o.edit_requested && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '5px 11px', borderRadius: 999, background: '#fee2e2', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            Edit requested
                          </span>
                        )}
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '5px 11px', borderRadius: 999, background: pill.bg, color: pill.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          {STATUS_LABEL[o.build_status] || o.build_status}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap: 8, fontSize: 13, color: '#4b5563', marginBottom: 14 }}>
                      <Row icon={<User size={14} />} label="Buyer" v={`${o.buyer?.name || ''}${o.buyer?.email ? ` · ${o.buyer.email}` : ''}` || '—'} />
                      <Row icon={<Phone size={14} />} label="Phone" v={info.phone || o.buyer?.phone || '—'} />
                      <Row icon={<Calendar size={14} />} label="Date" v={info.event_date || '—'} />
                      <Row icon={<MapPin size={14} />} label="Venue" v={`${info.venue || '—'}${info.city ? ` · ${info.city}` : ''}`} />
                    </div>
                    {info.notes && (
                      <div style={{ fontSize: 12.5, marginBottom: 14, padding: '8px 12px', borderRadius: 10, background: '#f5f3ff', color: '#374151' }}>
                        Notes: {info.notes}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {o.edit_requested && (
                        <button type="button" onClick={() => markEditApplied(o.id)} disabled={busy} className="storders-btn2" data-testid={`order-edit-applied-${o.id}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', borderRadius: 12, border: '1px solid #ddd6fe', background: '#fff', color: '#6d28d9', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                          <RefreshCw size={14} /> Mark edit applied
                        </button>
                      )}
                      <button type="button" onClick={() => markDelivered(o.id)} disabled={busy} className="storders-btn" data-testid={`order-deliver-${o.id}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 18px', borderRadius: 12, border: 'none', background: '#6d28d9', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                        <CheckCircle2 size={14} /> Mark delivered
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {toast && <div className="storders-toast" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 18px', borderRadius: 12, fontSize: 13 }}>{toast}</div>}
        </main>
      </div>
    </div>
  );
}

function Row({ icon, label, v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#a78bfa', display: 'inline-flex' }}>{icon}</span>
      <span style={{ color: '#9ca3af' }}>{label}:</span> <span>{v}</span>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 22 }}>
          <div className="storders-skel" style={{ height: 19, width: '38%', borderRadius: 6, marginBottom: 10 }} />
          <div className="storders-skel" style={{ height: 13, width: '58%', borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}
