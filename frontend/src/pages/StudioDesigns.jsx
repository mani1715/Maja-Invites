/* StudioDesigns.jsx — photographer-panel design showcase.
   Occasion tabs (Wedding populated; others coming soon) + event sub-tabs so the
   grid is chunked instead of one endless scroll. Designs load progressively
   (each theme's cards appear as its chunk resolves) for a fast first paint.
   Each design has a copyable friendly CODE; a code-search box jumps to a design
   + its price. "Get this design" reuses the existing cart → /cart flow. */
import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Copy, Check, Search, ShoppingBag, Loader2, X, Sparkles } from 'lucide-react';
import { EVENTS, getThemeDesignsAsync } from '@/themes/allDesigns';
import { getThemeById } from '@/themes/masterThemes';
import { useCart } from '@/context/CartContext';
import PanelTabs from '@/components/PanelTabs';
import EventDesignStrip from '@/components/EventDesignStrip';
import { THEME_ABBR, encodeDesignCode, decodeDesignCode } from '@/lib/designCode';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const THEME_IDS = Object.keys(THEME_ABBR);

// Occasion categories. Wedding + Ganesh Chaturthi are live; the rest are coming
// soon (no design data yet — YAGNI until the owner adds those theme configs).
const CATEGORIES = [
  { key: 'wedding', label: 'Wedding' },
  { key: 'ganesh', label: 'Ganesh Chaturthi', eventType: 'ganesh_chaturthi' },
  { key: 'birthday', label: 'Birthday', soon: true },
  { key: 'anniversary', label: 'Anniversary', soon: true },
  { key: 'baby', label: 'Baby Shower', soon: true },
  { key: 'housewarming', label: 'Housewarming', soon: true },
];

async function resolveDesign(themeId, event, index) {
  const data = await getThemeDesignsAsync(themeId);
  return ((data?.events?.[event]) || [])[index] || null;
}

