import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, Copy, Check } from '@/components/icons';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import DesignTile from '@/components/designs/DesignTile';
import * as studioStore from '@/api/studioStore';
import { decodeDesignCode } from '@/lib/designCode';
import {
  loadCatalogue, filterDesigns, findByCode, designName, designCode, designId,
  themeLabel, ceremonyLabel, catalogueUrl,
} from '@/lib/designCatalogue';
import './StudioDesigns.css';

// The photographer's view of the invitation catalogue.
//
// This page used to build its grid from the designCode.js vocabulary alone —
// 10 themes x 6 ceremonies = 60 gradient swatches, one placeholder card per
// combination, with a comment conceding the real catalogue "isn't ported
// here". It is ported now: 188 designs with real artwork, loaded from
// public/designs/catalogue.json (see lib/designCatalogue.js for what ships in
// git and what belongs on the CDN).
//
// That changes what the design code means on this page. A code is
// <THEME>-<CEREMONY>-<NN> and the NN was previously always 01 because there
// was only ever one card per combination; now it addresses a specific design,
// and the lookup box resolves to that one rather than to the combination.

const numberFmt = new Intl.NumberFormat('en-IN');
const fmtPrice = (p) => (typeof p === 'number' ? `₹${numberFmt.format(p)}` : '—');

const CEREMONIES = ['Engagement', 'Haldi', 'Mehandi', 'Marriage', 'Reception', 'Sangeeth'];

function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

