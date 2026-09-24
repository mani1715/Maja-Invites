import React, { useMemo } from 'react';

/**
 * AmPmTimePicker
 * ──────────────────────────────────────────────────────────────────
 * 12-hour wedding-time picker with an EXPLICIT AM/PM toggle.
 *
 * Persists value in plain 24-hour "HH:MM" format (e.g. "14:30") so
 * downstream code, calendars, ICS exports etc. don't need to change.
 *
 * Props:
 *   value     — 24h string ("" if not set). e.g. "16:45"
 *   onChange  — (newValueIn24h: string) => void
 *   testid    — base data-testid attribute
 *   className — extra classes for the outer container
 */
const pad = (n) => (n < 10 ? `0${n}` : String(n));

const to12h = (val24) => {
  if (!val24) return { hour12: '', minute: '', period: 'AM' };
  const [hStr, mStr] = String(val24).split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (Number.isNaN(h)) return { hour12: '', minute: '', period: 'AM' };
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return { hour12: String(h), minute: pad(m), period };
};

const to24h = (hour12, minute, period) => {
  if (!hour12) return '';
  let h = parseInt(hour12, 10);
  if (Number.isNaN(h)) return '';
  h = h % 12;
  if (period === 'PM') h += 12;
  return `${pad(h)}:${pad(parseInt(minute || '0', 10))}`;
};

const AmPmTimePicker = ({ value, onChange, testid = 'time-picker', className = '' }) => {
  const { hour12, minute, period } = useMemo(() => to12h(value), [value]);

  const update = (next) => {
    const merged = { hour12, minute, period, ...next };
    onChange(to24h(merged.hour12, merged.minute, merged.period));
  };

  const baseInputStyle = {
    background: 'rgba(8,5,3,0.55)',
    border: '1px solid var(--lux-border)',
    color: '#FFF8DC',
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 14,
    width: '100%',
    outline: 'none',
  };

  return (
    <div className={`flex items-stretch gap-2 ${className}`} data-testid={testid}>
      {/* Hour */}
      <select
        aria-label="Hour"
        value={hour12 || ''}
        onChange={(e) => update({ hour12: e.target.value || '12' })}
        style={{ ...baseInputStyle, width: 88 }}
        data-testid={`${testid}-hour`}
      >
        <option value="" disabled>HH</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>

      <span style={{ color: 'rgba(255,248,220,0.78)', alignSelf: 'center', fontSize: 18 }}>:</span>

      {/* Minute */}
      <select
        aria-label="Minute"
        value={minute || ''}
        onChange={(e) => update({ minute: e.target.value || '00' })}
        style={{ ...baseInputStyle, width: 88 }}
        data-testid={`${testid}-minute`}
      >
        <option value="" disabled>MM</option>
        {Array.from({ length: 60 }, (_, i) => pad(i)).map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      {/* AM / PM segmented toggle */}
      <div
        className="flex items-stretch rounded overflow-hidden"
        style={{ border: '1px solid var(--lux-border)' }}
        role="group"
        aria-label="AM or PM"
      >
        {['AM', 'PM'].map((p) => {
          const active = period === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => update({ period: p, hour12: hour12 || '12', minute: minute || '00' })}
              className="px-4 text-xs tracking-[0.2em] uppercase transition-all"
              style={{
                background: active ? 'rgba(212,175,55,0.22)' : 'transparent',
                color: active ? '#E8C766' : 'rgba(255,248,220,0.82)',
                fontWeight: active ? 700 : 500,
                minWidth: 56,
              }}
              data-testid={`${testid}-${p.toLowerCase()}`}
              aria-pressed={active}
            >
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AmPmTimePicker;
