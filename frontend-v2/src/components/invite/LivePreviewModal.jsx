import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './livePreviewModal.css';

/**
 * The live invitation, opened over whatever page the visitor was on.
 *
 * WHY AN IFRAME. The invitation is a full page: it themes `<body>`, runs its
 * own countdown, its own scroll reveals and its own audio. Rendering it inline
 * inside the marketing page would leak all of that into the host page — and
 * would pull the whole invitation bundle into the landing chunk, which is the
 * first thing a visitor downloads. The frame loads `/preview/luxe` (or
 * `/preview/celebration/:category`), which is the same route the "open in a new
 * tab" link points at, so what is inside this box is the product, not a
 * rendition of it. There is no second implementation to drift.
 *
 * `?embed=1` asks that page to drop its own chrome (back link, theme picker,
 * explanatory note, footer CTA) because this modal supplies them.
 */
export default function LivePreviewModal({
  open, title, subtitle, src, fullHref, browseHref, browseLabel, onClose,
}) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  // Escape closes, and the page behind must not scroll while this is up —
  // otherwise dismissing the modal drops you somewhere else on the page.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="lpm-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="lpm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — live invitation preview`}
        ref={dialogRef}
      >
        <header className="lpm-head">
          <div className="lpm-head-text">
            <p className="lpm-eyebrow">Live preview</p>
            <h2 className="lpm-title">{title}</h2>
            {subtitle && <p className="lpm-sub">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="lpm-close"
            onClick={onClose}
            ref={closeRef}
            aria-label="Close preview"
          >
            &times;
          </button>
        </header>

        <div className="lpm-body">
          <div className="lpm-phone">
            <span aria-hidden="true" className="lpm-phone-notch" />
            <iframe
              className="lpm-frame"
              src={src}
              title={`${title} invitation preview`}
              loading="lazy"
            />
          </div>

          <div className="lpm-aside">
            <p className="lpm-note">
              This is the actual invitation page your guests open — scroll it,
              open the RSVP, read the blessings. The names and dates are sample
              content, and nothing you type in here is saved.
            </p>
            <div className="lpm-actions">
              <a
                className="mj-btn-primary lpm-btn"
                href={fullHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open full screen
              </a>
              {browseHref && (
                <Link className="lpm-btn lpm-btn--ghost" to={browseHref} onClick={onClose}>
                  {browseLabel || 'See the designs'}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
