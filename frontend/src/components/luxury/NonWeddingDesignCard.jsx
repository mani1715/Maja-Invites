/**
 * NonWeddingDesignCard — visual mirror of the wedding theme card on the
 * landing page, but for non-wedding categories (baby birthday, half saree,
 * puberty, dhoti).
 *
 * The wedding card uses UniversalDesignRenderer (which renders the actual
 * design + animated overlays + couple text). Non-wedding designs are static
 * background art (no overlay system). So this component recreates the same
 * "live invitation" look by overlaying:
 *   • a top eyebrow line  (◇ FIRST BIRTHDAY ◇)
 *   • a circular celebrant photo bubble in the upper third
 *   • a soft cream / accent gradient band at the bottom containing
 *     "WITH BLESSINGS FROM OUR FAMILY", the celebrant name, date and venue.
 *
 * July 2026 fix:
 *   1. Category-specific sample photos (no more babies in dhoti cards)
 *   2. Circle bubble pushed deeper into the card so it sits in the visual
 *      centre of the empty upper area instead of touching the eyebrow.
 *   3. Eyebrow text wrapped in a translucent pill so it reads cleanly on
 *      every design backdrop (light cream, dark temple, busy floral).
 */
import React from 'react';
import { motion } from 'framer-motion';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const resolveImg = (u) => {
  if (!u) return '';
  if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('blob:')) return u;
  return `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`;
};

/* Category-appropriate hero photos. Each subject's face is roughly centered
   so the crop into a 96px circle keeps the face inside the frame. */
const CATEGORY_PHOTOS = {
  baby_birthday: 'https://images.unsplash.com/photo-1630304565858-642d53fa18ff?w=300&h=300&fit=crop&crop=faces&q=85',
  half_saree:    'https://images.unsplash.com/photo-1619516388835-2b60acc4049e?w=300&h=300&fit=crop&crop=faces&q=85',
  puberty:       'https://images.unsplash.com/photo-1676995229157-396a66e02c10?w=300&h=300&fit=crop&crop=faces&q=85',
  dhoti:         'https://images.unsplash.com/photo-1561987446-f3bfc5de6edf?w=300&h=300&fit=crop&crop=faces&q=85',
};

/* Per-category sample data — written so each preview tells a complete
   little story, exactly like the wedding cards do (Anaya & Rohan, etc.) */
const CATEGORY_SAMPLES = {
  baby_birthday: [
    {
      eyebrow: 'First Birthday',
      familyLine: 'With Blessings From Our Family',
      celebrant: 'Manvi',
      date: 'Saturday, 15 August 2026',
      venue: 'The Royal Banquet · Hyderabad',
      accent: '#FF69B4',
      panelTint: 'rgba(255,235,243,0.94)',
      panelText: '#3B1E2B',
    },
    {
      eyebrow: 'A Joyful Year',
      familyLine: 'Together With Our Family',
      celebrant: 'Aarav',
      date: 'Sunday, 22 November 2026',
      venue: 'Lotus Pavilion · Chennai',
      accent: '#87CEEB',
      panelTint: 'rgba(232,244,253,0.94)',
      panelText: '#162B3C',
    },
    {
      eyebrow: 'Tiny Toes Tiny Heart',
      familyLine: 'With Joy We Invite You',
      celebrant: 'Ananya',
      date: 'Saturday, 10 October 2026',
      venue: 'Maple Hall · Bengaluru',
      accent: '#FFB347',
      panelTint: 'rgba(255,244,224,0.94)',
      panelText: '#3B2A14',
    },
  ],
  half_saree: [
    {
      eyebrow: 'Half Saree Ceremony',
      familyLine: 'Together With Our Family',
      celebrant: 'Meera',
      date: 'Friday, 10 July 2026',
      venue: 'Sri Krishna Mandapam · Chennai',
      accent: '#C71585',
      panelTint: 'rgba(255,232,243,0.94)',
      panelText: '#3B0F2B',
    },
    {
      eyebrow: 'Pavadai Daavani',
      familyLine: 'With Blessings From Our Family',
      celebrant: 'Hasini',
      date: 'Sunday, 16 August 2026',
      venue: 'Padmavati Hall · Tirupati',
      accent: '#B8860B',
      panelTint: 'rgba(255,248,220,0.94)',
      panelText: '#3B2E14',
    },
  ],
  puberty: [
    {
      eyebrow: 'Manjal Neerattu',
      familyLine: 'With Blessings From Our Family',
      celebrant: 'Anika',
      date: 'Sunday, 21 June 2026',
      venue: 'Andal Mahal · Madurai',
      accent: '#C0392B',
      panelTint: 'rgba(255,240,224,0.94)',
      panelText: '#3B1F0F',
    },
    {
      eyebrow: 'Coming Of Age',
      familyLine: 'Together With Our Family',
      celebrant: 'Vaishnavi',
      date: 'Saturday, 7 September 2026',
      venue: 'Lakshmi Vilas · Salem',
      accent: '#B8860B',
      panelTint: 'rgba(255,248,220,0.94)',
      panelText: '#3B2814',
    },
  ],
  dhoti: [
    {
      eyebrow: 'Vetti Kattum Vizha',
      familyLine: 'Together With Our Family',
      celebrant: 'Arjun',
      date: 'Saturday, 16 May 2026',
      venue: 'Sri Sankara Hall · Coimbatore',
      accent: '#4A148C',
      panelTint: 'rgba(232,232,255,0.94)',
      panelText: '#1A1A3B',
    },
    {
      eyebrow: 'Dhoti Ceremony',
      familyLine: 'With Blessings From Our Family',
      celebrant: 'Karthik',
      date: 'Sunday, 28 June 2026',
      venue: 'Subramanya Hall · Madurai',
      accent: '#B8860B',
      panelTint: 'rgba(255,248,220,0.94)',
      panelText: '#3B2814',
    },
  ],
};

