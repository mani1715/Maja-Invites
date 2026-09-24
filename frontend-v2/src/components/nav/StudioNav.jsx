import { useNavigate } from 'react-router-dom';
import RailNav from './RailNav';
import { useAuth } from '@/context/AuthContext';
import './nav.css';

// Ported from "MAJA Studio Nav.dc.html". active = label of current page.
// The ID-scoped surfaces (gallery, QR codes, wedding detail, and the four
// per-wedding management tabs) stay reached from dashboard rows and the
// WeddingToolbar — a wedding has to be chosen first, so they cannot be
// top-level. Everything here is studio-wide.
const DEFS = [
  { title: 'Main Navigation', items: [
    ['Storage', '/studio/storage'],
    ['Wedding Invitations', '/studio/invitations'],
    ['Portfolio', '/studio/portfolio'],
    ['Clients', '/studio/clients'],
    ['Notifications', '/studio/notifications'],
  ] },
];

const THEME = {
  border: '#ddd6fe', fg: '#111827', dim: '#4b5563', label: '#4b5563',
  activeBg: '#a78bfa', activeFg: '#2e1065', tagBg: '#ddd6fe', tagFg: '#6d28d9', hoverBg: '#ede9fe',
};

export default function StudioNav({ active = '' }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  // Must clear the session before landing on /auth — SignIn bounces any
  // still-authenticated admin straight back to the dashboard.
  const onLogout = async (e) => {
    e.preventDefault();
    await logout();
    navigate('/auth', { replace: true });
  };
  const groups = DEFS.map((g) => ({ title: g.title, active, items: g.items.map(([label, href]) => ({ label, href })) }));
  return (
    <RailNav
      className="pxg-snav"
      brandHref="/studio/dashboard"
      brandGlyph="M"
      brandLabel="MAJA Studio"
      brandColor="#6d28d9"
      groups={groups}
      footer={{ href: '/auth', label: 'Log out', glyph: '⎙', onClick: onLogout }}
      theme={THEME}
    />
  );
}
