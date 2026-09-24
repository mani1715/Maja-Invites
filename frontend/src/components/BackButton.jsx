/**
 * BackButton — drop-in back link for any admin / super-admin sub-page.
 *
 * Usage:
 *   <BackButton />                      ← uses navigate(-1) with smart fallback
 *   <BackButton to="/super-admin" />    ← explicit destination
 *   <BackButton label="Back to dashboard" />
 *
 * Behaviour:
 *   - If `to` is provided → navigates to that route
 *   - Else if history.length > 1 → navigates to previous page (browser back)
 *   - Else falls back to `/studio/dashboard` (or `/super-admin/dashboard` if URL starts with /super-admin)
 *
 * Designed to be put as the first element inside the page wrapper so it
 * shows up consistently above the page heading.
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const BackButton = ({
  to,
  label = 'Back',
  className = '',
  variant = 'default',  // 'default' | 'subtle' | 'gold'
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    if (to) { navigate(to); return; }
    if (window.history.length > 1) { navigate(-1); return; }
    // Fallback based on URL prefix
    if (location.pathname.startsWith('/super-admin')) navigate('/super-admin/dashboard');
    else if (location.pathname.startsWith('/studio'))  navigate('/studio/dashboard');
    else navigate('/');
  };

  const styles = {
    default: {
      background: 'rgba(245,236,215,0.06)',
      color: '#F5ECD7',
      border: '1px solid rgba(245,236,215,0.15)',
    },
    subtle: {
      background: 'transparent',
      color: 'rgba(245,236,215,0.75)',
      border: '1px solid transparent',
    },
    gold: {
      background: 'rgba(212,175,55,0.15)',
      color: '#D4AF37',
      border: '1px solid rgba(212,175,55,0.35)',
    },
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="back-button"
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] tracking-[0.25em] uppercase font-medium hover:bg-white/10 transition-colors ${className}`}
      style={styles[variant] || styles.default}
      aria-label={label}
    >
      <ChevronLeft className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
};

export default BackButton;
