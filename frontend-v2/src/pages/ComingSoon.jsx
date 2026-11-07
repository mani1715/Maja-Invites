import { Link, useSearchParams } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
export default function ComingSoon() {
  const [params] = useSearchParams();
  return <><MarketingNav /><main className="px-recovery"><p className="px-kicker">Not available yet</p><h1>{params.get('f') || 'Something new is taking shape.'}</h1><p>This feature isn’t available yet. You can explore the current tools or ask our team for help.</p><div><Link to="/features">Explore features</Link><Link to="/support">Contact support</Link></div></main></>;
}
