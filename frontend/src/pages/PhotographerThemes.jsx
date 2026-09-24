import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PanelTabs from '@/components/PanelTabs';
import { MASTER_THEMES } from '@/themes/masterThemes';
import { Search, Sparkles, ArrowRight } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * PhotographerThemes (Part 10) — a functional clone of the Home themes grid,
 * scoped to the Photographer Panel. Selecting a theme starts the in-panel
 * "Create New Invitation" flow (/admin/category-selector) — it NEVER redirects
 * outside the authenticated panel, so the session is always preserved.
 */
export default function PhotographerThemes() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const themes = useMemo(() => {
    const list = Object.entries(MASTER_THEMES || {}).map(([id, t]) => ({ id, ...t }));
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((t) =>
      (t.name || t.label || t.id).toLowerCase().includes(s) ||
      (t.description || '').toLowerCase().includes(s) ||
      (t.religion || '').toLowerCase().includes(s) ||
      (t.region || '').toLowerCase().includes(s));
  }, [q]);

  const startWithTheme = (themeId) => {
    // stay inside the panel — go to the create-invitation category selector,
    // carrying the chosen theme so the flow can preselect it.
    navigate('/studio/category-selector', { state: { themeId } });
  };

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8 md:py-12 max-w-[1400px] mx-auto relative z-10">
        <PanelTabs active="/studio/themes" />

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <span className="lux-eyebrow block mb-3">◆ Themes</span>
            <h1 className="font-display text-[2rem] md:text-[3rem]" style={{ color: 'var(--lux-text)' }}>
              Choose a <span className="text-gold italic font-script">canvas.</span>
            </h1>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--lux-text-faint)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search themes…"
              className="lux-input pl-9 w-64" data-testid="themes-search" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {themes.map((t, i) => (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i % 8) * 0.04 }}
              whileHover={{ y: -4 }}
              onClick={() => startWithTheme(t.id)}
              className="relative rounded-2xl overflow-hidden text-left group lux-glass"
              style={{ minHeight: 220 }}
              data-testid={`theme-card-${t.id}`}
            >
              <div className="absolute inset-0" style={{
                background: t.preview || t.cover
                  ? `url(${t.preview || t.cover}) center/cover`
                  : 'linear-gradient(160deg, rgba(212,175,55,0.18), rgba(20,16,10,0.9))',
              }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 40%, rgba(6,4,2,0.88))' }} />
              <div className="relative p-4 h-full flex flex-col justify-end" style={{ minHeight: 220 }}>
                <span className="font-display text-lg" style={{ color: '#FFF8DC' }}>{t.name || t.label || t.id}</span>
                {(t.religion || t.region) && (
                  <span className="text-[11px] mt-0.5" style={{ color: '#E8C97A' }}>
                    {[t.religion, t.region].filter(Boolean).join(' · ')}
                  </span>
                )}
                <span className="mt-3 inline-flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#E8C97A' }}>
                  Use this theme <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </motion.button>
          ))}
        </div>

        {themes.length === 0 && (
          <div className="lux-glass p-10 text-center mt-6" style={{ color: 'var(--lux-text-muted)' }}>
            <Sparkles className="w-5 h-5 mx-auto mb-2" /> No themes match “{q}”.
          </div>
        )}
      </div>
    </div>
  );
}
