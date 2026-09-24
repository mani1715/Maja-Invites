import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { HeartHandshake, Phone, MapPin, Search, Navigation, Loader2, X } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Food-donation section — shown at the very end of the invitation, kept COMPACT:
 * a single-line teaser that expands on tap into the finder (city search +
 * "Detect location" + nearby centers). If food is left over after the event,
 * guests can reach nearby orphanages / child-care centers instead of wasting it.
 */
const FoodDonationSection = ({ city = '' }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(city || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const load = useCallback(async (cityVal) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/public/food-donation`, { params: { city: cityVal || '' } });
      setData(data);
    } catch (_e) { setData(null); } finally { setLoading(false); }
  }, []);

  // Load once the panel is opened (keeps the collapsed teaser network-free).
  useEffect(() => { if (open && data === null) load(city); }, [open, data, city, load]);

  // "Detect location" — browser geolocation + a keyless reverse-geocode to a city
  // name. Fully best-effort: denied permission or a blocked request just no-ops.
  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
          const j = await r.json();
          const cityName = j.city || j.locality || j.principalSubdivision || '';
          if (cityName) { setQ(cityName); load(cityName); }
        } catch { /* ignore */ } finally { setDetecting(false); }
      },
      () => setDetecting(false),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [load]);

  const centers = [...(data?.centers || []), ...(data?.national || [])];

  return (
    <section className="px-6 md:px-16 py-10" data-testid="food-donation-section">
      <div className="max-w-2xl mx-auto">
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="w-full lux-glass px-4 py-3 flex items-center justify-center gap-2 text-sm rounded-xl hover:bg-[rgba(212,175,55,0.06)] transition-colors"
            style={{ color: 'rgba(255,248,220,0.9)' }}
            data-testid="food-donation-toggle"
          >
            <HeartHandshake className="w-4 h-4 text-gold shrink-0" />
            Is your food getting spoiled?
            <span className="text-gold">Share it with a nearby home →</span>
          </button>
        ) : (
          <div className="lux-glass p-5" data-testid="food-donation-panel">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="lux-eyebrow inline-flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-gold" /> Let no plate go to waste
              </span>
              <button onClick={() => setOpen(false)} className="opacity-70 hover:opacity-100" aria-label="Close" data-testid="food-donation-close">
                <X className="w-4 h-4" style={{ color: 'rgba(255,248,220,0.85)' }} />
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,248,220,0.8)' }}>
              Surplus food after the celebration? These nearby homes &amp; child-care centers will gladly receive it — a quick call turns leftovers into someone's meal.
            </p>

            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="flex-1 min-w-[160px] flex items-center gap-2 px-3 py-2 rounded-full" style={{ border: '1px solid var(--lux-border)' }}>
                <MapPin className="w-4 h-4 text-gold shrink-0" />
                <input
                  value={q} onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') load(q); }}
                  placeholder="Your city"
                  className="bg-transparent outline-none text-sm w-full" style={{ color: '#FFF8DC' }}
                  data-testid="food-city-input"
                />
              </div>
              <button onClick={() => load(q)} className="lux-btn !px-3 !py-2" data-testid="food-city-search">
                <Search className="w-4 h-4" />
              </button>
              <button onClick={detectLocation} className="lux-btn lux-btn-ghost !px-3 !py-2 inline-flex items-center gap-1 text-xs"
                data-testid="food-detect-location">
                {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />} Detect
              </button>
            </div>

            {loading ? (
              <p className="text-sm" style={{ color: 'rgba(255,248,220,0.7)' }}>Finding centers…</p>
            ) : (
              <>
                {data && !data.has_local && q && (
                  <p className="text-xs mb-3" style={{ color: 'rgba(255,248,220,0.7)' }}>
                    No verified local centers listed for "{q}" yet — here's the national child helpline you can always call.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  {centers.map((c) => (
                    <a key={c.id} href={`tel:${c.phone}`} className="lux-glass p-3 flex items-center gap-3 no-underline" data-testid={`food-center-${c.id}`}>
                      <div className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: 'rgba(212,175,55,0.12)' }}>
                        <Phone className="w-4 h-4 text-gold" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-sm truncate" style={{ color: '#FFF8DC' }}>{c.name}</div>
                        <div className="text-gold text-sm">{c.phone}</div>
                        {c.address && <div className="text-[11px] truncate" style={{ color: 'rgba(255,248,220,0.7)' }}>{c.address}</div>}
                      </div>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default FoodDonationSection;