export default function StudioDesigns() {
  const navigate = useNavigate();
  const location = useLocation();
  const inPanel = location.pathname.startsWith('/studio');  // photographer panel vs public/user route
  const { add: addToCart } = useCart();
  const [cat, setCat] = useState('wedding');
  const [event, setEvent] = useState('All');
  const [items, setItems] = useState([]);     // progressive: {themeId, themeLabel, event, index, design, code}
  const [loadingCount, setLoadingCount] = useState(THEME_IDS.length);
  const [copied, setCopied] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codeResult, setCodeResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const catMeta = CATEGORIES.find((c) => c.key === cat) || CATEGORIES[0];

  // Progressive load: append each theme's cards as its chunk resolves.
  useEffect(() => {
    let alive = true;
    THEME_IDS.forEach(async (themeId) => {
      let data;
      try { data = await getThemeDesignsAsync(themeId); }
      catch { if (alive) setLoadingCount((n) => n - 1); return; }
      if (!alive) return;
      const themeLabel = getThemeById(themeId)?.name || themeId;
      const batch = [];
      for (const ev of EVENTS) {
        ((data?.events?.[ev]) || []).forEach((design, index) => {
          batch.push({ themeId, themeLabel, event: ev, index, design, code: encodeDesignCode(themeId, ev, index) });
        });
      }
      setItems((prev) => [...prev, ...batch]);
      setLoadingCount((n) => n - 1);
    });
    return () => { alive = false; };
  }, []);

  const copyCode = useCallback((code) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? '' : c)), 1500);
  }, []);

  const getDesign = useCallback(async (design, themeId, ev) => {
    await addToCart({ design_id: design.id, theme_id: themeId, event_type: ev, name: design.title });
    navigate('/cart');
  }, [addToCart, navigate]);

  const searchCode = useCallback(async () => {
    const parsed = decodeDesignCode(codeInput);
    if (!parsed) { setCodeResult({ error: 'Invalid code. Format: MUGH-ENG-01' }); return; }
    setSearching(true);
    try {
      const design = await resolveDesign(parsed.themeId, parsed.event, parsed.index);
      if (!design) { setCodeResult({ error: 'No design for that code.' }); return; }
      let price = null;
      try {
        const { data } = await axios.get(`${API_URL}/api/store/design/${design.id}/price`);
        price = data?.price_inr ?? data?.price ?? null;
      } catch { /* price at checkout */ }
      setCodeResult({ ...parsed, design, code: codeInput.trim().toUpperCase(), price });
    } finally { setSearching(false); }
  }, [codeInput]);

  const shown = event === 'All' ? items : items.filter((i) => i.event === event);

  return (
    <div className="min-h-screen" style={{ background: '#0B0805' }}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6">
        {inPanel ? <PanelTabs active="/studio/designs" /> : (
          <button onClick={() => navigate(-1)} className="lux-btn lux-btn-ghost text-xs mb-6" data-testid="designs-back">← Back</button>
        )}

        <div className="mb-5">
          <div className="lux-eyebrow mb-2">◆ Designs</div>
          <h1 className="font-display text-3xl md:text-4xl" style={{ color: 'var(--lux-text)' }}>Browse Designs</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>
            Pick a category, copy a design's code, or paste a code below to jump to it.
          </p>
        </div>

        {/* Code search */}
        <div className="lux-glass p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCode()}
                placeholder="Have a design code? e.g. MUGH-ENG-01"
                className="lux-input pl-10 w-full uppercase" data-testid="design-code-input" />
            </div>
            <button onClick={searchCode} disabled={searching} className="lux-btn" data-testid="design-code-search">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find design
            </button>
          </div>
          {codeResult && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--lux-border)' }}>
              {codeResult.error ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: '#f0a0a0' }}><X className="w-4 h-4" /> {codeResult.error}</div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <img src={codeResult.design.image} alt={codeResult.design.title} loading="lazy" className="w-28 h-36 object-cover rounded-lg" />
                  <div className="flex-1 text-center sm:text-left">
                    <div className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{codeResult.design.title}</div>
                    <div className="text-xs mt-1 tracking-widest" style={{ color: '#D4AF37' }}>{codeResult.code}</div>
                    <div className="text-sm mt-2" style={{ color: 'var(--lux-text)' }}>
                      {codeResult.price != null ? `₹${Number(codeResult.price).toLocaleString('en-IN')}` : 'Price shown at checkout'}
                    </div>
                  </div>
                  <button onClick={() => getDesign(codeResult.design, codeResult.themeId, codeResult.event)} className="lux-btn" data-testid="design-code-get">
                    <ShoppingBag className="w-4 h-4" /> Get this design
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Occasion category tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)}
              className="shrink-0 px-4 py-2 rounded-full text-xs tracking-wider uppercase" data-testid={`cat-${c.key}`}
              style={cat === c.key
                ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06', fontWeight: 600 }
                : { border: '1px solid var(--lux-border)', color: 'var(--lux-text-muted)' }}>
              {c.label}{c.soon ? ' · soon' : ''}
            </button>
          ))}
        </div>

        {catMeta.eventType ? (
          /* Event-engine designs (Ganesh first) — same strip the home page uses;
             each card opens the full invitation preview your client will see. */
          <EventDesignStrip
            eventType={catMeta.eventType}
            title={catMeta.label}
            eyebrow="◆ Festival invitations"
            blurb="Show these to your clients — tap a design to open the full invitation preview."
            limit={20}
            className="!px-0 !py-0"
          />
        ) : cat !== 'wedding' ? (
          <div className="lux-glass p-12 text-center" data-testid="cat-comingsoon">
            <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: '#D4AF37' }} />
            <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{catMeta.label} designs are coming soon.</p>
          </div>
        ) : (
          <>
            {/* Event sub-tabs — chunk the grid so it's not one long scroll */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5">
              {['All', ...EVENTS].map((ev) => (
                <button key={ev} onClick={() => setEvent(ev)}
                  className="shrink-0 px-3.5 py-1.5 rounded-full text-xs" data-testid={`event-${ev}`}
                  style={event === ev
                    ? { background: 'rgba(212,175,55,0.2)', border: '1px solid #D4AF37', color: '#D4AF37' }
                    : { border: '1px solid var(--lux-border)', color: 'var(--lux-text-muted)' }}>
                  {ev}
                </button>
              ))}
            </div>

            <div className="text-xs mb-4 flex items-center gap-2" style={{ color: 'var(--lux-text-faint)' }}>
              {shown.length} designs
              {loadingCount > 0 && <><Loader2 className="w-3 h-3 animate-spin" /> loading more…</>}
            </div>

            {shown.length === 0 && loadingCount === 0 ? (
              <div className="text-sm py-10 text-center" style={{ color: 'var(--lux-text-muted)' }}>No designs in this category yet.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {/* Deliberately NOT wrapped in TiltCard — measured, not assumed.
                    This grid renders all 180 designs at once (no virtualisation),
                    so per-card tilt means 180 pointer-tracked spring rigs.
                    CDP Performance.getMetrics, real GPU, identical exercise
                    (30 wheel scrolls + pointer sweeps across cards), 3 runs each:
                      ScriptDuration       0.19s -> 1.00s   (5.3x)
                      RecalcStyleDuration  0.12s -> 0.30s   (2.5x)
                      RecalcStyleCount      296  ->  494
                      TaskDuration          7.4s -> 11.9s   (+60%)
                      DOM nodes           22,847 -> 26,100
                    Tilt stays on the small, high-intent grids (plans = 4 cards,
                    photographers) where that multiplier is irrelevant.
                    NB: measure this with Performance.getMetrics, not rAF deltas —
                    every Chrome mode on this box (headed, headless=new, occluded
                    or not) pins ~15-20% of rAF frames at a 250ms scheduling floor
                    with ZERO long tasks, which masks the real cost entirely. */}
                {shown.map(({ themeId, themeLabel, event: ev, design, code }) => (
                  <motion.div key={code} className="lux-glass overflow-hidden flex flex-col h-full"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="aspect-[3/4] overflow-hidden" style={{ background: '#16110C' }}>
                      <img src={design.image} alt={design.title} loading="lazy" className="w-full h-full object-cover" />
                    </div>
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>{design.title}</div>
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--lux-text-faint)' }}>{themeLabel} · {ev}</div>
                      <button onClick={() => copyCode(code)}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37' }}
                        data-testid={`design-copy-${code}`}>
                        <span className="tracking-widest">{code}</span>
                        {copied === code ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => getDesign(design, themeId, ev)}
                        className="lux-btn text-[11px] py-2 mt-auto justify-center" data-testid={`design-get-${code}`}>
                        <ShoppingBag className="w-3.5 h-3.5" /> Get this design
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
