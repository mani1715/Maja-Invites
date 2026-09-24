import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { CheckCircle2, UserCheck } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const inputStyle = {
  width: '100%', padding: '0.85rem 1rem', background: 'transparent', color: '#FFF8DC',
  border: '1px solid var(--lux-border)', borderRadius: '0.5rem', outline: 'none',
  fontFamily: 'Manrope, sans-serif', fontSize: '0.92rem', caretColor: '#D4AF37',
};

/**
 * CheckInSection — quick "I'm here" check-in for guests at the venue.
 * Optionally tied to a specific event (event_id).
 */
const CheckInSection = ({ slug, enabled, events = [] }) => {
  const [form, setForm] = useState({ guest_name: '', guest_phone: '', event_id: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  if (!enabled) return null;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const payload = {
        guest_name: form.guest_name.trim(),
        guest_phone: form.guest_phone.trim() || undefined,
        event_id: form.event_id || undefined,
      };
      await axios.post(`${API_URL}/api/invite/${slug}/check-in`, payload);
      setDone(true);
    } catch (e) {
      const d = e.response?.data?.detail;
      const msg = Array.isArray(d) ? d.map((x) => `${(x.loc || []).slice(-1)[0]}: ${x.msg}`).join(' · ') : (d || 'Could not check in.');
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="px-6 md:px-16 py-20" data-testid="section-check-in">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7 }}
        >
          <span className="lux-eyebrow inline-flex items-center gap-2 mb-5">
            <UserCheck className="w-3.5 h-3.5" /> I'm Here
          </span>
          <h2
            className="font-display text-[2rem] md:text-[2.8rem] leading-[1.05] mb-3"
            style={{ color: '#FFF8DC' }}
          >
            Made it? <span className="text-gold italic font-script">Tap to greet.</span>
          </h2>
          <p className="text-[0.95rem] leading-relaxed mb-6" style={{ color: 'rgba(255,248,220,0.85)' }}>
            Let the couple know you've arrived at the venue.
          </p>
        </motion.div>

        {done ? (
          <div className="lux-glass p-8 text-center" data-testid="check-in-success">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-3" style={{ color: '#D4AF37' }} />
            <h3 className="font-display text-2xl mb-2" style={{ color: '#FFF8DC' }}>You're checked in.</h3>
            <p className="text-sm" style={{ color: 'rgba(255,248,220,0.85)' }}>
              The couple just got a small celebration on their dashboard. 🎉
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="lux-glass p-6 md:p-7 space-y-4" data-testid="check-in-form">
            <label className="block">
              <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>Your Name</span>
              <input
                required
                type="text"
                value={form.guest_name}
                onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                style={inputStyle}
                data-testid="check-in-name"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>Phone (optional)</span>
              <input
                type="tel"
                placeholder="+91…"
                value={form.guest_phone}
                onChange={(e) => setForm({ ...form, guest_phone: e.target.value })}
                style={inputStyle}
                data-testid="check-in-phone"
              />
            </label>
            {events.length > 0 && (
              <label className="block">
                <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>Event (optional)</span>
                <select
                  value={form.event_id}
                  onChange={(e) => setForm({ ...form, event_id: e.target.value })}
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}
                  data-testid="check-in-event"
                >
                  <option value="" style={{ background: '#1A130B' }}>— Pick an event —</option>
                  {events.filter((ev) => ev?.event_id && (ev.visible !== false)).map((ev) => (
                    <option key={ev.event_id} value={ev.event_id} style={{ background: '#1A130B' }}>
                      {ev.name || ev.event_type}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {err && (
              <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'rgba(139,0,0,0.18)', color: '#FFD7C9' }}>
                {err}
              </div>
            )}
            <button type="submit" disabled={busy} className="lux-btn w-full justify-center" data-testid="check-in-submit">
              {busy ? 'Checking in…' : "I've Arrived"} <CheckCircle2 className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </section>
  );
};

export default CheckInSection;
