import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Map as MapIcon, Car, Navigation, MessageCircle, Share2, MapPin, Clock, Loader2,
  Copy, Check, Apple, Compass, ParkingSquare, Calendar,
} from 'lucide-react';
import { useInvitePrefetch } from '@/context/InvitePrefetchContext';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * VenuesSection — public multi-venue display.
 * Renders main venue + per-event venues, each with deep links, W3W,
 * parking instructions, WhatsApp share, and live ETA from user location.
 */
const VenuesSection = ({ slug }) => {
  const prefetch = useInvitePrefetch(slug);
  const [data, setData] = useState(prefetch?.venues || null);
  const [userLoc, setUserLoc] = useState(null);
  const [etaMap, setEtaMap] = useState({}); // venueKey -> { duration_minutes, distance_km, loading, error }
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!slug) return;
    // Skip network if /full already provided venues data.
    if (prefetch && 'venues' in prefetch) {
      setData(prefetch.venues || null);
      return;
    }
    axios.get(`${API_URL}/api/invite/${slug}/venues`)
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, [slug, prefetch]);

  const allVenues = useMemo(() => {
    if (!data) return [];
    const main = data.main_venue && (data.main_venue.latitude || data.main_venue.name) ? [{ key: 'main', ...data.main_venue }] : [];
    const events = (data.events || [])
      .filter((e) => e.latitude || e.address)
      .map((e) => ({ key: `event-${e.event_id}`, ...e }));
    // Avoid showing main twice if events list is exhaustive — keep both, label distinguishes them
    return [...main, ...events];
  }, [data]);

  const requestEta = (venue) => {
    if (!navigator.geolocation) {
      setEtaMap((p) => ({ ...p, [venue.key]: { error: 'Location not supported' } }));
      return;
    }
    setEtaMap((p) => ({ ...p, [venue.key]: { loading: true } }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setUserLoc({ lat, lng });
        if (!venue.latitude || !venue.longitude) {
          setEtaMap((p) => ({ ...p, [venue.key]: { error: 'Pin not set' } }));
          return;
        }
        try {
          const r = await axios.get(`${API_URL}/api/invite/${slug}/eta`, {
            params: { from_lat: lat, from_lng: lng, to_lat: venue.latitude, to_lng: venue.longitude },
          });
          setEtaMap((p) => ({ ...p, [venue.key]: { ...r.data } }));
        } catch (e) {
          setEtaMap((p) => ({ ...p, [venue.key]: { error: 'No route' } }));
        }
      },
      () => setEtaMap((p) => ({ ...p, [venue.key]: { error: 'Permission denied' } })),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const doCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch { /* ignore */ }
  };

  if (!data || allVenues.length === 0) return null;

  return (
    <section className="px-6 md:px-12 py-16 md:py-20" data-testid="public-venues">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <motion.span initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.1 }}
            className="lux-eyebrow inline-flex items-center gap-2 mb-3">
            <Compass className="w-3 h-3" /> Travel & venues
          </motion.span>
          <motion.h2 initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.7 }}
            className="font-display text-[1.9rem] md:text-[2.6rem]" style={{ color: '#FFF8DC' }}>
            Getting <span className="font-script italic text-gold">there</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-3 text-sm md:text-base max-w-2xl mx-auto"
            style={{ color: 'rgba(255,248,220,0.82)' }}>
            Tap any venue card to navigate, book a ride or share with family.
          </motion.p>
        </div>

        <div className="space-y-5">
          {allVenues.map((v, i) => (
            <VenueCard key={v.key} venue={v} idx={i}
              eta={etaMap[v.key]}
              onRequestEta={() => requestEta(v)}
              onCopy={doCopy}
              copiedKey={copied} />
          ))}
        </div>

        <AnimatePresence>
          {copied && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs tracking-widest uppercase z-50"
              style={{ background: '#D4AF37', color: '#16110C' }}>
              Copied
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

const VenueCard = ({ venue, idx, eta, onRequestEta, onCopy, copiedKey }) => {
  const isMain = venue.kind === 'main';
  const links = venue.links || {};
  const w3w = venue.what3words;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px', amount: 0.1 }}
      transition={{ duration: 0.6, delay: idx * 0.06 }}
      className="lux-glass p-5 md:p-6"
      data-testid={`venue-card-${venue.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] tracking-[0.3em] uppercase px-2 py-0.5 rounded-full"
              style={{
                background: isMain ? 'rgba(212,175,55,0.18)' : 'rgba(255,248,220,0.08)',
                color: isMain ? '#D4AF37' : 'rgba(255,248,220,0.85)',
              }}>
              {isMain ? 'Main venue' : (venue.event_type || 'Event')}
            </span>
            {!isMain && venue.date && (
              <span className="text-[10px] inline-flex items-center gap-1" style={{ color: 'rgba(255,248,220,0.8)' }}>
                <Calendar className="w-3 h-3" /> {venue.date}{venue.start_time ? ` · ${venue.start_time}` : ''}
              </span>
            )}
          </div>
          <h3 className="font-display text-lg md:text-2xl truncate" style={{ color: '#FFF8DC' }}>
            {venue.event_name || venue.name}
          </h3>
          {venue.address && (
            <p className="text-xs md:text-sm mt-1 inline-flex items-start gap-1" style={{ color: 'rgba(255,248,220,0.85)' }}>
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-gold flex-shrink-0" />
              <span>{venue.address}</span>
            </p>
          )}
        </div>

        {/* ETA */}
        <EtaBadge eta={eta} onRequest={onRequestEta} hasPin={Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude)} testid={`eta-${venue.key}`} />
      </div>

      {/* What3Words */}
      {w3w && (
        <button onClick={() => onCopy(`///${w3w}`, `w3w-${venue.key}`)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs mb-3 hover:bg-[rgba(212,175,55,0.1)] transition-colors"
          style={{ border: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.85)' }}
          data-testid={`w3w-copy-${venue.key}`}>
          <span className="text-gold font-mono">///</span>
          <span className="font-mono">{w3w}</span>
          {copiedKey === `w3w-${venue.key}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 opacity-60" />}
        </button>
      )}

      {/* Parking */}
      {venue.parking_info && (
        <div className="text-xs px-3 py-2 rounded-lg mb-4 inline-flex items-start gap-2"
          style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)', color: 'rgba(255,248,220,0.8)' }}>
          <ParkingSquare className="w-3.5 h-3.5 text-gold mt-0.5 flex-shrink-0" />
          <span>{venue.parking_info}</span>
        </div>
      )}

      {/* Deep link grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {links.google_maps && (
          <DeepLink href={links.google_maps} icon={MapIcon} label="Google Maps" testid={`gmaps-${venue.key}`} />
        )}
        {links.apple_maps && (
          <DeepLink href={links.apple_maps} icon={Apple} label="Apple Maps" testid={`apple-${venue.key}`} />
        )}
        {links.uber && (
          <DeepLink href={links.uber} icon={Car} label="Uber" testid={`uber-${venue.key}`} />
        )}
        {links.ola && (
          <DeepLink href={links.ola} icon={Car} label="Ola" testid={`ola-${venue.key}`} />
        )}
        {links.rapido && (
          <DeepLink href={links.rapido} icon={Navigation} label="Rapido" testid={`rapido-${venue.key}`} />
        )}
        {links.whatsapp_share && (
          <DeepLink href={links.whatsapp_share} icon={MessageCircle} label="Share" accent testid={`wa-${venue.key}`} />
        )}
      </div>
    </motion.div>
  );
};

const DeepLink = ({ href, icon: Icon, label, accent, testid }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
    className="px-3 py-2.5 rounded-lg flex flex-col items-center justify-center gap-1 text-center transition-all hover:-translate-y-0.5"
    style={{
      background: accent ? 'rgba(37,211,102,0.12)' : 'rgba(255,248,220,0.04)',
      border: `1px solid ${accent ? 'rgba(37,211,102,0.3)' : 'var(--lux-border)'}`,
    }}
    data-testid={testid}>
    <Icon className="w-4 h-4" style={{ color: accent ? '#25D366' : '#D4AF37' }} />
    <span className="text-[10px] tracking-[0.1em] uppercase" style={{ color: 'rgba(255,248,220,0.85)' }}>{label}</span>
  </a>
);

const EtaBadge = ({ eta, onRequest, hasPin, testid }) => {
  if (!hasPin) return null;
  if (!eta) {
    return (
      <button onClick={onRequest} type="button"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] tracking-[0.12em] uppercase transition-colors hover:bg-[rgba(212,175,55,0.1)]"
        style={{ border: '1px solid var(--lux-border)', color: '#D4AF37' }}
        data-testid={testid}>
        <Clock className="w-3 h-3" /> Show ETA
      </button>
    );
  }
  if (eta.loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] tracking-[0.12em] uppercase"
        style={{ border: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.82)' }} data-testid={testid}>
        <Loader2 className="w-3 h-3 animate-spin" /> Calculating…
      </span>
    );
  }
  if (eta.error) {
    return (
      <button onClick={onRequest} type="button" title={eta.error}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] tracking-[0.12em] uppercase opacity-60"
        style={{ border: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.8)' }} data-testid={testid}>
        Retry ETA
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] tracking-[0.1em] uppercase"
      style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37' }}
      data-testid={testid}>
      <Car className="w-3 h-3" /> ~{eta.duration_minutes} min · {eta.distance_km} km
    </div>
  );
};

export default React.memo(VenuesSection);