/* Universal fallback photo used only when the category isn't recognised. */
const DEFAULT_PHOTO = 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop&crop=faces&q=80';

const getSample = (category, index) => {
  const samples = CATEGORY_SAMPLES[category] || CATEGORY_SAMPLES.baby_birthday;
  return samples[index % samples.length];
};

const getCategoryPhoto = (category) => CATEGORY_PHOTOS[category] || DEFAULT_PHOTO;

const NonWeddingDesignCard = ({ design, category, index = 0, photo }) => {
  const sample = getSample(category, index);
  const heroPhoto = photo || getCategoryPhoto(category);
  const accent = sample.accent;
  const panelBg = sample.panelTint;
  const panelText = sample.panelText;

  return (
    <div
      className="relative w-full overflow-hidden rounded-md transition-transform duration-300 group-hover:scale-[1.01]"
      style={{ aspectRatio: '3 / 4', background: '#161210' }}
      data-testid={`non-wedding-card-preview-${design.design_id}`}
    >
      {/* Base art (the actual design image — kept full-bleed) */}
      <img
        src={resolveImg(design.preview_image || design.thumbnail)}
        alt={design.name}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => { e.currentTarget.style.opacity = 0.6; }}
      />

      {/* Soft top wash so the eyebrow stays readable on busy art */}
      <div
        className="absolute top-0 inset-x-0 h-20 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 100%)' }}
      />

      {/* Top eyebrow — wrapped in a translucent pill so the text is always
          readable regardless of the design backdrop (light, dark, busy). */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        className="absolute top-3.5 inset-x-0 flex justify-center px-3 z-10"
      >
        <span
          className="font-display text-[10px] sm:text-[11px] tracking-[0.36em] uppercase px-3 py-1 rounded-full whitespace-nowrap"
          style={{
            color: '#FFF8DC',
            background: 'rgba(15,10,6,0.55)',
            backdropFilter: 'blur(6px)',
            border: `1px solid ${accent}66`,
            textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            letterSpacing: '0.32em',
          }}
        >
          ◇ {sample.eyebrow} ◇
        </span>
      </motion.div>

      {/* Celebrant photo bubble — positioned in the visual centre of the
          card's upper half so the design's decorative top art (garlands,
          arches, pillars) frames the circle nicely. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
        className="absolute z-10"
        style={{ top: '32%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden"
          style={{
            border: `3px solid ${accent}`,
            boxShadow: '0 6px 22px rgba(0,0,0,0.35), inset 0 0 0 3px rgba(255,255,255,0.85)',
            backgroundImage: `url(${heroPhoto})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
          }}
        />
        {/* Tiny decorative ring around the bubble — mimics wedding photo dial */}
        <div
          className="absolute -inset-2 rounded-full pointer-events-none"
          style={{ border: `1px dashed ${accent}80` }}
        />
      </motion.div>

      {/* Bottom invitation panel — cream/tinted band with celebrant name + date */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
        className="absolute bottom-0 inset-x-0 px-4 pt-12 pb-5 text-center"
        style={{
          background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${panelBg} 38%, ${panelBg} 100%)`,
        }}
      >
        <span
          className="block text-[9px] sm:text-[10px] tracking-[0.32em] uppercase mb-1.5"
          style={{ color: `${panelText}CC` }}
        >
          {sample.familyLine}
        </span>
        <h4
          className="font-display leading-tight"
          style={{
            color: panelText,
            fontFamily: '"Cormorant Garamond", serif',
            fontSize: 'clamp(1.4rem, 2.2vw, 1.8rem)',
            fontWeight: 600,
          }}
        >
          {sample.celebrant}
        </h4>
        <span
          className="block text-[10px] sm:text-[11px] tracking-[0.28em] uppercase mt-2"
          style={{ color: panelText }}
        >
          {sample.date}
        </span>
        <span
          className="block text-[9px] sm:text-[10px] tracking-[0.22em] uppercase mt-1.5"
          style={{ color: `${panelText}BB` }}
        >
          {sample.venue}
        </span>
      </motion.div>
    </div>
  );
};

export default NonWeddingDesignCard;
