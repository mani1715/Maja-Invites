/**
 * CelebrationPreviewModal — full preview of a non-wedding design
 * that opens BEFORE the purchase / creation flow.
 *
 *   Landing page card click  ──▶  this modal  ──▶  "Use this design"
 *                                                  └─▶ /user/buy-celebration/:cat/:designId
 *
 * July 2026 — now fetches the full category feature list from
 * /api/event-categories/{cat}/features so the customer sees EVERY
 * feature included in the invitation (not just 4 hardcoded ones).
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins, Sparkles, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import NonWeddingDesignCard from './NonWeddingDesignCard';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const resolveImg = (u) => {
  if (!u) return '';
  if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('blob:')) return u;
  return `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`;
};

const SAMPLE_DEMO = {
  baby_birthday: { celebrant: 'Aarav', subtitle: 'Turning 1st', parents: 'Ravi & Sita', date: 'Saturday, August 15, 2026' },
  half_saree:    { celebrant: 'Meera', subtitle: 'Half Saree Ceremony', parents: 'Karthik & Lakshmi', date: 'Friday, July 10, 2026' },
  puberty:       { celebrant: 'Anika', subtitle: 'Manjal Neerattu', parents: 'Sundar & Priya', date: 'Sunday, June 21, 2026' },
  dhoti:         { celebrant: 'Arjun', subtitle: 'Vetti Kattum Vizha', parents: 'Vasanth & Geetha', date: 'Saturday, May 16, 2026' },
};

const CATEGORY_PILL = {
  baby_birthday: { icon: '🎂', label: 'Baby Birthday', color: '#FF69B4' },
  half_saree:    { icon: '👗', label: 'Half Saree',    color: '#C71585' },
  puberty:       { icon: '🌸', label: 'Puberty',       color: '#FF8C00' },
  dhoti:         { icon: '👔', label: 'Dhoti',         color: '#7B68EE' },
};

const CelebrationPreviewModal = ({ open, onClose, category, design, onUseDesign }) => {
  const [features, setFeatures] = useState([]);
  const [pricing, setPricing] = useState({ design_credits: null, feature_credits: {} });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !category) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setFeatures([]);
      try {
        const [featsRes, priceRes] = await Promise.all([
          axios.get(`${API_URL}/api/event-categories/${category}/features`).catch(() => null),
          axios.get(`${API_URL}/api/event-categories/${category}/pricing?user_type=normal_user`).catch(() => null),
        ]);
        if (!alive) return;
        setFeatures(featsRes?.data?.features || []);
        if (priceRes?.data) setPricing(priceRes.data);
      } catch (e) {
        console.warn('CelebrationPreviewModal load', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [open, category]);

  if (!open || !design) return null;
  const sample = SAMPLE_DEMO[category] || {};
  const pill = CATEGORY_PILL[category] || { icon: '✨', label: category, color: '#D4AF37' };
  const credits = pricing.design_credits ?? design.credit_cost ?? 1;
  const includedFeatures = features.filter((f) => f.default || (f.credits || 0) === 0);
  const optionalFeatures = features.filter((f) => !f.default && (f.credits || 0) > 0);

  /* Render via React portal directly onto <body> so the modal lives in its
     own stacking context and is GUARANTEED to sit above the page header
     (z-50) regardless of any transformed/translated ancestor. */
  const modalNode = (
    <AnimatePresence>
      <motion.div
        key="preview-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[9999] grid place-items-center px-4 py-6"
        style={{ background: 'rgba(11,9,8,0.92)', backdropFilter: 'blur(14px)' }}
        data-testid="celebration-preview-modal"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-5xl max-h-[94vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
          style={{
            background: 'linear-gradient(180deg,#171210 0%, #0d0a08 100%)',
            border: '1px solid rgba(212,175,55,0.25)',
          }}
        >
          {/* TOP BAR — prominent Back button + design title, always visible
              and pinned so the user can never lose their way out of the
              preview. Mirrors the wedding-flow header on /themes/:id pages. */}
          <div
            className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 shrink-0"
            style={{
              background: 'linear-gradient(180deg, rgba(11,9,8,0.95), rgba(11,9,8,0.85))',
              borderBottom: '1px solid rgba(212,175,55,0.25)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs tracking-[0.22em] uppercase font-medium hover:scale-[1.03] transition-transform"
              style={{
                background: 'rgba(255,248,220,0.10)',
                border: '1px solid rgba(255,248,220,0.28)',
                color: '#FFF8DC',
              }}
              aria-label="Back to designs"
              data-testid="preview-modal-back"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <div className="flex-1 text-center px-2 truncate">
              <span
                className="text-[10px] tracking-[0.32em] uppercase block"
                style={{ color: 'rgba(255,248,220,0.7)' }}
              >
                Preview · {pill.label}
              </span>
              <span
                className="font-display text-base sm:text-lg truncate block"
                style={{ color: '#FFF8DC' }}
              >
                {design.name}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full grid place-items-center hover:bg-white/10 transition-colors shrink-0"
              style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,248,220,0.2)' }}
              aria-label="Close preview"
              data-testid="preview-modal-close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* BODY — wedding-style live preview on the left, info on the right */}
          <div className="flex flex-col md:flex-row flex-1 min-h-0">
            {/* LEFT — wedding-card style live preview with celebrant overlay */}
            <div className="md:w-2/5 relative grid place-items-center bg-black/40 overflow-y-auto p-5 sm:p-6"
              style={{ minHeight: 360 }}>
              <div className="w-full max-w-[340px]">
                <NonWeddingDesignCard
                  design={design}
                  category={category}
                  index={0}
                />
              </div>
              {/* category pill */}
              <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur z-10"
                style={{ background: 'rgba(0,0,0,0.55)', border: `1px solid ${pill.color}40` }}>
                <span>{pill.icon}</span>
                <span className="text-[10px] tracking-[0.32em] uppercase font-medium"
                  style={{ color: pill.color }}>
                  {pill.label}
                </span>
              </div>
            </div>

            {/* RIGHT — info + features + CTA */}
            <div className="md:w-3/5 p-6 sm:p-8 flex flex-col gap-5 overflow-y-auto"
              style={{ color: '#FFF8DC' }}>
            <div>
              <span className="text-[10px] tracking-[0.32em] uppercase"
                style={{ color: 'rgba(255,248,220,0.7)' }}>
                Preview
              </span>
              <h2 className="font-display text-2xl sm:text-3xl mt-2" data-testid="preview-modal-design-name">
                {design.name}
              </h2>
              <p className="text-sm mt-2 leading-relaxed"
                style={{ color: 'rgba(255,248,220,0.85)' }}>
                {`A ${pill.label.toLowerCase()} invitation, designed with the same
                premium layout used for our wedding flow — every feature below is
                already category-aware.`}
              </p>
            </div>

            {/* sample celebrant card removed — the wedding-style live
                preview on the left panel already shows the celebrant name,
                date and venue so this redundant block was causing data
                drift (e.g. "Manvi" on left and "Aarav" here). */}

            {/* INCLUDED features — fetched live from API */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] tracking-[0.32em] uppercase"
                  style={{ color: 'rgba(255,248,220,0.78)' }}>
                  Included free
                </span>
                <span className="text-[10px] tracking-wider uppercase"
                  style={{ color: '#A8C076' }}>
                  {includedFeatures.length} feature{includedFeatures.length !== 1 ? 's' : ''}
                </span>
              </div>
              {loading ? (
                <div className="space-y-1.5">
                  {[0,1,2,3].map((i) => (
                    <div key={i} className="h-8 rounded-lg"
                      style={{ background: 'rgba(255,248,220,0.05)' }} />
                  ))}
                </div>
              ) : (
                <ul className="space-y-1.5"
                  data-testid="preview-modal-included-features">
                  {includedFeatures.map((f) => (
                    <li key={f.key}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                      style={{
                        background: 'rgba(138,154,91,0.10)',
                        border: '1px solid rgba(138,154,91,0.25)',
                      }}
                      data-testid={`preview-modal-feature-${f.key}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">{f.icon || '◆'}</span>
                        <span className="text-[13px] truncate" style={{ color: '#FFF8DC' }}>
                          {f.label}
                        </span>
                      </div>
                      <Check className="w-3.5 h-3.5 shrink-0" style={{ color: '#A8C076' }} strokeWidth={3} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* OPTIONAL features */}
            {optionalFeatures.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] tracking-[0.32em] uppercase"
                    style={{ color: 'rgba(255,248,220,0.78)' }}>
                    Optional add-ons
                  </span>
                  <span className="text-[10px] tracking-wider uppercase"
                    style={{ color: pill.color }}>
                    pick in next step
                  </span>
                </div>
                <ul className="space-y-1.5"
                  data-testid="preview-modal-optional-features">
                  {optionalFeatures.map((f) => {
                    const featCost = (pricing.feature_credits && pricing.feature_credits[f.key] != null)
                      ? pricing.feature_credits[f.key]
                      : (f.credits || 0);
                    return (
                      <li key={f.key}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                        style={{
                          background: 'rgba(212,175,55,0.07)',
                          border: '1px solid rgba(212,175,55,0.2)',
                        }}
                        data-testid={`preview-modal-feature-${f.key}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm shrink-0">{f.icon || '◆'}</span>
                          <span className="text-[13px] truncate" style={{ color: '#FFF8DC' }}>
                            {f.label}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 shrink-0"
                          style={{ color: pill.color }}>
                          <Coins className="w-3 h-3" />
                          <span className="text-xs font-medium">+{featCost}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* CTA */}
            <div className="mt-auto pt-2">
              <div className="flex items-center justify-between mb-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <span className="text-xs tracking-[0.22em] uppercase"
                  style={{ color: 'rgba(255,248,220,0.85)' }}>
                  Base design cost
                </span>
                <div className="inline-flex items-center gap-1.5"
                  data-testid="preview-modal-base-cost">
                  <Coins className="w-4 h-4" style={{ color: '#D4AF37' }} />
                  <span className="font-display text-lg" style={{ color: '#FFF8DC' }}>
                    {credits}
                  </span>
                  <span className="text-xs" style={{ color: 'rgba(255,248,220,0.8)' }}>
                    credit{credits > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUseDesign(category, design)}
                className="lux-btn w-full justify-center"
                data-testid="preview-modal-use-design"
              >
                <Sparkles className="w-4 h-4" />
                Use this design
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full mt-2 py-2 text-[11px] tracking-[0.25em] uppercase hover:opacity-80 transition-opacity"
                style={{ color: 'rgba(255,248,220,0.78)' }}
                data-testid="preview-modal-cancel"
              >
                Keep browsing
              </button>
            </div>
          </div>
          </div>{/* close body row */}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalNode, document.body)
    : modalNode;
};

export default CelebrationPreviewModal;
