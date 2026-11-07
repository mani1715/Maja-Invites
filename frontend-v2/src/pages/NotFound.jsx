import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import useSeo from '@/lib/useSeo';
export default function NotFound() {
  useSeo({title:'Page not found',description:'Find your way back to Pixora.',noindex:true});
  return <><MarketingNav /><main className="px-recovery"><p className="px-kicker">404 / A different direction</p><h1>Let’s find your way back.</h1><p>This link may have moved or the address may be incomplete. Explore Pixora, or contact us if you need a hand.</p><div><Link to="/">Back to Pixora</Link><Link to="/photographers">Explore photographers</Link><Link to="/support">Get help</Link></div></main></>;
}
