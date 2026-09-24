// Pixora design-system component wrappers — thin className composers over
// src/styles/pixora.css. No styled-components, no new deps. Chrome only
// (modals, buttons, forms, navs) — never the guest invitation theme content.
//
//   PxButton({ variant: 'primary'|'secondary'|'ghost', ... })
//   PxCard({ ... })                 -> .px-card
//   PxGlassCard({ ... })            -> .px-glass
//   PxModal({ open, onClose, title, children, ... })
//   PxSectionHeader({ eyebrow, title, sub, ... })
//   PxSpinner({ ... })              -> CSS-only spinner
//
// All props/data-testid/aria-* pass through via {...rest}.

import { useEffect } from "react";

const cx = (...parts) => parts.filter(Boolean).join(" ");

export function PxButton({ variant = "primary", className = "", children, ...rest }) {
  const variantClass = variant === "secondary" ? "px-btn-secondary" : variant === "ghost" ? "px-btn-ghost" : "";
  return (
    <button className={cx("px-btn", variantClass, className)} {...rest}>
      {children}
    </button>
  );
}

export function PxCard({ className = "", children, ...rest }) {
  return (
    <div className={cx("px-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function PxGlassCard({ className = "", children, ...rest }) {
  return (
    <div className={cx("px-glass", className)} {...rest}>
      {children}
    </div>
  );
}

export function PxModal({ open, onClose, title, className = "", children, ...rest }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="px-modal-overlay" onClick={onClose}>
      <div
        className={cx("px-modal", className)}
        role="dialog"
        aria-modal="true"
        aria-label={title || rest["aria-label"]}
        onClick={(e) => e.stopPropagation()}
        {...rest}
      >
        {title ? <h2 className="px-section-title" style={{ marginBottom: 16 }}>{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

export function PxSectionHeader({ eyebrow, title, sub, className = "", ...rest }) {
  return (
    <div className={cx("px-section-header", className)} {...rest}>
      {eyebrow ? <span className="px-eyebrow">{eyebrow}</span> : null}
      {title ? <h2 className="px-section-title">{title}</h2> : null}
      {sub ? <p className="px-section-sub">{sub}</p> : null}
    </div>
  );
}

export function PxSpinner({ className = "", ...rest }) {
  return <span className={cx("px-spinner", className)} role="status" aria-label="Loading" {...rest} />;
}
