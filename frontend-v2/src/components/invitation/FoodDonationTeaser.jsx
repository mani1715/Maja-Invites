// FoodDonationTeaser — compact link-through to the standalone /food-donation
// finder (frontend-v2/src/pages/FoodDonation.jsx already owns the real
// city-search + centres logic; this only teases it, per the brief, rather
// than duplicating it inline the way the legacy app did).
export default function FoodDonationTeaser() {
  return (
    <section className="gi-food-teaser-wrap">
      <a href="/food-donation" className="gi-food-teaser">
        Is your food getting spoiled? <span className="gi-food-teaser-cta">Share it with a nearby home &rarr;</span>
      </a>
    </section>
  );
}
