import React from 'react';
import '@/styles/luxury.css';

/**
 * InvitationShell — the wrapper every generated invitation renders inside.
 *
 * Carries the atmosphere layers (aurora + jaali) that the main template uses,
 * so a generated page starts from the same depth instead of a flat background.
 * Both layers are fixed + pointer-events:none and sit behind the content: a
 * scrolling/attached background here breaks scroll on iOS Safari and Android
 * Chrome, which is why they are not painted on the scroll container itself.
 */
export default function InvitationShell({ children, testId = 'generated-invitation' }) {
  React.useEffect(() => {
    // The luxe theme is applied at the body level by the app shell for the
    // main template; a generated route may be entered directly, so ensure it.
    const cls = ['luxe', 'luxe-grain', 'luxe-vignette'];
    cls.forEach((c) => document.body.classList.add(c));
    return () => cls.forEach((c) => document.body.classList.remove(c));
  }, []);

  return (
    <div className="luxe min-h-screen relative" data-testid={testId}>
      <div className="lux-aurora" aria-hidden="true">
        <span className="a1" /><span className="a2" /><span className="a3" />
      </div>
      <div className="lux-jaali" aria-hidden="true" />
      <div className="relative" style={{ zIndex: 1 }}>{children}</div>
    </div>
  );
}
