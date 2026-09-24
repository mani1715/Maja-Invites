import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Map as MapIcon, Car, Navigation, BedDouble } from 'lucide-react';
import { useInvitePrefetch } from '@/context/InvitePrefetchContext';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const TravelLinksSection = ({ slug }) => {
  const prefetch = useInvitePrefetch(slug);
  const [data, setData] = useState(prefetch?.travel || null);
  // Hooks must run on EVERY render, before the `if (!data) return null` below —
  // declaring this after that early return violates react-hooks/rules-of-hooks
  // and FAILS the production build (which enforces ESLint).
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (!slug) return;
    // Skip network if /full already provided travel data.
    if (prefetch && 'travel' in prefetch) {
      setData(prefetch.travel || null);
      return;
    }
    axios.get(`${API_URL}/api/invite/${slug}/travel`).then((r) => setData(r.data)).catch(() => {});
  }, [slug, prefetch]);
  if (!data || !data.links) return null;

  // `carries_destination` comes from the API: which providers really pre-fill the
  // drop point. Rapido publishes no destination deep link (the old one 404'd), so
  // its tile copies the address for the guest to paste instead of pretending.
  const carries = data.carries_destination || {};
  const dropAddress = data.drop_address || data.venue || '';
  const copyDrop = async () => {
    try {
      await navigator.clipboard.writeText(dropAddress);
      setCopied('Address copied — paste it as your drop');
      setTimeout(() => setCopied(''), 4000);
    } catch (_) { /* clipboard blocked; the link still opens */ }
  };

  const items = [
    { icon: MapIcon,    label: 'Open in Google Maps', href: data.links.google_maps,   testid: 'travel-gmaps' },
    { icon: Car,        label: 'Book Uber',           href: data.links.uber,          testid: 'travel-uber' },
    { icon: Car,        label: 'Book Ola',            href: data.links.ola,           testid: 'travel-ola' },
    { icon: Navigation, label: 'Book Rapido',         href: data.links.rapido,        testid: 'travel-rapido',
      note: carries.rapido === false ? 'Paste the drop address' : null,
      onClick: carries.rapido === false ? copyDrop : null },
    { icon: BedDouble,  label: 'Hotels nearby',       href: data.hotels_nearby_query, testid: 'travel-hotels' },
  ];

  return (
    <section className="px-6 md:px-12 py-16 md:py-20" data-testid="public-travel">
      <div className="max-w-3xl mx-auto text-center mb-8">
        <motion.span initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.1 }}
          className="lux-eyebrow block mb-3">◆ Travel made easy</motion.span>
        <motion.h2 initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.7 }}
          className="font-display text-[1.9rem] md:text-[2.6rem]" style={{ color: '#FFF8DC' }}>
          Getting to <span className="font-script italic text-gold">{data.venue}</span>
        </motion.h2>
      </div>
      <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((it, i) => (
          <motion.a key={it.label} href={it.href} target="_blank" rel="noopener noreferrer"
            onClick={it.onClick || undefined}
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
            transition={{ delay: i * 0.06, duration: 0.5 }}
            whileHover={{ y: -3 }}
            className="lux-glass p-4 flex flex-col items-center gap-2 text-center"
            data-testid={it.testid}>
            <it.icon className="w-5 h-5 text-gold" />
            <span className="text-xs tracking-[0.1em] uppercase" style={{ color: 'rgba(255,248,220,0.85)' }}>{it.label}</span>
            {it.note && (
              <span className="text-[10px] leading-tight" style={{ color: 'rgba(255,248,220,0.5)' }}>{it.note}</span>
            )}
          </motion.a>
        ))}
      </div>
      {copied && (
        <p className="max-w-3xl mx-auto mt-3 text-center text-[11px]" data-testid="travel-copied"
          style={{ color: '#E8C97A' }}>{copied}</p>
      )}
    </section>
  );
};

export default React.memo(TravelLinksSection);
