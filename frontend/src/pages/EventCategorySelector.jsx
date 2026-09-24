import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { ArrowLeft, Sparkles, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fadeUp = {
  hidden: { opacity: 0, y: 22, filter: 'blur(8px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const EventCategorySelector = () => {
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoverId, setHoverId] = useState(null);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) navigate('/studio/login', { replace: true });
  }, [admin, authLoading, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/event-categories`);
        setCategories(data.categories || []);
      } catch (e) {
        console.error('Failed to load categories', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelect = (cat) => {
    // Wedding keeps the existing form route exactly as-is for backward compatibility.
    if (cat.id === 'wedding') {
      navigate('/studio/profile/new');
    } else {
      navigate(`/studio/celebration/new?category=${cat.id}`);
    }
  };

  return (
    <div className="luxe-page min-h-screen" style={{ background: 'linear-gradient(180deg,#0b0908 0%,#161210 100%)' }}>
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8 pb-4 flex items-center justify-between">
        <button
          onClick={() => navigate('/studio/dashboard')}
          className="lux-btn lux-btn-ghost"
          data-testid="category-back"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
          ◆ Step 1 of 3 · Choose Invitation Type
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-20">
        {/* Hero */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="visible"
          className="text-center pt-6 pb-12"
        >
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full"
            style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
            <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: '#D4AF37' }}>
              Universal Invitations
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl mb-4"
            style={{ color: 'var(--lux-text)', letterSpacing: '-0.02em' }}>
            What are we celebrating today?
          </h1>
          <p className="text-sm md:text-base max-w-2xl mx-auto"
            style={{ color: 'var(--lux-text-muted)' }}>
            Pick the ceremony you want to craft. Each invitation type has tailored fields,
            cultural designs and the same world-class flow — RSVPs, blessings, live photo gallery,
            guest QR upload and digital shagun.
          </p>
        </motion.div>

        {/* Grid of category cards */}
        {loading ? (
          <div className="grid place-items-center py-20"><div className="lux-mandala" /></div>
        ) : (
          <motion.div
            variants={stagger}
            initial="hidden" animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            data-testid="category-grid"
          >
            {categories.map((cat, i) => (
              <motion.button
                key={cat.id}
                variants={fadeUp} custom={i}
                onClick={() => handleSelect(cat)}
                onMouseEnter={() => setHoverId(cat.id)}
                onMouseLeave={() => setHoverId(null)}
                whileHover={{ y: -6, scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                className="group text-left relative overflow-hidden rounded-2xl"
                style={{
                  border: '1px solid rgba(212,175,55,0.18)',
                  background: '#161210',
                }}
                data-testid={`category-card-${cat.id}`}
              >
                {/* Cover image with gradient overlay */}
                <div className="relative h-56 w-full overflow-hidden">
                  <img
                    src={cat.cover_preview}
                    alt={cat.label}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    onError={(e) => { e.currentTarget.style.background = cat.hero_gradient; e.currentTarget.style.opacity = 0; }}
                  />
                  <div className="absolute inset-0"
                    style={{
                      background: `linear-gradient(180deg, transparent 0%, rgba(11,9,8,0.45) 55%, rgba(11,9,8,0.95) 100%), ${hoverId === cat.id ? cat.hero_gradient.replace('linear-gradient', 'linear-gradient').replace(',', ',') : 'transparent'}`,
                      opacity: hoverId === cat.id ? 0.55 : 1,
                      transition: 'opacity .45s ease',
                    }}
                  />
                  {/* Icon badge */}
                  <div className="absolute top-4 left-4 flex items-center justify-center w-12 h-12 rounded-full text-2xl"
                    style={{ background: 'rgba(11,9,8,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(212,175,55,0.35)' }}>
                    {cat.icon}
                  </div>
                  {/* Order badge */}
                  <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full text-[9px] tracking-[0.3em] uppercase"
                    style={{ background: 'rgba(11,9,8,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37' }}>
                    Option {cat.order}
                  </div>
                </div>

                {/* Card body */}
                <div className="p-6">
                  <h3 className="font-display text-2xl mb-1" style={{ color: 'var(--lux-text)' }}>
                    {cat.label}
                  </h3>
                  <p className="text-[11px] tracking-[0.18em] uppercase mb-3"
                    style={{ color: cat.accent_color }}>
                    {cat.label_traditional}
                  </p>
                  <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
                    {cat.tagline}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] tracking-[0.25em] uppercase"
                      style={{ color: 'var(--lux-text-muted)' }}>
                      {cat.supports_sub_events ? 'Multi-event ceremony' : 'Single-ceremony invite'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: '#D4AF37' }}>
                      Start
                      <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>

                {/* Decorative hover ring */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity"
                  style={{
                    boxShadow: hoverId === cat.id ? '0 30px 60px -25px rgba(212,175,55,0.45)' : 'none',
                    opacity: hoverId === cat.id ? 1 : 0,
                  }}
                />
              </motion.button>
            ))}
          </motion.div>
        )}

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }}
          className="text-center text-xs mt-12"
          style={{ color: 'var(--lux-text-faint)' }}
        >
          ✦ All invitation types share the same powerful flow · RSVP · Blessings · Live Gallery · Digital Shagun · Payments ✦
        </motion.p>
      </div>
    </div>
  );
};

export default EventCategorySelector;
