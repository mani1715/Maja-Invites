import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, MessageCircle, Heart, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const ICONS = { MessageCircle, Heart, Clock };

/**
 * NotificationsBell — dashboard header bell with unread badge + dropdown feed.
 * Polls every 60s. Items are: rsvp / wish / expiring.
 */
const NotificationsBell = () => {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchUnread = async () => {
    try {
      const r = await axios.get(`${API_URL}/api/admin/notifications/unread-count`);
      setUnread(r.data?.count || 0);
    } catch (_) { /* silent */ }
  };
  const fetchItems = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/notifications?limit=20`);
      setItems(r.data?.items || []);
    } catch (_) { setItems([]); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 60000);
    return () => clearInterval(id);
  }, []);

  const toggle = () => {
    setOpen((v) => !v);
    if (!open) fetchItems();
  };

  return (
    <div className="relative">
      <button onClick={toggle}
        className="relative w-9 h-9 rounded-full inline-flex items-center justify-center"
        style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid var(--lux-border-strong)' }}
        data-testid="notifications-bell">
        <Bell className="w-4 h-4" style={{ color: '#D4AF37' }} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
            style={{ background: '#EF4444', color: '#fff' }}
            data-testid="notifications-unread-count">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-12 z-50 w-[320px] max-h-[480px] overflow-y-auto rounded-xl"
            style={{
              background: 'rgba(14,10,6,0.96)',
              border: '1px solid var(--lux-border-strong)',
              boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)',
            }}
            data-testid="notifications-panel"
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--lux-border)' }}>
              <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.7)' }}>
                Recent activity
              </div>
              <div className="font-display text-lg" style={{ color: '#FFF8DC' }}>
                Notifications
              </div>
            </div>
            {loading ? (
              <div className="px-4 py-8 text-center text-xs" style={{ color: 'rgba(255,248,220,0.7)' }}>
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs" style={{ color: 'rgba(255,248,220,0.7)' }}
                data-testid="notifications-empty">
                You're all caught up.
              </div>
            ) : (
              items.map((it, i) => {
                const Icon = ICONS[it.icon] || Bell;
                // BUG 6 FIX: route each notification to its CORRECT
                // destination. Before this fix every notification —
                // wish, rsvp, expiring — opened the RSVPs page.
                const handleClick = () => {
                  setOpen(false);
                  if (!it.profile_id) return;
                  if (it.type === 'wish') {
                    navigate(`/studio/profile/${it.profile_id}/wishes`);
                  } else if (it.type === 'expiring') {
                    navigate(`/studio/profile/${it.profile_id}/edit`);
                  } else {
                    // default — RSVP notifications
                    navigate(`/studio/profile/${it.profile_id}/rsvps`);
                  }
                };
                return (
                  <button key={i}
                    onClick={handleClick}
                    className="w-full px-4 py-3 flex items-start gap-3 text-left transition-colors hover:bg-white/5 border-b"
                    style={{ borderColor: 'var(--lux-border)' }}
                    data-testid={`notification-item-${i}`}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(212,175,55,0.08)' }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs leading-tight" style={{ color: '#FFF8DC' }}>{it.title}</div>
                      <div className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(255,248,220,0.7)' }}>
                        {it.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationsBell;
