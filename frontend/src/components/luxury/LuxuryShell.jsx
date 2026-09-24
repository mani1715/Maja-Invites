import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, LogOut, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import '@/styles/luxury.css';

/**
 * LuxuryShell — reusable luxe page wrapper with sticky top bar.
 *
 * Props:
 *   title             — page title shown on the left
 *   eyebrow           — small label above the title
 *   showCredits       — show credit pill from useAuth().admin.available_credits
 *   showBack          — show "back" button
 *   onBack            — back handler
 *   actions           — JSX node rendered next to logout
 *   children          — page content
 */
const LuxuryShell = ({
  title,
  eyebrow,
  showCredits = true,
  showBack = false,
  onBack,
  actions,
  children,
  testid,
}) => {
  const navigate = useNavigate();
  const { admin, logout } = useAuth();

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <div className="luxe min-h-screen relative" data-testid={testid}>
      <motion.nav
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-50 px-6 md:px-10 py-4 flex items-center justify-between border-b"
        style={{ background: 'var(--lux-chrome)', backdropFilter: 'blur(12px)', borderColor: 'var(--lux-border)' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          {showBack && (
            <button onClick={onBack || (() => navigate(-1))}
              className="flex items-center gap-1.5 text-xs tracking-[0.25em] uppercase shrink-0"
              style={{ color: 'var(--lux-text-muted)' }}
              data-testid="luxe-shell-back"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img src="/brand/maja-icon-64.png" alt="MAJA Invites"
              className="w-9 h-9 rounded-full shrink-0 object-cover"
              style={{ boxShadow: '0 0 0 1px var(--lux-border-strong), inset 0 0 0 1px rgba(232,199,102,0.18)' }}
              data-testid="luxe-shell-logo" />
            <span className="font-display text-[1.2rem] tracking-wide hidden md:inline" style={{ color: 'var(--lux-text)' }}>
              MAJA<span className="text-gold"> </span>Invites
            </span>
          </div>
          {title && (
            <div className="hidden lg:block pl-5 ml-1 border-l min-w-0" style={{ borderColor: 'var(--lux-border)' }}>
              {eyebrow && <div className="text-[10px] tracking-[0.3em] uppercase mb-0.5" style={{ color: 'var(--lux-text-muted)' }}>{eyebrow}</div>}
              <div className="font-display text-lg truncate" style={{ color: 'var(--lux-text)' }}>{title}</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {actions}
          <ThemeToggle />
          {admin && (
            <button onClick={handleLogout} className="lux-btn lux-btn-ghost text-[10px]" data-testid="luxe-shell-logout">
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          )}
        </div>
      </motion.nav>

      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default LuxuryShell;
