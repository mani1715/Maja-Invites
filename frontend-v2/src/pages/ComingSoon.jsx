import { Link, useLocation, useSearchParams } from 'react-router-dom';
import Placeholder from './_Placeholder';

// Shared target for nav items whose screen isn't built yet in this P0 app
// (see nav/RailNav.jsx `soon()` and pages/MANIFEST.md). Keeps every menu
// item clickable and visible instead of hiding it. Label comes from the
// `f` query param the nav links set, or route state if a caller prefers that.
export default function ComingSoon() {
  const { state } = useLocation();
  const [params] = useSearchParams();
  const label = state?.label || params.get('f') || 'This page';
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex' }}>
        <Placeholder title={label} route="Not built yet in this preview." />
      </div>
      <Link
        to="/"
        style={{ margin: '0 auto 40px', fontSize: 13.5, color: 'var(--mj-primary)', textDecoration: 'none' }}
      >
        ← Back home
      </Link>
    </div>
  );
}
