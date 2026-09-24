/* PendingOrders.jsx — "My Invitations" order + status tracker.
   Shows every paid order with its build status (pending details -> building ->
   delivered). Pending ones jump to the details form; delivered ones open the
   live invitation. Reuses /api/store/my-orders. */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, ArrowRight, Inbox, ExternalLink, Clock, Hammer, CheckCircle2, Copy } from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const abs = (u) => (u && u.startsWith('/') ? `${window.location.origin}${u}` : u);

// build_status -> {label, step (0-3), icon, tone}
const STATUS = {
  pending_info: { label: 'Awaiting your details', step: 1, icon: Clock, tone: '#E8C97A' },
  building: { label: 'Our studio is building it', step: 2, icon: Hammer, tone: '#E8C97A' },
  delivered: { label: 'Delivered', step: 3, icon: CheckCircle2, tone: '#8ae08a' },
};
const STEPS = ['Paid', 'Details', 'Building', 'Delivered'];

export default function PendingOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    axios.get(`${API_URL}/api/store/my-orders`, { withCredentials: true })
      .then(({ data }) => setOrders((data?.orders || []).filter((o) => o.status === 'paid')))
      .catch(() => setOrders([]));
  }, []);

  if (orders === null) return <div className="luxe min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin" style={{ color: '#D4AF37' }} /></div>;

  return (
    <div className="luxe min-h-screen px-6 py-12" data-testid="pending-orders">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="lux-eyebrow mb-2">◆ My invitations</div>
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Your invitations</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>Track every invitation you've bought — enter details, watch it get built, get the link.</p>
        </div>

        {orders.length === 0 ? (
          <div className="lux-glass p-10 text-center" data-testid="pending-empty">
            <Inbox className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--lux-text-faint)' }} />
            <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No invitations yet.</p>
            <button onClick={() => navigate('/designs')} className="lux-btn mt-5">Browse Designs</button>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const st = STATUS[o.build_status] || { label: o.build_status, step: 1, icon: Clock, tone: '#E8C97A' };
              const Icon = st.icon;
              const delivered = o.build_status === 'delivered' && o.live_url;
              return (
                <div key={o.id} className="lux-glass p-5" data-testid={`order-${o.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium" style={{ color: 'var(--lux-text)' }}>{o.design_name || o.design_id || 'Your design'}</div>
                      <div className="text-xs mt-1 flex flex-wrap items-center gap-2" style={{ color: 'var(--lux-text-muted)' }}>
                        {o.package_label && <span>{o.package_label}</span>}
                        <span>₹{Number(o.amount_inr || o.amount || 0).toLocaleString('en-IN')}</span>
                        {o.fulfillment_code && (
                          <span className="flex items-center gap-1 px-1.5 rounded" style={{ background: 'var(--lux-panel)' }}>
                            {o.fulfillment_code}
                            <button onClick={() => navigator.clipboard?.writeText(o.fulfillment_code)} title="Copy code"><Copy className="w-3 h-3" /></button>
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: st.tone }}><Icon className="w-3.5 h-3.5" /> {st.label}</span>
                  </div>

                  {/* status pipeline */}
                  <div className="flex items-center gap-1 mt-4 mb-3">
                    {STEPS.map((label, i) => (
                      <React.Fragment key={label}>
                        <div className="flex-1 h-1 rounded-full" style={{ background: i <= st.step ? 'linear-gradient(90deg,#E8C97A,#D4AF37)' : 'var(--lux-panel)' }} />
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] uppercase tracking-wide mb-3" style={{ color: 'var(--lux-text-faint)' }}>
                    {STEPS.map((label, i) => <span key={label} style={{ color: i <= st.step ? '#E8C97A' : undefined }}>{label}</span>)}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {o.build_status === 'pending_info' && (
                      <button onClick={() => navigate(`/order/${o.id}/details`)} className="lux-btn text-xs" data-testid={`order-enter-${o.id}`}>Enter details <ArrowRight className="w-3.5 h-3.5" /></button>
                    )}
                    {/* While the studio is building it, the buyer can still open
                        their submitted details to view or edit them (until the
                        studio locks the order). */}
                    {o.build_status === 'building' && (
                      <>
                        <button onClick={() => navigate(`/order/${o.id}/details`)} className="lux-btn text-xs" data-testid={`order-editdetails-${o.id}`}>View / edit details <ArrowRight className="w-3.5 h-3.5" /></button>
                        <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>We'll notify you when your link is ready.</span>
                      </>
                    )}
                    {delivered && (
                      <>
                        <a href={abs(o.live_url)} target="_blank" rel="noreferrer" className="lux-btn text-xs" data-testid={`order-view-${o.id}`}>View invitation <ExternalLink className="w-3.5 h-3.5" /></a>
                        <button onClick={() => navigate(`/order/${o.id}/details`)} className="lux-btn lux-btn-ghost text-xs" data-testid={`order-editdetails-${o.id}`}>Edit details</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
