import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import * as catalog from '@/api/publicCatalog';
import './FoodDonation.css';

// Where leftover wedding food can go.
//
// GET /api/public/food-donation has served real data since it was built and had
// no page. The admin side exists (/admin/food-donation) — so an owner could
// curate centres that nobody could then look up.
//
// EVERY NUMBER ON THIS PAGE COMES FROM THE SERVER. There are no example
// centres, no illustrative helplines and no "e.g." numbers anywhere in this
// file, because a person reading it may actually dial what they see. The
// national entry is CHILDLINE 1098, a real 24x7 helpline; if the API returns
// nothing, the page says it has nothing rather than filling the space.

export default function FoodDonation() {
  useSeo({
    title: 'Donate leftover wedding food',
    description: 'Find verified food-donation partners near your venue, so surplus food from a celebration reaches people who need it the same night.',
  });

  const [city, setCity] = useState('');
  const [state, setState] = useState({ status: 'loading', centers: [], national: [] });

  const load = useCallback((c) => {
    setState((s) => ({ ...s, status: 'loading' }));
    catalog.foodDonation(c)
      .then(({ data }) => setState({
        status: 'ready',
        centers: data.centers || [],
        national: data.national || [],
      }))
      .catch(() => setState({ status: 'error', centers: [], national: [] }));
  }, []);

  useEffect(() => { load(''); }, [load]);

  const submit = (e) => {
    e.preventDefault();
    load(city.trim());
  };

  const { status, centers, national } = state;
  const nothingAtAll = status === 'ready' && !centers.length && !national.length;

  return (
    <div className="fdon-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora fdon-hero">
        <div className="fdon-hero-inner">
          <p className="fdon-eyebrow">After the celebration</p>
          <h1 className="fdon-h1">Surplus food, <span>the same night</span></h1>
          <p className="fdon-sub">
            A wedding almost always cooks for more people than eat. These are
            organisations that will collect what is left while it is still safe
            to serve. Call before the meal ends — most need an hour&rsquo;s notice.
          </p>
        </div>
      </header>

      <main id="main-content" className="fdon-body">
        <form className="fdon-search" onSubmit={submit}>
          <label htmlFor="fdon-city" className="fdon-label">Your venue&rsquo;s city</label>
          <div className="fdon-search-row">
            <input
              id="fdon-city"
              className="fdon-input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Guntur, Hyderabad, Kochi…"
              data-testid="food-city"
            />
            <button type="submit" className="fdon-btn">Find partners</button>
          </div>
        </form>

        {status === 'loading' && <p className="fdon-state">Loading…</p>}
        {status === 'error' && (
          <p className="fdon-state fdon-state--error">
            Couldn&rsquo;t load the partner list. Please refresh — and if it is
            urgent, the national child helpline below is always reachable.
          </p>
        )}

        {status === 'ready' && centers.length > 0 && (
          <section className="fdon-section">
            <h2 className="fdon-h2">In {city || 'your city'}</h2>
            <div className="fdon-grid">
              {centers.map((c) => <CenterCard key={c.id || c.name} c={c} />)}
            </div>
          </section>
        )}

        {status === 'ready' && city && centers.length === 0 && (
          <p className="fdon-state">
            No partner is listed for &ldquo;{city}&rdquo; yet. The national
            helpline below still applies anywhere in India.
          </p>
        )}

        {status === 'ready' && national.length > 0 && (
          <section className="fdon-section">
            <h2 className="fdon-h2">Nationwide</h2>
            <div className="fdon-grid">
              {national.map((c) => <CenterCard key={c.id || c.name} c={c} national />)}
            </div>
          </section>
        )}

        {nothingAtAll && (
          <p className="fdon-state">
            No donation partners are listed yet.
          </p>
        )}

        <section className="fdon-note">
          <h2 className="fdon-h2">Before you call</h2>
          <ul>
            <li>Food that has sat out more than about two hours should not be donated.</li>
            <li>Say roughly how many people it will feed and whether it is vegetarian.</li>
            <li>Keep it covered and cold if collection is more than a few minutes away.</li>
          </ul>
          <p className="fdon-note-foot">
            Running a wedding through MAJA? Your invitation can carry this page
            so guests and the caterer see it too.{' '}
            <Link to="/contact" data-mj-link>Ask us to add it</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}

function CenterCard({ c, national = false }) {
  const tel = String(c.phone || '').replace(/[^\d+]/g, '');
  return (
    <article className="fdon-card">
      <div className="fdon-card-head">
        <h3 className="fdon-card-name">{c.name}</h3>
        {c.verified && <span className="fdon-verified">Verified</span>}
      </div>
      {c.phone && (
        // A phone number on a page like this must be dialable on a phone.
        <a className="fdon-phone" href={`tel:${tel}`}>{c.phone}</a>
      )}
      {c.address && <p className="fdon-card-line">{c.address}</p>}
      {(c.city || c.state) && !national && (
        <p className="fdon-card-line fdon-card-loc">
          {[c.city, c.state].filter(Boolean).join(', ')}
        </p>
      )}
      {c.hours && <p className="fdon-card-line">{c.hours}</p>}
    </article>
  );
}
