import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import PanelTabs from '@/components/PanelTabs';
import { ChevronLeft, ChevronRight, Plus, X, Loader2, MapPin } from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// day-status → colour. Clear green / yellow / red coding (owner spec):
//   available = green, busy (partial/booked) = yellow, blocked & away = red.
const STATUS_COLOR = {
  available: 'rgba(46,160,67,0.22)',   // green
  partial:   'rgba(214,163,42,0.42)',  // yellow — busy
  booked:    'rgba(214,163,42,0.50)',  // yellow — busy
  vacation:  'rgba(198,58,58,0.34)',   // red
  travel:    'rgba(198,58,58,0.34)',   // red
  holiday:   'rgba(198,58,58,0.30)',   // red
  blocked:   'rgba(198,58,58,0.44)',   // red
};
const STATUS_BORDER = {
  available: 'rgba(46,160,67,0.6)',
  partial:   'rgba(214,163,42,0.75)',
  booked:    'rgba(214,163,42,0.85)',
  vacation:  'rgba(198,58,58,0.65)',
  travel:    'rgba(198,58,58,0.65)',
  holiday:   'rgba(198,58,58,0.55)',
  blocked:   'rgba(198,58,58,0.8)',
};
const STATUS_LABEL = {
  available: 'Available', partial: 'Partly booked', booked: 'Booked',
  vacation: 'Vacation', travel: 'Travel', holiday: 'Holiday', blocked: 'Blocked',
};

export default function OccupancyCalendar() {
  const today = new Date(2026, 6, 1); // stable default; user navigates
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [days, setDays] = useState({});
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null); // selected iso date for the side panel

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/calendar/month?year=${year}&month=${month}`);
      setDays(data.days || {});
    } catch (e) { setDays({}); }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const prev = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const next = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const leadBlanks = (firstDow + 6) % 7; // convert to Mon-first
  const daysInMonth = new Date(year, month, 0).getDate();

  const iso = (d) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const addBooking = async (isoDate) => {
    const client_name = window.prompt('Client name'); if (client_name === null) return;
    const event_type = window.prompt('Event type (Wedding, Engagement…)') || '';
    const slot = window.prompt('Slot: full_day / half_day_morning / half_day_evening', 'full_day') || 'full_day';
    const location = window.prompt('Location') || '';
    await axios.post(`${API_URL}/api/calendar/bookings`, { date: isoDate, client_name, event_type, slot, location, status: 'accepted' });
    load();
  };
  const addBlock = async (isoDate) => {
    const kind = window.prompt('Block kind: blocked / vacation / travel / holiday', 'blocked') || 'blocked';
    await axios.post(`${API_URL}/api/calendar/blocks`, { date: isoDate, kind });
    load();
  };
  const delBooking = async (bid) => { await axios.delete(`${API_URL}/api/calendar/bookings/${bid}`); load(); };

  const selDay = sel ? days[sel] : null;

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8 md:py-12 max-w-[1400px] mx-auto relative z-10">
        <PanelTabs active="/studio/calendar" />

        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <span className="lux-eyebrow block mb-3">◆ Occupancy Calendar</span>
            <h1 className="font-display text-[2rem] md:text-[3rem]" style={{ color: 'var(--lux-text)' }}>
              {MONTHS[month - 1]} <span className="text-gold">{year}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prev} className="lux-btn lux-btn-ghost"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={next} className="lux-btn lux-btn-ghost"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="lux-glass p-4 md:p-6">
            <div className="grid grid-cols-7 gap-2 mb-2">
              {DOW.map((d) => (
                <div key={d} className="text-center text-[10px] tracking-widest uppercase" style={{ color: 'var(--lux-text-faint)' }}>{d}</div>
              ))}
            </div>
            {loading ? (
              <div className="flex items-center gap-2 p-8" style={{ color: 'var(--lux-text)' }}><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: leadBlanks }).map((_, i) => <div key={`b${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const d = i + 1; const id = iso(d); const info = days[id] || { status: 'available' };
                  return (
                    <motion.button key={id} whileHover={{ scale: 1.04 }} onClick={() => setSel(id)}
                      className="relative rounded-xl p-2 text-left transition"
                      style={{ minHeight: 74, background: STATUS_COLOR[info.status] || STATUS_COLOR.available,
                               border: sel === id ? '2px solid #E8C97A' : `1.5px solid ${STATUS_BORDER[info.status] || STATUS_BORDER.available}` }}
                      data-testid={`cal-day-${d}`}>
                      <span className="text-sm font-heading" style={{ color: 'var(--lux-text)' }}>{d}</span>
                      {(info.bookings || []).slice(0, 2).map((b) => (
                        <div key={b.id} className="mt-1 text-[9px] truncate px-1 rounded" style={{ background: 'rgba(0,0,0,0.3)', color: '#E8C97A' }}>
                          {b.event_type || 'Booking'}
                        </div>
                      ))}
                    </motion.button>
                  );
                })}
              </div>
            )}
            {/* legend */}
            <div className="flex flex-wrap gap-3 mt-5">
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--lux-text-muted)' }}>
                  <span className="w-3 h-3 rounded" style={{ background: STATUS_COLOR[k] }} /> {v}
                </span>
              ))}
            </div>
          </div>

          {/* day detail */}
          <div className="lux-glass p-5 h-fit">
            {!sel ? (
              <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>Select a date to manage bookings.</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading text-lg" style={{ color: 'var(--lux-text)' }}>{sel}</h3>
                  <button onClick={() => setSel(null)}><X className="w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} /></button>
                </div>
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: STATUS_COLOR[selDay?.status], color: 'var(--lux-text)' }}>
                  {STATUS_LABEL[selDay?.status] || 'Available'}
                </span>
                <div className="mt-4 space-y-2">
                  {(selDay?.bookings || []).map((b) => (
                    <div key={b.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm" style={{ color: 'var(--lux-text)' }}>{b.event_type || 'Booking'}</span>
                        <button onClick={() => delBooking(b.id)}><X className="w-3.5 h-3.5" style={{ color: 'var(--lux-text-muted)' }} /></button>
                      </div>
                      {b.client_name && <div className="text-xs mt-1" style={{ color: '#E8C97A' }}>{b.client_name}</div>}
                      {b.location && <div className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--lux-text-muted)' }}><MapPin className="w-3 h-3" />{b.location}</div>}
                      <div className="text-[10px] mt-1 uppercase tracking-wide" style={{ color: 'var(--lux-text-faint)' }}>{b.slot} · {b.status}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <button onClick={() => addBooking(sel)} className="lux-btn justify-center" data-testid="cal-add-booking"><Plus className="w-4 h-4" /> Add booking</button>
                  <button onClick={() => addBlock(sel)} className="lux-btn lux-btn-ghost justify-center" data-testid="cal-add-block">Block / vacation</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
