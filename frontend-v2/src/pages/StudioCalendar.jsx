import { useMemo, useState } from 'react';
import StudioModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt,
} from '@/components/StudioModule';
import * as api from '@/api/studioOps';

// Occupancy calendar. A studio's real constraint is dates, not weddings: this
// is the screen that answers "can I take this enquiry for the 14th?".
// Bookings come from the calendar router; blocks are manual unavailability.

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StudioCalendar() {
  const [cursor, setCursor] = useState(() => new Date());
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState(null);

  const month = monthKey(cursor);
  const { data, error, loading, reload } = useAsync(
    () => api.calendarMonth({ month }).then((r) => r.data),
    [month],
  );

  // `days` is a MAP keyed by ISO date, not a list:
  //   {"2026-08-01": {status, bookings[], block, weekday}, …}
  // This page was written against an imagined array of {date, booking, blocked}
  // and called days.forEach — a TypeError that took the whole page to the error
  // boundary the moment the request finally succeeded. (It never got that far
  // before: the request itself 422'd on the wrong query params.) Shape below is
  // read off a real response, not assumed.
  const dayMap = data?.days && !Array.isArray(data.days) ? data.days : {};
  const byDate = useMemo(() => {
    const m = new Map();
    Object.entries(dayMap).forEach(([iso, info]) => {
      const bookings = info?.bookings || [];
      m.set(iso, {
        ...info,
        // The grid asks "is this day booked / blocked"; the payload answers
        // with a list and a nullable block. Normalise once, here.
        booking: bookings[0] || null,
        bookings,
        blocked: info?.block || (info?.status === 'blocked' || info?.status === 'holiday'
          ? { kind: info.status } : null),
      });
    });
    return m;
  }, [dayMap]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    // JS weeks start Sunday; this calendar starts Monday.
    const lead = (first.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let d = 1; d <= last.getDate(); d += 1) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    return cells;
  }, [cursor]);

  const booked = [...byDate.values()].filter((d) => d.booking).length;
  const blocked = [...byDate.values()].filter((d) => d.blocked).length;

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      setPicked(null);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That change did not save.');
    } finally { setBusy(null); }
  };

  const monthLabel = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const shift = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <StudioModule
      active="Calendar"
      title="Calendar"
      sub="Which dates are already committed. Block a date to stop yourself double-booking it."
      actions={(
        <>
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => shift(-1)} aria-label="Previous month">←</button>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', fontSize: 13.5, fontWeight: 600 }}>{monthLabel}</span>
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => shift(1)} aria-label="Next month">→</button>
        </>
      )}
    >
      <StatRow items={[
        { label: 'Booked this month', value: loading ? '—' : numberFmt.format(booked) },
        { label: 'Blocked', value: loading ? '—' : numberFmt.format(blocked) },
        { label: 'Free', value: loading ? '—' : numberFmt.format(grid.filter(Boolean).length - booked - blocked) },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={1} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title={monthLabel}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
              {DOW.map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mj-muted)', padding: '4px 0' }}>
                  {d}
                </div>
              ))}
              {grid.map((d, i) => {
                if (!d) return <div key={`pad-${i}`} />;
                const key = ymd(d);
                const info = byDate.get(key) || {};
                const state = info.booking ? 'booked' : info.blocked ? 'blocked' : 'free';
                const bg = state === 'booked' ? 'var(--mj-accent-soft)' : state === 'blocked' ? '#fee2e2' : 'var(--mj-card)';
                const fg = state === 'booked' ? 'var(--mj-ink-deep)' : state === 'blocked' ? '#991b1b' : 'var(--mj-ink)';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPicked({ date: key, ...info })}
                    aria-label={`${key}: ${state}`}
                    style={{
                      minHeight: 62, border: `1px solid ${picked?.date === key ? 'var(--mj-primary)' : 'var(--mj-border)'}`,
                      borderRadius: 'var(--mj-radius-control)', background: bg, color: fg,
                      cursor: 'pointer', fontFamily: 'inherit', padding: 6, textAlign: 'left',
                      display: 'flex', flexDirection: 'column', gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{d.getDate()}</span>
                    {info.booking && (
                      <span style={{ fontSize: 10, lineHeight: 1.25, overflow: 'hidden' }}>
                        {info.booking.title || info.booking.couple || 'Booked'}
                      </span>
                    )}
                    {info.blocked && <span style={{ fontSize: 10 }}>Blocked</span>}
                  </button>
                );
              })}
            </div>
          </Panel>

          {picked && (
            <Panel title={new Date(`${picked.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
              {picked.booking ? (
                <>
                  <p style={{ fontSize: 13.5, margin: '0 0 14px' }}>
                    Booked: <strong>{picked.booking.title || picked.booking.couple || 'A wedding'}</strong>
                    {picked.booking.venue ? ` · ${picked.booking.venue}` : ''}
                  </p>
                  <button
                    type="button"
                    className="wmod-btn wmod-btn--danger"
                    disabled={busy === 'unbook'}
                    onClick={() => run('unbook', () => api.deleteBooking(picked.booking.id), 'Booking removed.')}
                  >
                    {busy === 'unbook' ? 'Removing…' : 'Remove booking'}
                  </button>
                </>
              ) : picked.blocked ? (
                <>
                  <p style={{ fontSize: 13.5, margin: '0 0 14px' }}>This date is blocked off.</p>
                  <button
                    type="button"
                    className="wmod-btn wmod-btn--ghost"
                    disabled={busy === 'unblock'}
                    onClick={() => run('unblock', () => api.deleteBlock(picked.blocked.id || picked.blocked), 'Date freed.')}
                  >
                    {busy === 'unblock' ? 'Freeing…' : 'Free this date'}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13.5, color: 'var(--mj-muted)', margin: '0 0 14px' }}>
                    Nothing on this date. Block it if you are unavailable — travel,
                    a personal commitment, or a hold for an enquiry you have not
                    confirmed yet.
                  </p>
                  <button
                    type="button"
                    className="wmod-btn wmod-btn--primary"
                    disabled={busy === 'block'}
                    onClick={() => run('block', () => api.createBlock({ date: picked.date }), 'Date blocked.')}
                  >
                    {busy === 'block' ? 'Blocking…' : 'Block this date'}
                  </button>
                </>
              )}
            </Panel>
          )}

          {/* The map always has a row per calendar day, so "empty" means
              nothing BOOKED or BLOCKED — not zero days. */}
          {booked === 0 && blocked === 0 && (
            <Panel>
              <Empty title="Nothing scheduled this month" body="Weddings you create with a date land here automatically." />
            </Panel>
          )}
        </>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
