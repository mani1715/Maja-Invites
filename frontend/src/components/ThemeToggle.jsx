import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

/* Toggles data-theme on <html> for ~400ms so `.theme-transition *` (see
   luxury.css) animates the swap, then removes it — keeps the global
   transition off the hot path for normal hover/interaction. */
function withThemeTransition(fn) {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  fn();
  window.setTimeout(() => root.classList.remove('theme-transition'), 400);
}

export default function ThemeToggle() {
  // next-themes needs a client mount check to avoid SSR/hydration mismatch
  // flashing the wrong icon before the persisted theme is read.
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => setMounted(true), []);

  const isLight = mounted && resolvedTheme === 'light';

  const toggle = () => withThemeTransition(() => setTheme(isLight ? 'dark' : 'light'));

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-pressed={isLight}
      data-testid="theme-toggle"
      className="relative lux-tap44 w-9 h-9 grid place-items-center rounded-full shrink-0 transition-colors"
      style={{
        background: 'var(--lux-panel)',
        border: '1px solid var(--lux-border)',
        color: 'var(--lux-gold)',
      }}
    >
      {mounted && isLight ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
