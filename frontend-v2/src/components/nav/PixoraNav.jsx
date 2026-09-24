import RailNav from './RailNav';
import './nav.css';

// Ported from "MAJA Pixora Nav.dc.html" — a single flat list in the source
// (no group headers, just a tagline row we don't have a slot for), so it's
// rendered here as one untitled group.
//
// Curated (lane W6): only StudioCommunity.jsx (/studio/community) consumes
// this component today, and it only builds 4 of the DC source's 8 groups
// (Feed/Reels/Stories/My Profile) — so those are the only entries here.
// The rest (Connect/Studio Tools/Growth/Marketplace/Learning Hub/…) are left
// out entirely rather than pointed at /soon, per the lane brief. If a later
// lane builds one of those surfaces, add its entry back here rather than
// re-introducing the /soon placeholders.
const DEFS = [
  ['Feed', '/studio/community?view=feed'],
  ['Reels', '/studio/community?view=reels'],
  ['Stories', '/studio/community?view=stories'],
  ['My Profile', '/studio/community?view=profile'],
];

const THEME = {
  border: '#ddd6fe', fg: '#111827', dim: '#4b5563', label: '#4b5563',
  activeBg: '#a78bfa', activeFg: '#2e1065', tagBg: 'transparent', tagFg: '#6d28d9', hoverBg: '#ede9fe',
};

export default function PixoraNav({ active = '' }) {
  const groups = [{ title: '', active, items: DEFS.map(([label, href, tag]) => ({ label, href, tag })) }];
  return (
    <RailNav
      className="pxg-nav"
      brandHref="/studio/community"
      brandGlyph="P"
      brandLabel="Pixora"
      brandColor="#6d28d9"
      groups={groups}
      footer={{ href: '/studio/dashboard', label: 'Back to Studio', glyph: '←' }}
      theme={THEME}
    />
  );
}
