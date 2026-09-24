import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// Shared sidebar-rail mechanics behind StudioNav / AdminNav / PixoraNav — the three
// M12 rail navs share one collapse/rail/wide breakpoint ladder and hover math.
// Not itself one of the 5 exported nav components (WeddingToolbar has its own shell).
export const initials = (s) => s.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

// Target for nav items whose screen isn't built yet in this P0 app (most of
// them — see src/pages/MANIFEST.md). Keeps the item visible instead of
// hiding it; ComingSoon.jsx reads the label back off the `f` query param.
export const soon = (label) => `/soon?f=${encodeURIComponent(label)}`;

export function useRailLayout() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const rail = vw >= 900 && vw < 1200;
  const wide = vw >= 1440;
  const shown = vw >= 900;
  return { vw, rail, wide, shown };
}

export default function RailNav({ className, brandHref, brandGlyph, brandLabel, brandColor, groups, footer, theme }) {
  const { rail, wide, shown } = useRailLayout();
  if (!shown) return null;

  const nudge = rail ? 'scale(1.06)' : 'translateX(2px)';
  const align = rail ? 'center' : 'stretch';
  const itemW = rail ? 44 : '100%';
  const itemJustify = rail ? 'center' : 'flex-start';
  const itemPad = rail ? '0' : '0 12px';
  const labelShow = !rail;

  return (
    <aside
      className={`mj-aside ${className}`}
      style={{ display: 'flex', padding: rail ? '24px 10px' : wide ? '30px 22px' : '28px 18px', alignItems: align }}
    >
      <Link
        to={brandHref}
        title={brandLabel}
        style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: theme.fg, marginBottom: rail ? 22 : 32, padding: rail ? 0 : '0 8px', flex: 'none' }}
      >
        <span style={{ width: 32, height: 32, border: `1.5px solid ${brandColor}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Spectral',serif", fontSize: 15, color: brandColor, flex: 'none' }}>{brandGlyph}</span>
        {labelShow && <span style={{ fontFamily: "'Spectral',serif", fontSize: 15.5, fontWeight: 500, whiteSpace: 'nowrap' }}>{brandLabel}</span>}
      </Link>

      {groups.map((g) => (
        <div key={g.title} style={{ marginBottom: rail ? 14 : wide ? 20 : 18, width: '100%', display: 'flex', flexDirection: 'column', alignItems: align }}>
          {labelShow && g.title && <p style={{ fontSize: 11.5, letterSpacing: '.09em', textTransform: 'uppercase', color: theme.label, margin: '0 0 6px', padding: '0 12px' }}>{g.title}</p>}
          {rail && <span style={{ display: 'block', width: 20, height: 1, background: theme.border, margin: '0 0 8px' }} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: rail ? 6 : 3, width: '100%', alignItems: align }}>
            {g.items.map((i) => {
              const on = i.label === g.active;
              return (
                <Link
                  key={i.href}
                  to={i.href}
                  title={i.label}
                  className="mj-rail-item"
                  style={{
                    minHeight: 44, width: itemW, display: 'flex', alignItems: 'center', justifyContent: itemJustify,
                    padding: itemPad, borderRadius: 14, fontSize: 13.5,
                    background: on ? theme.activeBg : 'transparent', color: on ? theme.activeFg : theme.dim,
                    fontWeight: on ? 600 : 400, boxShadow: on ? '0 10px 26px rgba(109,40,217,.24)' : 'none',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = nudge; if (!on) { e.currentTarget.style.background = theme.hoverBg; e.currentTarget.style.color = theme.fg; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.dim; } }}
                >
                  {labelShow && <span>{i.label}</span>}
                  {!labelShow && <span style={{ fontFamily: "'Spectral',serif", fontSize: 13.5, letterSpacing: '.02em' }}>{initials(i.label)}</span>}
                  {i.tag && labelShow && <span style={{ marginLeft: 'auto', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: theme.tagBg, color: theme.tagFg }}>{i.tag}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {footer && (
        <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: `1px solid ${theme.border}`, width: '100%', display: 'flex', flexDirection: 'column', alignItems: align }}>
          <Link
            to={footer.href}
            onClick={footer.onClick}
            title={footer.label}
            className="mj-rail-item"
            style={{ minHeight: 44, width: itemW, display: 'flex', alignItems: 'center', justifyContent: itemJustify, padding: itemPad, borderRadius: 14, fontSize: 13, color: theme.dim, textDecoration: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme.hoverBg; e.currentTarget.style.color = theme.fg; e.currentTarget.style.transform = nudge; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.dim; e.currentTarget.style.transform = 'none'; }}
          >
            {labelShow ? <span>{footer.label}</span> : <span style={{ fontSize: 15 }}>{footer.glyph}</span>}
          </Link>
        </div>
      )}
    </aside>
  );
}
