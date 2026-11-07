/**
 * DemoBanner.jsx — Discreet top toolbar shown in Demo Mode.
 * Enables quick role switching (Studio, Admin, Couple, Visitor),
 * resetting demo data, and collapsing the banner.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isDemoMode } from './appMode';
import { resetDemoStore } from './demoStore';
import './demo-banner.css';

export default function DemoBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [activeRole, setActiveRole] = useState('visitor');

  const demoActive = isDemoMode();

  useEffect(() => {
    if (!demoActive) return;
    try {
      const adminToken = localStorage.getItem('admin_token');
      const clientToken = localStorage.getItem('client_token');
      const pathname = location.pathname;

      if (adminToken === 'demo-admin-token' || pathname.startsWith('/admin')) {
        setActiveRole('admin');
      } else if (adminToken === 'demo-studio-token' || pathname.startsWith('/studio')) {
        setActiveRole('studio');
      } else if (clientToken || pathname.startsWith('/couple')) {
        setActiveRole('couple');
      } else {
        setActiveRole('visitor');
      }
    } catch (_e) {}
  }, [location.pathname, demoActive]);

  if (!demoActive) return null;

  const handleSwitchToStudio = () => {
    try {
      localStorage.setItem('admin_token', 'demo-studio-token');
      localStorage.removeItem('client_token');
    } catch (_e) {}
    setActiveRole('studio');
    navigate('/studio/dashboard');
    window.location.reload();
  };

  const handleSwitchToAdmin = () => {
    try {
      localStorage.setItem('admin_token', 'demo-admin-token');
      localStorage.removeItem('client_token');
    } catch (_e) {}
    setActiveRole('admin');
    navigate('/admin/dashboard');
    window.location.reload();
  };

  const handleSwitchToCouple = () => {
    try {
      localStorage.removeItem('admin_token');
      localStorage.setItem('client_token', 'demo-couple-token-aarav-ananya');
    } catch (_e) {}
    setActiveRole('couple');
    navigate('/couple/aarav-ananya');
    window.location.reload();
  };

  const handleSwitchToVisitor = () => {
    try {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('client_token');
    } catch (_e) {}
    setActiveRole('visitor');
    navigate('/');
    window.location.reload();
  };

  const handleResetData = () => {
    if (window.confirm('Reset all demo data (wishes, RSVPs, uploads) back to initial factory fixtures?')) {
      resetDemoStore();
      window.location.reload();
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        className="maja-demo-minimized"
        onClick={() => setCollapsed(false)}
        title="Open Demo Mode Controls"
      >
        <span>⚡ Demo Mode</span>
        <span style={{ opacity: 0.6 }}>⚙</span>
      </button>
    );
  }

  return (
    <aside className="maja-demo-banner" aria-label="Demo mode toolbar">
      <div className="maja-demo-inner">
        <div className="maja-demo-info">
          <span className="maja-demo-badge">Demo Mode</span>
          <span className="maja-demo-notice">
            Synthetic fixtures active • Simulated payments, messages &amp; uploads
          </span>
        </div>

        <div className="maja-demo-controls">
          <button
            type="button"
            className={`maja-demo-btn ${activeRole === 'studio' ? 'maja-demo-btn-active' : ''}`}
            onClick={handleSwitchToStudio}
            title="Switch to Studio Photographer Dashboard"
          >
            📷 Studio
          </button>
          <button
            type="button"
            className={`maja-demo-btn ${activeRole === 'admin' ? 'maja-demo-btn-active' : ''}`}
            onClick={handleSwitchToAdmin}
            title="Switch to Operations Admin Dashboard"
          >
            👑 Admin
          </button>
          <button
            type="button"
            className={`maja-demo-btn ${activeRole === 'couple' ? 'maja-demo-btn-active' : ''}`}
            onClick={handleSwitchToCouple}
            title="Switch to Couple Portal (Aarav & Ananya)"
          >
            💍 Couple
          </button>
          <button
            type="button"
            className={`maja-demo-btn ${activeRole === 'visitor' ? 'maja-demo-btn-active' : ''}`}
            onClick={handleSwitchToVisitor}
            title="Switch to Visitor / Public Site"
          >
            🌐 Visitor
          </button>
          <button
            type="button"
            className="maja-demo-btn maja-demo-btn-warn"
            onClick={handleResetData}
            title="Reset browser storage to default fixtures"
          >
            ↺ Reset
          </button>
          <button
            type="button"
            className="maja-demo-btn-icon"
            onClick={() => setCollapsed(true)}
            title="Minimize banner"
            aria-label="Minimize demo banner"
          >
            ✕
          </button>
        </div>
      </div>
    </aside>
  );
}