export default function StudioDesigns() {
  const navigate = useNavigate();
  const vw = useViewportWidth();
  const isPhone = vw < 640;
  const isMobile = vw < 900;

  const [all, setAll] = useState(null);
  const [ceremony, setCeremony] = useState('All');
  const [theme, setTheme] = useState('All');
  const [q, setQ] = useState('');
  const [prices, setPrices] = useState({}); // code -> price_inr
  const [copied, setCopied] = useState('');

  const [codeInput, setCodeInput] = useState('');
  const [lookup, setLookup] = useState(null); // { design, price } | { error }
  const [looking, setLooking] = useState(false);

  useEffect(() => { loadCatalogue().then(setAll); }, []);

  const themes = useMemo(() => {
    if (!all) return [];
    const seen = new Map();
    for (const d of all) if (!seen.has(d.theme)) seen.set(d.theme, themeLabel(d.theme));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const shown = useMemo(() => (all ? filterDesigns(all, {
    theme: theme === 'All' ? '' : theme,
    ceremony: ceremony === 'All' ? '' : ceremony,
    q,
  }) : []), [all, theme, ceremony, q]);

  // Prices are per design code and admin-controlled, so they have to come from
  // the server rather than be derived here. Fetch only what is on screen, and
  // cache by code so flipping filters back and forth does not re-request.
  useEffect(() => {
    const missing = shown.filter((d) => {
      const c = designCode(d);
      return c && !(c in prices);
    }).slice(0, 60);
    if (!missing.length) return undefined;
    let cancelled = false;
    Promise.allSettled(missing.map((d) => {
      const c = designCode(d);
      return studioStore.designPrice(c, d.theme).then((r) => [c, r.data?.price_inr]);
    })).then((results) => {
      if (cancelled) return;
      setPrices((prev) => {
        const next = { ...prev };
        for (const r of results) if (r.status === 'fulfilled') next[r.value[0]] = r.value[1];
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.length, theme, ceremony]);

  const copyCode = useCallback((code) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? '' : c)), 1500);
  }, []);

  const useThisDesign = useCallback((d) => {
    // Hand off to the cart/checkout flow — see src/lib/cart.js's documented
    // `maja_selected_design` sessionStorage contract.
    try {
      sessionStorage.setItem('maja_selected_design', JSON.stringify({
        design_id: designCode(d),
        theme_id: d.theme,
        event_type: d.ceremony,
        name: `${themeLabel(d.theme)} — ${ceremonyLabel(d.ceremony)}`,
        image: catalogueUrl(d.src480),
      }));
    } catch (_e) { /* private mode */ }
    navigate('/cart');
  }, [navigate]);

  const runLookup = useCallback(async () => {
    const parsed = decodeDesignCode(codeInput);
    if (!parsed) { setLookup({ error: 'Invalid code. Format: MUGH-ENG-01' }); return; }
    const design = findByCode(all || [], codeInput);
    if (!design) {
      setLookup({ error: `No design at ${codeInput.toUpperCase()}. The collection and ceremony are valid — that number is past the end of the set.` });
      return;
    }
    setLooking(true);
    try {
      const { data } = await studioStore.designPrice(designCode(design), design.theme);
      setLookup({ design, price: data?.price_inr });
    } catch (_e) {
      setLookup({ design, price: null });
    } finally {
      setLooking(false);
    }
  }, [codeInput, all]);

  const shellCols = isMobile ? '1fr' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const pagePad = isPhone ? '18px 14px 70px' : (isMobile ? '26px 22px 70px' : '34px 34px 70px');
  const heroPad = isPhone ? '22px 18px' : (isMobile ? '26px 24px' : '30px 30px');
  const lookupPad = isPhone ? '18px' : '22px 24px';
  const gridCols = isPhone ? 'repeat(auto-fit,minmax(160px,1fr))' : 'repeat(auto-fit,minmax(220px,1fr))';
  const gridGap = isPhone ? '12px' : '18px';

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <MobileNav panel="studio" active="Designs" />
      <div style={{ background: '#ffffff', color: '#111827', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols }}>
        {!isMobile && <StudioNav active="Designs" />}

        <main id="main-content" className="stdes-main" style={{ padding: pagePad, minWidth: 0 }} data-testid="studio-designs">
          <header className="mjWash" style={{ marginBottom: 22, border: '1px solid #ddd6fe', borderRadius: 20, padding: heroPad }}>
            <p style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 10px' }}>Invitations</p>
            <h1 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 'clamp(26px,4vw,38px)', lineHeight: 1.12, margin: 0 }}>
              Browse <span style={{ color: '#6d28d9', fontStyle: 'italic' }}>designs</span>
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '10px 0 0', maxWidth: '58ch', lineHeight: 1.65 }}>
              {all === null
                ? 'Loading the catalogue…'
                : <>{all.length} designs across {themes.length} collections and six ceremonies. Every design carries a code &mdash; if a client already picked one, type it in and go straight there.</>}
            </p>

            <div className="mjGlass" style={{ borderRadius: 20, padding: lookupPad, marginTop: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.3em', textTransform: 'uppercase', color: '#6d28d9', margin: '0 0 12px' }}>Design code lookup</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                  <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    className="stdes-field"
                    value={codeInput}
                    onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setLookup(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && runLookup()}
                    placeholder="e.g. MUGH-ENG-01"
                    style={{ width: '100%', minHeight: 44, padding: '0 14px 0 36px', border: '1px solid #e5e7eb', borderRadius: 14, background: '#ffffff', fontSize: 14, letterSpacing: '.04em', fontFamily: 'inherit', color: '#111827' }}
                    data-testid="design-code-input"
                  />
                </div>
                <button type="button" className="stdes-btn" onClick={runLookup} disabled={looking || !all} data-testid="design-code-search"
                  style={{ minHeight: 44, padding: '0 20px', border: 'none', borderRadius: 14, background: '#6d28d9', color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', flex: 'none' }}>
                  {looking ? 'Finding…' : 'Find design'}
                </button>
              </div>

              {lookup && (
                <div style={{ marginTop: 14 }}>
                  {lookup.error ? (
                    <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{lookup.error}</p>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <img
                        src={catalogueUrl(lookup.design.src480)}
                        alt={designName(lookup.design)}
                        style={{ width: 56, height: 72, borderRadius: 10, flexShrink: 0, objectFit: 'cover', background: lookup.design.dominant || '#ede9fe' }}
                      />
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontFamily: "'Spectral',serif", fontSize: 16 }}>{designName(lookup.design)}</div>
                        <div style={{ fontSize: 12, color: '#6d28d9', letterSpacing: '.05em', marginTop: 2 }}>
                          {designCode(lookup.design)} · {ceremonyLabel(lookup.design.ceremony)} · {fmtPrice(lookup.price)}
                        </div>
                      </div>
                      <button type="button" className="stdes-btn" onClick={() => useThisDesign(lookup.design)} data-testid="design-code-use"
                        style={{ minHeight: 40, padding: '0 18px', border: 'none', borderRadius: 12, background: '#6d28d9', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ShoppingBag size={14} /> Use this design
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 12 }}>
            {['All', ...CEREMONIES].map((ev) => {
              const on = ceremony === ev;
              return (
                <button key={ev} type="button" onClick={() => setCeremony(ev)} className="stdes-chip" data-testid={`design-event-${ev}`}
                  style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: `1px solid ${on ? '#6d28d9' : '#ddd6fe'}`, background: on ? '#6d28d9' : 'transparent', color: on ? '#f2eefb' : '#6b7280', fontSize: 13, fontWeight: on ? 600 : 400, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none' }}>
                  {ev === 'Sangeeth' ? 'Sangeet' : ev}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              data-testid="design-theme-filter"
              style={{ minHeight: 44, padding: '0 14px', borderRadius: 14, border: '1px solid #ddd6fe', background: '#fff', fontSize: 13.5, fontFamily: 'inherit', color: '#111827' }}
            >
              <option value="All">All collections</option>
              {themes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search designs…"
              aria-label="Search designs"
              data-testid="design-search"
              style={{ flex: 1, minWidth: 160, minHeight: 44, padding: '0 14px', borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13.5, fontFamily: 'inherit', color: '#111827' }}
            />
            <span style={{ fontSize: 13, color: '#6b7280', flexShrink: 0 }}>
              {all === null ? 'Loading…' : `${shown.length} design${shown.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {all === null && (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: gridGap }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: '3/4', borderRadius: 18, background: '#f5f3ff', border: '1px solid #ddd6fe' }} />
              ))}
            </div>
          )}

          {all !== null && all.length === 0 && (
            <p style={{ fontSize: 14, color: '#6b7280' }}>
              The design catalogue could not be loaded. Reload the page; if it keeps
              failing the catalogue file is missing from this deployment.
            </p>
          )}

          {all !== null && all.length > 0 && shown.length === 0 && (
            <p style={{ fontSize: 14, color: '#6b7280' }}>No design matches those filters.</p>
          )}

          {shown.length > 0 && (
            <div data-reveal style={{ display: 'grid', gridTemplateColumns: gridCols, gap: gridGap }}>
              {shown.map((d) => {
                const code = designCode(d);
                return (
                  <DesignTile
                    key={designId(d)}
                    design={d}
                    onSelect={useThisDesign}
                    actions={(
                      <>
                        <button type="button" onClick={() => copyCode(code)} className="stdes-code" data-testid={`design-copy-${code}`}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 40, border: '1px solid #ddd6fe', borderRadius: 12, background: 'none', fontSize: 12, letterSpacing: '.04em', color: '#6b7280', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {copied === code ? <Check size={12} /> : <Copy size={12} />}
                          {copied === code ? 'Copied' : fmtPrice(prices[code])}
                        </button>
                        <button type="button" onClick={() => useThisDesign(d)} className="stdes-btn" data-testid={`design-use-${code}`}
                          style={{ minHeight: 40, border: 'none', borderRadius: 12, background: '#6d28d9', color: '#fff', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <ShoppingBag size={13} /> Use
                        </button>
                      </>
                    )}
                  />
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
