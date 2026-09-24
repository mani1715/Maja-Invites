import { useEffect, useState } from 'react';

/** Ticking countdown to an ISO date. Pure client (recon §9: no backend for
   this). Clamped at zero — never goes negative once the date has passed. */
export function useCountdown(iso, tickMs = 1000) {
  const target = iso ? new Date(iso).getTime() : NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(target)) return undefined;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [target, tickMs]);

  if (Number.isNaN(target)) return { days: 0, hours: 0, mins: 0, secs: 0, elapsed: false };
  const diff = Math.max(0, target - now);
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor(diff / 3600000) % 24,
    mins: Math.floor(diff / 60000) % 60,
    secs: Math.floor(diff / 1000) % 60,
    elapsed: diff <= 0,
  };
}
