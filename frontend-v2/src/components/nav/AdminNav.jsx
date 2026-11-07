import { ADMIN_NAV } from './navigation';
import { useNavigate } from 'react-router-dom';
import RailNav from './RailNav';
import { useAuth } from '@/context/AuthContext';
import './nav.css';

// Ported from "MAJA Admin Nav.dc.html". Dark rail. active = label of current
// page.
//
// Grouped by what the owner is actually doing, highest-frequency first
// (Phase 10). Operations leads with the event work — Events and Face ops sit
// right under the Console — then the fulfilment/delivery loop; Customer is the
// support/disputes desk; Money is pricing and margin; Platform is system health
// and the low-frequency admin tools (Investigation lives here, not up top).
// Every entry below is a built page in THIS app (verified against App.jsx) —
// the console defers nothing to the legacy /super-admin/* screens.
const DEFS = ADMIN_NAV;

const THEME = {
  border: '#362b49', fg: '#e9e3f3', dim: '#c7bed5', label: '#c4b5fd',
  activeBg: '#a78bfa', activeFg: '#2e1065', tagBg: '#40307a', tagFg: '#ccc2db', hoverBg: '#322743',
};

export default function AdminNav({ active = '' }) {
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
      className="pxg-anav"
      brandHref="/admin/dashboard"
      brandGlyph="P"
      brandLabel="Pixora Console"
      brandColor="#c4b5fd"
      groups={groups}
      footer={{ href: '/auth', label: 'Log out', glyph: '⎙', onClick: onLogout }}
      theme={THEME}
    />
  );
}
