import { buildIcsFile, googleCalendarUrl } from '@/lib/buildIcs';

// AddToCalendarButton — pure client, no backend call: everything it needs
// (title/venue/date/time) is already on the invite payload. `start` must be
// a valid Date; renders nothing otherwise so a malformed/missing date is a
// silent no-op rather than a broken link.
export default function AddToCalendarButton({ title, description, location, start, end, small = false }) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;

  const downloadIcs = () => {
    const blob = buildIcsFile({ title, description, location, start, end });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const btnClass = small ? 'mj-btn-outline-d gi-cal-btn--sm' : 'mj-btn-outline-d';

  return (
    <span className="gi-cal-row">
      <a
        className={btnClass}
        href={googleCalendarUrl({ title, description, location, start, end })}
        target="_blank"
        rel="noreferrer"
      >
        + Google Calendar
      </a>
      <button type="button" className={btnClass} onClick={downloadIcs}>Download .ics</button>
    </span>
  );
}
