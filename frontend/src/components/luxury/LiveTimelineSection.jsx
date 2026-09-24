import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Calendar, MapPin, Utensils } from 'lucide-react';
import AddToCalendarButton from './AddToCalendarButton';
import { classifyMealTime, formatMealTime } from '@/utils/mealTime';

const parseEventDateTime = (e) => {
  if (!e) return null;
  try {
    const datePart = e.date || (e.event_date ? new Date(e.event_date).toISOString().slice(0, 10) : null);
    const startTime = e.start_time || '18:00';
    if (!datePart) return null;
    const [hh, mm] = String(startTime).split(':');
    const d = new Date(`${datePart}T${(hh || '00').padStart(2, '0')}:${(mm || '00').padStart(2, '0')}:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch { return null; }
};

const parseEndDateTime = (e, start) => {
  if (!e || !start) return null;
  if (!e.end_time) return new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2h default
  try {
    const datePart = e.date || (e.event_date ? new Date(e.event_date).toISOString().slice(0, 10) : null);
    const [hh, mm] = String(e.end_time).split(':');
    const d = new Date(`${datePart}T${(hh || '00').padStart(2, '0')}:${(mm || '00').padStart(2, '0')}:00`);
    return Number.isNaN(d.getTime()) ? new Date(start.getTime() + 2 * 60 * 60 * 1000) : d;
  } catch { return new Date(start.getTime() + 2 * 60 * 60 * 1000); }
};

const fmtTime = (d) => d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
const fmtDate = (d) => d ? d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' }) : '';

const statusOf = (start, end, now) => {
  if (!start) return 'upcoming';
  if (end && now > end) return 'done';
  if (now >= start && (!end || now <= end)) return 'now';
  return 'upcoming';
};

/**
 * LiveTimelineSection
 * Renders the wedding day timeline with NOW / UPCOMING / DONE badges.
 * Auto-refreshes every minute so the "Now" indicator stays accurate.
 */
const LiveTimelineSection = ({ events = [], slug }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo(() => {
    return (events || [])
      .filter((e) => e && (e.visible !== false))
      .map((e) => {
        const start = parseEventDateTime(e);
        const end = parseEndDateTime(e, start);
        return {
          event: e,
          start,
          end,
          status: statusOf(start, end, now),
        };
      })
      .sort((a, b) => {
        if (!a.start) return 1;
        if (!b.start) return -1;
        return a.start - b.start;
      });
  }, [events, now]);

  if (!items.length) return null;

  return (
    <section className="px-6 md:px-16 py-20" data-testid="section-live-timeline">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7 }}
        >
          <span className="lux-eyebrow inline-flex items-center gap-2 mb-4">
            <Clock className="w-3.5 h-3.5" /> The Day, Live
          </span>
          <h2
            className="font-display text-[2rem] md:text-[2.8rem] leading-[1.05] mb-8"
            style={{ color: '#FFF8DC' }}
          >
            Where we are <span className="text-gold italic font-script">right now.</span>
          </h2>
        </motion.div>

        <ol className="relative border-l ml-3" style={{ borderColor: 'var(--lux-border)' }}>
          {items.map((it, i) => {
            const { event: e, start, end, status } = it;
            const badge =
              status === 'now'
                ? { txt: 'Happening now', bg: 'rgba(212,175,55,0.18)', fg: '#FFE9A8', dot: '#D4AF37' }
                : status === 'done'
                ? { txt: 'Done', bg: 'rgba(255,248,220,0.06)', fg: 'rgba(255,248,220,0.7)', dot: 'rgba(255,248,220,0.4)' }
                : { txt: 'Upcoming', bg: 'rgba(255,248,220,0.06)', fg: 'rgba(255,248,220,0.88)', dot: 'rgba(255,248,220,0.78)' };

            return (
              <li
                key={e.event_id || i}
                className="ml-6 mb-8"
                data-testid={`timeline-item-${i}`}
                data-status={status}
              >
                <span
                  className="absolute -left-[7px] w-3.5 h-3.5 rounded-full"
                  style={{ background: badge.dot, boxShadow: status === 'now' ? '0 0 0 6px rgba(212,175,55,0.18)' : 'none' }}
                />
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <span
                    className="px-3 py-1 text-[10px] tracking-[0.25em] uppercase rounded-full"
                    style={{ background: badge.bg, color: badge.fg, border: `1px solid ${badge.dot}` }}
                  >
                    {badge.txt}
                  </span>
                  <span className="font-display text-lg md:text-xl" style={{ color: '#FFF8DC' }}>
                    {e.name || e.event_type}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: 'rgba(255,248,220,0.85)' }}>
                  {start && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> {fmtDate(start)} · {fmtTime(start)}{end ? `–${fmtTime(end)}` : ''}
                    </span>
                  )}
                  {e.venue_name && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> {e.venue_name}
                    </span>
                  )}
                </div>
                {/* Feb 2026 — Meal chip: auto-classified from `meal_time` (12:30 → Lunch, 19:00 → Dinner). */}
                {e.meal_time && classifyMealTime(e.meal_time) && (
                  <div className="mt-2">
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-[0.15em] uppercase"
                      style={{
                        background: 'rgba(212,175,55,0.12)',
                        border: '1px solid rgba(212,175,55,0.35)',
                        color: '#FFE9A8',
                      }}
                      data-testid={`timeline-meal-${i}`}
                    >
                      <Utensils className="w-3 h-3" />
                      {classifyMealTime(e.meal_time)} · {formatMealTime(e.meal_time)}
                    </span>
                  </div>
                )}
                {e.description && (
                  <p className="mt-1 text-sm leading-relaxed max-w-2xl" style={{ color: 'rgba(255,248,220,0.78)' }}>
                    {e.description}
                  </p>
                )}
                {slug && e.event_id && status !== 'done' && (
                  <div className="mt-3">
                    <AddToCalendarButton
                      slug={slug}
                      eventId={e.event_id}
                      label="Add this event"
                      subtle
                      size="sm"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

export default LiveTimelineSection;
