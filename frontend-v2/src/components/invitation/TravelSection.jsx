// TravelSection — "getting there" deep links. Sourced from the `/full`
// envelope's `travel` field (built by backend/travel_links.py), NOT
// `premium_features` — that module is unrelated to this payload. No
// sections_enabled flag covers this; it renders whenever the backend built
// at least one link (effectively always, since every wedding has a venue).
export default function TravelSection({ travel }) {
  const links = travel?.links;
  if (!links) return null;

  const buttons = [
    ['google_maps', 'Google Maps'],
    ['uber', 'Uber'],
    ['ola', 'Ola'],
    ['rapido', 'Rapido'],
  ].filter(([key]) => links[key]);
  if (!buttons.length) return null;

  return (
    <section className="gi-section" data-reveal>
      <p className="gi-eyebrow">Getting there</p>
      <h2 className="gi-split-title gi-travel-title">Plan your ride</h2>
      {travel.drop_address && <p className="gi-split-body gi-travel-address">{travel.drop_address}</p>}
      <div className="gi-travel-row">
        {buttons.map(([key, label]) => (
          <a key={key} href={links[key]} target="_blank" rel="noreferrer" className="mj-btn-outline-d" data-mj-lift>
            {label}
            {travel.carries_destination && travel.carries_destination[key] === false ? ' (paste address)' : ''}
          </a>
        ))}
      </div>
      {travel.hotels_nearby_query && (
        <a href={travel.hotels_nearby_query} target="_blank" rel="noreferrer" className="gi-travel-hotels-link">
          Find hotels nearby &rarr;
        </a>
      )}
    </section>
  );
}
