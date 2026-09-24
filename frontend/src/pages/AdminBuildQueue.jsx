import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Hammer, ArrowLeft, CheckCircle2, User, Phone, MapPin, Calendar } from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const getAuth = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/**
 * Studio build queue — paid orders awaiting the done-for-you build. The
 * photographer reads the buyer's submitted wedding details, builds the
 * invitation via the normal builder, then marks the order delivered with the
 * published profile id.
 */
const AdminBuildQueue = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/build-queue`, { headers: getAuth() });
      setOrders(data?.orders || []);
    } catch (_e) { setOrders([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markDelivered = async (orderId) => {
    const profileId = window.prompt('Published invitation profile id (or slug) to link:');
    if (!profileId) return;
    await axios.post(`${API_URL}/api/admin/build-queue/${orderId}/deliver`, { profile_id: profileId }, { headers: getAuth() });
    load();
  };

  return (
    <div className="luxe min-h-screen px-6 py-10" data-testid="admin-build-queue">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate('/studio/dashboard')} className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--lux-text-muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <div className="flex items-center gap-3 mb-8">
          <Hammer className="w-6 h-6 text-gold" />
          <h1 className="font-display text-3xl md:text-4xl" style={{ color: 'var(--lux-text)' }}>Build <span className="font-script italic text-gold">queue</span></h1>
          <span className="ml-2 text-sm px-3 py-1 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#D4AF37' }}>{orders.length}</span>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>Loading…</p>
        ) : orders.length === 0 ? (
          <div className="lux-glass p-10 text-center">
            <p className="text-sm" style={{ color: 'var(--lux-text)' }}>No paid orders awaiting build.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {orders.map((o) => {
              const info = o.info || {};
              return (
                <div key={o.id} className="lux-glass p-6" data-testid={`bq-order-${o.id}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>
                        {info.bride_name || '—'} <span className="text-gold">&amp;</span> {info.groom_name || '—'}
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                        Design: {o.design_id} · ₹{Number(o.amount_inr || 0).toLocaleString('en-IN')} · {o.build_status}
                      </div>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider"
                      style={{ background: o.build_status === 'building' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)', color: o.build_status === 'building' ? '#D4AF37' : 'var(--lux-text-muted)' }}>
                      {o.build_status === 'building' ? 'ready to build' : 'awaiting details'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-4" style={{ color: 'var(--lux-text-muted)' }}>
                    <Row icon={<User className="w-3.5 h-3.5" />} label="Buyer" v={`${o.buyer?.name || ''} · ${o.buyer?.email || ''}`} />
                    <Row icon={<Phone className="w-3.5 h-3.5" />} label="Phone" v={info.phone || o.buyer?.phone || '—'} />
                    <Row icon={<Calendar className="w-3.5 h-3.5" />} label="Date" v={info.event_date || '—'} />
                    <Row icon={<MapPin className="w-3.5 h-3.5" />} label="Venue" v={`${info.venue || '—'} ${info.city ? `· ${info.city}` : ''}`} />
                  </div>
                  {info.notes && (
                    <div className="text-xs mb-4 px-3 py-2 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--lux-text)' }}>
                      Notes: {info.notes}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => navigate('/studio/profile/new')} className="lux-btn" data-testid={`bq-build-${o.id}`}>
                      <Hammer className="w-4 h-4" /> Open builder
                    </button>
                    <button onClick={() => markDelivered(o.id)} className="inline-flex items-center gap-2 px-4 rounded-lg text-sm" style={{ border: '1px solid rgba(80,180,80,0.4)', color: '#D2F3D6' }} data-testid={`bq-deliver-${o.id}`}>
                      <CheckCircle2 className="w-4 h-4" /> Mark delivered
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const Row = ({ icon, label, v }) => (
  <div className="flex items-center gap-2">
    <span className="text-gold">{icon}</span>
    <span className="opacity-60">{label}:</span> <span>{v}</span>
  </div>
);

export default AdminBuildQueue;
